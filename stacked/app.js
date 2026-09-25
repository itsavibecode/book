/* Stacked v0.2.0 - multi-stream viewer for Kick.
   Vanilla JS, no build, no dependencies. Kick URLs and the channel API live
   in kick.js (window.Kick), the split tree in layout.js (window.Layout);
   this file is the page. */
(function () {
  'use strict';

  var MAX = 8;              // hard cap on tiles
  var WARN_AT = 5;          // passive heads-up about CPU/heat
  var POLL_MS = 60000;      // live status refresh per channel
  var GAP = 8, PAD = 8;     // grid spacing in px (matches the gutter width)
  var MIN_TILE = 120;       // smallest cell a gutter drag may leave, px
  var LS = { last: 'stacked:last', chat: 'stacked:chatHidden', recent: 'stacked:recent', layout: 'stacked:layout' };

  // Tiles per row for each count (the auto grid). 3 = 2 + 1 centred.
  var ROWS = { 1: [1], 2: [2], 3: [2, 1], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4] };

  var ICON = {
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/></svg>',
    reload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    grip: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="4" cy="2.5" r="1.1"/><circle cx="8" cy="2.5" r="1.1"/><circle cx="4" cy="6" r="1.1"/><circle cx="8" cy="6" r="1.1"/><circle cx="4" cy="9.5" r="1.1"/><circle cx="8" cy="9.5" r="1.1"/></svg>'
  };

  var PRESET_TIP = {
    grid: 'Auto grid (g): 16:9 tiles packed into the space. Drag the bars between tiles to size them by hand.',
    side: 'Side by side: every stream in one row. Drag the bars between tiles to change widths.',
    stack: 'Stack: full-width rows, one above the other, even with two streams. Drag the bars to change row heights.',
    focus: 'Focus (f): the audible stream big on top, the rest in a strip below. Unmute a strip tile to swap it in.'
  };
  var PHONE_TIP = 'Layouts need a wider screen. At phone width the streams are always stacked.';

  function $(id) { return document.getElementById(id); }
  var app = $('app'), area = $('area'), grid = $('grid');
  var splitsEl = $('splits'), shield = $('shield');
  var layBtns = [].slice.call(document.querySelectorAll('#layGrp [data-lay]'));
  var chatBtn = $('chatBtn');
  var modal = $('addModal'), addForm = $('addForm'), addInput = $('addInput');
  var addErr = $('addErr'), addGo = $('addGo');
  var mqPhone = window.matchMedia('(max-width: 699px)');

  var order = [];     // slugs in display order (always the tree's reading order)
  var tiles = {};     // slug -> tile record
  var audible = null; // slug of the one tile with sound, or null

  // The layout. While `custom` is false the tree is rebuilt from the preset
  // on every change; once a gutter has been dragged the tree is kept and
  // edited in place (new tiles appended, removed ones collapsed away).
  var lay = { preset: 'grid', custom: false, tree: null };
  var stash = null;   // the layout `f` returns to when it leaves Focus
  var drag = null;    // gutter resize or tile reorder in progress

  function isPhone() { return mqPhone.matches; }

  /* ---------- storage ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, dflt) {
    try { var v = JSON.parse(lsGet(k)); return v == null ? dflt : v; } catch (e) { return dflt; }
  }

  /* ---------- toasts ---------- */
  function toast(msg, kind) {
    var box = $('toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, kind === 'err' ? 5000 : 3500);
  }

  /* ---------- tiles ---------- */
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

  function makeTile(slug) {
    var el = document.createElement('div');
    el.className = 'tile loading';
    el.dataset.slug = slug;
    el.innerHTML =
      '<div class="media"></div>' +
      '<div class="top"><span class="pill" hidden></span>' +
        '<span class="chip"><span class="grip" title="Drag onto another tile to swap their places">' + ICON.grip + '</span>' +
        '<img class="av" alt="" referrerpolicy="no-referrer" hidden><span class="av av-ph"></span>' +
        '<span class="nm"></span><span class="n" hidden>' + ICON.eye + '<b></b></span></span></div>' +
      '<div class="mid"><button type="button" class="unmute" title="Move the sound to this stream (every other tile mutes)">' +
        ICON.vol + '<span class="lbl">Click to unmute</span></button></div>' +
      '<div class="offcard" hidden><span class="pill off">OFFLINE</span><h4></h4><p></p></div>' +
      '<div class="wait">Checking channel...</div>' +
      '<div class="bar">' +
        '<button type="button" class="ib" data-act="mute"></button>' +
        '<button type="button" class="ib" data-act="reload" title="Reload this player and re-check the channel">' + ICON.reload + '</button>' +
        '<a class="ib" data-act="open" target="_blank" rel="noopener" title="Open this channel on kick.com in a new tab">' + ICON.ext + '</a>' +
        '<span class="sep" aria-hidden="true"></span>' +
        '<button type="button" class="ib" data-act="remove" title="Remove this stream from the session">' + ICON.x + '</button>' +
      '</div>';
    el.querySelector('[data-act="open"]').href = Kick.channelPage(slug);
    var img = el.querySelector('img.av');
    img.addEventListener('error', function () { img.hidden = true; img.nextSibling.hidden = false; });
    return el;
  }

  // Keep the tile's media (player iframe / offline background) in step with
  // its state. The iframe is only re-created when its URL must change, so a
  // poll that finds nothing new never reloads a player.
  function setMedia(t, force) {
    var media = t.el.querySelector('.media');
    if (t.state === 'live' || t.state === 'unknown') {
      var want = Kick.playerUrl(t.slug, audible !== t.slug);
      if (force || !t.iframe || t.src !== want) {
        var f = document.createElement('iframe');
        f.src = want;
        f.setAttribute('allow', 'autoplay; fullscreen');
        f.setAttribute('scrolling', 'no');
        f.title = (t.info ? t.info.name : t.slug) + ' on Kick';
        media.textContent = '';
        media.appendChild(f);
        t.iframe = f;
        t.src = want;
      }
    } else {
      t.iframe = null;
      t.src = '';
      media.textContent = '';
      if (t.state === 'offline' && t.info && t.info.banner) {
        var bg = document.createElement('div');
        bg.className = 'bg';
        bg.style.backgroundImage = 'url("' + t.info.banner.replace(/["\\\n]/g, '') + '")';
        media.appendChild(bg);
      }
    }
  }

  function paintTile(t) {
    var el = t.el, info = t.info;
    var name = info ? info.name : t.slug;
    el.classList.toggle('loading', t.state === 'loading');
    el.classList.toggle('offline', t.state === 'offline');
    el.classList.toggle('audible', audible === t.slug);

    var pill = el.querySelector('.top .pill');
    pill.hidden = !(t.state === 'live' || t.state === 'offline');
    pill.textContent = t.state === 'live' ? 'LIVE' : 'OFFLINE';
    pill.classList.toggle('off', t.state === 'offline');

    var chip = el.querySelector('.chip');
    chip.title = info && info.live && info.title ? name + ' - ' + info.title : name;
    el.querySelector('.nm').textContent = name;
    var img = el.querySelector('img.av'), ph = el.querySelector('.av-ph');
    if (info && info.avatar) {
      if (img.getAttribute('src') !== info.avatar) img.src = info.avatar;
      img.hidden = false; ph.hidden = true;
    } else {
      img.hidden = true; ph.hidden = false;
    }
    var n = el.querySelector('.chip .n');
    n.hidden = t.state !== 'live';
    n.querySelector('b').textContent = info ? fmt(info.viewers) : '';
    n.title = info ? fmt(info.viewers) + ' watching' : '';

    var card = el.querySelector('.offcard');
    card.hidden = t.state !== 'offline';
    if (t.state === 'offline') {
      card.querySelector('h4').textContent = name + ' is offline';
      var bio = info && info.bio ? info.bio : '';
      if (bio.length > 180) bio = bio.slice(0, 177).replace(/\s+\S*$/, '') + '...';
      card.querySelector('p').textContent = bio ||
        'Stays in the grid and switches to the player when the channel goes live.';
    }

    var mb = el.querySelector('[data-act="mute"]');
    var canPlay = t.state === 'live' || t.state === 'unknown';
    mb.hidden = !canPlay;
    if (audible === t.slug) {
      mb.innerHTML = ICON.vol;
      mb.title = 'Mute this stream';
    } else {
      mb.innerHTML = ICON.muted;
      mb.title = 'Unmute this stream (every other tile mutes)';
    }
  }

  function applyInfo(t, res) {
    t.lastPoll = Date.now();
    if (res.status === 'ok') {
      t.info = res;
      t.state = res.live ? 'live' : 'offline';
    } else if (t.state === 'loading') {
      t.state = 'unknown'; // Kick unreachable: show the player anyway, keep polling
    }
    if (t.state === 'offline' && audible === t.slug) audible = null;
    setMedia(t);
    paintTile(t);
  }

  function addTile(slug, res) {
    var t = { slug: slug, info: null, state: 'loading', el: makeTile(slug), lastPoll: 0, iframe: null, src: '' };
    tiles[slug] = t;
    order.push(slug);
    grid.appendChild(t.el);
    if (res) applyInfo(t, res); else paintTile(t);
    return t;
  }

  function removeTile(slug) {
    var t = tiles[slug];
    if (!t) return;
    if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
    delete tiles[slug];
    order.splice(order.indexOf(slug), 1);
    if (audible === slug) audible = null;
  }

  // Tile restored from a link: create it straight away, then look it up.
  function addAndFetch(slug) {
    var t = addTile(slug, null);
    Kick.fetchChannel(slug).then(function (res) {
      if (tiles[slug] !== t) return; // removed while loading
      if (res.status === 'missing') {
        removeTile(slug);
        treeRemove(slug);
        toast('No Kick channel called "' + slug + '", so it was left out.', 'err');
        afterChange();
        return;
      }
      if (res.status === 'ok' && res.slug !== slug && !tiles[res.slug]) renameTile(t, res.slug);
      applyInfo(t, res);
    });
  }

  function renameTile(t, slug) {
    var i = order.indexOf(t.slug), old = t.slug;
    delete tiles[t.slug];
    if (audible === t.slug) audible = slug;
    if (lay.tree) lay.tree = Layout.mapLeaves(lay.tree, function (s) { return s === old ? slug : s; });
    t.slug = slug;
    t.el.dataset.slug = slug;
    t.el.querySelector('[data-act="open"]').href = Kick.channelPage(slug);
    tiles[slug] = t;
    order[i] = slug;
    afterChange();
  }

  /* ---------- audio focus: one audible tile at a time ---------- */
  function setAudible(slug) {
    if (slug && (!tiles[slug] || tiles[slug].state === 'offline' || tiles[slug].state === 'loading')) return;
    var prev = audible;
    if (prev === slug) return;
    audible = slug;
    [prev, slug].forEach(function (s) {
      if (s && tiles[s]) { setMedia(tiles[s]); paintTile(tiles[s]); }
    });
    // Focus: whichever tile gets the sound moves into the big slot.
    if (slug && lay.preset === 'focus' && order.length > 1) {
      var big = bigSlug();
      if (big && big !== slug) swapLeaves(slug, big);
    }
  }

  /* ---------- layout: presets, tree edits, string form ---------- */
  function bigSlug() { return lay.custom ? Layout.firstLeaf(lay.tree) : order[0]; }

  function fitWidth(rows, W, H) {
    var cols = Math.max.apply(null, rows), nr = rows.length;
    var w = Math.min((W - (cols - 1) * GAP) / cols, ((H - (nr - 1) * GAP) / nr) * 16 / 9);
    return Math.max(0, Math.floor(w));
  }

  // The fixed arrangement from ROWS, unless the area is so narrow or tall
  // that another row split gives tiles over 1.5x wider (e.g. a tablet with
  // chat open, where two side-by-side tiles would be postage stamps).
  function pickRows(n, W, H) {
    var spec = ROWS[n], specW = fitWidth(spec, W, H), best = spec, bestW = specW;
    for (var cols = 1; cols <= n; cols++) {
      var r = [];
      for (var left = n; left > 0; left -= cols) r.push(Math.min(cols, left));
      var w = fitWidth(r, W, H);
      if (w > bestW) { best = r; bestW = w; }
    }
    return specW * 1.5 >= bestW ? spec : best;
  }

  function presetTree() {
    var rows = null;
    if (lay.preset === 'grid') {
      var W = grid.clientWidth - 2 * PAD, H = grid.clientHeight - 2 * PAD;
      rows = W > 0 && H > 0 ? pickRows(order.length, W, H) : ROWS[order.length];
    }
    return Layout.build(lay.preset, order, rows);
  }

  function slugIndex(s) { return order.indexOf(s); }

  // What goes after ?l= in the link: nothing for Auto grid, the preset name
  // for an untouched preset, the tree for a hand-sized layout.
  function layoutString() {
    if (!lay.custom || !lay.tree || order.length < 2) return lay.preset === 'grid' ? '' : lay.preset;
    return (lay.preset === 'focus' ? 'focus:' : '') + Layout.serialize(lay.tree, slugIndex);
  }

  // Anything unreadable or not matching the channel list falls back to Auto
  // grid without a word: a bad layout must never cost anyone their streams.
  function applyLayoutString(str) {
    stash = null;
    var p = Layout.parse(str, order.length);
    if (!p) { lay = { preset: 'grid', custom: false, tree: null }; return; }
    lay = { preset: p.preset, custom: p.custom, tree: null };
    if (p.custom) {
      var slugs = order.slice();
      lay.tree = Layout.mapLeaves(p.tree, function (i) { return slugs[i]; });
      order = Layout.leaves(lay.tree); // keys 1-9 follow the reading order
    }
  }

  function treeAdd(slug) {
    if (lay.custom) lay.tree = Layout.append(lay.tree, slug, lay.preset === 'focus');
  }

  // Call after the tile has left `order`, while the tree still holds it.
  function treeRemove(slug) {
    if (!lay.custom) return;
    if (order.length < 2 || (lay.preset === 'focus' && Layout.firstLeaf(lay.tree) === slug)) {
      lay.custom = false;
      lay.tree = null;
      return;
    }
    lay.tree = Layout.remove(lay.tree, slug);
  }

  function swapLeaves(a, b) {
    var i = order.indexOf(a), j = order.indexOf(b);
    if (i < 0 || j < 0 || a === b) return;
    order[i] = b;
    order[j] = a;
    if (lay.custom) lay.tree = Layout.swap(lay.tree, a, b);
    afterChange();
  }

  function setPreset(p) {
    if (isPhone()) { toast(PHONE_TIP); return; }
    if (Layout.PRESETS.indexOf(p) === -1) return;
    if (p === 'focus' && lay.preset !== 'focus') {
      stash = { preset: lay.preset, custom: lay.custom, tree: Layout.clone(lay.tree) };
    } else if (p !== 'focus') {
      stash = null;
    }
    lay = { preset: p, custom: false, tree: null };
    if (p === 'focus' && audible && order[0] !== audible) {
      var i = order.indexOf(audible);
      order[i] = order[0];
      order[0] = audible;
    }
    afterChange();
  }

  // `f` a second time: back to whatever was there before Focus, hand-made
  // sizes included, as long as the same channels are still on screen.
  function leaveFocus() {
    if (isPhone()) { toast(PHONE_TIP); return; }
    var s = stash;
    stash = null;
    var back = Layout.leaves(s && s.custom ? s.tree : null);
    var same = back.length === order.length && back.every(function (x) { return order.indexOf(x) !== -1; });
    if (s && s.custom && same) {
      lay = { preset: s.preset, custom: true, tree: s.tree };
      order = back;
    } else {
      lay = { preset: s && s.preset !== 'focus' ? s.preset : 'grid', custom: false, tree: null };
    }
    afterChange();
  }

  function paintPresets() {
    var phone = isPhone();
    layBtns.forEach(function (b) {
      var p = b.getAttribute('data-lay');
      var on = !phone && lay.preset === p && (!lay.custom || p === 'focus');
      b.classList.toggle('on', on);
      b.classList.toggle('dis', phone);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-disabled', phone ? 'true' : 'false');
      b.title = phone ? PHONE_TIP :
        PRESET_TIP[p] + (lay.custom ? ' Clicking it replaces the sizes you dragged.' : '');
    });
  }

  /* ---------- layout: rendering ---------- */
  // The tree is drawn as nested flex boxes of empty cells with gutters
  // between them. Tiles are never moved into the cells (moving an iframe in
  // the DOM reloads the player); each tile is absolutely positioned over its
  // cell instead, letterboxed to 16:9 and centred.
  var rendered = '';

  // Gutters remember where their split sits in the tree (a path of kid
  // indexes), not the node itself: untouched presets are rebuilt as fresh
  // objects on every layout pass.
  function gutter(node, path, i) {
    var g = document.createElement('div');
    var horiz = node.d === 'h';
    g.className = 'gut';
    g.setAttribute('role', 'separator');
    g.setAttribute('aria-orientation', horiz ? 'vertical' : 'horizontal');
    g.setAttribute('data-tip', horiz ? 'drag to resize width' : 'drag to resize height');
    g.setAttribute('aria-label', horiz ? 'Drag to resize width' : 'Drag to resize height');
    g._path = path;
    g._i = i;
    return g;
  }

  function nodeAt(path) {
    var n = lay.tree;
    for (var k = 0; k < path.length && n; k++) n = Layout.isSplit(n) ? n.kids[path[k]] : null;
    return Layout.isSplit(n) ? n : null;
  }

  function buildNode(node, path) {
    if (!Layout.isSplit(node)) {
      var c = document.createElement('div');
      c.className = 'cell';
      c.setAttribute('data-slug', node);
      return c;
    }
    var el = document.createElement('div');
    el.className = 'split';
    el.setAttribute('data-d', node.d);
    node.kids.forEach(function (k, i) {
      if (i) el.appendChild(gutter(node, path, i));
      var ch = buildNode(k, path.concat(i));
      ch.style.flex = node.ratios[i] + ' 1 0';
      el.appendChild(ch);
    });
    return el;
  }

  function renderSplits() {
    var sig = JSON.stringify(lay.tree);
    if (sig === rendered) return;
    rendered = sig;
    splitsEl.textContent = '';
    if (lay.tree != null) splitsEl.appendChild(buildNode(lay.tree, []));
  }

  function placeTiles() {
    var g = grid.getBoundingClientRect();
    [].forEach.call(splitsEl.querySelectorAll('.cell'), function (c) {
      var t = tiles[c.getAttribute('data-slug')];
      if (!t) return;
      var r = c.getBoundingClientRect();
      var w = Math.floor(Math.max(0, Math.min(r.width, r.height * 16 / 9)));
      var h = Math.floor(w * 9 / 16);
      var st = t.el.style;
      st.left = Math.round(r.left - g.left + (r.width - w) / 2) + 'px';
      st.top = Math.round(r.top - g.top + (r.height - h) / 2) + 'px';
      st.width = w + 'px';
      st.height = h + 'px';
    });
    sizeClasses();
  }

  function layout() {
    paintPresets();
    var n = order.length;
    if (!n) {
      lay.tree = null;
      renderSplits();
      return;
    }
    order.forEach(function (s, i) { tiles[s].el.style.order = i; });
    if (!drag && !lay.custom) lay.tree = presetTree();
    if (isPhone()) {
      // Phone: always one column of full-width 16:9 tiles, page scrolls.
      order.forEach(function (s) {
        var st = tiles[s].el.style;
        st.left = st.top = st.width = st.height = '';
      });
      sizeClasses();
      return;
    }
    if (!drag) renderSplits(); // a rebuild mid-drag would drop the pointer capture
    placeTiles();
  }

  function sizeClasses() {
    order.forEach(function (s) {
      var el = tiles[s].el, w = el.offsetWidth;
      el.classList.toggle('sm', w < 380);
      el.classList.toggle('xs', w < 250);
    });
  }

  /* ---------- drags: gutter resize + tile reorder ---------- */
  // While either drag runs, a transparent shield covers the players so the
  // iframes cannot swallow pointer events.
  function showShield(cursor) {
    shield.style.cursor = cursor;
    shield.hidden = false;
  }

  function startResize(e, g) {
    var prev = g.previousElementSibling, next = g.nextElementSibling, node = nodeAt(g._path), i = g._i;
    if (!prev || !next || !node || !node.ratios[i]) return;
    var horiz = node.d === 'h';
    var ra = prev.getBoundingClientRect(), rb = next.getBoundingClientRect();
    var a = horiz ? ra.width : ra.height, b = horiz ? rb.width : rb.height;
    drag = {
      kind: 'resize', cap: g, id: e.pointerId, g: g, prev: prev, next: next, node: node, i: i,
      horiz: horiz, a: a, total: a + b, sum: node.ratios[i - 1] + node.ratios[i],
      start: horiz ? e.clientX : e.clientY, moved: false
    };
    g.classList.add('hot');
    try { g.setPointerCapture(e.pointerId); } catch (x) {}
    showShield(horiz ? 'col-resize' : 'row-resize');
    e.preventDefault();
  }

  function moveResize(e) {
    var d = (drag.horiz ? e.clientX : e.clientY) - drag.start;
    if (!drag.moved && Math.abs(d) < 1) return;
    drag.moved = true;
    var min = Math.min(MIN_TILE, drag.total / 2);
    var na = Math.max(min, Math.min(drag.total - min, drag.a + d));
    var r = drag.sum * na / drag.total;
    drag.node.ratios[drag.i - 1] = r;
    drag.node.ratios[drag.i] = drag.sum - r;
    drag.prev.style.flex = r + ' 1 0';
    drag.next.style.flex = (drag.sum - r) + ' 1 0';
    placeTiles(); // pointermove already arrives once per frame
  }

  function startMove(e, grip) {
    var el = grip.closest('.tile');
    if (!el || order.length < 2) return;
    drag = { kind: 'move', cap: grip, id: e.pointerId, slug: el.dataset.slug, x0: e.clientX, y0: e.clientY, moved: false, target: null, ghost: null };
    try { grip.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
    e.stopPropagation();
  }

  function tileAt(x, y, except) {
    for (var i = 0; i < order.length; i++) {
      var s = order[i];
      if (s === except) continue;
      var r = tiles[s].el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s;
    }
    return null;
  }

  function moveMove(e) {
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6) return;
      drag.moved = true;
      var src = tiles[drag.slug];
      if (!src) return;
      src.el.classList.add('lifted');
      var gh = document.createElement('div');
      gh.className = 'drag-ghost';
      gh.textContent = src.info ? src.info.name : src.slug;
      var w = Math.max(120, Math.min(240, src.el.offsetWidth * 0.5));
      gh.style.width = Math.round(w) + 'px';
      gh.style.height = Math.round(w * 9 / 16) + 'px';
      grid.appendChild(gh);
      drag.ghost = gh;
      showShield('grabbing');
    }
    var g = grid.getBoundingClientRect(), gh2 = drag.ghost;
    if (gh2) {
      gh2.style.left = Math.round(e.clientX - g.left - gh2.offsetWidth / 2) + 'px';
      gh2.style.top = Math.round(e.clientY - g.top - gh2.offsetHeight / 2) + 'px';
    }
    var tgt = tileAt(e.clientX, e.clientY, drag.slug);
    if (tgt !== drag.target) {
      if (drag.target && tiles[drag.target]) tiles[drag.target].el.classList.remove('drop');
      if (tgt) tiles[tgt].el.classList.add('drop');
      drag.target = tgt;
    }
  }

  function endDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag;
    drag = null;
    shield.hidden = true;
    try { d.cap.releasePointerCapture(d.id); } catch (x) {}
    if (d.kind === 'resize') {
      d.g.classList.remove('hot');
      if (d.moved) {
        lay.custom = true; // from here on the tree is edited, not regenerated
        afterChange();
      } else {
        layout();
      }
      return;
    }
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    if (tiles[d.slug]) tiles[d.slug].el.classList.remove('lifted');
    if (d.target && tiles[d.target]) tiles[d.target].el.classList.remove('drop');
    if (d.moved && d.target && !cancelled) swapLeaves(d.slug, d.target);
  }

  grid.addEventListener('pointerdown', function (e) {
    if (drag || isPhone() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var g = e.target.closest('.gut');
    if (g) { startResize(e, g); return; }
    var grip = e.target.closest('.grip');
    if (grip) startMove(e, grip);
  });
  grid.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.kind === 'resize') moveResize(e); else moveMove(e);
  });
  grid.addEventListener('pointerup', function (e) { endDrag(e, false); });
  grid.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  grid.addEventListener('lostpointercapture', function (e) { endDrag(e, false); });

  /* ---------- session, hash, storage ---------- */
  // #a/b/c?l=<layout>  ->  { slugs: [a, b, c], layout: '<layout>' }
  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch (e) {}
    var q = raw.indexOf('?'), query = '';
    if (q !== -1) { query = raw.slice(q + 1); raw = raw.slice(0, q); }
    var m = /(?:^|&)l=([^&]*)/.exec(query);
    var out = [];
    raw.split('/').forEach(function (part) {
      var s = Kick.parseSlug(part);
      if (s && out.indexOf(s) === -1) out.push(s);
    });
    return { slugs: out, layout: m ? m[1] : '' };
  }

  function writeHash() {
    var l = layoutString();
    var h = order.length ? '#' + order.join('/') + (l ? '?l=' + l : '') : '';
    if (location.hash === h || (!h && !location.hash)) return;
    history.replaceState(null, '', location.pathname + location.search + h);
  }

  function afterChange() {
    writeHash();
    if (order.length) {
      lsSet(LS.last, JSON.stringify(order));
      lsSet(LS.layout, layoutString() || 'grid');
    }
    app.classList.toggle('has-streams', order.length > 0);
    if (!order.length) paintResume();
    layout();
  }

  function syncFromHash() {
    var p = parseHash(), want = p.slugs;
    if (want.length > MAX) {
      toast('Stacked shows up to ' + MAX + ' streams, so the rest of that link was left out.', 'warn');
      want = want.slice(0, MAX);
      p.layout = '';
    }
    order.slice().forEach(function (s) { if (want.indexOf(s) === -1) removeTile(s); });
    want.forEach(function (s) { if (!tiles[s]) addAndFetch(s); });
    order = want.filter(function (s) { return tiles[s]; });
    applyLayoutString(p.layout);
    afterChange();
  }

  function remember(slug) {
    var r = lsJSON(LS.recent, []);
    if (!Array.isArray(r)) r = [];
    r = [slug].concat(r.filter(function (s) { return s !== slug; })).slice(0, 12);
    lsSet(LS.recent, JSON.stringify(r));
  }

  function paintResume() {
    var btn = $('resumeBtn');
    var last = lsJSON(LS.last, []);
    if (!Array.isArray(last)) last = [];
    last = last.map(Kick.parseSlug).filter(Boolean).slice(0, MAX);
    btn.hidden = !last.length;
    if (!last.length) return;
    var names = last.slice(0, 3).join(', ') + (last.length > 3 ? ' +' + (last.length - 3) : '');
    btn.textContent = 'Resume last session (' + names + ')';
    btn.onclick = function () {
      // The saved layout string goes back in with the channels it was made for.
      var l = String(lsGet(LS.layout) || '');
      if (l === 'grid' || !/^[a-z0-9().,:]{1,400}$/.test(l)) l = '';
      history.replaceState(null, '', location.pathname + location.search + '#' + last.join('/') + (l ? '?l=' + l : ''));
      syncFromHash();
    };
  }

  /* ---------- chat column ---------- */
  function setChatHidden(hidden) {
    app.classList.toggle('nochat', hidden);
    chatBtn.classList.toggle('on', !hidden);
    chatBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    chatBtn.title = hidden ? 'Show chat (c)' : 'Hide chat (c)';
    lsSet(LS.chat, hidden ? '1' : '0');
    layout();
  }
  function toggleChat() { setChatHidden(!app.classList.contains('nochat')); }

  /* ---------- Add Stream modal ---------- */
  var busy = false;

  function openModal() {
    if (order.length >= MAX) {
      toast(MAX + ' streams is the limit. Remove one to add another.', 'warn');
      return;
    }
    addInput.value = '';
    showErr('');
    paintRecent();
    modal.hidden = false;
    setTimeout(function () { addInput.focus(); }, 0);
  }
  function closeModal() {
    if (busy) return;
    modal.hidden = true;
  }
  function showErr(msg) {
    addErr.textContent = msg;
    addErr.hidden = !msg;
  }
  function setBusy(b) {
    busy = b;
    addGo.disabled = b;
    addGo.textContent = b ? 'Checking...' : 'Add';
  }

  function paintRecent() {
    var r = lsJSON(LS.recent, []);
    if (!Array.isArray(r)) r = [];
    r = r.map(Kick.parseSlug).filter(function (s) { return s && !tiles[s]; }).slice(0, 10);
    var list = $('recentList');
    list.textContent = '';
    r.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.title = 'Add ' + s + ' again';
      b.addEventListener('click', function () { addInput.value = s; submitAdd(); });
      list.appendChild(b);
    });
    $('recentWrap').hidden = !r.length;
  }

  function submitAdd() {
    if (busy) return;
    var raw = addInput.value.trim();
    var slug = Kick.parseSlug(raw);
    if (!raw) { showErr('Type a channel name first.'); addInput.focus(); return; }
    if (!slug) {
      showErr('That does not look like a Kick channel. Use the name from kick.com/name (letters, numbers, - or _), or paste the kick.com link.');
      addInput.focus();
      return;
    }
    if (tiles[slug]) { showErr(slug + ' is already in this session.'); addInput.select(); return; }
    if (order.length >= MAX) { toast(MAX + ' streams is the limit. Remove one to add another.', 'warn'); return; }
    showErr('');
    setBusy(true);
    Kick.fetchChannel(slug).then(function (res) {
      setBusy(false);
      if (res.status === 'missing') {
        toast('No Kick channel called "' + slug + '".', 'err');
        addInput.select();
        return;
      }
      var s = res.status === 'ok' ? res.slug : slug;
      if (tiles[s]) { showErr(s + ' is already in this session.'); return; }
      if (order.length >= MAX) { toast(MAX + ' streams is the limit. Remove one to add another.', 'warn'); return; }
      addTile(s, res);
      treeAdd(s);
      remember(s);
      closeModal();
      afterChange();
      if (res.status !== 'ok') toast('Could not reach Kick to check "' + s + '". Added it anyway.', 'warn');
      else if (order.length === WARN_AT) toast('5 streams is a lot of video. Laptops can run warm from here on.', 'warn');
    });
  }

  /* ---------- events ---------- */
  $('addBtn').addEventListener('click', openModal);
  $('landAdd').addEventListener('click', openModal);
  $('addClose').addEventListener('click', closeModal);
  $('addCancel').addEventListener('click', closeModal);
  addForm.addEventListener('submit', function (e) { e.preventDefault(); submitAdd(); });
  addInput.addEventListener('input', function () { if (!addErr.hidden) showErr(''); });
  chatBtn.addEventListener('click', toggleChat);

  document.querySelectorAll('.soon').forEach(function (b) {
    b.addEventListener('click', function () {
      toast(b.getAttribute('data-soon') + ' is coming in a later version.');
    });
  });

  layBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!order.length) { toast('Add a stream first, then pick a layout.'); return; }
      setPreset(b.getAttribute('data-lay'));
    });
  });

  grid.addEventListener('click', function (e) {
    var tileEl = e.target.closest('.tile');
    if (!tileEl) return;
    var slug = tileEl.dataset.slug;
    if (e.target.closest('.unmute')) { setAudible(slug); return; }
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var t = tiles[slug];
    if (!t) return;
    if (act === 'mute') {
      setAudible(audible === slug ? null : slug);
    } else if (act === 'reload') {
      setMedia(t, true);
      refresh(slug);
    } else if (act === 'remove') {
      removeTile(slug);
      treeRemove(slug);
      afterChange();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!modal.hidden) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape' && drag && drag.kind === 'move') {
      endDrag(null, true);
    } else if (e.key >= '1' && e.key <= '9') {
      var s = order[Number(e.key) - 1];
      if (s) setAudible(s);
    } else if (e.key === 'm' || e.key === 'M') {
      setAudible(null);
    } else if (e.key === 'c' || e.key === 'C') {
      toggleChat();
    } else if ((e.key === 'f' || e.key === 'F') && order.length && !drag) {
      if (lay.preset === 'focus') leaveFocus(); else setPreset('focus');
    } else if ((e.key === 'g' || e.key === 'G') && order.length && !drag) {
      setPreset('grid');
    }
  });

  window.addEventListener('hashchange', syncFromHash);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(area);
  else window.addEventListener('resize', layout);
  if (mqPhone.addEventListener) mqPhone.addEventListener('change', layout);

  /* ---------- live status polling ---------- */
  function refresh(slug) {
    var t = tiles[slug];
    if (!t || t.polling) return;
    t.polling = true;
    Kick.fetchChannel(slug).then(function (res) {
      t.polling = false;
      if (tiles[slug] !== t) return;
      if (res.status === 'missing') { t.lastPoll = Date.now(); return; } // transient; keep the tile
      applyInfo(t, res);
    });
  }

  setInterval(function () {
    if (document.hidden) return;
    var now = Date.now(), k = 0;
    order.forEach(function (s) {
      var t = tiles[s];
      if (t.state === 'loading' || t.polling || now - t.lastPoll < POLL_MS) return;
      t.lastPoll = now; // claim the slot so the next tick does not double up
      setTimeout(function () { refresh(s); }, (k++) * 700);
    });
  }, 5000);

  /* ---------- consent banner (site-wide `greenline-consent` key) ---------- */
  (function () {
    var banner = $('consentBanner');
    function record(state) {
      try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': state }); } catch (e) {}
      lsSet('greenline-consent', state);
      banner.hidden = true;
    }
    $('consentAccept').addEventListener('click', function () { record('granted'); });
    $('consentReject').addEventListener('click', function () { record('denied'); });
    $('cookieReset').addEventListener('click', function () {
      try { localStorage.removeItem('greenline-consent'); } catch (e) {}
      try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': 'denied' }); } catch (e) {}
      banner.hidden = false;
    });
    if (window.__needsConsent) banner.hidden = false;
  })();

  /* ---------- boot ---------- */
  setChatHidden(lsGet(LS.chat) === '1');
  syncFromHash();
})();
