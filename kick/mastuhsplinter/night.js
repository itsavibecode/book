/* KickPocketed - night transcript page. Reads window.NIGHT = {json, speaker, keys} */
(function () {
  'use strict';
  var N = window.NIGHT;
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var RX = /spli?n+t|mast(uh|ah|er) ?s|mastuh/i;
  var CAP = 12;
  var BOTS = /bot$|^@?bot|botrix|streamlabs|nightbot|kickbot|pepperpal|tinkobot|emojibot/i;
  var EMO = {}, ROWS = [];
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- clock: local / UTC / JST ---------- */
  var TZ = lsGet('kp_tz') || 'local';
  function fmtTime(ts) {
    var d = new Date(ts.replace(' ', 'T') + 'Z');
    if (TZ === 'utc') return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    if (TZ === 'jst') { var j = new Date(d.getTime() + 9 * 3600e3); return pad(j.getUTCHours()) + ':' + pad(j.getUTCMinutes()); }
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function tzLabel() {
    if (TZ === 'utc') return 'UTC';
    if (TZ === 'jst') return 'JST';
    try { return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).filter(function (p) { return p.type === 'timeZoneName'; })[0].value; } catch (e) { return 'local'; }
  }
  function applyTz() {
    ROWS.forEach(function (r) { r.tEl.textContent = fmtTime(r.k); });
    $('colTz').textContent = tzLabel();
    document.querySelectorAll('#keys time').forEach(function (t) { t.textContent = fmtTime(t.getAttribute('data-ts')); });
    document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tz') === TZ)); });
  }

  /* ---------- formatting ---------- */
  function fmt(s) {
    var h = esc(s).replace(/:([A-Za-z0-9_]{2,40}):/g, function (all, n) {
      return EMO[n] ? '<img class="emi" src="https://files.kick.com/emotes/' + EMO[n].split('.')[0] + '/fullsize" alt="' + n + '" title="' + n + '" loading="lazy">' : '<span class="em">' + n + '</span>';
    });
    return h.replace(/(mastuh\s?splint\w*|master\s?splint\w*|splint\w*)/gi, '<span class="hit">$1</span>');
  }
  var stripE = function (x) { return x.replace(/:[A-Za-z0-9_]{2,40}:/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
  var isShort = function (x) { return stripE(x).length < 12; };
  function line(c, hide) {
    var u = c[0], x = c[1], him = u === 'mastuhsplinter';
    return '<div class="' + (him ? 'him' : (RX.test(x) ? 'ment' : '')) + '"' + (hide ? ' hidden data-more' : '') + '><span class="u">' + (him ? 'MASTUHSPLINTER' : esc(u)) + '</span>' + fmt(x) + '</div>';
  }
  function chatHtml(ch) {
    if (!ch.length) return '<span class="empty">no chat</span>';
    var shown = 0;
    var out = ch.map(function (c) {
      var imp = c[0] === 'mastuhsplinter' || RX.test(c[1]);
      var show = imp || (!isShort(c[1]) && !BOTS.test(c[0]) && shown < CAP);
      if (show && !imp) shown++;
      return line(c, !show);
    });
    var hid = out.filter(function (h) { return h.indexOf('data-more') >= 0; }).length;
    return out.join('') + (hid ? '<button class="more" type="button" title="Show the messages hidden as spam, bots, or very short">show ' + hid + ' more</button>' : '');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button.more'); if (!b) return;
    var box = b.parentElement, open = b.getAttribute('data-open') === '1';
    box.querySelectorAll('[data-more]').forEach(function (d) { d.hidden = open; });
    b.setAttribute('data-open', open ? '0' : '1');
    b.textContent = open ? b.textContent.replace('hide', 'show') : b.textContent.replace('show', 'hide');
  });

  /* ---------- load ---------- */
  Promise.all([
    fetch('nights/' + N.json).then(function (r) { return r.json(); }),
    fetch('nights/emotes.json').then(function (r) { return r.json(); }).catch(function () { return {}; })
  ]).then(function (res) {
    var d = res[0]; EMO = res[1];
    var m = new Map();
    var get = function (k) { if (!m.has(k)) m.set(k, { k: k, sp: [], ch: [] }); return m.get(k); };
    (d.speech || []).forEach(function (x) { get(x[0].slice(0, 16)).sp.push(x[1]); });
    (d.chat || []).forEach(function (x) { get(x[0].slice(0, 16)).ch.push([x[1], x[2]]); });
    var keyset = {}; N.keys.forEach(function (k) { keyset[k[0]] = 1; });
    var html = [];
    ROWS = Array.from(m.values()).sort(function (a, b) { return a.k < b.k ? -1 : 1; }).map(function (r) {
      var text = (r.sp.join(' ') + ' ' + r.ch.map(function (c) { return c[0] + ' ' + c[1]; }).join(' ')).toLowerCase();
      var id = 't' + r.k.replace(/\D/g, '');
      html.push('<section class="row' + (keyset[r.k] ? ' key' : '') + '" id="' + id + '"><div class="t"><a href="#' + id + '" title="Link to this minute (click to copy)" data-k="' + r.k + '"></a></div>' +
        '<div class="sp"><span class="lbl">' + esc(N.speaker) + '</span>' + (r.sp.length ? r.sp.map(function (x) { return '<p>' + fmt(x) + '</p>'; }).join('') : '<span class="empty">no speech</span>') + '</div>' +
        '<div class="ch"><span class="lbl">Chat</span>' + chatHtml(r.ch) + '</div></section>');
      return { k: r.k, text: text, sp: r.sp.length, hit: RX.test(text), him: r.ch.some(function (c) { return c[0] === 'mastuhsplinter'; }) };
    });
    var rows = $('rows'); rows.innerHTML = html.join('');
    var els = rows.children;
    ROWS.forEach(function (r, i) { r.el = els[i]; r.tEl = r.el.querySelector('.t a'); });
    var ol = $('keys');
    ol.innerHTML = N.keys.map(function (k) { return '<li><a href="#t' + k[0].replace(/\D/g, '') + '"><time data-ts="' + k[0] + '"></time><span>' + esc(k[1]) + '</span></a></li>'; }).join('');
    applyTz(); apply();
    if (location.hash) { var e = document.getElementById(location.hash.slice(1)); if (e) e.scrollIntoView(); }
  }).catch(function (e) {
    $('rows').innerHTML = '<p class="empty">Could not load the transcript (' + esc(e.message) + ').</p>';
  });

  /* ---------- filters ---------- */
  function apply() {
    var q = $('q').value.trim().toLowerCase();
    var only = $('only').checked, quiet = $('quiet').checked, himOnly = $('him').checked;
    var n = 0;
    ROWS.forEach(function (r) {
      var show = (!q || r.text.indexOf(q) >= 0) && (!only || r.hit) && (!quiet || r.sp) && (!himOnly || r.him);
      r.el.hidden = !show; if (show) n++;
    });
    $('count').textContent = n + ' of ' + ROWS.length + ' minutes';
  }
  ['q', 'only', 'quiet', 'him'].forEach(function (id) { $(id).addEventListener('input', apply); });
  $('allchat').addEventListener('input', function (e) { document.body.classList.toggle('allchat', e.target.checked); });

  /* jump between mentions */
  function jump(dir) {
    var vis = ROWS.filter(function (r) { return !r.el.hidden && (r.hit || r.him); });
    if (!vis.length) return;
    var y = window.scrollY + 70, target = null;
    if (dir > 0) { for (var i = 0; i < vis.length; i++) { if (vis[i].el.offsetTop > y + 2) { target = vis[i]; break; } } }
    else { for (var j = vis.length - 1; j >= 0; j--) { if (vis[j].el.offsetTop < y - 2) { target = vis[j]; break; } } }
    if (!target) target = dir > 0 ? vis[0] : vis[vis.length - 1];
    target.el.scrollIntoView({ block: 'start' });
    history.replaceState(null, '', '#' + target.el.id);
  }
  $('prevHit').addEventListener('click', function () { jump(-1); });
  $('nextHit').addEventListener('click', function () { jump(1); });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () { TZ = b.getAttribute('data-tz'); lsSet('kp_tz', TZ); applyTz(); });
  });

  /* copy a minute's link */
  var toast = $('toast'), toastT;
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.row .t a'); if (!a) return;
    var url = location.href.split('#')[0] + a.getAttribute('href');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        toast.textContent = 'Link to this minute copied'; toast.hidden = false;
        clearTimeout(toastT); toastT = setTimeout(function () { toast.hidden = true; }, 1800);
      }).catch(function () {});
    }
  });
})();
