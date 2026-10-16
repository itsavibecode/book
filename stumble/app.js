/* Stumble v0.1.0 - the page: state, tabs, scan + roll loop, timer wiring,
   keyboard, toasts, modals, and every panel. Kick URLs live in kick.js, the
   countdown in timer.js, storage + sync in store.js, sign-in in auth.js.
   Everything from Kick or from the user goes into the DOM as text, never
   as HTML. */
'use strict';

import * as K from './kick.js';
import { createTimer, formatClock, ringPath, renderRing } from './timer.js';
import {
  createStore, KEYS, lsGet, lsSet, verifiedGet, verifiedSet, byteLength,
  NOTE_MAX_BYTES, TAGS_MAX, SAVED_COLUMNS, defaultPrefs
} from './store.js';
import * as Auth from './auth.js';

/* ---------- config ---------- */

const VERSION = '0.1.0';
/* Public client id of the Kick app (kick.com > Settings > Developer). Empty
   until the app exists: Sign in then just says so, and everything else
   works signed out from localStorage. The secret never goes here; it lives
   in stumble-worker (wrangler secret put KICK_CLIENT_SECRET). */
const KICK_CLIENT_ID = '';
const RESCAN_MS = 10 * 60 * 1000;
const VIEWER_REFRESH_MS = 60 * 1000;
const VERIFY_TRIES = 12;
const SAVED_LIVE_MAX = 20;
const LIVE_CACHE_MS = 2 * 60 * 1000;
const MUTE_GRACE_MS = 2000;

const WORKER = Auth.workerBase();
const LOCAL = Auth.isLocalHost();
const $ = function (id) { return document.getElementById(id); };
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- state ---------- */

const store = createStore({
  workerBase: WORKER,
  onStatus: renderSync,
  onAuthLost: authLost,
  onLimit: function (msg) { toast(msg, { err: true, ms: 6000 }); }
});

const S = {
  pool: new Map(),        // stream id -> stream
  scanGen: 0,
  scanning: false,
  scanCtl: null,
  scanFloor: 0,
  scanCats: '',
  lastScanAt: 0,
  liveTotal: 0,
  livePlus: false,
  fetched: 0,
  topViewers: 0,
  scanFrac: 0,
  rateLimited: 0,
  hdNote: '',
  fallback: false,
  current: null,          // stream on screen
  muted: false,
  autoRolled: false,
  wantRoll: false,
  deepLinked: false,
  rollBusy: false,
  rollToken: 0,
  tab: 'chat',
  sheetOpen: false,
  matchCount: 0,
  liveCache: {},          // slug -> {live, viewers, t}
  chat: null,             // {slug, counter, chatters, msgsPerMin, status} for the stream on screen
  ownSlug: '',
  refreshTimer: 0,
  noteTimer: 0,
  noteSlug: '',
  emptyShown: false,
  modalOpen: 0,
  lastTickSec: -1,
  topCats: null,
  catTerm: '',
  langTerm: ''
};

const timer = createTimer({ onExpire: function () { roll('timer'); }, onChange: renderTimer });

/* ---------- tiny DOM helpers ---------- */

function h(tag, props) {
  const el = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function (k) {
      const v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else el.setAttribute(k, v === true ? '' : v);
    });
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name, cls) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#i-' + name);
  s.appendChild(u);
  return s;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function avatarImg(src, size) {
  return h('img', { src: src || 'favicon-192.png', alt: '', width: size, height: size, loading: 'lazy', referrerpolicy: 'no-referrer' });
}

/* ---------- formatting ---------- */

function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
function uptime(start) {
  if (!start) return '';
  const m = Math.max(0, Math.floor((Date.now() - start) / 60000));
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}
function ago(t) {
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dateShort(t) {
  if (!t) return '';
  const d = new Date(t);
  const y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + y;
}
function clock(t) {
  const d = new Date(t);
  return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}
function dayLabel(t) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return DAYS[d.getDay()] + ' ' + dateShort(t);
}
function tagClass(tag) {
  let x = 0;
  for (let i = 0; i < tag.length; i++) x = (x * 31 + tag.charCodeAt(i)) | 0;
  return 'tag-' + (Math.abs(x) % 8);
}
function tagChip(tag, onRemove) {
  const c = h('span', { class: 'chip tag ' + tagClass(tag) }, tag);
  if (onRemove) {
    c.appendChild(h('button', { class: 'x', type: 'button', title: 'Remove the tag "' + tag + '"', 'aria-label': 'Remove tag ' + tag, onclick: onRemove }, icon('x')));
  }
  return c;
}

function track(name, params) {
  try { if (window.gtag && !window.__gaOptedOut) window.gtag('event', name, params || {}); } catch (e) { /* ignore */ }
}

/* ---------- toasts (top-center, passive) ---------- */

function toast(msg, opts) {
  opts = opts || {};
  const el = h('div', { class: 'toast' + (opts.err ? ' err' : ''), role: 'status' }, h('span', { text: msg }));
  let t = 0;
  function close() { clearTimeout(t); if (el.parentNode) el.parentNode.removeChild(el); }
  if (opts.action) {
    el.appendChild(h('button', { type: 'button', text: opts.action, onclick: function () { close(); opts.onAction(); } }));
  }
  $('toasts').appendChild(el);
  t = setTimeout(close, opts.ms || 3200);
  return close;
}

/* ---------- modals (close only via their buttons / X) ---------- */

function modal(o) {
  const root = $('modalRoot');
  const prevFocus = document.activeElement;
  const titleId = 'mo-' + Date.now();
  const back = h('div', { class: 'backdrop' });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
  function close(result) {
    document.removeEventListener('keydown', onKey, true);
    if (back.parentNode) back.parentNode.removeChild(back);
    S.modalOpen--;
    timer.setReason('modal', S.modalOpen > 0);
    if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* gone */ }
    if (o.onClose) o.onClose(result);
  }
  const hd = h('div', { class: 'mo-hd' }, h('span', { id: titleId, text: o.title }));
  if (o.closeX !== false) {
    hd.appendChild(h('button', { class: 'ib', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: function () { close('x'); } }, icon('x')));
  }
  const bd = h('div', { class: 'mo-bd' });
  if (typeof o.body === 'string') bd.appendChild(h('p', { text: o.body }));
  else if (o.body) bd.appendChild(o.body);
  const ft = h('div', { class: 'mo-ft' });
  (o.buttons || []).forEach(function (b) {
    ft.appendChild(h('button', {
      class: b.cls || 'btn-ol', type: 'button', text: b.label, title: b.title || null,
      onclick: function () {
        const r = b.onClick ? b.onClick() : undefined;
        if (r === false) return;
        close(b.value || b.label);
      }
    }));
  });
  box.appendChild(hd); box.appendChild(bd); box.appendChild(ft);
  back.appendChild(box);
  root.appendChild(back);
  S.modalOpen++;
  timer.setReason('modal', true);
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (o.escape) close('escape');
      return;
    }
    if (e.key === 'Tab') {
      const f = box.querySelectorAll('button, input, textarea, select, a[href]');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);
  const focusEl = (o.focus && box.querySelector(o.focus)) || ft.querySelector('button') || box.querySelector('button');
  if (focusEl) setTimeout(function () { focusEl.focus(); }, 0);
  return { close: close, box: box };
}

/* ---------- theme ---------- */

const THEME_COLORS = { ink: '#0b0d12', kick: '#0f0f0f', ember: '#120d0b' };
function applyTheme() {
  const t = store.prefs.theme;
  document.documentElement.setAttribute('data-theme', t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', THEME_COLORS[t] || THEME_COLORS.ink);
  document.querySelectorAll('[data-theme-pick]').forEach(function (b) {
    b.setAttribute('aria-pressed', b.dataset.themePick === t ? 'true' : 'false');
  });
}

/* ---------- scanning ---------- */

function serverKey(f) {
  return (f.catInclude || []).map(function (c) { return c.slug; }).sort().join(',');
}

let poolTimer = 0;
function poolChangedSoon() {
  if (poolTimer) return;
  poolTimer = setTimeout(function () { poolTimer = 0; onPoolChanged(); }, 250);
}

function addItems(items, gen) {
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    s._gen = gen;
    S.pool.set(s.id, s);
  }
  S.fetched += items.length;
  poolChangedSoon();
}

async function startScan() {
  if (S.scanCtl) S.scanCtl.abort();
  const ctl = new AbortController();
  S.scanCtl = ctl;
  const gen = ++S.scanGen;
  const f = store.prefs.filters;
  const floor = Math.max(0, Number(f.minViewers) || 0);
  const cats = (f.catInclude || []).map(function (c) { return c.slug; });
  const subs = cats.length ? cats : [null];
  S.scanning = true;
  S.scanFloor = floor;
  S.scanCats = serverKey(f);
  S.fetched = 0;
  S.scanFrac = 0;
  S.rateLimited = 0;
  renderCounters();
  let total = 0;
  let cut = false;
  let networkFail = false;
  for (let i = 0; i < subs.length; i++) {
    if (ctl.signal.aborted) return;
    let top = 0;
    try {
      const r = await K.scan({
        subcategory: subs[i],
        floor: floor,
        signal: ctl.signal,
        onItems: function (items) { if (gen === S.scanGen) addItems(items, gen); },
        onProgress: function (p) {
          if (gen !== S.scanGen) return;
          if (p.page === 1 || !top) top = Math.max(top, p.lastViewers);
          const frac = K.scanFraction(top || p.lastViewers, p.lastViewers, floor);
          S.scanFrac = Math.max(S.scanFrac, (i + frac) / subs.length);
          if (!S.topViewers || p.page === 1) S.topViewers = top;
          renderCounters();
        },
        onBackoff: function (on) {
          if (gen !== S.scanGen) return;
          S.rateLimited = Math.max(0, S.rateLimited + (on ? 1 : -1));
          renderHdMsg();
        }
      });
      total += r.fetched;
      if (r.cutByFloor) cut = true;
    } catch (e) {
      if (e && e.network) networkFail = true;
    }
  }
  if (gen !== S.scanGen || ctl.signal.aborted) return;
  if (networkFail && total === 0) {
    await fallbackScan(gen);
  } else if (S.fallback) {
    S.fallback = false;
    S.hdNote = '';
  }
  if (gen !== S.scanGen) return;
  // Streams not seen in this scan have ended: drop them.
  S.pool.forEach(function (s, id) { if (s._gen !== gen) S.pool.delete(id); });
  S.scanning = false;
  S.scanFrac = 1;
  S.lastScanAt = Date.now();
  S.rateLimited = 0;
  if (!cats.length && !S.fallback) { S.liveTotal = total; S.livePlus = cut; }
  renderHdMsg();
  onPoolChanged();
}

/* PLAN 1.2: only when the direct list throws (network/CORS), ask the
   Worker for Kick's official list. Top 100 only, so the header says so. */
