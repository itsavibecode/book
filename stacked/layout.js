/* Stacked - the split tree (tmux-style layout engine), pure functions only.
   No DOM here, so it can be checked from Node.

   A layout is a tree. A leaf is a channel slug (a string; a number while a
   layout string is being parsed). A split is
     { d: 'h' | 'v', kids: [node, node, ...], ratios: [0.5, 0.5, ...] }
   'h' lays its kids out left to right, 'v' top to bottom; ratios sum to 1.

   Layout string grammar (goes in the link after the channel list, ?l=...):
     layout := preset | [ 'focus:' ] node
     preset := 'grid' | 'side' | 'stack' | 'focus'
     node   := index | ( 'h' | 'v' ) '(' item ( ',' item )+ ')'
     item   := node [ ':' ratio ]
     index  := 0-based position in the channel list
     ratio  := decimal share of the parent, 2 places, leading 0 dropped (.6)
   Ratios are written for every kid of a split or for none (none = equal).
   Example: h(v(0,1):.6,2:.4) - channels 1 and 2 stacked in a column that
   takes 60% of the width, channel 3 in the other 40%. */
(function (root) {
  'use strict';

  var PRESETS = ['grid', 'side', 'stack', 'focus'];
  var FOCUS_RATIOS = [0.75, 0.25];

  function isSplit(n) { return !!n && typeof n === 'object'; }

  function equal(k) {
    var r = [];
    for (var i = 0; i < k; i++) r.push(1 / k);
    return r;
  }

  function split(d, kids, ratios) {
    if (kids.length === 1) return kids[0];
    return { d: d, kids: kids, ratios: ratios || equal(kids.length) };
  }

  /* Build a preset tree for the slugs in order. `rows` (tiles per row, e.g.
     [3, 2]) is only used by 'grid'; the page works it out from the space. */
  function build(preset, slugs, rows) {
    var n = slugs.length;
    if (!n) return null;
    if (n === 1) return slugs[0];
    if (preset === 'side') return split('h', slugs.slice());
    if (preset === 'stack') return split('v', slugs.slice());
    if (preset === 'focus') {
      return split('v', [slugs[0], split('h', slugs.slice(1))], FOCUS_RATIOS.slice());
    }
    rows = rows && rows.length ? rows : [n];
    var i = 0, kids = [];
    rows.forEach(function (cnt) {
      kids.push(split('h', slugs.slice(i, i + cnt)));
      i += cnt;
    });
    return split('v', kids);
  }

  function clone(t) {
    if (!isSplit(t)) return t;
    return { d: t.d, kids: t.kids.map(clone), ratios: t.ratios.slice() };
  }

  function mapLeaves(t, fn) {
    if (t == null) return t;
    if (!isSplit(t)) return fn(t);
    return { d: t.d, kids: t.kids.map(function (k) { return mapLeaves(k, fn); }), ratios: t.ratios.slice() };
  }

  function leaves(t, out) {
    out = out || [];
    if (t == null) return out;
    if (!isSplit(t)) { out.push(t); return out; }
    t.kids.forEach(function (k) { leaves(k, out); });
    return out;
  }

  function firstLeaf(t) {
    while (isSplit(t)) t = t.kids[0];
    return t;
  }

  function normalize(r) {
    var s = 0;
    r.forEach(function (x) { s += x; });
    return r.map(function (x) { return s > 0 ? x / s : 1 / r.length; });
  }

  /* Collapse single-kid splits and fold a kid split into a parent that runs
     the same way (h inside h), keeping every tile's share of the space. */
  function tidy(t) {
    if (!isSplit(t)) return t;
    var kids = [], ratios = [];
    t.kids.forEach(function (k, i) {
      k = tidy(k);
      if (k == null) return;
      if (isSplit(k) && k.d === t.d) {
        k.kids.forEach(function (kk, j) { kids.push(kk); ratios.push(t.ratios[i] * k.ratios[j]); });
      } else {
        kids.push(k);
        ratios.push(t.ratios[i]);
      }
    });
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    return { d: t.d, kids: kids, ratios: normalize(ratios) };
  }

  function remove(t, slug) {
    function drop(n) {
      if (!isSplit(n)) return n === slug ? null : n;
      var kids = [], ratios = [];
      n.kids.forEach(function (k, i) {
        k = drop(k);
        if (k != null) { kids.push(k); ratios.push(n.ratios[i]); }
      });
      if (!kids.length) return null;
      return { d: n.d, kids: kids, ratios: ratios };
    }
    return tidy(drop(t));
  }

  /* Add a leaf with an equal share of the root split (or, in Focus, of the
     strip under the big tile). */
  function append(t, slug, intoStrip) {
    if (t == null) return slug;
    if (!isSplit(t)) return { d: 'h', kids: [t, slug], ratios: [0.5, 0.5] };
    t = clone(t);
    var host = t;
    if (intoStrip && t.d === 'v' && t.kids.length === 2) {
      var strip = t.kids[1];
      if (!isSplit(strip)) {
        t.kids[1] = { d: 'h', kids: [strip, slug], ratios: [0.5, 0.5] };
        return t;
      }
      if (strip.d === 'h') host = strip;
    }
    var k = host.kids.length;
    host.ratios = host.ratios.map(function (r) { return r * k / (k + 1); });
    host.ratios.push(1 / (k + 1));
    host.kids.push(slug);
    return t;
  }

  function swap(t, a, b) {
    return mapLeaves(t, function (s) { return s === a ? b : s === b ? a : s; });
  }

  /* ---------- string form ---------- */
  function fmtRatio(r) {
    r = Math.min(0.99, Math.max(0.01, r));
    return r.toFixed(2).replace(/^0/, '').replace(/0$/, '');
  }

  function roundRatios(r) {
    var out = [], sum = 0;
    for (var i = 0; i < r.length - 1; i++) {
      var v = Math.round(r[i] * 100) / 100;
      out.push(v);
      sum += v;
    }
    out.push(Math.round((1 - sum) * 100) / 100);
    return out;
  }

  /* `indexOf` maps a leaf to its number in the channel list. */
  function serialize(t, indexOf) {
    if (!isSplit(t)) return String(indexOf(t));
    var r = roundRatios(t.ratios);
    var even = r.every(function (x) { return Math.abs(x - 1 / r.length) < 0.011; });
    return t.d + '(' + t.kids.map(function (k, i) {
      return serialize(k, indexOf) + (even ? '' : ':' + fmtRatio(r[i]));
    }).join(',') + ')';
  }

  /* Returns { preset, custom, tree } with numeric leaves, or null when the
     string is not a valid layout for exactly `n` channels. */
  function parse(str, n) {
    str = String(str == null ? '' : str).trim().toLowerCase();
    if (!str) return null;
    if (PRESETS.indexOf(str) !== -1) return { preset: str, custom: false, tree: null };
    var preset = 'grid';
    if (str.indexOf('focus:') === 0) { preset = 'focus'; str = str.slice(6); }
    if (str.length > 400) return null;
    var pos = 0;

    function fail() { throw new Error('bad layout'); }
    function num() {
      var m = /^\d*\.?\d+/.exec(str.slice(pos));
      if (!m) fail();
      pos += m[0].length;
      return parseFloat(m[0]);
    }
    function node(depth) {
      if (depth > 12) fail();
      var c = str.charAt(pos);
      if (c === 'h' || c === 'v') {
        pos++;
        if (str.charAt(pos++) !== '(') fail();
        var kids = [], ratios = [];
        for (;;) {
          kids.push(node(depth + 1));
          if (str.charAt(pos) === ':') { pos++; ratios.push(num()); }
          var ch = str.charAt(pos++);
          if (ch === ')') break;
          if (ch !== ',') fail();
        }
        if (kids.length < 2) fail();
        if (ratios.length && ratios.length !== kids.length) fail();
        if (ratios.some(function (r) { return !(r > 0) || !isFinite(r); })) fail();
        return { d: c, kids: kids, ratios: ratios.length ? normalize(ratios) : equal(kids.length) };
      }
      if (!/\d/.test(c)) fail();
      var m = /^\d+/.exec(str.slice(pos));
      pos += m[0].length;
      return parseInt(m[0], 10);
    }

    try {
      var tree = node(0);
      if (pos !== str.length) return null;
      var seen = leaves(tree);
      if (seen.length !== n) return null;
      var used = {};
      for (var i = 0; i < seen.length; i++) {
        if (seen[i] >= n || used[seen[i]]) return null;
        used[seen[i]] = true;
      }
      if (n < 2) return { preset: preset, custom: false, tree: null };
      return { preset: preset, custom: true, tree: tidy(tree) };
    } catch (e) {
      return null;
    }
  }

  root.Layout = {
    PRESETS: PRESETS,
    build: build,
    clone: clone,
    mapLeaves: mapLeaves,
    leaves: leaves,
    firstLeaf: firstLeaf,
    remove: remove,
    append: append,
    swap: swap,
    serialize: serialize,
    parse: parse,
    isSplit: isSplit
  };
})(typeof window !== 'undefined' ? window : globalThis);
