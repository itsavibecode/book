/* Fortress Watch v0.3.0, blackout starter kit. Vanilla JS, no build step.
   Renders the kit hero count and the item list from data/kit.json on the
   board (index.html) and on the standalone kit page (kit.html). On the kit
   page it also runs the theme toggle, the toast and the consent banner,
   which app.js handles on the board. Pictograms come from the sprite that
   tools/build-seo.py inlines into each page (<use href="#ki-<id>">). */
(function () {
  'use strict';

  var SITE = 'https://bookhockeys.com/fortress/';
  var KIT_KEY = 'fortress-kit';
  var THEME_KEY = 'fortress-theme';
  var STANDALONE = document.body.classList.contains('kit-page');
  var SVGNS = 'http://www.w3.org/2000/svg';

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
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function track(name, params) { try { if (window.gtag && !window.__gaOptedOut) window.gtag('event', name, params || {}); } catch (e) {} }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  /* Pictogram from the inlined sprite; decorative, the name sits next to it. */
  function icon(id, cls) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ki ' + (cls || ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#ki-' + id);
    svg.appendChild(use);
    return svg;
  }

  /* ---------- toast (the board's app.js owns Escape there) ---------- */
  var toastEl = $('toast'), toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4000);
  }
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

  /* ---------- render ---------- */
  function amazonUrl(q, tag) {
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(q) + (tag ? '&tag=' + encodeURIComponent(tag) : '');
  }
  function kitLoad() {
    try { var v = JSON.parse(lsGet(KIT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }

  function render(kit) {
    var host = $('kitBody');
    host.textContent = '';
    var items = (kit && Array.isArray(kit.items) ? kit.items : []).filter(function (k) { return k && k.id && k.name; });
    var core = items.filter(function (k) { return k.priority !== 'recommended'; });
    var rec = items.filter(function (k) { return k.priority === 'recommended'; });
    var countLine = $('kitCount');
    if (countLine) countLine.textContent = items.length ? plural(core.length, 'core item') + ', ' + rec.length + ' recommended' : '';
    if (!items.length) {
      host.appendChild(stateBlock('No kit items yet.', 'Items appear here once they are copied from the official checklists. The Ready.gov and UK Be Ready pages have the full lists meanwhile.'));
      return;
    }
    var srcBy = {};
    (kit.sources || []).forEach(function (s) { if (s && s.id) srcBy[s.id] = s; });
    var tag = (kit.affiliateTag || '').trim();
    var picked = kitLoad().filter(function (id) { return items.some(function (k) { return k.id === id; }); });

    var intro = el('p', 'sec-intro');
    intro.appendChild(document.createTextNode('Copied from the official checklists: '));
    var srcList = (kit.sources || []).filter(function (s) { return s && s.url; });
    srcList.forEach(function (s, i) {
      if (i) intro.appendChild(document.createTextNode(i === srcList.length - 1 ? ' and ' : ', '));
      var a = el('a', null, s.label || hostOf(s.url));
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
      intro.appendChild(a);
    });
    intro.appendChild(document.createTextNode('. Quantities are in their wording. Tick what you want and copy your list.'));
    host.appendChild(intro);

    var countEl = el('p', 'kit-count');
    countEl.setAttribute('aria-live', 'polite');
    var copy = el('button', 'btn btn-solid', 'Copy my list');
    copy.type = 'button';
    var clear = el('button', 'btn', 'Clear my list');
    clear.type = 'button';
    function syncCount() {
      countEl.textContent = picked.length ? plural(picked.length, 'item') + ' on your list.' : 'Nothing on your list yet.';
      clear.hidden = !picked.length;
      host.querySelectorAll('.kit-chip').forEach(function (c) {
        c.classList.toggle('is-picked', picked.indexOf(c.getAttribute('data-id')) > -1);
      });
    }

    /* One item's details: pictogram, name, quantity, why, sources, tick, Amazon. */
    function details(k, wrapTag) {
      var row = el(wrapTag, 'kit-item');
      row.id = 'kit-' + k.id;
      row.appendChild(icon(k.id, 'ki-row'));
      var main = el('div', 'kit-main');
      var head = el('p', 'kit-head');
      head.appendChild(el('span', 'kit-name', k.name));
      main.appendChild(head);
      if (k.quantity) main.appendChild(el('p', 'kit-qty', k.quantity));
      if (k.why) main.appendChild(el('p', 'kit-why', k.why));
      var chips = el('p', 'kit-src');
      (k.officialSources || []).forEach(function (id) {
        var s = srcBy[id];
        if (!s) return;
        var c = el('span', 'flag', s.label);
        c.title = 'On the ' + s.label + ' checklist';
        chips.appendChild(c);
      });
      if (chips.children.length) main.appendChild(chips);
      var acts = el('div', 'kit-acts');
      var lab = el('label', 'kit-check');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = picked.indexOf(k.id) > -1;
      cb.addEventListener('change', function () {
        picked = picked.filter(function (id) { return id !== k.id; });
        if (cb.checked) picked.push(k.id);
        lsSet(KIT_KEY, JSON.stringify(picked));
        syncCount();
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, 'Add to my list'));
      acts.appendChild(lab);
      if (k.amazonQuery) {
        var a = el('a', 'btn', 'Find on Amazon');
        a.href = amazonUrl(k.amazonQuery, tag);
        a.target = '_blank';
        a.rel = 'noopener nofollow sponsored';
        a.setAttribute('aria-label', 'Find ' + k.name + ' on Amazon (opens a new tab)');
        a.addEventListener('click', function () { track('kit_amazon', { item_id: k.id, tagged: !!tag }); });
        acts.appendChild(a);
      }
      main.appendChild(acts);
      row.appendChild(main);
      return row;
    }

    if (core.length) {
      host.appendChild(el('h3', 'kit-h', 'Core kit'));
      var ul = el('ul', 'kit-list kit-core');
      core.forEach(function (k) { ul.appendChild(details(k, 'li')); });
      host.appendChild(ul);
    }

    /* Recommended items are optional extras, so they sit as one compact row of
       chips that open to the same details; the core list stays scannable. */
    if (rec.length) {
      host.appendChild(el('h3', 'kit-h kit-h-rec', 'Also recommended'));
      var chipRow = el('div', 'kit-chips');
      var panels = el('div', 'kit-panels');
      rec.forEach(function (k) {
        var panel = el('div', 'kit-panel');
        panel.id = 'kp-' + k.id;
        panel.hidden = true;
        panel.appendChild(details(k, 'div'));
        var chip = el('button', 'kit-chip');
        chip.type = 'button';
        chip.setAttribute('data-id', k.id);
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-controls', panel.id);
        chip.appendChild(icon(k.id, 'ki-chip'));
        chip.appendChild(el('span', null, k.name));
        var mark = el('span', 'kit-chip-mark', 'On list');
        chip.appendChild(mark);
        chip.addEventListener('click', function () {
          var open = chip.getAttribute('aria-expanded') === 'true';
          chip.setAttribute('aria-expanded', open ? 'false' : 'true');
          panel.hidden = open;
        });
        panel.addEventListener('keydown', function (e) {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          chip.click();
          chip.focus();
        });
        chip.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && chip.getAttribute('aria-expanded') === 'true') { e.stopPropagation(); chip.click(); }
        });
        chipRow.appendChild(chip);
        panels.appendChild(panel);
      });
      host.appendChild(chipRow);
      host.appendChild(panels);
    }

    var bar = el('div', 'kit-bar');
    bar.appendChild(countEl);
    copy.addEventListener('click', function () {
      if (!picked.length) { toast('Nothing ticked yet. Tick "Add to my list" on the items you want.'); return; }
      var lines = items.filter(function (k) { return picked.indexOf(k.id) > -1; })
        .map(function (k) { return '- ' + k.name + (k.quantity ? ': ' + k.quantity : ''); });
      var text = 'My blackout starter kit, from the official lists (' + SITE + 'kit.html)\n' + lines.join('\n');
      copyText(text, function (ok) {
        toast(ok ? 'Copied ' + plural(lines.length, 'item') + '. Paste it anywhere.' : 'Copy failed. The page kept your ticks; try again.');
        track('kit_copy', { count: lines.length });
      });
    });
    clear.addEventListener('click', function () {
      picked = [];
      lsDel(KIT_KEY);
      host.querySelectorAll('.kit-check input').forEach(function (c) { c.checked = false; });
      syncCount();
      copy.focus();
    });
    bar.appendChild(copy);
    bar.appendChild(clear);
    host.appendChild(bar);
    syncCount();

    var disc = tag ? kit.disclosureWithTag : kit.disclosureNoTag;
    host.appendChild(el('p', 'kit-disclosure', disc || (tag
      ? 'The Amazon buttons are affiliate links: BookHockeys may earn a small commission if you buy, at no cost to you.'
      : 'The Amazon buttons open a plain search. We earn nothing from them.')));
  }

  /* ---------- kit page only: theme, Escape, consent ---------- */
  if (STANDALONE) {
    var themeBtn = $('themeBtn');
    var paint = function () { themeBtn.setAttribute('aria-pressed', document.documentElement.getAttribute('data-theme') === 'dark' ? 'true' : 'false'); };
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      if (next === 'dark') lsSet(THEME_KEY, 'dark'); else lsDel(THEME_KEY);
      paint();
    });
    paint();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toastEl && !toastEl.hidden) { toastEl.hidden = true; e.preventDefault(); }
    });
    var banner = $('consentBanner');
    var show = function (on) { banner.hidden = !on; document.body.classList.toggle('has-consent', on); };
    var record = function (state) {
      try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': state }); } catch (e) {}
      lsSet('greenline-consent', state);
      show(false);
      toast(state === 'granted' ? 'Analytics allowed on this device.' : 'Analytics cookies declined on this device.');
    };
    $('consentAccept').addEventListener('click', function () { record('granted'); });
    $('consentReject').addEventListener('click', function () { record('denied'); });
    $('cookieReset').addEventListener('click', function () {
      lsDel('greenline-consent');
      try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': 'denied' }); } catch (e) {}
      show(true);
      $('consentReject').focus();
    });
    if (window.__needsConsent) show(true);
  }

  /* ---------- load ---------- */
  if (!$('kitBody')) return;
  fetch('data/kit.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('kit.json: HTTP ' + r.status);
    return r.json();
  }).then(function (kit) {
    if (!kit || typeof kit !== 'object') throw new Error('kit.json: not an object');
    render(kit);
  }).catch(function () {
    var host = $('kitBody');
    host.textContent = '';
    host.appendChild(stateBlock('The starter kit did not load.', 'kit.json could not be read, so the list is empty. The Ready.gov and UK Be Ready pages have the official lists. Reload to try again.', 'Reload the page', function () { location.reload(); }));
  });
})();