async function fallbackScan(gen) {
  const f = store.prefs.filters;
  const ids = (f.catInclude || []).map(function (c) { return c.id; }).filter(Boolean);
  const qs = ['limit=100'];
  if (ids.length === 1) qs.push('category_id=' + encodeURIComponent(ids[0]));
  try {
    const res = await fetch(WORKER + '/live?' + qs.join('&'));
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    const items = (d.data || []).map(K.normalizeOfficial).filter(Boolean);
    if (gen !== S.scanGen) return;
    addItems(items, gen);
    S.fallback = true;
    S.hdNote = "Kick's live list did not load; showing the top 100 from Kick's official API.";
  } catch (e) {
    S.fallback = true;
    S.hdNote = 'Could not reach Kick. Trying again in a minute.';
    setTimeout(function () { if (!S.scanning) startScan(); }, 60000);
  }
  renderHdMsg();
}

function maybeRescanForFilters() {
  const f = store.prefs.filters;
  const floor = Math.max(0, Number(f.minViewers) || 0);
  if (serverKey(f) !== S.scanCats || floor < S.scanFloor) {
    clearTimeout(maybeRescanForFilters.t);
    maybeRescanForFilters.t = setTimeout(startScan, 600);
  }
}

function onPoolChanged() {
  const r = currentCandidates();
  S.matchCount = r.matching.length;
  renderCounters();
  if (S.tab === 'filters' && panelVisible()) { renderLangChips(); if (!S.catTerm) renderCatChips(); }
  if (S.emptyShown && r.candidates.length) hideEmpty();
  if (!S.rollBusy && r.candidates.length && (S.wantRoll || (!S.autoRolled && !S.deepLinked && !S.current))) {
    S.wantRoll = false;
    S.autoRolled = true;
    roll('auto');
  }
}

function currentCandidates() {
  return K.candidatesFor(S.pool, store.prefs.filters, store.streamers, store.history, Date.now(), S.current ? S.current.slug : '');
}

/* ---------- header ---------- */

let countersPending = false;
function renderCounters() {
  if (countersPending) return;
  countersPending = true;
  // a timer, not requestAnimationFrame: rAF stops in background tabs and
  // the counts must be right the moment the tab comes back
  setTimeout(function () {
    countersPending = false;
    const live = $('cLive');
    if (S.liveTotal) live.textContent = fmt(S.liveTotal) + (S.livePlus ? '+' : '') + ' live';
    else if (S.scanCats) live.textContent = fmt(S.pool.size) + ' in your categories';
    else live.textContent = (S.scanning ? fmt(S.fetched) + '+' : fmt(S.pool.size)) + ' live';
    $('cMatch').textContent = fmt(S.matchCount) + ' match';
    $('cScan').textContent = S.scanning ? 'scanned ' + Math.round(S.scanFrac * 100) + '%' : (S.lastScanAt ? 'scanned 100%' : 'starting');
    const bar = $('progressBar');
    const prog = $('progress');
    bar.style.width = (S.scanning ? Math.max(3, S.scanFrac * 100) : 100) + '%';
    prog.classList.toggle('done', !S.scanning);
    $('fCount').textContent = plural(S.matchCount, 'stream') + ' match' + (S.scanning ? ' (still scanning)' : '');
    const seen = fmt(S.fetched || S.pool.size) + ' streams seen, ' + fmt(S.matchCount) + ' match';
    $('emptyScan').textContent = S.scanning ? 'Scanning Kick... ' + seen : seen + (S.matchCount ? '' : '. Try looser filters.');
  }, 120);
}

function renderHdMsg() {
  const el = $('hdMsg');
  const msg = S.rateLimited > 0 ? 'Kick is rate-limiting, scan paused' : S.hdNote;
  el.textContent = msg;
  el.hidden = !msg;
}

/* ---------- the roll ---------- */

async function roll(source) {
  if (S.rollBusy) return;
  const f = store.prefs.filters;
  const r = currentCandidates();
  let list = r.candidates;
  if (!list.length) {
    if (!S.pool.size || (S.scanning && !r.matching.length)) {
      S.wantRoll = true;
      if (source !== 'auto' && source !== 'timer') toast('Still scanning Kick. Rolling as soon as something matches.');
      timer.idle();
      return;
    }
    showEmpty(r.matching.length);
    timer.idle();
    return;
  }
  S.rollBusy = true;
  setRollBusy(true);
  const token = ++S.rollToken;
  try {
    let pick = null;
    if (f.verifiedOnly) {
      for (let i = 0; i < VERIFY_TRIES && list.length; i++) {
        const c = K.pickWeighted(list, f.bias);
        let v = verifiedGet(c.slug);
        if (v === null) {
          const ch = await K.fetchChannel(c.slug);
          if (token !== S.rollToken) return;
          if (ch.status === 'ok') { v = ch.verified; verifiedSet(c.slug, v); }
          else v = false;
        }
        if (v) { pick = c; break; }
        list = list.filter(function (x) { return x !== c; });
      }
      if (!pick) {
        toast('No verified stream matched; loosen the filters', { ms: 6000 });
        if (!S.current) showEmptyText('No verified stream matched; loosen the filters.');
        timer.idle();
        return;
      }
    } else {
      pick = K.pickWeighted(list, f.bias);
    }
    showStream(pick, { source: source });
  } finally {
    S.rollBusy = false;
    setRollBusy(false);
  }
}

function setRollBusy(on) {
  const b = $('rollBtn');
  b.setAttribute('aria-busy', on ? 'true' : 'false');
}

function pressRoll() {
  const b = $('rollBtn');
  b.classList.add('pressed');
  setTimeout(function () { b.classList.remove('pressed'); }, 120);
  roll('manual');
}

/* Put a stream on screen. source: manual | timer | auto | deeplink |
   saved | again | undo. Every show is a History "rolled" entry and bumps
   the streamer's seen stats. */
function showStream(s, opts) {
  opts = opts || {};
  flushNote();
  const prev = S.current;
  S.current = s;
  hideEmpty();
  const now = Date.now();
  const rec = store.ensure(s.slug);
  const before = { seenCount: rec.seenCount || 0, lastSeen: rec.lastSeen || 0 };
  rec.name = s.name || rec.name;
  if (s.avatar) rec.avatar = s.avatar;
  if (s.userId) rec.userId = s.userId;
  rec.lastViewers = s.viewers || 0;
  rec.lastCategory = s.category ? s.category.name : '';
  rec.lastTitle = s.title || '';
  rec.firstSeen = rec.firstSeen || now;
  rec.lastSeen = now;
  rec.seenCount = (rec.seenCount || 0) + 1;
  store.putStreamer(s.slug);
  addHistory(s, 'rolled');
  S.cardBefore = before;

  // player
  setPlayer(s.slug);
  $('playerEmpty').hidden = true;

  // card cross-fade
  const card = $('cardIn');
  if (!reduceMotion && prev) {
    card.classList.add('fading');
    setTimeout(function () { renderCard(); card.classList.remove('fading'); }, 150);
  } else renderCard();

  // timer
  if (opts.keepTimer) { /* "Roll this one" leaves the countdown alone */ }
  else if (opts.source === 'deeplink') timer.idle();
  else timer.start(store.prefs.timer.defaultSec);
  renderTimer(timer.state());

  // keep viewers fresh while on screen; first lookup also learns "verified"
  stopChatCounter();
  clearInterval(S.refreshTimer);
  clearTimeout(S.refreshSoon);
  S.refreshSoon = setTimeout(refreshCurrent, 1500);
  S.refreshTimer = setInterval(refreshCurrent, VIEWER_REFRESH_MS);

  if (panelVisible() && S.tab === 'chat') renderChat();
  if (S.tab === 'notes') renderNotes();
  if (S.tab === 'history' && panelVisible()) renderHistory();
  updateActionState();
  track('stumble_roll', { source: opts.source || 'manual' });
}

/* "N chatting": unique senders in Kick's public chat feed over the last five
   minutes, counted from the moment the stream came up (section 3.4 of the
   plan did not have it; the user asked for it on 2026-10-16). */
function startChatCounter(slug, channelId, roomId) {
  stopChatCounter();
  const entry = { slug: slug, counter: null, chatters: 0, msgsPerMin: 0, status: 'connecting', since: Date.now() };
  S.chat = entry;
  // The relay lives on the Worker; no Worker (offline, or not deployed yet)
  // just means the number stays off the card.
  const wsUrl = WORKER.replace(/^http/, 'ws') + '/chat-ws?channel=' + encodeURIComponent(channelId) + '&room=' + encodeURIComponent(roomId);
  entry.counter = K.chatCounter(wsUrl, function (u) {
    if (S.chat !== entry) return;
    entry.chatters = u.chatters; entry.msgsPerMin = u.msgsPerMin; entry.status = u.status;
    renderChatters();
  });
  renderChatters();
}
function stopChatCounter() {
  if (S.chat && S.chat.counter) S.chat.counter.stop();
  S.chat = null;
  renderChatters();
}
function renderChatters() {
  const el = $('cardChatters');
  const c = S.chat, s = S.current;
  if (!el) return;
  if (!c || !s || c.slug !== s.slug || s.live === false || c.status === 'failed') { el.textContent = ''; el.hidden = true; return; }
  el.hidden = false;
  const mins = Math.min(5, Math.max(1, Math.round((Date.now() - c.since) / 60000)));
  if (c.status !== 'live' && !c.chatters) { el.textContent = 'chat: connecting'; el.classList.add('dim'); return; }
  el.classList.remove('dim');
  el.textContent = plural(c.chatters, 'chatting', 'chatting') + (c.msgsPerMin >= 1 ? ' (' + Math.round(c.msgsPerMin) + '/min)' : '');
  el.title = 'People who sent a chat message in the last ' + (mins < 5 ? mins + ' min (counting since this stream came up)' : '5 minutes') +
    ', read from Kick\'s public chat feed. Viewers includes everyone watching; this is only who talks.';
}

async function refreshCurrent() {
  const s = S.current;
  if (!s) return;
  const c = await K.fetchChannel(s.slug);
  if (S.current !== s || c.status !== 'ok') return;
  verifiedSet(s.slug, c.verified);
  if (c.live && c.chatroomId && c.channelId && !(S.chat && S.chat.slug === s.slug)) startChatCounter(s.slug, c.channelId, c.chatroomId);
  s.live = c.live;
  if (c.live) {
    s.viewers = c.viewers;
    if (c.title) s.title = c.title;
    if (c.startedAt) s.startedAt = c.startedAt;
    if (c.category) s.category = c.category;
  }
  if (c.avatar && !s.avatar) s.avatar = c.avatar;
  s.affiliate = c.affiliate || s.affiliate;
  renderCard();
}

function setPlayer(slug) {
  const p = $('player');
  const old = p.querySelector('iframe');
  if (old) p.removeChild(old);
  if (!slug) return;
  p.appendChild(h('iframe', {
    src: K.playerUrl(slug, S.muted),
    title: 'Kick player',
    allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
    referrerpolicy: 'origin'
  }));
}

