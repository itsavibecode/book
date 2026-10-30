/* Fortress Watch v0.3.0, map page. Vanilla JS + Leaflet 1.9.4, no build step.
   Pins every claim in data/items.json that has a `geo` (and smaller pins for
   `geoAlso`), coloured by its label, sized by how recent it is. The list under
   the map carries the same claims for keyboard and screen-reader users. */
(function () {
  'use strict';

  var THEME_KEY = 'fortress-theme';
  var STATUS_ORDER = ['fact', 'confirmed', 'reported', 'rumor', 'speculation', 'debunked'];
  var STATUS_LABEL = { fact: 'Fact', confirmed: 'Confirmed', reported: 'Reported', rumor: 'Rumor', speculation: 'Speculation', debunked: 'Debunked' };
  var RANGES = [
    { id: '48h', label: 'Last 48 hours', days: 2, phrase: 'in the last 48 hours' },
    { id: '7d', label: '7 days', days: 7, phrase: 'in the last 7 days' },
    { id: '30d', label: '30 days', days: 30, phrase: 'in the last 30 days' },
    { id: 'all', label: 'All', days: Infinity, phrase: 'at any date' }
  ];
  /* Basemap tiles. The plan named CARTO Voyager / Dark Matter, but since 2026
     basemaps.cartocdn.com answers every tile with "API KEY REQUIRED", so the
     page uses Esri's keyless Light Gray / Dark Gray Canvas. To move to CARTO
     with a key, change these two URLs and ATTRIB; nothing else depends on them. */
  var TILES = {
    light: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    dark: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
  };
  var ATTRIB = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  var items = [];
  var filt = { range: '7d', statuses: new Set() };
  var map = null, tiles = null, pinLayer = null, tileErrors = 0, tileLoads = 0;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  var TODAY = (function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  /* A claim's age counts from its own date or its latest history entry. */
  function latestDay(it) {
    var d = it.date || '';
    (Array.isArray(it.history) ? it.history : []).forEach(function (h) { if (h && h.date && h.date > d) d = h.date; });
    return d;
  }
  function ageDays(it) {
    var d = parseDay(latestDay(it));
    return d ? Math.max(0, Math.round((TODAY - d) / 86400000)) : Infinity;
  }
  function radiusFor(age) { return age <= 2 ? 12 : age <= 7 ? 9 : age <= 30 ? 7 : 5; }
  function validGeo(g) { return g && isFinite(g.lat) && isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180; }

  function stamp(status) {
    var s = el('span', 'stamp stamp-sm s-' + (STATUS_LABEL[status] ? status : 'reported'));
    s.appendChild(el('span', 'sr-only', 'Label: '));
    s.appendChild(document.createTextNode(STATUS_LABEL[status] || status));
    return s;
  }
  function stateBlock(title, text, btnLabel, onClick) {
    var b = el('div', 'state');
    b.appendChild(el('strong', null, title));
    if (text) b.appendChild(el('p', null, text));
    if (btnLabel) {
      var btn = el('button', 'btn', btnLabel);
      btn.type = 'button';
      btn.addEventListener('click', onClick);
      b.appendChild(btn);
    }
    return b;
  }
  function setState(node) {
    var host = $('mapState');
    host.textContent = '';
    if (node) host.appendChild(node);
  }

  /* ---------- pin colours: the stamp colours, read from the theme tokens ---------- */
  function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function pinStyle(status) {
    var ink = tok('--ink'), bg = tok('--bg');
    switch (status) {
      case 'fact': return { fillColor: ink, color: bg, weight: 2 };
      case 'confirmed': return { fillColor: tok('--conf'), color: bg, weight: 2 };
      case 'rumor': return { fillColor: tok('--amber'), color: ink, weight: 2 };
      case 'speculation': return { fillColor: bg, color: tok('--amber-text'), weight: 3 };
      case 'debunked': return { fillColor: tok('--red-fill'), color: ink, weight: 2 };
      default: return { fillColor: bg, color: ink, weight: 2.5 };
    }
  }

  /* ---------- theme (same key as the board) ---------- */
  var themeBtn = $('themeBtn');
  function theme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function paintTheme() { themeBtn.setAttribute('aria-pressed', theme() === 'dark' ? 'true' : 'false'); }
  themeBtn.addEventListener('click', function () {
    var next = theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (next === 'dark') lsSet(THEME_KEY, 'dark'); else lsDel(THEME_KEY);
    paintTheme();
    if (map) { setTiles(); render(false); }
    renderLegend();
  });
  paintTheme();

  /* ---------- toast + Escape ---------- */
  var toastEl = $('toast'), toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4000);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!toastEl.hidden) { toastEl.hidden = true; e.preventDefault(); }
    else if (map) map.closePopup();
  });

  /* ---------- map ---------- */
  function setTiles() {
    if (tiles) map.removeLayer(tiles);
    tileErrors = 0; tileLoads = 0;
    tiles = L.tileLayer(TILES[theme()], { attribution: ATTRIB, maxZoom: 12 });
    tiles.on('tileerror', function () {
      tileErrors++;
      if (tileErrors >= 4 && !tileLoads) $('mapWrap').classList.add('tiles-failed');
    });
    tiles.on('tileload', function () { tileLoads++; $('mapWrap').classList.remove('tiles-failed'); });
    tiles.addTo(map);
  }
  function initMap() {
    if (!window.L || !$('map')) return false;
    map = L.map('map', { minZoom: 1, maxZoom: 12, worldCopyJump: true, zoomControl: true });
    map.setView([30, 0], 2);
    var note = el('div', 'tile-note', 'The map tiles did not load (the tile server may be down or blocked). The pins and the list below still work; reload to try again.');
    $('mapWrap').appendChild(note);
    setTiles();
    pinLayer = L.layerGroup().addTo(map);
    return true;
  }
  function popupFor(it, place, secondary) {
    var box = el('div', 'pop');
    var top = el('p', 'pop-top');
    var t = el('time', 'tnum', it.date); t.setAttribute('datetime', it.date);
    top.appendChild(t);
    top.appendChild(stamp(it.status));
    box.appendChild(top);
    box.appendChild(el('p', 'pop-head', it.headline));
    box.appendChild(el('p', 'pop-place', (secondary ? 'Also named: ' : '') + place));
    var a = el('a', 'pop-link', 'Open on the board');
    a.href = 'index.html#c-' + encodeURIComponent(it.id);
    box.appendChild(a);
    return box;
  }

  /* ---------- filters ---------- */
  function pinned() { return items.filter(function (it) { return validGeo(it.geo); }); }
  function inRange(it) {
    var r = RANGES.filter(function (x) { return x.id === filt.range; })[0];
    return ageDays(it) <= r.days;
  }
  function visible() {
    return pinned().filter(function (it) {
      return inRange(it) && (!filt.statuses.size || filt.statuses.has(it.status));
    }).sort(function (a, b) { return latestDay(a) < latestDay(b) ? 1 : latestDay(a) > latestDay(b) ? -1 : (a.id < b.id ? -1 : 1); });
  }
  function chip(label, pressed, onClick) {
    var b = el('button', 'btn', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }
  function renderChips() {
    var a = document.activeElement, group = a && a.parentNode && a.parentNode.id, label = a && a.textContent;
    var rc = $('rangeChips'); rc.textContent = '';
    RANGES.forEach(function (r) {
      rc.appendChild(chip(r.label, filt.range === r.id, function () { filt.range = r.id; render(true); }));
    });
    var sc = $('statusChips'); sc.textContent = '';
    var present = STATUS_ORDER.filter(function (s) { return pinned().some(function (it) { return it.status === s; }); });
    sc.appendChild(chip('All', !filt.statuses.size, function () { filt.statuses.clear(); render(true); }));
    present.forEach(function (s) {
      sc.appendChild(chip(STATUS_LABEL[s], filt.statuses.has(s), function () {
        if (filt.statuses.has(s)) filt.statuses.delete(s); else filt.statuses.add(s);
        render(true);
      }));
    });
    if (group && /Chips$/.test(group)) {
      var again = Array.prototype.filter.call($(group).children, function (b) { return b.textContent === label; })[0];
      if (again) again.focus();
    }
  }

  /* ---------- render ---------- */
  function renderList(list) {
    var ol = $('mapList');
    ol.textContent = '';
    list.forEach(function (it) {
      var li = el('li');
      var t = el('time', 'tnum', it.date); t.setAttribute('datetime', it.date);
      li.appendChild(t);
      li.appendChild(stamp(it.status));
      var a = el('a', null, it.headline);
      a.href = 'index.html#c-' + encodeURIComponent(it.id);
      li.appendChild(a);
      var places = [it.geo.place].concat((it.geoAlso || []).filter(validGeo).map(function (g) { return g.place; })).filter(Boolean);
      if (places.length) li.appendChild(el('span', 'map-place', places.join('; ')));
      ol.appendChild(li);
    });
  }
  function render(fit) {
    renderChips();
    var all = pinned(), list = visible();
    var r = RANGES.filter(function (x) { return x.id === filt.range; })[0];
    $('mapCount').textContent = all.length ? 'Showing ' + plural(list.length, 'pinned claim') + ' of ' + all.length + '.' : '';
    if (!all.length) {
      setState(stateBlock('No claims have a location yet.', 'Locations are added when a claim is reviewed. The board has every claim in the meantime.'));
      var link = el('a', 'btn', 'Go to the board'); link.href = 'index.html';
      $('mapState').firstChild.appendChild(link);
    } else if (!list.length) {
      var labels = filt.statuses.size ? ' with ' + (filt.statuses.size === 1 ? 'this label' : 'these labels') : '';
      setState(stateBlock('No pinned claims ' + r.phrase + labels + '.', 'Widen the dates to see the rest.', 'Show all dates and labels', function () {
        filt.range = 'all'; filt.statuses.clear(); render(true);
        var first = $('rangeChips').lastChild; if (first) first.focus();
      }));
    } else {
      setState(null);
    }
    renderList(list);
    if (!map) return;
    pinLayer.clearLayers();
    var pts = [];
    list.slice().reverse().forEach(function (it) {
      var age = ageDays(it), st = pinStyle(it.status);
      (it.geoAlso || []).filter(validGeo).forEach(function (g) {
        L.circleMarker([g.lat, g.lng], { radius: 5, fillColor: st.fillColor, color: st.color, weight: 1.5, fillOpacity: 0.75, dashArray: '2 2' })
          .bindPopup(popupFor(it, g.place || '', true)).addTo(pinLayer);
        pts.push([g.lat, g.lng]);
      });
      L.circleMarker([it.geo.lat, it.geo.lng], { radius: radiusFor(age), fillColor: st.fillColor, color: st.color, weight: st.weight, fillOpacity: 0.95 })
        .bindPopup(popupFor(it, it.geo.place || '', false)).addTo(pinLayer);
      pts.push([it.geo.lat, it.geo.lng]);
    });
    if (fit && pts.length === 1) map.setView(pts[0], 5);
    else if (fit && pts.length) map.fitBounds(pts, { padding: [36, 36], maxZoom: 6 });
  }
  function renderLegend() {
    var ul = $('legend');
    ul.textContent = '';
    STATUS_ORDER.forEach(function (s) {
      var st = pinStyle(s);
      var li = el('li');
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('aria-hidden', 'true');
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '8');
      c.setAttribute('fill', st.fillColor); c.setAttribute('stroke', st.color === tok('--bg') ? tok('--ctl-bd') : st.color);
      c.setAttribute('stroke-width', String(Math.min(st.weight, 2.5)));
      svg.appendChild(c);
      li.appendChild(svg);
      li.appendChild(stamp(s));
      ul.appendChild(li);
    });
    var size = el('li', 'legend-note', 'Bigger pin: newer claim. Small dashed pin: another place the claim names.');
    ul.appendChild(size);
  }

  /* ---------- consent banner (site-wide `greenline-consent` key) ---------- */
  (function () {
    var banner = $('consentBanner');
    function show(on) { banner.hidden = !on; document.body.classList.toggle('has-consent', on); }
    function record(state) {
      try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': state }); } catch (e) {}
      lsSet('greenline-consent', state);
      show(false);
      toast(state === 'granted' ? 'Analytics allowed on this device.' : 'Analytics cookies declined on this device.');
    }
    $('consentAccept').addEventListener('click', function () { record('granted'); });
    $('consentReject').addEventListener('click', function () { record('denied'); });
    $('cookieReset').addEventListener('click', function () {
      lsDel('greenline-consent');
      try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': 'denied' }); } catch (e) {}
      show(true);
      $('consentReject').focus();
    });
    if (window.__needsConsent) show(true);
  })();

  /* ---------- load ---------- */
  renderLegend();
  var mapOk = initMap();
  if (!mapOk) {
    $('mapWrap').hidden = true;
  }
  fetch('data/items.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('items.json: HTTP ' + r.status);
    return r.json();
  }).then(function (data) {
    items = (Array.isArray(data) ? data : []).filter(function (it) { return it && it.id && it.headline; });
    var recent = pinned().filter(function (it) { return ageDays(it) <= 7; }).length;
    if (recent < 3) filt.range = 'all';
    render(true);
    if (!mapOk) {
      var host = $('mapState');
      host.insertBefore(stateBlock('The map library did not load, so there is no map.', 'The list below has the same claims. Reload to try again.', 'Reload the page', function () { location.reload(); }), host.firstChild);
    }
  }).catch(function () {
    renderChips();
    $('mapList').textContent = '';
    setState(stateBlock('The claims did not load.', 'items.json could not be read, so there are no pins. The board may still work. Reload to try again.', 'Reload the page', function () { location.reload(); }));
  });
})();
