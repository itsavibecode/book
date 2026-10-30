/* Fortress Watch v0.3.0. Vanilla JS, no build step.
   Fetches data/*.json and renders every section. Each section loads on its
   own, so one missing file shows that section's error and leaves the rest. */
(function () {
  'use strict';

  var SITE = 'https://bookhockeys.com/fortress/';
  var THEME_KEY = 'fortress-theme';
  var STATUS_ORDER = ['fact', 'confirmed', 'reported', 'rumor', 'speculation', 'debunked'];
  var STATUS_LABEL = {
    fact: 'Fact', confirmed: 'Confirmed', reported: 'Reported', rumor: 'Rumor',
    speculation: 'Speculation', debunked: 'Debunked', analysis: 'Analysis', 'pending-review': 'Pending review'
  };
  /* Higher is better supported. Speculation is a different axis (a theory
     about why), so moves into or out of it are never counted as downgrades. */
  var STATUS_RANK = { fact: 5, confirmed: 4, reported: 3, rumor: 2, debunked: 1 };
  var REGION_ORDER = ['US', 'UK', 'EU', 'Asia', 'Global'];
  var THEORY_ORDER = ['iran', 'russia', 'china', 'midterms', 'false-flag', 'cyberattack', 'ai-cyber', 'grid', 'solar', 'nuclear', 'other'];
  var THEORY_LABEL = {
    nuclear: 'Nuclear', iran: 'Iran', midterms: 'Midterms', 'false-flag': 'False flag',
    cyberattack: 'Cyberattack', 'ai-cyber': 'AI and cyber', grid: 'Grid', solar: 'Solar storm',
    russia: 'Russia', china: 'China', other: 'Other'
  };
  /* Item theory -> analysis.json theory key, where the names differ. */
  var THEORY_TO_ANALYSIS = { 'ai-cyber': 'cyberattack' };
  var WIRE_FIRST = 20;
  var STALE_HOURS = 9;

  var D = { items: [], sources: [], byId: {}, srcById: {}, meta: null };
  var filters = { statuses: new Set(), regions: new Set(), theories: new Set(), simpsons: false, recent: false, minTrust: 1, sort: 'newest' };
  var boardReady = false;

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function track(name, params) { try { if (window.gtag && !window.__gaOptedOut) window.gtag('event', name, params || {}); } catch (e) {} }

  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  var TODAY = (function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  function daysFromToday(s) {
    var d = parseDay(s);
    return d ? Math.round((d - TODAY) / 86400000) : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtUTC(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }
  function timeEl(iso, text) {
    var t = el('time', 'tnum', text || iso);
    t.setAttribute('datetime', iso);
    return t;
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  /* Registrable domain: news.sky.com -> sky.com, www.bbc.co.uk -> bbc.co.uk.
     Same second-level list as refresh.py. */
  var SECOND_LEVEL = ['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'gov.au',
    'co.nz', 'govt.nz', 'co.in', 'co.jp', 'or.jp', 'go.jp', 'com.br', 'co.za', 'go.kr', 'co.kr'];
  function registrable(host) {
    var p = host.split('.');
    return p.length >= 3 && SECOND_LEVEL.indexOf(p.slice(-2).join('.')) > -1 ? p.slice(-3).join('.') : p.slice(-2).join('.');
  }
  function sourceDomains(s) {
    return [s.domain].concat(Array.isArray(s.altDomains) ? s.altDomains : [])
      .filter(function (d) { return typeof d === 'string' && d.indexOf('.') > -1; })
      .map(function (d) { return d.toLowerCase().replace(/^www\./, ''); });
  }
  /* Exact or subdomain match on domain / altDomains first, then the same
     registrable domain when one side is the bare registrable name. */
  function sourceForHost(host) {
    host = (host || '').toLowerCase().replace(/^www\./, '');
    if (!host) return null;
    var i, k, ds;
    for (i = 0; i < D.sources.length; i++) {
      ds = sourceDomains(D.sources[i]);
      for (k = 0; k < ds.length; k++) if (host === ds[k] || host.slice(-(ds[k].length + 1)) === '.' + ds[k]) return D.sources[i];
    }
    var reg = registrable(host);
    for (i = 0; i < D.sources.length; i++) {
      ds = sourceDomains(D.sources[i]);
      for (k = 0; k < ds.length; k++) if (registrable(ds[k]) === reg && (ds[k] === reg || host === reg)) return D.sources[i];
    }
    return null;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* ---------- shared renderers ---------- */
  function stamp(status, extra) {
    var known = STATUS_LABEL[status];
    var cls = 'stamp ' + (STATUS_RANK[status] || status === 'speculation' || status === 'analysis' ? 's-' + status : 's-reported') + (extra ? ' ' + extra : '');
    var s = el('span', cls);
    s.appendChild(el('span', 'sr-only', 'Label: '));
    s.appendChild(document.createTextNode(known || String(status || 'unlabeled')));
    return s;
  }
  function meter(trust) {
    var m = el('span', 'meter');
    m.setAttribute('aria-hidden', 'true');
    for (var i = 1; i <= 5; i++) m.appendChild(el('i', i <= trust ? 'on' : ''));
    return m;
  }
  function outletChip(src) {
    var c = el('span', 'outlet');
    c.title = src.trustReason || '';
    c.appendChild(el('span', 'outlet-name', src.name));
    c.appendChild(meter(src.trust));
    c.appendChild(el('span', 'trust-text', 'Trust ' + src.trust + ' of 5'));
    return c;
  }
  /* A link to a claim on the board, carrying its current label so the
     analysis and tables stay honest when a label changes. */
  function claimLink(id) {
    var it = D.byId[id];
    if (!it) return null;
    var a = el('a', 'claim-link');
    a.href = '#c-' + id;
    a.appendChild(stamp(it.status, 'stamp-sm'));
    a.appendChild(el('span', null, it.headline));
    return a;
  }
  function claimLinkList(ids) {
    var ul = el('ul', 'claim-links');
    (ids || []).forEach(function (id) {
      var a = claimLink(id);
      if (!a) return;
      var li = el('li');
      li.appendChild(a);
      ul.appendChild(li);
    });
    return ul.children.length ? ul : null;
  }
  function stateBlock(tag, title, text, btnLabel, onClick) {
    var b = el(tag, tag === 'li' ? 'board-state' : 'state');
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
  function reload() { location.reload(); }
  function errorBlock(what) {
    return stateBlock('div', what + ' did not load.', 'The data file could not be read, so this part is empty. The rest of the page is unaffected. Reload to try again.', 'Reload the page', reload);
  }

  /* ---------- item facts ---------- */
  function maxTrust(it) {
    return (it.sourceIds || []).reduce(function (m, id) {
      var s = D.srcById[id];
      return s ? Math.max(m, s.trust) : m;
    }, 0);
  }
  function history(it) { return Array.isArray(it.history) ? it.history.filter(function (h) { return h && h.date; }) : []; }
  function latestHistory(it) {
    var h = history(it).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return h[0] || null;
  }
  function isRecent(it) {
    var d = daysFromToday(it.date);
    if (d !== null && d >= -2 && d <= 0) return true;
    var lh = latestHistory(it);
    var hd = lh ? daysFromToday(lh.date) : null;
    return hd !== null && hd >= -2 && hd <= 0;
  }
  function recentUpdate(it) {
    var lh = latestHistory(it);
    if (!lh) return null;
    var d = daysFromToday(lh.date);
    return d !== null && d >= -7 && d <= 0 ? lh : null;
  }
  function downgrades(it) {
    var seq = history(it).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var out = [];
    for (var i = 1; i < seq.length; i++) {
      var a = STATUS_RANK[seq[i - 1].status], b = STATUS_RANK[seq[i].status];
      if (a && b && b < a) out.push({ from: seq[i - 1].status, to: seq[i].status, date: seq[i].date, note: seq[i].note || '' });
    }
    var last = seq[seq.length - 1];
    if (last && last.status !== it.status && STATUS_RANK[last.status] && STATUS_RANK[it.status] && STATUS_RANK[it.status] < STATUS_RANK[last.status]) {
      out.push({ from: last.status, to: it.status, date: it.updated || it.date, note: '' });
    }
    return out;
  }
  function upcoming(it) {
    if (!it.eventDate) return null;
    var d = daysFromToday(it.eventDate);
    return d !== null && d >= 0 && d <= 30 ? d : null;
  }
  function countdownText(d) { return d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; }
  function shareText(it) { return it.headline + ' [' + (STATUS_LABEL[it.status] || it.status).toUpperCase() + '] via Fortress Watch'; }

  /* ---------- theme ---------- */
  var themeBtn = $('themeBtn');
  function paintTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }
  themeBtn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (next === 'dark') lsSet(THEME_KEY, 'dark'); else lsDel(THEME_KEY);
    paintTheme();
  });
  paintTheme();

  /* ---------- toast ---------- */
  var toastEl = $('toast'), toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  }
  function hideToast() { toastEl.hidden = true; }

  /* ---------- share ---------- */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }
  function buildShare(it, strip) {
    var url = SITE + '#c-' + it.id;
    var text = shareText(it);
    strip.appendChild(el('p', 'share-text', text));
    var copy = el('button', 'btn btn-solid', 'Copy link and text');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      copyText(text + ' ' + url, function (ok) {
        toast(ok ? 'Copied. Paste it anywhere.' : 'Copy failed. The link is ' + url);
        track('share', { method: 'copy', content_type: 'claim', item_id: it.id });
      });
    });
    var x = el('a', 'btn', 'Post on X');
    x.href = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    x.target = '_blank'; x.rel = 'noopener';
    x.addEventListener('click', function () { track('share', { method: 'x', content_type: 'claim', item_id: it.id }); });
    var r = el('a', 'btn', 'Post on Reddit');
    r.href = 'https://www.reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(text);
    r.target = '_blank'; r.rel = 'noopener';
    r.addEventListener('click', function () { track('share', { method: 'reddit', content_type: 'claim', item_id: it.id }); });
    strip.appendChild(copy); strip.appendChild(x); strip.appendChild(r);
  }

  /* ---------- sources panel ---------- */
  function simpsonsInfo(it) {
    var wrap = document.createDocumentFragment();
    wrap.appendChild(el('h4', null, 'Simpsons link'));
    var s = it.simpsons;
    if (s && typeof s === 'object') {
      var bits = [];
      if (s.episode) bits.push(s.episode + (s.aired ? ' (aired ' + s.aired + ')' : ''));
      if (s.shows) bits.push('What it shows: ' + s.shows);
      wrap.appendChild(el('p', null, bits.join('. ')));
    } else if (typeof s === 'string') {
      wrap.appendChild(el('p', null, s));
    }
    wrap.appendChild(el('p', null, 'People online tie this claim to a Simpsons episode. That is a tag, not evidence: the stamp is the status. The summary above says what the episode actually shows where we have checked it. Every Simpsons-tagged claim:'));
    var others = D.items.filter(function (o) { return o.simpsons && o.id !== it.id; }).map(function (o) { return o.id; });
    var list = claimLinkList(others);
    if (list) wrap.appendChild(list);
    return wrap;
  }
  function buildPanel(it, panel) {
    panel.appendChild(el('h4', null, 'Sources'));
    var ul = el('ul');
    (it.urls || []).forEach(function (u) {
      var host = hostOf(u);
      var src = sourceForHost(host);
      var li = el('li');
      var a = el('a', null, src ? src.name : (host || u));
      a.href = u; a.target = '_blank'; a.rel = 'noopener nofollow';
      li.appendChild(a);
      li.appendChild(el('span', 'src-meta', ' ' + host + (src ? ', Trust ' + src.trust + ' of 5' : ', outlet not rated')));
      ul.appendChild(li);
    });
    if (!ul.children.length) ul.appendChild(el('li', null, 'No link on file for this claim.'));
    panel.appendChild(ul);

    if (it.quote) {
      panel.appendChild(el('h4', null, 'Quote'));
      panel.appendChild(el('blockquote', null, it.quote));
    }

    var srcs = (it.sourceIds || []).map(function (id) { return D.srcById[id]; }).filter(Boolean);
    if (srcs.length) {
      panel.appendChild(el('h4', null, 'Why each outlet has its rating'));
      var ul2 = el('ul');
      srcs.forEach(function (s) {
        ul2.appendChild(el('li', null, s.name + ': Trust ' + s.trust + ' of 5. ' + (s.trustReason || '')));
      });
      panel.appendChild(ul2);
    }

    if (it.eventDate) {
      panel.appendChild(el('h4', null, 'Scheduled date'));
      var d = upcoming(it);
      panel.appendChild(el('p', null, it.eventDate + (d !== null ? ', ' + countdownText(d) + '.' : '.') + ' A date on the board is not a warning by itself; the summary says whether the event is routine.'));
    }

    if (it.simpsons) panel.appendChild(simpsonsInfo(it));

    var h = history(it).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (h.length) {
      panel.appendChild(el('h4', null, 'Label history'));
      var ol = el('ol');
      h.forEach(function (e) {
        var li = el('li');
        li.appendChild(timeEl(e.date));
        li.appendChild(document.createTextNode(' '));
        li.appendChild(stamp(e.status, 'stamp-sm'));
        if (e.note) li.appendChild(document.createTextNode(' ' + e.note));
        ol.appendChild(li);
      });
      panel.appendChild(ol);
    }
  }

  /* ---------- board row ---------- */
  function renderRow(it, idx) {
    var li = el('li', 'claim');
    li.id = 'c-' + it.id;
    li.setAttribute('tabindex', '-1');

    var meta = el('div', 'claim-meta');
    meta.appendChild(timeEl(it.date));
    meta.appendChild(stamp(it.status, idx % 2 ? 'tilt-b' : ''));
    li.appendChild(meta);

    var body = el('div', 'claim-body');
    var flags = el('div', 'flags');
    if (it.simpsons) {
      var sp = el('span', 'flag flag-simpsons', 'SIMPSONS');
      sp.title = typeof it.simpsons === 'object' && it.simpsons.episode
        ? it.simpsons.episode + (it.simpsons.aired ? ', aired ' + it.simpsons.aired : '')
        : 'People tie this claim to a Simpsons episode. A tag, not a status.';
      flags.appendChild(sp);
    }
    if (it.theory) flags.appendChild(el('span', 'flag', 'Theory: ' + (THEORY_LABEL[it.theory] || it.theory)));
    if (it.eventDate) {
      flags.appendChild(el('span', 'flag flag-date tnum', 'DATE ' + it.eventDate));
      var cd = upcoming(it);
      if (cd !== null) flags.appendChild(el('span', 'countdown', countdownText(cd)));
    }
    if (isRecent(it)) flags.appendChild(el('span', 'flag flag-dev', 'DEVELOPING'));
    var upd = recentUpdate(it);
    if (upd) flags.appendChild(el('span', 'flag tnum', 'UPDATED ' + upd.date));
    if (downgrades(it).length) flags.appendChild(el('span', 'flag flag-corr', 'CORRECTION'));
    body.appendChild(flags);

    body.appendChild(el('h3', null, it.headline));
    body.appendChild(el('p', 'summary', it.summary));
    if (upd && upd.note) body.appendChild(el('p', 'update-note', 'Update ' + upd.date + ': ' + upd.note));

    var outs = el('div', 'outlets');
    (it.sourceIds || []).forEach(function (id) {
      var s = D.srcById[id];
      if (s) outs.appendChild(outletChip(s));
    });
    if (outs.children.length) body.appendChild(outs);

    var actions = el('div', 'actions');
    var panelId = 'src-' + it.id, shareId = 'sh-' + it.id;
    var exp = el('button', 'btn', 'Sources and quote');
    exp.type = 'button';
    exp.setAttribute('aria-expanded', 'false');
    exp.setAttribute('aria-controls', panelId);
    var shareBtn = el('button', 'btn', 'Share');
    shareBtn.type = 'button';
    shareBtn.setAttribute('aria-expanded', 'false');
    shareBtn.setAttribute('aria-controls', shareId);
    shareBtn.setAttribute('aria-label', 'Share: ' + it.headline);
    actions.appendChild(exp);
    actions.appendChild(shareBtn);
    body.appendChild(actions);

    var strip = el('div', 'share-strip');
    strip.id = shareId; strip.hidden = true;
    body.appendChild(strip);
    var panel = el('div', 'panel');
    panel.id = panelId; panel.hidden = true;
    body.appendChild(panel);

    exp.addEventListener('click', function () {
      var open = exp.getAttribute('aria-expanded') === 'true';
      if (!open && !panel.children.length) buildPanel(it, panel);
      exp.setAttribute('aria-expanded', open ? 'false' : 'true');
      panel.hidden = open;
    });
    shareBtn.addEventListener('click', function () {
      var open = shareBtn.getAttribute('aria-expanded') === 'true';
      if (!open && !strip.children.length) buildShare(it, strip);
      shareBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      strip.hidden = open;
    });

    li.appendChild(body);
    return li;
  }

  /* ---------- board ---------- */
  var boardEl = $('boardList'), countEl = $('resultCount'), clearBtn = $('clearFilters');

  function passes(it) {
    if (filters.statuses.size && !filters.statuses.has(it.status)) return false;
    if (filters.regions.size && !filters.regions.has(it.region)) return false;
    if (filters.theories.size && !filters.theories.has(it.theory)) return false;
    if (filters.simpsons && !it.simpsons) return false;
    if (filters.recent && !isRecent(it)) return false;
    if (maxTrust(it) < filters.minTrust) return false;
    return true;
  }
  function sorted(list) {
    var by = filters.sort;
    return list.slice().sort(function (a, b) {
      if (by === 'trust') {
        var t = maxTrust(b) - maxTrust(a);
        if (t) return t;
      }
      if (a.date !== b.date) return (by === 'oldest') === (a.date < b.date) ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  }
  function anyFilter() {
    return filters.statuses.size || filters.regions.size || filters.theories.size || filters.simpsons || filters.recent || filters.minTrust > 1;
  }
  function renderBoard() {
    boardEl.textContent = '';
    boardEl.removeAttribute('aria-busy');
    if (!D.items.length) {
      boardEl.appendChild(stateBlock('li', 'No claims on the board yet.', 'Claims appear here after the first hand review of the sources. The wire below shows what is being reported meanwhile.'));
      countEl.textContent = '';
      return;
    }
    var shown = sorted(D.items.filter(passes));
    shown.forEach(function (it, i) { boardEl.appendChild(renderRow(it, i)); });
    if (!shown.length) {
      var why = filters.recent ? 'Nothing on the board is dated or updated in the last 48 hours with these filters.' : 'No claim matches all of these filters together.';
      boardEl.appendChild(stateBlock('li', 'No claims match these filters.', why + ' Clear them to see all ' + D.items.length + ' claims.', 'Clear filters', clearFilters));
    }
    countEl.textContent = 'Showing ' + shown.length + ' of ' + plural(D.items.length, 'claim');
    clearBtn.hidden = !anyFilter();
  }

  /* ---------- filters ---------- */
  function chip(label, pressed, onClick, title) {
    var b = el('button', 'btn', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }
  function chipGroup(host, values, set, labelOf, allTitle) {
    host.textContent = '';
    host.appendChild(chip('All', set.size === 0, function () { set.clear(); refresh(); }, allTitle));
    values.forEach(function (v) {
      host.appendChild(chip(labelOf(v), set.has(v), function () {
        if (set.has(v)) set.delete(v); else set.add(v);
        refresh();
      }));
    });
  }
  function present(key, order) {
    var seen = {};
    D.items.forEach(function (it) { if (it[key]) seen[it[key]] = true; });
    var out = order.filter(function (v) { return seen[v]; });
    Object.keys(seen).sort().forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); });
    return out;
  }
  var mtButtons = [];
  function buildFilters() {
    var mt = $('mtBtns');
    mt.textContent = '';
    mtButtons = [];
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var b = el('button', 'mt-btn');
        b.type = 'button';
        b.setAttribute('aria-label', n === 1 ? 'Any trust' : 'Trust ' + n + ' of 5 or higher');
        b.appendChild(el('i'));
        b.addEventListener('click', function () { filters.minTrust = n; refresh(); });
        mt.appendChild(b);
        mtButtons.push(b);
      })(i);
    }
    $('simpsonsChip').addEventListener('click', function () { filters.simpsons = !filters.simpsons; refresh(); });
    $('recentChip').addEventListener('click', function () { filters.recent = !filters.recent; refresh(); });
    $('sortSel').addEventListener('change', function (e) { filters.sort = e.target.value; refresh(); });
    clearBtn.addEventListener('click', clearFilters);
    if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) $('moreFilters').open = true;
  }
  function syncFilters() {
    chipGroup($('statusChips'), present('status', STATUS_ORDER), filters.statuses, function (s) { return STATUS_LABEL[s] || s; });
    chipGroup($('regionChips'), present('region', REGION_ORDER), filters.regions, function (r) { return r; });
    chipGroup($('theoryChips'), present('theory', THEORY_ORDER), filters.theories, function (t) { return THEORY_LABEL[t] || t; });
    $('simpsonsChip').setAttribute('aria-pressed', filters.simpsons ? 'true' : 'false');
    $('recentChip').setAttribute('aria-pressed', filters.recent ? 'true' : 'false');
    mtButtons.forEach(function (b, idx) {
      b.classList.toggle('on', idx < filters.minTrust);
      b.setAttribute('aria-pressed', idx + 1 === filters.minTrust ? 'true' : 'false');
    });
    $('mtReadout').textContent = filters.minTrust === 1 ? 'Any' : filters.minTrust + ' and up';
    $('sortSel').value = filters.sort;
    var n = (filters.regions.size ? 1 : 0) + (filters.theories.size ? 1 : 0) + (filters.minTrust > 1 ? 1 : 0) + (filters.sort !== 'newest' ? 1 : 0);
    $('moreCount').textContent = n ? '(' + n + ' set)' : '';
  }
  /* Rebuilding the chip rows replaces the focused button, so focus is put
     back on the control with the same label. */
  function refresh() {
    var a = document.activeElement;
    var group = a && a.parentNode && a.parentNode.id;
    var label = a && a.textContent;
    syncFilters();
    renderBoard();
    if (group && /Chips$/.test(group)) {
      var again = Array.prototype.filter.call($(group).children, function (b) { return b.textContent === label; })[0];
      if (again) again.focus();
    }
  }
  function clearFilters() {
    filters.statuses.clear(); filters.regions.clear(); filters.theories.clear();
    filters.simpsons = false; filters.recent = false; filters.minTrust = 1;
    syncFilters(); renderBoard();
    $('board-h').focus();
  }

  /* ---------- deep links ---------- */
  var lastTarget = null;
  function goToHash() {
    var m = /^#c-(.+)$/.exec(location.hash);
    if (!m || !boardReady) return;
    var id = decodeURIComponent(m[1]);
    var it = D.byId[id];
    if (!it) {
      toast('That claim is no longer on the board.');
      return;
    }
    if (!passes(it)) {
      filters.statuses.clear(); filters.regions.clear(); filters.theories.clear();
      filters.simpsons = false; filters.recent = false; filters.minTrust = 1;
      syncFilters(); renderBoard();
    }
    var row = $('c-' + id);
    if (!row) return;
    if (lastTarget && lastTarget !== row) lastTarget.classList.remove('is-target');
    row.classList.add('is-target');
    lastTarget = row;
    row.scrollIntoView({ block: 'start' });
    row.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', goToHash);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#c-"]');
    if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); goToHash(); }
  });

  /* ---------- status line ---------- */
  function renderStatus(meta, metaOk) {
    if (meta && meta.statusConfirmed) $('statusConfirmed').textContent = meta.statusConfirmed;
    if (meta && meta.statusNotTrue) $('statusNotTrue').textContent = meta.statusNotTrue;
    var box = $('statusMeta');
    box.textContent = '';

    var p1 = el('p');
    if (metaOk && meta.lastUpdated) {
      p1.appendChild(document.createTextNode('Board last changed '));
      p1.appendChild(timeEl(meta.lastUpdated, fmtUTC(meta.lastUpdated)));
      p1.appendChild(document.createTextNode('. '));
    }
    if (metaOk && meta.lastFeedRun) {
      p1.appendChild(document.createTextNode('Wire checked '));
      p1.appendChild(timeEl(meta.lastFeedRun, fmtUTC(meta.lastFeedRun)));
      p1.appendChild(document.createTextNode('.'));
    }
    if (!metaOk) p1.textContent = 'The update times did not load (meta.json could not be read). The claims below are unaffected.';
    if (p1.childNodes.length) box.appendChild(p1);

    if (!boardReady) {
      box.appendChild(el('p', null, 'Label counts are unavailable because the claims list did not load.'));
      return;
    }
    var tally = {};
    D.items.forEach(function (it) { tally[it.status] = (tally[it.status] || 0) + 1; });
    var parts = STATUS_ORDER.filter(function (s) { return tally[s]; }).map(function (s) { return tally[s] + ' ' + s; });
    Object.keys(tally).forEach(function (s) { if (STATUS_ORDER.indexOf(s) === -1) parts.push(tally[s] + ' ' + (STATUS_LABEL[s] || s).toLowerCase()); });
    var p2 = el('p', 'tnum');
    p2.appendChild(el('strong', null, plural(D.items.length, 'claim') + ':'));
    p2.appendChild(document.createTextNode(' ' + parts.join(', ') + '.'));
    box.appendChild(p2);

    D.items.filter(function (it) { return upcoming(it) !== null; })
      .sort(function (a, b) { return a.eventDate < b.eventDate ? -1 : 1; })
      .slice(0, 2)
      .forEach(function (it) {
        var p = el('p', 'next-date');
        p.appendChild(el('strong', null, 'Coming up: '));
        var a = el('a', null, it.headline);
        a.href = '#c-' + it.id;
        p.appendChild(a);
        p.appendChild(document.createTextNode(', '));
        p.appendChild(timeEl(it.eventDate));
        p.appendChild(document.createTextNode(', ' + countdownText(upcoming(it)) + '.'));
        box.appendChild(p);
      });

    var recent = D.items.filter(isRecent).length;
    var p3 = el('p');
    if (recent) {
      var link = el('a', null, 'New or changed in the last 48 hours: ' + plural(recent, 'claim'));
      link.href = '#board';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        filters.recent = true;
        syncFilters(); renderBoard();
        $('board-h').focus();
        $('board').scrollIntoView({ block: 'start' });
      });
      p3.appendChild(link);
    } else {
      p3.textContent = 'Nothing on the board is new or changed in the last 48 hours.';
    }
    box.appendChild(p3);
    var pm = el('p');
    var mapA = el('a', null, 'See where the claims come from');
    mapA.href = 'map.html';
    pm.appendChild(mapA);
    box.appendChild(pm);
    var p4 = el('p');
    var kitA = el('a', null, 'What to keep at home: the blackout starter kit from the official lists');
    kitA.href = '#kit';
    p4.appendChild(kitA);
    box.appendChild(p4);
  }

  /* ---------- theories rail ---------- */
  function renderTheories(analysis) {
    var host = $('theoryRail');
    host.textContent = '';
    var aBy = {};
    ((analysis && analysis.theories) || []).forEach(function (a) { aBy[a.theory] = a; });
    var cards = D.items.filter(function (it) { return it.status === 'speculation'; }).map(function (it) {
      var a = aBy[THEORY_TO_ANALYSIS[it.theory] || it.theory] || null;
      /* "other" is a catch-all, so only named theories count their sibling claims. */
      var siblings = it.theory && it.theory !== 'other' ? D.items.filter(function (o) { return o.theory === it.theory; }).length : 1;
      var linked = siblings + (a ? (a.visibleToday || []).filter(function (id) { return D.byId[id]; }).length : 0);
      return { it: it, a: a, count: linked };
    }).sort(function (x, y) { return y.count - x.count || (x.it.date < y.it.date ? 1 : -1); });

    if (!cards.length) {
      host.appendChild(stateBlock('div', 'No theories on the board yet.', 'When a theory about why starts circulating, it gets a SPECULATION claim on the board and a card here.'));
      return;
    }
    /* Spans on the 6-column desktop grid: first card full width, the next two
       halves, the rest thirds; a short last row stretches to fill. */
    var spans = cards.map(function (c, i) { return i === 0 ? 6 : i <= 2 ? 3 : 2; });
    var thirds = spans.filter(function (s) { return s === 2; }).length;
    if (thirds % 3 === 1) spans[spans.length - 1] = 6;
    if (thirds % 3 === 2) { spans[spans.length - 1] = 3; spans[spans.length - 2] = 3; }
    if (cards.length === 2) spans[1] = 6;

    cards.forEach(function (c, i) {
      var it = c.it, a = c.a;
      var card = el('article', 'theory' + (i === 0 ? ' theory-wide' : ''));
      card.style.setProperty('--span', spans[i]);
      var head = el('div');
      head.appendChild(stamp('speculation', i % 2 ? 'tilt-b' : ''));
      head.appendChild(el('h3', null, it.headline.replace(/^Theory:\s*/i, '')));
      var seen = (it.sourceIds || []).map(function (id) { return D.srcById[id]; }).filter(Boolean)
        .map(function (s) { return s.name + ' (trust ' + s.trust + ')'; });
      if (seen.length) head.appendChild(el('p', 'pushed', 'Seen in: ' + seen.join(', ')));
      var claimA = el('a', 'more', 'The claim on the board');
      claimA.href = '#c-' + it.id;
      head.appendChild(claimA);
      card.appendChild(head);

      var body = el('div');
      body.appendChild(el('h4', null, 'Points toward'));
      var fm = /^[\s\S]*?\.(?=\s|$)/.exec(it.summary || '');
      var first = fm ? fm[0] : (it.summary || '');
      body.appendChild(el('p', null, first));
      var toward = a ? (a.visibleToday || []).filter(function (id) {
        var o = D.byId[id];
        return o && o.id !== it.id && STATUS_RANK[o.status] >= 3;
      }) : [];
      var tl = claimLinkList(toward.slice(0, i === 0 ? 4 : 3));
      if (tl) body.appendChild(tl);
      else if (a) body.appendChild(el('p', 'pushed', 'Nothing on the board above rumor level points toward it.'));

      body.appendChild(el('h4', null, 'Points against'));
      var rest = (it.summary || '').slice(first.length).trim();
      body.appendChild(el('p', null, a ? a.boringExplanation : (rest || 'No written analysis for this theory yet.')));
      if (a) {
        var more = el('a', 'more', 'Full reasoning in the analysis');
        more.href = '#a-' + a.theory;
        body.appendChild(more);
      }
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  /* ---------- analysis ---------- */
  function renderAnalysis(an) {
    var host = $('analysisBody');
    host.textContent = '';
    $('analysisSig').textContent = an.author || ('Analysis by Claude, ' + (an.updated || '') + ', not a prediction.');
    if (an.intro) host.appendChild(el('p', 'intro', an.intro));
    (an.theories || []).forEach(function (t) {
      var art = el('article', 'a-theory');
      art.id = 'a-' + t.theory;
      var hd = el('div');
      hd.appendChild(stamp('analysis', 'stamp-sm'));
      hd.appendChild(el('h3', null, t.title || t.theory));
      art.appendChild(hd);
      var dl = el('dl');
      function row(term, node) {
        dl.appendChild(el('dt', null, term));
        var dd = el('dd');
        if (typeof node === 'string') dd.textContent = node; else dd.appendChild(node);
        dl.appendChild(dd);
      }
      if (t.trigger) row('What would set it off', t.trigger);
      if (t.earlySigns && t.earlySigns.length) {
        var ul = el('ul');
        t.earlySigns.forEach(function (s) { ul.appendChild(el('li', null, s)); });
        row('What we would see first', ul);
      }
      var vis = claimLinkList(t.visibleToday);
      row('On the board today', vis || el('span', 'none', 'Nothing on the board yet.'));
      if (t.boringExplanation) row('The boring explanation', t.boringExplanation);
      art.appendChild(dl);
      host.appendChild(art);
    });
    if (an.nov17) {
      var box = el('div', 'nov17');
      box.id = 'nov17';
      box.appendChild(el('h3', null, an.nov17.title || 'November 17'));
      box.appendChild(el('p', null, an.nov17.text));
      var l = claimLinkList(an.nov17.itemIds);
      if (l) box.appendChild(l);
      host.appendChild(box);
    }
    if (an.verdict) {
      var v = el('div', 'verdict');
      v.appendChild(el('h3', null, 'Most likely reading, with its uncertainty'));
      v.appendChild(el('p', null, an.verdict));
      host.appendChild(v);
    }
  }

  /* ---------- officials table ---------- */
  function renderGuidance(rows) {
    var host = $('guideBody');
    host.textContent = '';
    if (!rows.length) {
      host.appendChild(stateBlock('div', 'No official guidance listed yet.', 'Rows appear here once a government publication is on the board.'));
      return;
    }
    var t = el('table', 'tbl');
    var thead = el('thead'), hr = el('tr');
    ['Who', 'What they ask', 'How long', 'Date', 'Source'].forEach(function (h) {
      var th = el('th', null, h); th.scope = 'col'; hr.appendChild(th);
    });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      var th = el('th', null, r.country); th.scope = 'row'; th.setAttribute('data-label', 'Who');
      tr.appendChild(th);
      var g = el('td', null, r.guidance); g.setAttribute('data-label', 'Asks'); tr.appendChild(g);
      var du = el('td', 'dur', r.duration); du.setAttribute('data-label', 'How long'); tr.appendChild(du);
      var dt = el('td'); dt.setAttribute('data-label', 'Date');
      var dwrap = el('span');
      dwrap.appendChild(timeEl(r.date));
      if (r.dateNote) dwrap.appendChild(document.createTextNode(' (' + r.dateNote + ')'));
      dt.appendChild(dwrap); tr.appendChild(dt);
      var src = el('td'); src.setAttribute('data-label', 'Source');
      var sw = el('div');
      if (r.officialUrl) {
        var a = el('a', null, r.officialLabel || hostOf(r.officialUrl));
        a.href = r.officialUrl; a.target = '_blank'; a.rel = 'noopener';
        sw.appendChild(a);
      } else if (r.officialLabel) {
        sw.appendChild(el('span', null, r.officialLabel));
      }
      var cl = claimLinkList(r.itemIds);
      if (cl) sw.appendChild(cl);
      src.appendChild(sw); tr.appendChild(src);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.appendChild(t);
  }

  /* ---------- FAQ ---------- */
  function renderFaq(list) {
    var host = $('faqBody');
    host.textContent = '';
    if (!list.length) {
      host.appendChild(stateBlock('div', 'No questions listed yet.'));
      return;
    }
    list.forEach(function (f, i) {
      var d = el('details');
      d.id = 'q-' + (i + 1);
      d.appendChild(el('summary', null, f.q));
      var ans = el('div', 'answer');
      ans.appendChild(el('p', null, f.a));
      var cl = claimLinkList(f.itemIds);
      if (cl) {
        ans.appendChild(el('p', 'pushed', 'On the board:'));
        ans.appendChild(cl);
      }
      d.appendChild(ans);
      host.appendChild(d);
    });
  }

  /* ---------- wire ---------- */
  function renderWire(feed, meta) {
    var host = $('wireBody');
    host.textContent = '';
    var entries = (Array.isArray(feed) ? feed : []).slice().sort(function (a, b) { return a.published < b.published ? 1 : -1; });
    var last = meta && meta.lastFeedRun ? new Date(meta.lastFeedRun) : null;
    var ageH = last && !isNaN(last) ? (Date.now() - last.getTime()) / 3600000 : null;
    if (meta && meta.feedStatus === 'failed') {
      host.appendChild(el('p', 'wire-warn', 'The last wire refresh failed' + (meta.lastFeedAttempt ? ' (' + fmtUTC(meta.lastFeedAttempt) + ')' : '') + '. These headlines are from the last good refresh. The board above is unaffected.'));
    } else if (ageH !== null && ageH > STALE_HOURS) {
      host.appendChild(el('p', 'wire-warn', 'The wire is ' + Math.round(ageH) + ' hours old, so the last scheduled refresh did not run or failed. The board above is unaffected.'));
    } else if (meta && meta.feedStatus === 'partial') {
      host.appendChild(el('p', 'wire-note', 'Some searches failed on the last refresh, so a few headlines may be missing.'));
    }
    if (!entries.length) {
      host.appendChild(stateBlock('div', 'No matching headlines in the last 48 hours.', 'The wire is checked every 6 hours' + (last ? '; the last check was ' + fmtUTC(meta.lastFeedRun) : '') + '. The board above has every reviewed claim.'));
      return;
    }
    host.appendChild(el('p', 'wire-note', plural(entries.length, 'headline') + ' from the last 48 hours' + (last ? ', checked ' + fmtUTC(meta.lastFeedRun) : '') + '.'));
    var ul = el('ul', 'wire');
    function addRow(e) {
      var li = el('li');
      var d = new Date(e.published);
      var t = el('time', 'tnum');
      t.setAttribute('datetime', e.published);
      if (!isNaN(d)) {
        t.appendChild(document.createTextNode(fmtUTC(e.published).slice(0, 10)));
        t.appendChild(el('br'));
        t.appendChild(document.createTextNode(fmtUTC(e.published).slice(11)));
      }
      li.appendChild(t);
      var b = el('div');
      var a = el('a', null, e.title);
      a.href = e.url; a.target = '_blank'; a.rel = 'noopener nofollow';
      b.appendChild(a);
      var src = el('div', 'w-src');
      var known = (e.sourceId && D.srcById[e.sourceId]) || sourceForHost(e.domain);
      var trust = known ? known.trust : e.trust;
      src.appendChild(el('span', null, (known ? known.name : (e.outlet || e.domain || 'Unknown outlet'))));
      if (trust) {
        src.appendChild(meter(trust));
        src.appendChild(el('span', 'trust-text', 'Trust ' + trust + ' of 5'));
      } else {
        src.appendChild(el('span', null, 'Outlet not rated'));
      }
      b.appendChild(src);
      li.appendChild(b);
      ul.appendChild(li);
    }
    entries.slice(0, WIRE_FIRST).forEach(addRow);
    host.appendChild(ul);
    if (entries.length > WIRE_FIRST) {
      var more = el('button', 'btn wire-more', 'Show all ' + entries.length + ' headlines');
      more.type = 'button';
      more.addEventListener('click', function () {
        var firstNew = ul.children.length;
        entries.slice(WIRE_FIRST).forEach(addRow);
        more.remove();
        var a = ul.children[firstNew] && ul.children[firstNew].querySelector('a');
        if (a) a.focus();
      });
      host.appendChild(more);
    }
  }

  /* ---------- corrections ---------- */
  function renderCorrections() {
    var host = $('corrBody');
    host.textContent = '';
    var log = [];
    D.items.forEach(function (it) { downgrades(it).forEach(function (d) { log.push({ it: it, d: d }); }); });
    log.sort(function (x, y) { return x.d.date < y.d.date ? 1 : -1; });
    if (!log.length) {
      host.appendChild(stateBlock('div', 'No corrections yet.', 'When we downgrade a label, the change is listed here with its date and reason, and the old label stays in that claim\'s history.'));
      return;
    }
    var ul = el('ul', 'corr-list');
    log.forEach(function (c) {
      var li = el('li');
      li.appendChild(timeEl(c.d.date));
      li.appendChild(document.createTextNode(' '));
      li.appendChild(stamp(c.d.from, 'stamp-sm'));
      li.appendChild(document.createTextNode(' to '));
      li.appendChild(stamp(c.d.to, 'stamp-sm'));
      li.appendChild(document.createTextNode(' '));
      var a = el('a', null, c.it.headline);
      a.href = '#c-' + c.it.id;
      li.appendChild(a);
      if (c.d.note) li.appendChild(el('p', 'update-note', c.d.note));
      ul.appendChild(li);
    });
    host.appendChild(ul);
  }

  /* ---------- keyboard: Escape closes the toast and any open share strip ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var closed = false;
    if (!toastEl.hidden) { hideToast(); closed = true; }
    var openShare = document.querySelector('.actions button[aria-controls^="sh-"][aria-expanded="true"]');
    if (openShare) {
      var strip = $(openShare.getAttribute('aria-controls'));
      if (strip && strip.contains(document.activeElement)) {
        openShare.click();
        openShare.focus();
        closed = true;
      }
    }
    if (closed) e.preventDefault();
  });

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
  function getJSON(name) {
    return fetch('data/' + name + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + '.json: HTTP ' + r.status);
      return r.json();
    });
  }
  function settle(p) { return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; }); }

  buildFilters();
  /* The blackout starter kit renders from kit.js, shared with kit.html. */
  Promise.all(['items', 'sources', 'meta', 'analysis', 'guidance', 'faq', 'feed'].map(function (n) { return settle(getJSON(n)); }))
    .then(function (r) {
      var items = r[0], sources = r[1], meta = r[2], analysis = r[3], guidance = r[4], faq = r[5], feed = r[6];
      var metaOk = meta.ok && meta.v && typeof meta.v === 'object';
      D.meta = metaOk ? meta.v : null;

      if (items.ok && sources.ok && Array.isArray(items.v) && Array.isArray(sources.v)) {
        D.items = items.v.filter(function (it) { return it && it.id && it.headline; });
        D.sources = sources.v;
        D.items.forEach(function (it) { D.byId[it.id] = it; });
        D.sources.forEach(function (s) { D.srcById[s.id] = s; });
        boardReady = true;
        syncFilters();
        renderBoard();
      } else {
        boardEl.textContent = '';
        boardEl.removeAttribute('aria-busy');
        boardEl.appendChild(stateBlock('li', 'The claims list did not load.', (items.ok ? 'sources.json' : 'items.json') + ' could not be read. The status line above is from the last published version. Reload to try again.', 'Reload the page', reload));
        countEl.textContent = '';
      }

      renderStatus(D.meta, metaOk);

      if (!boardReady) {
        ['theoryRail', 'analysisBody', 'guideBody', 'faqBody', 'corrBody'].forEach(function (id) {
          $(id).textContent = '';
          $(id).appendChild(stateBlock('div', 'This part needs the claims list, which did not load.', 'Reload the page to try again.', 'Reload the page', reload));
        });
      } else {
        renderTheories(analysis.ok ? analysis.v : null);
        if (analysis.ok && analysis.v) renderAnalysis(analysis.v); else { $('analysisBody').textContent = ''; $('analysisBody').appendChild(errorBlock('The analysis')); }
        if (guidance.ok && Array.isArray(guidance.v)) renderGuidance(guidance.v); else { $('guideBody').textContent = ''; $('guideBody').appendChild(errorBlock('The official guidance table')); }
        if (faq.ok && Array.isArray(faq.v)) renderFaq(faq.v); else { $('faqBody').textContent = ''; $('faqBody').appendChild(errorBlock('The questions')); }
        renderCorrections();
      }
      if (feed.ok) renderWire(feed.v, D.meta);
      else { $('wireBody').textContent = ''; $('wireBody').appendChild(stateBlock('div', 'The wire did not load.', 'feed.json could not be read, so there are no auto-collected headlines to show. The board above is unaffected. Reload to try again.', 'Reload the page', reload)); }

      if (location.hash) {
        if (/^#c-/.test(location.hash)) goToHash();
        else { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
      }
    });
})();