function showEmpty(matching) {
  const hrs = Number(store.prefs.filters.repeatHours) || 0;
  let msg;
  if (!matching) msg = 'Nothing live matches your filters right now. Loosen them in Filters.';
  else msg = "You've seen all " + plural(matching, 'matching stream') + ' in the last ' + (hrs === 1 ? 'hour' : hrs + ' hours') + '.';
  $('cardEmptyMsg').textContent = msg;
  $('cardEmpty').hidden = false;
  $('lowerRepeatBtn').hidden = !matching;
  $('emptyClearBtn').hidden = !matching;
  S.emptyShown = true;
}
function showEmptyText(msg) {
  $('cardEmptyMsg').textContent = msg;
  $('cardEmpty').hidden = false;
  $('lowerRepeatBtn').hidden = true;
  $('emptyClearBtn').hidden = true;
  S.emptyShown = true;
}
function hideEmpty() {
  $('cardEmpty').hidden = true;
  S.emptyShown = false;
}

function addHistory(s, action) {
  if (!s) return;
  const t = Date.now();
  store.addHistory({
    id: t.toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    t: t,
    slug: s.slug,
    name: s.name || s.slug,
    avatar: s.avatar || '',
    viewers: s.viewers || 0,
    category: s.category ? s.category.name : (s.lastCategory || ''),
    action: action
  });
  if (S.tab === 'history' && panelVisible()) renderHistory();
}

/* ---------- card ---------- */

function renderCard() {
  const s = S.current;
  const has = !!s;
  $('cardAv').src = has && s.avatar ? s.avatar : 'favicon-192.png';
  $('cardAvLink').href = has ? K.channelPage(s.slug) : 'https://kick.com/';
  const name = $('cardName');
  name.textContent = has ? s.name : 'Your first stream lands here';
  name.href = has ? K.channelPage(s.slug) : 'https://kick.com/';
  $('cardVerified').hidden = !(has && verifiedGet(s.slug) === true);
  $('cardAffiliate').hidden = !(has && s.affiliate);
  const live = $('cardLive');
  live.hidden = !has;
  if (has) {
    const off = s.live === false;
    live.textContent = off ? 'OFFLINE' : 'LIVE' + (s.startedAt ? ' ' + uptime(s.startedAt) : '');
    live.classList.toggle('off', off);
  }
  $('cardViewers').textContent = has && s.live !== false ? plural(s.viewers || 0, 'viewer') : '';
  const chips = $('cardChips');
  clear(chips);
  if (has) {
    if (s.category) chips.appendChild(h('span', { class: 'chip', title: 'Category' }, s.category.name));
    if (s.language) chips.appendChild(h('span', { class: 'chip', title: 'Stream language' }, s.language));
    if (s.mature) chips.appendChild(h('span', { class: 'chip mature', title: 'Marked mature by the streamer' }, '18+'));
    (s.tags || []).slice(0, 3).forEach(function (t) { chips.appendChild(h('span', { class: 'chip muted', title: "The streamer's own tag" }, t)); });
  }
  const title = $('cardTitle');
  title.textContent = has ? (s.title || '') : 'Press Space or hit Roll.';
  title.title = has ? (s.title || '') : '';
  renderCardMine();
  updateActionState();
}

function renderCardMine() {
  const box = $('cardMine');
  clear(box);
  const s = S.current;
  const rec = s ? store.record(s.slug) : null;
  const before = S.cardBefore || { seenCount: 0, lastSeen: 0 };
  const parts = [];
  if (rec && rec.tags && rec.tags.length) {
    const t = h('span', { class: 'chips', title: 'Your tags' });
    rec.tags.forEach(function (x) { t.appendChild(tagChip(x)); });
    parts.push(t);
  }
  if (rec && rec.note && rec.note.trim()) {
    const n = rec.note.trim();
    parts.push(h('button', {
      class: 'note-prev', type: 'button', title: 'Your note. Click to open it in the Notes tab.',
      onclick: function () { openTab('notes', { focusNote: true }); }
    }, '"' + (n.length > 80 ? n.slice(0, 80) + '...' : n) + '"'));
  }
  const meta = [];
  if (before.seenCount) meta.push('Seen ' + plural(before.seenCount, 'time') + ' before', 'last ' + ago(before.lastSeen));
  if (rec && rec.saved) meta.push('saved ' + dateShort(rec.savedAt));
  if (meta.length) parts.push(h('span', { class: 'muted' }, meta.join(' . ')));
  parts.forEach(function (p) { box.appendChild(p); });
  box.hidden = !parts.length;
}

function updateActionState() {
  const s = S.current;
  const rec = s ? store.record(s.slug) : null;
  ['saveBtn', 'hideBtn', 'noteBtn', 'openBtn', 'shareBtn', 'muteBtn'].forEach(function (id) { $(id).disabled = !s; });
  const save = $('saveBtn');
  const saved = !!(rec && rec.saved);
  save.setAttribute('aria-pressed', saved ? 'true' : 'false');
  save.querySelector('span').textContent = saved ? 'Saved' : 'Save';
  const mute = $('muteBtn');
  mute.setAttribute('aria-pressed', S.muted ? 'true' : 'false');
  mute.querySelector('use').setAttribute('href', S.muted ? '#i-mute' : '#i-vol');
  ['tPause', 'tMinus', 'tPlus', 'tLock'].forEach(function (id) { $(id).disabled = !s; });
  $('tSet').disabled = !s;
}

/* ---------- actions ---------- */

function toggleSave() {
  const s = S.current;
  if (!s) return;
  const rec = store.ensure(s.slug);
  rec.saved = !rec.saved;
  rec.savedAt = rec.saved ? Date.now() : 0;
  store.putStreamer(s.slug);
  if (rec.saved) { addHistory(s, 'saved'); toast('Saved ' + s.name); track('stumble_save'); }
  else toast('Removed ' + s.name + ' from Saved');
  renderCard();
  if (S.tab === 'saved' && panelVisible()) renderSaved();
}

function hideCurrent() {
  const s = S.current;
  if (!s) return;
  const rec = store.ensure(s.slug);
  rec.blocked = true;
  rec.blockedAt = Date.now();
  store.putStreamer(s.slug);
  addHistory(s, 'hidden');
  track('stumble_hide');
  toast('Hidden ' + s.name + '.', {
    action: 'Undo', ms: 6000,
    onAction: function () {
      const r = store.ensure(s.slug);
      r.blocked = false; r.blockedAt = 0;
      store.putStreamer(s.slug);
      showStream(s, { source: 'undo' });
      toast(s.name + ' is back in the roll');
      if (S.tab === 'more') renderMore();
    }
  });
  if (S.tab === 'more') renderMore();
  roll('manual');
}

function openOnKick() {
  if (!S.current) return;
  window.open(K.channelPage(S.current.slug), '_blank', 'noopener');
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise(function (resolve, reject) {
    const ta = h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); }
    document.body.removeChild(ta);
  });
}

function share() {
  const s = S.current;
  if (!s) return;
  copyText(K.shareUrl(s.slug)).then(function () {
    toast('Link copied: opens Stumble on ' + s.name);
  }, function () {
    toast('Could not copy. The link is ' + K.shareUrl(s.slug), { ms: 8000 });
  });
  addHistory(s, 'shared');
}

function toggleMute() {
  if (!S.current) return;
  S.muted = !S.muted;
  setPlayer(S.current.slug);
  updateActionState();
  if (store.prefs.timer.pauseMute) {
    timer.setReason('mute', true);
    clearTimeout(toggleMute.t);
    toggleMute.t = setTimeout(function () { timer.setReason('mute', false); }, MUTE_GRACE_MS);
  }
}

/* Saved "Roll this one" / History "Roll again": no timer change for the
   former; the latter is a normal roll onto a chosen streamer. */
async function rollSlug(slug, keepTimer) {
  let s = null;
  S.pool.forEach(function (x) { if (x.slug === slug) s = x; });
  if (!s) {
    const c = await K.fetchChannel(slug);
    if (c.status !== 'ok') { toast('Could not load ' + slug + ' from Kick', { err: true }); return; }
    if (!c.live) { toast(c.name + ' is not live right now'); return; }
    s = K.streamFromChannel(c);
  }
  showStream(s, { source: keepTimer ? 'saved' : 'again', keepTimer: !!keepTimer });
  if (window.innerWidth < 1100) closeSheet();
}

/* ---------- timer UI ---------- */

function renderTimer(st) {
  if (!st) st = timer.state();
  const strip = $('timerStrip');
  const def = store.prefs.timer.defaultSec;
  $('tClock').textContent = st.active ? formatClock(st.remainingMs) : (st.locked ? formatClock(st.remainingMs) : '-:--');
  let label;
  if (st.locked) label = 'Locked. Space still rolls.';
  else if (st.active && st.manualPause) label = 'left, paused';
  else if (st.active) label = 'left';
  else if (!S.current) label = 'Timer starts with your first roll.';
  else if (!def) label = 'Timer off. Roll when you like.';
  else if (S.deepLinked && S.current && S.current.id === (S.deepStreamId || '')) label = 'Roll to start the timer.';
  else label = 'Timer stopped. Roll to start it again.';
  $('tLabel').textContent = label;
  $('tWhy').textContent = st.autoReason ? 'paused: ' + st.autoReason : '';
  strip.classList.toggle('warn', !!st.warning);
  const pause = $('tPause');
  const paused = st.active && st.manualPause;
  pause.setAttribute('aria-pressed', paused ? 'true' : 'false');
  $('tPauseLbl').textContent = paused ? 'Resume' : 'Pause';
  pause.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  $('tLock').setAttribute('aria-pressed', st.locked ? 'true' : 'false');
  $('tMakeDefault').hidden = !st.differsFromDefault;
  renderRing($('ringArc'), st);
  // optional tick in the last 5 s
  if (store.prefs.timer.tick && st.running && st.warning) {
    const sec = Math.ceil(st.remainingMs / 1000);
    if (sec !== S.lastTickSec && sec > 0) { S.lastTickSec = sec; tickSound(); }
  } else S.lastTickSec = -1;
}

let audioCtx = null;
function tickSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.07);
  } catch (e) { /* no audio */ }
}

function toggleLock() {
  const locked = timer.toggleLock();
  if (locked && S.current) addHistory(S.current, 'locked');
}

function sizeRing() {
  const wrap = $('rollWrap');
  const svg = $('ring');
  const w = wrap.clientWidth, hgt = wrap.clientHeight;
  if (!w || !hgt) return;
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt);
  const d = ringPath(w, hgt, 3);
  $('ringTrack').setAttribute('d', d);
  $('ringArc').setAttribute('d', d);
  renderRing($('ringArc'), timer.state());
}

function syncAutoPausePrefs() {
  const t = store.prefs.timer;
  if (!t.pauseTyping) { timer.setReason('typing', false); timer.setReason('chat', false); }
  else checkTyping();
  if (!t.pauseHidden) timer.setReason('hidden', false);
  else timer.setReason('hidden', document.hidden);
  if (!t.pauseHover) timer.setReason('hover', false);
  if (!t.pauseMute) timer.setReason('mute', false);
}

function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return ['checkbox', 'radio', 'button', 'submit', 'range', 'color'].indexOf(el.type) === -1;
  return false;
}
function checkTyping() {
  const on = store.prefs.timer.pauseTyping;
  const a = document.activeElement;
  timer.setReason('typing', !!(on && isTypingTarget(a)));
  const inChat = !!(on && a && a.tagName === 'IFRAME' && a.closest && a.closest('.chat-body'));
  timer.setReason('chat', inChat);
}

/* ---------- tabs + sheet ---------- */

const TABS = ['chat', 'notes', 'filters', 'saved', 'history', 'more'];
function isSheet() { return window.innerWidth < 1100; }
function panelVisible() { return !isSheet() || S.sheetOpen; }

function openTab(name, opts) {
  opts = opts || {};
  if (TABS.indexOf(name) === -1) name = 'chat';
  if (S.tab === 'notes' && name !== 'notes') flushNote();
  S.tab = name;
  TABS.forEach(function (t) {
    const tab = $('tab-' + t);
    const on = t === name;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    $('panel-' + t).hidden = !on;
  });
  $('rail').classList.toggle('wide', name === 'saved' || name === 'history');
  if (isSheet() && !opts.noSheet) openSheet();
  lsSet(KEYS.ui, { tab: name });
  renderTab(name);
  if (opts.focusNote) setTimeout(function () { const t = $('noteText'); if (t && !t.closest('[hidden]')) t.focus(); }, 30);
  if (opts.focusEl) setTimeout(function () { const e = $(opts.focusEl); if (e) { e.focus(); if (e.select) e.select(); } }, 30);
  if (opts.focusTab) $('tab-' + name).focus();
}

function renderTab(name) {
  if (name === 'chat') renderChat();
  else if (name === 'notes') renderNotes();
  else if (name === 'filters') renderFilters();
  else if (name === 'saved') { renderSaved(); refreshSavedLive(); }
  else if (name === 'history') renderHistory();
  else if (name === 'more') renderMore();
}

function openSheet() {
  S.sheetOpen = true;
  $('rail').classList.add('open');
  renderTab(S.tab);
}
function closeSheet() {
  if (S.tab === 'notes') flushNote();
  S.sheetOpen = false;
  $('rail').classList.remove('open');
}

/* ---------- chat ---------- */

function setChatFrame(body, slug, title) {
  let f = body.querySelector('iframe');
  const url = K.chatUrl(slug);
  if (!f) {
    f = h('iframe', { title: title, referrerpolicy: 'origin' });
    body.appendChild(f);
  }
  if (f.getAttribute('src') !== url) f.setAttribute('src', url);
}

function renderChat() {
  const p = store.prefs.panels;
  const s = S.current;
  const secS = $('chatSecStreamer');
  const bodyS = $('chatBodyStreamer');
  $('chatNameStreamer').textContent = s ? s.name : 'Streamer chat';
  $('chatOpenStreamer').hidden = !s;
  if (s) $('chatOpenStreamer').href = K.chatUrl(s.slug);
  const collapsedS = !!p.chatCollapsed.streamer;
  secS.classList.toggle('collapsed', collapsedS);
  $('chatCaretStreamer').setAttribute('aria-expanded', collapsedS ? 'false' : 'true');
  $('chatEmptyStreamer').hidden = !!s;
  if (s && !collapsedS && panelVisible()) setChatFrame(bodyS, s.slug, s.name + ' chat');
  else if (!s) { const f = bodyS.querySelector('iframe'); if (f) bodyS.removeChild(f); }

  const mine = $('chatSecMine');
  const showMine = store.signedIn() && p.myChat && !!S.ownSlug;
  mine.hidden = !showMine;
  if (showMine) {
    const user = store.user || {};
    $('chatNameMine').textContent = (user.name || S.ownSlug) + ' (your chat)';
    $('chatOpenMine').href = K.chatUrl(S.ownSlug);
    const collapsedM = !!p.chatCollapsed.mine;
    mine.classList.toggle('collapsed', collapsedM);
    $('chatCaretMine').setAttribute('aria-expanded', collapsedM ? 'false' : 'true');
    if (!collapsedM && panelVisible()) setChatFrame($('chatBodyMine'), S.ownSlug, 'Your chat');
  }
}

function toggleChatSection(which) {
  const c = store.prefs.panels.chatCollapsed;
  c[which] = !c[which];
  store.savePrefs();
  renderChat();
}

/* ---------- notes + tags ---------- */

function renderNotes() {
  const s = S.current;
  $('notesEmpty').hidden = !!s;
  $('notes').hidden = !s;
  if (!s) return;
  const rec = store.record(s.slug) || store.ensure(s.slug);
  $('notesAv').src = s.avatar || rec.avatar || 'favicon-192.png';
  $('notesName').textContent = s.name;
  const b = S.cardBefore || {};
  $('notesSeen').textContent = (rec.seenCount ? 'Seen ' + plural(rec.seenCount, 'time') : '') +
    (b.lastSeen ? ' . before this, ' + ago(b.lastSeen) : '') + (rec.saved ? ' . saved ' + dateShort(rec.savedAt) : '');
  const ta = $('noteText');
  if (S.noteSlug !== s.slug || document.activeElement !== ta) {
    ta.value = rec.note || '';
    S.noteSlug = s.slug;
    $('noteSaved').textContent = rec.note ? 'Saved' : '';
  }
  autoGrow(ta);
  renderTagChips();
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.5) + 'px';
}

function onNoteInput() {
  autoGrow($('noteText'));
  $('noteSaved').textContent = 'Typing...';
  clearTimeout(S.noteTimer);
  S.noteTimer = setTimeout(saveNote, 800);
}

function saveNote() {
  clearTimeout(S.noteTimer);
  S.noteTimer = 0;
  const slug = S.noteSlug;
  if (!slug) return;
  const val = $('noteText').value;
  if (byteLength(val) > NOTE_MAX_BYTES) {
    $('noteSaved').textContent = 'Too long to save (64 KB max).';
    toast('That note is over 64 KB, so it was not saved.', { err: true });
    return;
  }
  const rec = store.ensure(slug);
  if ((rec.note || '') === val) { $('noteSaved').textContent = val ? 'Saved' : ''; return; }
  rec.note = val;
  store.putStreamer(slug);
  $('noteSaved').textContent = 'Saved ' + clock(Date.now());
  if (S.current && S.current.slug === slug) renderCardMine();
}

function flushNote() { if (S.noteTimer) saveNote(); }

function normTag(t) {
  return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '').slice(0, 40);
}

function renderTagChips() {
  const box = $('tagChips');
  clear(box);
  const s = S.current;
  if (!s) return;
  const rec = store.record(s.slug);
  (rec && rec.tags || []).forEach(function (t) {
    box.appendChild(tagChip(t, function () { removeTag(t); }));
  });
}

function addTag(raw) {
  const t = normTag(raw);
  const s = S.current;
  if (!t || !s) return;
  const rec = store.ensure(s.slug);
  rec.tags = rec.tags || [];
  if (rec.tags.indexOf(t) !== -1) return;
  if (rec.tags.length >= TAGS_MAX) { toast('50 tags is the most one streamer can have.', { err: true }); return; }
  rec.tags.push(t);
  store.putStreamer(s.slug);
  afterTagsChanged();
}
function removeTag(t) {
  const s = S.current;
  if (!s) return;
  const rec = store.ensure(s.slug);
  rec.tags = (rec.tags || []).filter(function (x) { return x !== t; });
  store.putStreamer(s.slug);
  afterTagsChanged();
}
function afterTagsChanged() {
  renderTagChips();
  renderCardMine();
  onFiltersChanged(false);
}

let suggestIdx = -1;
function renderSuggest() {
  const list = $('tagSuggest');
  const input = $('tagInput');
  const term = normTag(input.value);
  const s = S.current;
  const mine = s && store.record(s.slug) ? (store.record(s.slug).tags || []) : [];
  const all = store.tagSet().filter(function (t) { return mine.indexOf(t) === -1 && (!term || t.indexOf(term) !== -1); }).slice(0, 8);
  clear(list);
  if (!all.length || document.activeElement !== input) { list.hidden = true; suggestIdx = -1; return; }
  if (suggestIdx >= all.length) suggestIdx = all.length - 1;
  all.forEach(function (t, i) {
    list.appendChild(h('li', {
      role: 'option', id: 'sug-' + i, 'aria-selected': i === suggestIdx ? 'true' : 'false',
      onmousedown: function (e) { e.preventDefault(); addTag(t); input.value = ''; renderSuggest(); }
    }, tagChip(t)));
  });
  list.hidden = false;
}

function onTagKey(e) {
  const input = $('tagInput');
  const items = $('tagSuggest').querySelectorAll('li');
  if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); suggestIdx = (suggestIdx + 1) % items.length; renderSuggest(); return; }
  if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); suggestIdx = suggestIdx <= 0 ? items.length - 1 : suggestIdx - 1; renderSuggest(); return; }
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (suggestIdx >= 0 && items[suggestIdx]) addTag(items[suggestIdx].textContent);
    else addTag(input.value);
    input.value = '';
    suggestIdx = -1;
    renderSuggest();
    return;
  }
  if (e.key === 'Backspace' && !input.value) {
    const s = S.current;
    const rec = s && store.record(s.slug);
    if (rec && rec.tags && rec.tags.length) removeTag(rec.tags[rec.tags.length - 1]);
    return;
  }
  if (e.key === 'Escape') { $('tagSuggest').hidden = true; }
}

/* ---------- filters ---------- */

function setSeg(id, value) {
  $(id).querySelectorAll('button').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.v) === String(value) ? 'true' : 'false');
  });
}

function renderFilters() {
  const f = store.prefs.filters;
  const t = store.prefs.timer;
  setVal('fMin', f.minViewers);
  setVal('fMax', f.maxViewers == null || f.maxViewers === '' ? '' : f.maxViewers);
  setVal('fLive', f.minLiveMin);
  setVal('fRepeat', f.repeatHours);
  $('fMature').checked = !!f.mature;
  $('fVerified').checked = !!f.verifiedOnly;
  setSeg('fTier', f.tier || 'any');
  setSeg('fBias', f.bias);
  setVal('fHas', f.titleHas);
  setVal('fNot', f.titleNot);
  const presets = [0, 15, 30, 60, 120, 300, 600];
  setSeg('fTimer', presets.indexOf(t.defaultSec) !== -1 ? t.defaultSec : 'none');
  setVal('fTimerCustom', presets.indexOf(t.defaultSec) === -1 ? t.defaultSec : '');
  $('fTick').checked = !!t.tick;
  $('fPauseTyping').checked = !!t.pauseTyping;
  $('fPauseHidden').checked = !!t.pauseHidden;
  $('fPauseHover').checked = !!t.pauseHover;
  $('fPauseMute').checked = !!t.pauseMute;
  renderLangChips();
  renderCatChips();
  renderTagFilterChips();
  renderCounters();
}

function setVal(id, v) {
  const el = $(id);
  if (document.activeElement === el) return;
  el.value = v == null ? '' : v;
}

function renderLangChips() {
  const f = store.prefs.filters;
  const box = $('fLangs');
  const counts = K.languageCounts(S.pool);
  f.languages.forEach(function (l) {
    if (!counts.some(function (c) { return c.name === l; })) counts.push({ name: l, count: 0 });
  });
  const search = $('fLangSearch');
  search.hidden = counts.length <= 12;
  const term = search.hidden ? '' : S.langTerm.toLowerCase();
  clear(box);
  const shown = counts.filter(function (c) { return !term || c.name.toLowerCase().indexOf(term) !== -1 || f.languages.indexOf(c.name) !== -1; });
  if (!shown.length) box.appendChild(h('span', { class: 'empty-note', text: S.pool.size ? 'No language matches that search.' : 'Languages appear as the scan finds streams.' }));
  shown.forEach(function (c) {
    const on = f.languages.indexOf(c.name) !== -1;
    box.appendChild(h('button', {
      class: 'chip', type: 'button', 'aria-pressed': on ? 'true' : 'false',
      title: on ? 'Click to stop limiting the roll to ' + c.name : 'Only roll ' + c.name + ' streams (pick several for any of them)',
      onclick: function () {
        const i = f.languages.indexOf(c.name);
        if (i === -1) f.languages.push(c.name); else f.languages.splice(i, 1);
        store.savePrefs();
        onFiltersChanged(true);
        renderLangChips();
      }
    }, c.name, h('span', { class: 'n', text: ' ' + fmt(c.count) })));
  });
}

function catState(slug) {
  const f = store.prefs.filters;
  if (f.catInclude.some(function (c) { return c.slug === slug; })) return 'inc';
  if (f.catExclude.some(function (c) { return c.slug === slug; })) return 'exc';
  return '';
}

function cycleCat(c) {
  const f = store.prefs.filters;
  const st = catState(c.slug);
  const rec = { id: c.id || null, slug: c.slug, name: c.name };
  f.catInclude = f.catInclude.filter(function (x) { return x.slug !== c.slug; });
  f.catExclude = f.catExclude.filter(function (x) { return x.slug !== c.slug; });
  if (st === '') f.catInclude.push(rec);
  else if (st === 'inc') f.catExclude.push(rec);
  store.savePrefs();
  onFiltersChanged(true);
  renderCatChips();
}

function renderCatChips() {
  const f = store.prefs.filters;
  const box = $('fCats');
  const poolCats = K.categoryCounts(S.pool);
  const countBy = {};
  poolCats.forEach(function (c) { countBy[c.slug] = c.count; });
  let list;
  if (S.catTerm) {
    const merged = {};
    (S.topCats || []).concat(poolCats).forEach(function (c) { if (!merged[c.slug]) merged[c.slug] = c; });
    list = K.matchCategories(Object.keys(merged).map(function (k) { return merged[k]; }), S.catTerm, 14);
  } else {
    list = poolCats.slice(0, 14);
  }
  const chosen = f.catInclude.concat(f.catExclude);
  chosen.forEach(function (c) { if (!list.some(function (x) { return x.slug === c.slug; })) list.unshift(c); });
  clear(box);
  if (!list.length) box.appendChild(h('span', { class: 'empty-note', text: S.catTerm ? 'No category matches that search.' : 'Categories appear as the scan finds streams.' }));
  list.forEach(function (c) {
    const st = catState(c.slug);
    const n = countBy[c.slug];
    const tip = st === 'inc' ? 'Included: the roll only uses these categories. Click to exclude instead.'
      : st === 'exc' ? 'Excluded: never rolled. Click to clear.'
        : 'Click to include (only roll this category); click again to exclude.';
    box.appendChild(h('button', {
      class: 'chip' + (st ? ' ' + st : ''), type: 'button', title: tip,
      'aria-label': c.name + (st === 'inc' ? ', included' : st === 'exc' ? ', excluded' : ''),
      onclick: function () { cycleCat(c); }
    }, c.name, n ? h('span', { class: 'n', text: ' ' + fmt(n) }) : null));
  });
}

function renderTagFilterChips() {
  const f = store.prefs.filters;
  const tags = store.tagSet();
  [['fTagsAny', 'tagsAny', 'tagsNever'], ['fTagsNever', 'tagsNever', 'tagsAny']].forEach(function (row) {
    const box = $(row[0]);
    clear(box);
    const all = tags.slice();
    f[row[1]].forEach(function (t) { if (all.indexOf(t) === -1) all.push(t); });
    if (!all.length) { box.appendChild(h('span', { class: 'empty-note', text: 'Tag streamers in Notes to filter by your tags.' })); return; }
    all.forEach(function (t) {
      const on = f[row[1]].indexOf(t) !== -1;
      const b = h('button', {
        class: 'chip' + (on ? ' ' + (row[1] === 'tagsAny' ? 'inc' : 'exc') : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
        title: row[1] === 'tagsAny' ? 'Only roll streamers you tagged "' + t + '"' : 'Never roll streamers you tagged "' + t + '"',
        onclick: function () {
          const list = f[row[1]];
          const i = list.indexOf(t);
          if (i === -1) { list.push(t); f[row[2]] = f[row[2]].filter(function (x) { return x !== t; }); }
          else list.splice(i, 1);
          store.savePrefs();
          onFiltersChanged(true);
          renderTagFilterChips();
        }
      }, t);
      box.appendChild(b);
    });
  });
}

function numOr(v, d) {
  if (v === '' || v == null) return d;
  const n = Number(v);
  return isFinite(n) ? n : d;
}

function readFilterInputs() {
  const f = store.prefs.filters;
  f.minViewers = Math.max(0, Math.round(numOr($('fMin').value, 0)));
  const mx = $('fMax').value;
  f.maxViewers = mx === '' ? '' : Math.max(0, Math.round(numOr(mx, 0)));
  f.minLiveMin = Math.max(0, Math.round(numOr($('fLive').value, 0)));
  f.repeatHours = Math.max(0, numOr($('fRepeat').value, 0));
  f.titleHas = $('fHas').value;
  f.titleNot = $('fNot').value;
  store.savePrefs();
  onFiltersChanged(true);
}

/* Any filter change: recount instantly, rescan if a server-side part
   (included categories, a lower floor) changed. */
function onFiltersChanged(rescan) {
  const r = currentCandidates();
  S.matchCount = r.matching.length;
  renderCounters();
  if (S.emptyShown && r.candidates.length) hideEmpty();
  if (rescan) maybeRescanForFilters();
  if (S.wantRoll && r.candidates.length && !S.rollBusy) { S.wantRoll = false; roll('manual'); }
}

function setTimerDefault(sec) {
  store.prefs.timer.defaultSec = sec;
  store.savePrefs();
  renderFilters();
  renderTimer();
}

function resetFilters() {
  const keepTimer = store.prefs.timer;
  store.prefs.filters = defaultPrefs().filters;
  store.prefs.timer = keepTimer;
  store.savePrefs();
  S.catTerm = '';
  $('fCatSearch').value = '';
  renderFilters();
  onFiltersChanged(true);
  toast('Filters back to the defaults');
}

/* ---------- saved table ---------- */

const COLS = {
  name: { label: 'Name', w: 2.2, sort: function (r) { return (r.name || r.slug).toLowerCase(); } },
  tags: { label: 'Tags', w: 1.6, sort: function (r) { return (r.tags || []).join(','); } },
  live: { label: 'Live now', w: 1.2, sort: function (r) { const c = S.liveCache[r.slug]; return c && c.live ? c.viewers : -1; } },
  lastSeen: { label: 'Last seen', w: 1.2, sort: function (r) { return r.lastSeen || 0; } },
  seen: { label: 'Seen', w: 0.8, sort: function (r) { return r.seenCount || 0; } },
  savedAt: { label: 'Saved on', w: 1.2, sort: function (r) { return r.savedAt || 0; } },
  note: { label: 'Note', w: 2, sort: function (r) { return (r.note || '').toLowerCase(); } }
};
const ACTIONS_W = 1.3;
const MIN_W = 0.6;

function visibleCols() {
  const sv = store.prefs.saved;
  return sv.order.filter(function (k) { return sv.hidden.indexOf(k) === -1 && COLS[k]; });
}
function colW(k) {
  const w = store.prefs.saved.widths[k];
  return typeof w === 'number' && w > 0 ? w : COLS[k].w;
}

function savedRecords() {
  const all = store.streamers;
  const list = Object.keys(all).map(function (k) { return all[k]; }).filter(function (r) { return r.saved; });
  const sort = store.prefs.saved.sort;
  if (sort.key && COLS[sort.key]) {
    const fn = COLS[sort.key].sort;
    const dir = sort.dir === 'desc' ? -1 : 1;
    list.sort(function (a, b) {
      const x = fn(a), y = fn(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  } else {
    list.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
  }
  return list;
}

function renderSaved() {
  const cols = visibleCols();
  const recs = savedRecords();
  $('savedCount').textContent = plural(recs.length, 'saved streamer');
  $('savedEmpty').hidden = recs.length > 0;
  $('savedWrap').hidden = recs.length === 0;
  // widths as shares of the table, so it always fits its box
  const total = cols.reduce(function (a, k) { return a + colW(k); }, 0) + ACTIONS_W;
  const cg = $('savedCols');
  clear(cg);
  cols.forEach(function (k) { cg.appendChild(h('col', { style: 'width:' + (colW(k) / total * 100).toFixed(3) + '%' })); });
  cg.appendChild(h('col', { style: 'width:' + (ACTIONS_W / total * 100).toFixed(3) + '%' }));
  // header
  const sort = store.prefs.saved.sort;
  const hr = $('savedHead');
  clear(hr);
  cols.forEach(function (k, i) {
    const dir = sort.key === k ? sort.dir : '';
    const th = h('th', { scope: 'col', 'aria-sort': dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none' });
    th.appendChild(h('button', {
      class: 'sort', type: 'button',
      title: 'Sort by ' + COLS[k].label.toLowerCase() + ': click for ascending, again for descending, a third time to go back to newest saved first',
      onclick: function () { cycleSort(k); }
    }, COLS[k].label, dir ? icon(dir === 'asc' ? 'up' : 'down', 'arrow') : null));
    const rz = h('span', { class: 'resizer', title: 'Drag to resize this column', 'aria-hidden': 'true' });
    rz.addEventListener('pointerdown', function (e) { startResize(e, i, cols); });
    th.appendChild(rz);
    hr.appendChild(th);
  });
  hr.appendChild(h('th', { scope: 'col' }, h('span', { class: 'sr', text: 'Actions' })));
  // rows
  const body = $('savedBody');
  clear(body);
  recs.forEach(function (r) {
    const tr = h('tr');
    cols.forEach(function (k) { tr.appendChild(savedCell(k, r)); });
    tr.appendChild(h('td', { 'data-label': 'Actions' }, h('div', { class: 'row-acts' },
      h('button', { class: 'ib', type: 'button', title: 'Put ' + (r.name || r.slug) + ' on the player now, without restarting the timer', 'aria-label': 'Roll this one', onclick: function () { rollSlug(r.slug, true); } }, icon('dice')),
      h('a', { class: 'ib', href: K.channelPage(r.slug), target: '_blank', rel: 'noopener', title: 'Open on Kick', 'aria-label': 'Open on Kick' }, icon('open')),
      h('button', { class: 'ib danger', type: 'button', title: 'Remove from Saved (notes and tags stay)', 'aria-label': 'Unsave', onclick: function () { unsave(r.slug); } }, icon('x'))
    )));
    body.appendChild(tr);
  });
  renderColMenu();
}

function savedCell(k, r) {
  const td = h('td', { 'data-label': COLS[k].label, class: 'cell-' + k });
  if (k === 'name') {
    td.appendChild(h('div', { class: 'who' }, avatarImg(r.avatar, 26),
      h('a', { href: K.channelPage(r.slug), target: '_blank', rel: 'noopener', title: 'Open ' + (r.name || r.slug) + ' on Kick', text: r.name || r.slug })));
  } else if (k === 'tags') {
    const box = h('div', { class: 'chips' });
    (r.tags || []).forEach(function (t) { box.appendChild(tagChip(t)); });
    td.appendChild(box);
  } else if (k === 'live') {
    const c = S.liveCache[r.slug];
    if (!c) td.appendChild(h('span', { class: 'muted', text: '-' }));
    else td.appendChild(h('span', null, h('span', { class: 'live-dot' + (c.live ? ' on' : '') }), c.live ? fmt(c.viewers) : 'offline'));
  } else if (k === 'lastSeen') {
    td.className += ' date';
    td.textContent = r.lastSeen ? dateShort(r.lastSeen) : '-';
    td.title = r.lastSeen ? new Date(r.lastSeen).toLocaleString() : '';
  } else if (k === 'seen') {
    td.textContent = fmt(r.seenCount || 0);
  } else if (k === 'savedAt') {
    td.className += ' date';
    td.textContent = r.savedAt ? dateShort(r.savedAt) : '-';
    td.title = r.savedAt ? new Date(r.savedAt).toLocaleString() : '';
  } else if (k === 'note') {
    const n = (r.note || '').trim();
    td.className += ' note-cell';
    td.textContent = n.length > 60 ? n.slice(0, 60) + '...' : n;
    td.title = n;
  }
  return td;
}

function cycleSort(k) {
  const s = store.prefs.saved.sort;
  if (s.key !== k) { s.key = k; s.dir = 'asc'; }
  else if (s.dir === 'asc') s.dir = 'desc';
  else { s.key = ''; s.dir = ''; }
  store.savePrefs();
  renderSaved();
}

function startResize(e, i, cols) {
  e.preventDefault();
  const table = $('savedTable');
  const tw = table.getBoundingClientRect().width || 1;
  const total = cols.reduce(function (a, k) { return a + colW(k); }, 0) + ACTIONS_W;
  const k = cols[i];
  const nk = cols[i + 1] || null; // the right neighbour gives up the space
  const w0 = colW(k);
  const n0 = nk ? colW(nk) : ACTIONS_W;
  const x0 = e.clientX;
  const rz = e.target;
  rz.classList.add('active');
  try { rz.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  const colsEls = $('savedCols').children;
  function move(ev) {
    let dw = (ev.clientX - x0) / tw * total;
    dw = Math.max(MIN_W - w0, Math.min(n0 - MIN_W, dw));
    colsEls[i].style.width = ((w0 + dw) / total * 100).toFixed(3) + '%';
    colsEls[i + 1].style.width = ((n0 - dw) / total * 100).toFixed(3) + '%';
    move.dw = dw;
  }
  function up() {
    rz.removeEventListener('pointermove', move);
    rz.removeEventListener('pointerup', up);
    rz.removeEventListener('pointercancel', up);
    rz.classList.remove('active');
    const dw = move.dw || 0;
    if (dw) {
      const ws = store.prefs.saved.widths;
      ws[k] = Math.round((w0 + dw) * 100) / 100;
      if (nk) ws[nk] = Math.round((n0 - dw) * 100) / 100;
      store.savePrefs();
    }
    renderSaved();
  }
  rz.addEventListener('pointermove', move);
  rz.addEventListener('pointerup', up);
  rz.addEventListener('pointercancel', up);
}

function renderColMenu() {
  const sv = store.prefs.saved;
  const ul = $('colList');
  clear(ul);
  sv.order.forEach(function (k, i) {
    const shown = sv.hidden.indexOf(k) === -1;
    const li = h('li', { draggable: 'true', dataset: { col: k } },
      h('span', { class: 'grip', title: 'Drag to reorder' }, icon('grip')),
      h('label', null,
        h('input', {
          type: 'checkbox', checked: shown ? true : null, disabled: k === 'name' ? true : null,
          title: k === 'name' ? 'The name column always shows' : 'Show or hide this column',
          onchange: function (e) { toggleCol(k, e.target.checked); }
        }), COLS[k].label),
      h('button', { class: 'ib mv', type: 'button', title: 'Move up', 'aria-label': 'Move ' + COLS[k].label + ' up', disabled: i === 0 ? true : null, onclick: function () { moveCol(i, i - 1); } }, icon('up')),
      h('button', { class: 'ib mv', type: 'button', title: 'Move down', 'aria-label': 'Move ' + COLS[k].label + ' down', disabled: i === sv.order.length - 1 ? true : null, onclick: function () { moveCol(i, i + 1); } }, icon('down'))
    );
    li.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragover', function (e) { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
    li.addEventListener('drop', function (e) {
      e.preventDefault();
      li.classList.remove('drag-over');
      const from = sv.order.indexOf(e.dataTransfer.getData('text/plain'));
      if (from !== -1) moveCol(from, i);
    });
    ul.appendChild(li);
  });
}

function moveCol(from, to) {
  const o = store.prefs.saved.order;
  if (to < 0 || to >= o.length || from === to) return;
  const k = o.splice(from, 1)[0];
  o.splice(to, 0, k);
  store.savePrefs();
  renderSaved();
}
function toggleCol(k, show) {
  const hd = store.prefs.saved.hidden;
  const i = hd.indexOf(k);
  if (show && i !== -1) hd.splice(i, 1);
  if (!show && i === -1) hd.push(k);
  store.savePrefs();
  renderSaved();
}

function unsave(slug) {
  const r = store.ensure(slug);
  r.saved = false;
  r.savedAt = 0;
  store.putStreamer(slug);
  toast('Removed ' + (r.name || slug) + ' from Saved');
  renderSaved();
  if (S.current && S.current.slug === slug) renderCard();
}

/* Live now: pool first (free), then the Worker's bulk check when signed
   in, then channel lookups, at most 20 per refresh. */
async function refreshSavedLive(force) {
  const now = Date.now();
  const recs = savedRecords();
  const stale = recs.filter(function (r) {
    const c = S.liveCache[r.slug];
    return force || !c || now - c.t > LIVE_CACHE_MS;
  });
  const bySlug = {};
  S.pool.forEach(function (s) { bySlug[s.slug] = s; });
  const todo = [];
  stale.forEach(function (r) {
    const p = bySlug[r.slug];
    if (p) S.liveCache[r.slug] = { live: true, viewers: p.viewers, t: now };
    else todo.push(r);
  });
  if (store.signedIn() && todo.length) {
    const ids = todo.map(function (r) { return r.userId; }).filter(Boolean).slice(0, 100);
    if (ids.length) {
      try {
        const res = await fetch(WORKER + '/saved-live?ids=' + ids.join(','));
        if (res.ok) {
          const d = await res.json();
          const live = {};
          (d.data || []).forEach(function (x) { live[String(x.broadcaster_user_id || x.user_id)] = x.viewer_count || 0; });
          const t = Date.now();
          for (let i = todo.length - 1; i >= 0; i--) {
            const r = todo[i];
            if (!r.userId) continue;
            const v = live[String(r.userId)];
            S.liveCache[r.slug] = { live: v !== undefined, viewers: v || 0, t: t };
            todo.splice(i, 1);
          }
        }
      } catch (e) { /* fall through to lookups */ }
    }
  }
  const batch = todo.slice(0, SAVED_LIVE_MAX);
  let i = 0;
  async function worker() {
    while (i < batch.length) {
      const r = batch[i++];
      const c = await K.fetchChannel(r.slug);
      if (c.status === 'ok') {
        S.liveCache[r.slug] = { live: c.live, viewers: c.viewers, t: Date.now() };
        verifiedSet(r.slug, c.verified);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (S.tab === 'saved') renderSaved();
}

/* ---------- history ---------- */

const ACTION_LABEL = { rolled: 'rolled', saved: 'saved', hidden: 'hidden', locked: 'locked', shared: 'shared' };

function renderHistory() {
  const list = $('histList');
  clear(list);
  const hist = store.history;
  $('histCount').textContent = plural(hist.length, 'entry', 'entries') + ' (last 500 kept)';
  $('histEmpty').hidden = hist.length > 0;
  $('histClear').disabled = !hist.length;
  let day = '';
  const frag = document.createDocumentFragment();
  hist.forEach(function (e) {
    const d = dayLabel(e.t);
    if (d !== day) { day = d; frag.appendChild(h('div', { class: 'h-day', text: d })); }
    const meta = [];
    if (e.viewers) meta.push(plural(e.viewers, 'viewer'));
    if (e.category) meta.push(e.category);
    frag.appendChild(h('div', { class: 'h-row' },
      h('span', { class: 'h-time', text: clock(e.t) }),
      avatarImg(e.avatar, 28),
      h('div', { class: 'h-main' },
        h('strong', null, e.name || e.slug, ' ', h('span', { class: 'h-act ' + e.action, text: ACTION_LABEL[e.action] || e.action })),
        h('span', { text: meta.join(' . ') })),
      h('button', { class: 'ib', type: 'button', title: 'Roll ' + (e.name || e.slug) + ' again (if live)', 'aria-label': 'Roll again', onclick: function () { rollSlug(e.slug, false); } }, icon('dice'))
    ));
  });
  list.appendChild(frag);
}

function confirmClearHistory() {
  modal({
    title: 'Clear history?',
    body: "Clears the don't-repeat memory too. Saved, hidden, notes and tags stay.",
    escape: false,
    buttons: [
      { label: 'Cancel', cls: 'btn-ol' },
      {
        label: 'Clear history', cls: 'btn-ol danger', onClick: function () {
          store.clearHistory();
          renderHistory();
          onFiltersChanged(false);
          toast('History cleared');
        }
      }
    ]
  });
}

/* ---------- more ---------- */

function renderMore() {
  renderAccountBox();
  // hidden streamers
  const box = $('blockedList');
  clear(box);
  const all = store.streamers;
  const blocked = Object.keys(all).map(function (k) { return all[k]; }).filter(function (r) { return r.blocked; })
    .sort(function (a, b) { return (b.blockedAt || 0) - (a.blockedAt || 0); });
  if (!blocked.length) box.appendChild(h('p', { class: 'muted', text: 'Nobody hidden. Press B on a stream to keep it out of the roll for good.' }));
  blocked.forEach(function (r) {
    box.appendChild(h('div', { class: 'b-row' }, avatarImg(r.avatar, 26),
      h('span', { class: 'who' }, r.name || r.slug, h('span', { class: 'muted', text: r.blockedAt ? ' . hidden ' + dateShort(r.blockedAt) : '' })),
      h('button', {
        class: 'btn-ol btn-sm', type: 'button', title: 'Let ' + (r.name || r.slug) + ' come up in the roll again',
        onclick: function () {
          r.blocked = false; r.blockedAt = 0;
          store.putStreamer(r.slug);
          toast((r.name || r.slug) + ' is back in the roll');
          renderMore();
          onFiltersChanged(false);
        }
      }, 'Unhide')));
  });
  applyTheme();
  $('pMyChat').checked = !!store.prefs.panels.myChat;
  $('pMyChat').disabled = !store.signedIn();
  $('pLegend').checked = !!store.prefs.panels.legend;
  $('gaState').textContent = window.__gaOptedOut ? 'Analytics is off on this device.' : '';
}

function renderAccountBox() {
  const box = $('acctBox');
  clear(box);
  const u = store.user;
  if (store.signedIn() && u) {
    box.appendChild(h('div', { class: 'acct-row' }, avatarImg(u.avatar, 40),
      h('div', { class: 'who' }, h('strong', { text: u.name || 'Kick user' }), h('span', { class: 'muted', text: 'Signed in with Kick' })),
      h('button', { class: 'btn-ol btn-sm', type: 'button', title: 'Stop syncing on this device. Your data stays here and in the cloud.', onclick: signOut }, 'Sign out')));
  } else {
    box.appendChild(h('div', { class: 'acct-row' },
      h('button', { class: 'btn-kick', type: 'button', title: $('signInBtn').title, onclick: signIn }, icon('kick'), h('span', { text: 'Sign in with Kick' }))));
    box.appendChild(h('p', { class: 'muted', text: 'Sign in to keep your saved streamers, notes and filters on every device. Nothing here needs it.' }));
    if (LOCAL) {
      box.appendChild(h('button', {
        class: 'linkish', type: 'button',
        title: 'Local testing only: signs in a fake user through wrangler dev with DEV_FAKE_LOGIN=1',
        onclick: devSignIn
      }, 'Dev sign-in (local Worker)'));
    }
  }
}

/* ---------- account + sync ---------- */

function renderHeaderAccount() {
  const u = store.user;
  const on = store.signedIn() && !!u;
  $('signInBtn').hidden = on;
  $('acctBtn').hidden = !on;
  $('syncDot').hidden = !on;
  if (on) {
    $('acctAvatar').src = u.avatar || 'favicon-192.png';
    $('acctName').textContent = u.name || 'Account';
  }
}

function renderSync(st) {
  const b = $('syncDot');
  b.dataset.state = st.state;
  const t = st.at ? clock(st.at) : '';
  b.title = st.state === 'saved' ? 'Synced at ' + t
    : st.state === 'saving' ? 'Saving...'
      : st.state === 'failed' ? 'Sync failed at ' + t + (st.msg ? ': ' + st.msg : '') + '. Click to retry.'
        : 'Sync idle';
}

function signIn() {
  if (!KICK_CLIENT_ID) { toast('Sign-in not set up yet'); return; }
  Auth.beginLogin(KICK_CLIENT_ID).catch(function () { toast('Could not start sign-in in this browser', { err: true }); });
}

function devSignIn() {
  const input = h('input', { type: 'text', value: 'devtester', maxlength: '24', spellcheck: 'false', 'aria-label': 'Fake user name', style: 'width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg)' });
  modal({
    title: 'Dev sign-in',
    body: h('div', null, h('p', { text: 'Signs in a fake user through the local Worker (wrangler dev with DEV_FAKE_LOGIN=1). Production never allows this.' }), input),
    escape: true,
    focus: 'input',
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Sign in', cls: 'btn', onClick: function () {
          Auth.devLogin(WORKER, input.value || 'devtester').then(onSignedIn, function (e) {
            toast('Dev sign-in failed: ' + (e.message || 'is wrangler dev running on 8787?'), { err: true, ms: 6000 });
          });
        }
      }
    ]
  });
}

async function onSignedIn(res) {
  if (!res || !res.session) { toast('Sign-in failed', { err: true }); return; }
  store.setSession(res.session, res.user);
  renderHeaderAccount();
  track('stumble_signin');
  toast('Signed in as ' + (res.user && res.user.name ? res.user.name : 'Kick user'));
  learnOwnSlug();
  const uid = String(res.user.id);
  if (store.mergedFor() !== uid && store.hasLocalData()) {
    modal({
      title: "Keep what's on this device?",
      body: h('div', null,
        h('p', { text: 'This browser already has saved streamers, notes, tags, filters or history from before you signed in.' }),
        h('p', { text: 'Merge adds them to your account (saved and hidden are combined, notes from both are kept, tags and history are joined). Use cloud only replaces this device with what your account already has.' })),
      closeX: false,
      escape: false,
      buttons: [
        { label: 'Merge', cls: 'btn', title: 'Recommended: nothing on either side is lost', onClick: function () { doMerge(uid); } },
        { label: 'Use cloud only', cls: 'btn-ol', title: "Drop this device's copy and load your account's", onClick: function () { useCloud(uid); } }
      ]
    });
  } else {
    useCloud(uid);
  }
}

function doMerge(uid) {
  store.merge().then(function () {
    store.setMergedFor(uid);
    afterStateReplaced();
    toast('Merged. Everything now syncs to your account.');
  }, function (e) {
    toast('Merge failed: ' + ((e && e.data && e.data.error) || 'sync server unreachable') + '. Your local data is untouched.', { err: true, ms: 7000 });
  });
}

function useCloud(uid) {
  store.fetchState().then(function (s) {
    if (!s.prefs) { // empty account: seed it with this device's settings
      store.setMergedFor(uid);
      store.savePrefs();
      afterStateReplaced();
      return;
    }
    store.applyState(s);
    store.setMergedFor(uid);
    afterStateReplaced();
  }, function () {
    toast('Could not load your account. Working from this device for now.', { err: true });
  });
}

function afterStateReplaced() {
  applyTheme();
  applyPanels();
  renderCard();
  renderTab(S.tab);
  onFiltersChanged(true);
}

function learnOwnSlug() {
  const u = store.user;
  if (!u) return;
  if (u.slug) { S.ownSlug = u.slug; renderChat(); return; }
  const guess = String(u.name || '').toLowerCase();
  if (!guess) return;
  K.fetchChannel(guess).then(function (c) {
    if (c.status !== 'ok') return;
    S.ownSlug = c.slug;
    const nu = Object.assign({}, store.user, { slug: c.slug });
    store.setUser(nu);
    renderChat();
  });
}

function signOut() {
  const n = store.pendingCount();
  const go = function () {
    store.logout().then(function () {
      S.ownSlug = '';
      renderHeaderAccount();
      renderMore();
      renderChat();
      toast('Signed out. Your data stays on this device.');
    });
  };
  if (!n) { go(); return; }
  modal({
    title: 'Some changes have not synced',
    body: plural(n, 'change') + ' on this device have not reached your account yet. Signing out now keeps them on this device only.',
    escape: false,
    buttons: [
      { label: 'Cancel' },
      { label: 'Retry sync', onClick: function () { store.retry().then(function () { if (!store.pendingCount()) toast('All changes synced'); }); } },
      { label: 'Sign out anyway', cls: 'btn-ol danger', onClick: go }
    ]
  });
}

function authLost() {
  store.dropSession();
  S.ownSlug = '';
  renderHeaderAccount();
  if (S.tab === 'more') renderMore();
  toast('Your sign-in expired. Sign in again to keep syncing.', { err: true, ms: 6000 });
}

/* ---------- panels prefs ---------- */

function applyPanels() {
  $('legend').hidden = !store.prefs.panels.legend;
}

/* ---------- keyboard ---------- */

function showKeys() {
  const rows = [
    ['Space', 'Roll a new stream'], ['S', 'Save / unsave'], ['B', 'Hide this streamer'],
    ['N', 'Note and tags'], ['O', 'Open on Kick'], ['T', 'Pause / resume the timer'],
    ['[ / ]', '30 s less / more'], ['L', 'Lock the timer on this stream'], ['M', 'Mute / unmute'],
    ['C', 'Chat tab'], ['F', 'Filters tab'], ['?', 'This list']
  ];
  const g = h('div', { class: 'keys' });
  rows.forEach(function (r) { g.appendChild(h('kbd', { text: r[0] })); g.appendChild(h('span', { text: r[1] })); });
  modal({ title: 'Keyboard', body: h('div', null, g, h('p', { class: 'muted', style: 'margin-top:12px', text: "Keys do nothing while you type in a box, or while the chat or player has focus (we cannot see inside Kick's frames)." })), escape: true, buttons: [{ label: 'Close', cls: 'btn' }] });
}

function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (S.modalOpen) return;
  const t = e.target;
  if (isTypingTarget(t)) return;
  if (e.key === 'Escape') { if (isSheet() && S.sheetOpen) closeSheet(); $('colMenu').hidden = true; return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const map = {
    ' ': pressRoll,
    s: toggleSave,
    b: hideCurrent,
    n: function () { if (S.current) openTab('notes', { focusNote: true }); },
    o: openOnKick,
    t: function () { timer.togglePause(); },
    '[': function () { timer.add(-30); },
    ']': function () { timer.add(30); },
    l: toggleLock,
    m: toggleMute,
    c: function () { openTab('chat', { focusTab: true }); },
    f: function () { openTab('filters', { focusTab: true }); },
    '?': showKeys
  };
  const fn = map[k];
  if (!fn) return;
  e.preventDefault();
  fn();
}

/* ---------- consent banner (greenline logic) ---------- */

function initConsent() {
  const banner = $('consentBanner');
  function show() { banner.hidden = false; }
  function record(state) {
    try { if (window.gtag) window.gtag('consent', 'update', { analytics_storage: state === 'granted' ? 'granted' : 'denied' }); } catch (e) { /* ignore */ }
    try { localStorage.setItem('greenline-consent', state); } catch (e) { /* ignore */ }
    banner.hidden = true;
  }
  $('consentAccept').addEventListener('click', function () { record('granted'); });
  $('consentReject').addEventListener('click', function () { record('denied'); });
  $('cookieReset').addEventListener('click', function () {
    if (window.__gaOptedOut) { toast('Analytics is switched off on this device (?ga=off), so there is nothing to choose.'); return; }
    try { localStorage.removeItem('greenline-consent'); } catch (e) { /* ignore */ }
    try { if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch (e) { /* ignore */ }
    show();
  });
  if (window.__needsConsent) show();
}

/* ---------- deep links ---------- */

async function openDeepLink() {
  const slug = K.parseSlug(location.hash);
  if (!slug) return false;
  if (S.current && S.current.slug === slug) return true;
  S.deepLinked = true;
  $('emptyScan').textContent = 'Loading ' + slug + '...';
  const c = await K.fetchChannel(slug);
  if (c.status === 'ok') {
    const s = K.streamFromChannel(c);
    S.deepStreamId = s.id;
    verifiedSet(c.slug, c.verified);
    showStream(s, { source: 'deeplink' });
    if (!c.live) toast(c.name + ' is offline right now. Roll when you are ready.', { ms: 5000 });
    return true;
  }
  S.deepLinked = false;
  toast(c.status === 'missing' ? 'There is no Kick channel called ' + slug : 'Could not load ' + slug + ' from Kick', { err: true });
  onPoolChanged();
  return false;
}

/* ---------- wiring ---------- */

function bind() {
  $('rollBtn').addEventListener('click', pressRoll);
  $('saveBtn').addEventListener('click', toggleSave);
  $('hideBtn').addEventListener('click', hideCurrent);
  $('noteBtn').addEventListener('click', function () { openTab('notes', { focusNote: true }); });
  $('openBtn').addEventListener('click', openOnKick);
  $('shareBtn').addEventListener('click', share);
  $('muteBtn').addEventListener('click', toggleMute);
  $('lowerRepeatBtn').addEventListener('click', function () { openTab('filters', { focusEl: 'fRepeat' }); });
  $('emptyClearBtn').addEventListener('click', confirmClearHistory);

  // timer strip
  $('tPause').addEventListener('click', function () { timer.togglePause(); });
  $('tMinus').addEventListener('click', function () { timer.add(-30); });
  $('tPlus').addEventListener('click', function () { timer.add(30); });
  $('tLock').addEventListener('click', toggleLock);
  $('tSetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const v = Number($('tSet').value);
    if (!S.current || !isFinite(v) || v <= 0) return;
    timer.setRemaining(Math.min(3600, v));
    $('tSet').value = '';
    $('tSet').blur();
  });
  $('tMakeDefault').addEventListener('click', function () {
    const sec = Math.max(10, Math.min(3600, timer.currentLengthSec()));
    setTimerDefault(sec);
    toast('Every roll now gets ' + formatClock(sec * 1000));
  });

  // auto-pause sources
  const actions = $('actions');
  actions.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && store.prefs.timer.pauseHover) timer.setReason('hover', true); });
  actions.addEventListener('pointerleave', function () { timer.setReason('hover', false); });
  document.addEventListener('focusin', checkTyping);
  document.addEventListener('focusout', function () { setTimeout(checkTyping, 0); });
  window.addEventListener('blur', function () { setTimeout(checkTyping, 0); });
  window.addEventListener('focus', checkTyping);
  document.addEventListener('visibilitychange', function () {
    timer.setReason('hidden', !!(store.prefs.timer.pauseHidden && document.hidden));
  });

  // tabs
  $('tabs').addEventListener('click', function (e) {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    if (isSheet() && S.sheetOpen && S.tab === b.dataset.tab) { closeSheet(); return; }
    openTab(b.dataset.tab);
  });
  $('tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const i = TABS.indexOf(S.tab);
    let n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : TABS.length - 1;
    n = (n + TABS.length) % TABS.length;
    e.preventDefault();
    openTab(TABS[n], { focusTab: true });
  });
  $('sheetClose').addEventListener('click', closeSheet);
  $('acctBtn').addEventListener('click', function () { openTab('more'); });
  $('signInBtn').addEventListener('click', signIn);
  $('syncDot').addEventListener('click', function () { store.retry(); });

  // chat
  $('chatCaretStreamer').addEventListener('click', function () { toggleChatSection('streamer'); });
  $('chatCaretMine').addEventListener('click', function () { toggleChatSection('mine'); });

  // notes
  $('noteText').addEventListener('input', onNoteInput);
  $('noteText').addEventListener('blur', flushNote);
  $('tagInput').addEventListener('keydown', onTagKey);
  $('tagInput').addEventListener('input', function () {
    // A comma that arrives as text (paste, IME, autocomplete) instead of a
    // keydown still splits: everything before the last comma becomes tags.
    const input = $('tagInput');
    if (input.value.indexOf(',') !== -1) {
      const parts = input.value.split(',');
      input.value = parts.pop();
      parts.forEach(addTag);
    }
    suggestIdx = -1; renderSuggest();
  });
  $('tagInput').addEventListener('focus', renderSuggest);
  $('tagInput').addEventListener('blur', function () { setTimeout(function () { $('tagSuggest').hidden = true; }, 100); });
  $('tagBox').addEventListener('click', function (e) { if (e.target === $('tagBox')) $('tagInput').focus(); });

  // filters
  let ft = 0;
  ['fMin', 'fMax', 'fLive', 'fRepeat', 'fHas', 'fNot'].forEach(function (id) {
    $(id).addEventListener('input', function () { clearTimeout(ft); ft = setTimeout(readFilterInputs, 250); });
    $(id).addEventListener('change', readFilterInputs);
  });
  $('fMature').addEventListener('change', function (e) { store.prefs.filters.mature = e.target.checked; store.savePrefs(); onFiltersChanged(false); });
  $('fVerified').addEventListener('change', function (e) { store.prefs.filters.verifiedOnly = e.target.checked; store.savePrefs(); onFiltersChanged(false); });
  $('fTier').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    store.prefs.filters.tier = b.dataset.v; store.savePrefs(); setSeg('fTier', b.dataset.v); onFiltersChanged(false);
  });
  $('fBias').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    store.prefs.filters.bias = b.dataset.v; store.savePrefs(); setSeg('fBias', b.dataset.v);
  });
  $('fTimer').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    setTimerDefault(Number(b.dataset.v));
  });
  $('fTimerCustom').addEventListener('change', function (e) {
    const v = Number(e.target.value);
    if (!isFinite(v) || e.target.value === '') return;
    const sec = Math.max(10, Math.min(3600, Math.round(v)));
    e.target.value = sec;
    setTimerDefault(sec);
  });
  [['fTick', 'tick'], ['fPauseTyping', 'pauseTyping'], ['fPauseHidden', 'pauseHidden'], ['fPauseHover', 'pauseHover'], ['fPauseMute', 'pauseMute']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (e) { store.prefs.timer[p[1]] = e.target.checked; store.savePrefs(); syncAutoPausePrefs(); });
  });
  $('fLangSearch').addEventListener('input', function (e) { S.langTerm = e.target.value; renderLangChips(); });
  let ct = 0;
  $('fCatSearch').addEventListener('focus', function () {
    if (!S.topCats) K.loadTopCategories().then(function (l) { S.topCats = l; if (S.catTerm) renderCatChips(); });
  });
  $('fCatSearch').addEventListener('input', function (e) {
    clearTimeout(ct);
    ct = setTimeout(function () { S.catTerm = e.target.value.trim(); renderCatChips(); }, 300);
  });
  $('fReset').addEventListener('click', resetFilters);

  // saved
  $('colBtn').addEventListener('click', function () {
    const m = $('colMenu');
    m.hidden = !m.hidden;
    $('colBtn').setAttribute('aria-expanded', m.hidden ? 'false' : 'true');
    if (!m.hidden) renderColMenu();
  });
  document.addEventListener('click', function (e) {
    const m = $('colMenu');
    if (!m.hidden && !e.target.closest('.col-mgr-wrap')) { m.hidden = true; $('colBtn').setAttribute('aria-expanded', 'false'); }
  });
  $('colReset').addEventListener('click', function () {
    store.prefs.saved = defaultPrefs().saved;
    store.savePrefs();
    renderSaved();
  });
  $('savedRefresh').addEventListener('click', function () { refreshSavedLive(true); });

  // history + more
  $('histClear').addEventListener('click', confirmClearHistory);
  $('themes').addEventListener('click', function (e) {
    const b = e.target.closest('[data-theme-pick]'); if (!b) return;
    store.prefs.theme = b.dataset.themePick; store.savePrefs(); applyTheme();
  });
  $('pMyChat').addEventListener('change', function (e) { store.prefs.panels.myChat = e.target.checked; store.savePrefs(); renderChat(); });
  $('pLegend').addEventListener('change', function (e) { store.prefs.panels.legend = e.target.checked; store.savePrefs(); applyPanels(); });

  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', openDeepLink);
  window.addEventListener('beforeunload', flushNote);

  let rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      sizeRing();
      if (!isSheet()) { $('rail').classList.remove('open'); S.sheetOpen = false; renderTab(S.tab); }
    }, 100);
  });
  if (window.ResizeObserver) new ResizeObserver(sizeRing).observe($('rollWrap'));
}

async function init() {
  $('verLabel').textContent = 'v' + VERSION;
  $('aboutVer').textContent = 'v' + VERSION;
  applyTheme();
  applyPanels();
  bind();
  initConsent();
  sizeRing();
  renderCard();
  renderTimer(timer.state());
  renderHeaderAccount();
  renderSync(store.status);

  const ui = lsGet(KEYS.ui, {}) || {};
  openTab(ui.tab && TABS.indexOf(ui.tab) !== -1 ? ui.tab : 'chat', { noSheet: true });

  // the tick also re-checks focus: typing into Kick's chat iframe fires no
  // event in our document, and focus events can be skipped for a window
  // that is not focused
  setInterval(function () { checkTyping(); timer.tick(); }, 200);
  setInterval(function () { if (S.current) renderCard(); }, 30000); // uptime text
  setInterval(function () {
    if (!S.scanning && S.lastScanAt && Date.now() - S.lastScanAt > RESCAN_MS) startScan();
  }, 30000);

  // OAuth return?
  const ret = Auth.takeRedirect();
  if (ret && ret.error) toast(ret.error, { err: true, ms: 6000 });
  else if (ret && ret.code) {
    Auth.exchange(WORKER, ret.code, ret.verifier).then(onSignedIn, function (e) {
      toast(e.message || 'Sign-in failed', { err: true, ms: 6000 });
    });
  } else if (store.signedIn()) {
    learnOwnSlug();
    store.pullCloud().then(afterStateReplaced, function () { /* keep local cache; dot shows failure */ });
  }

  if (location.hash.length > 1) await openDeepLink();
  startScan();
}

init();
