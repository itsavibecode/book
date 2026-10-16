/* Stumble - state, localStorage, Worker sync and the merge rules.
   Signed out: everything lives under stumble.* keys in localStorage.
   Signed in: localStorage stays as the instant cache, every change is
   written through to the Worker (debounced 800 ms per endpoint), and the
   queue of unsent changes is itself persisted so a closed tab or a dropped
   connection does not lose an edit. */
'use strict';

import { DEFAULT_FILTERS } from './kick.js';

export const KEYS = {
  prefs: 'stumble.prefs',
  streamers: 'stumble.streamers',
  history: 'stumble.history',
  session: 'stumble.session',
  user: 'stumble.user',
  pending: 'stumble.pending',
  mergedFor: 'stumble.mergedFor',
  verified: 'stumble.verified',
  ui: 'stumble.ui'
};

export const HISTORY_CAP = 500;
export const NOTE_MAX_BYTES = 64 * 1024;
export const TAGS_MAX = 50;
export const STREAMERS_MAX = 5000;
export const SYNC_DEBOUNCE_MS = 800;
export const NOTE_DIVIDER = '\n\n---\n\n';

export const SAVED_COLUMNS = ['name', 'tags', 'live', 'lastSeen', 'seen', 'savedAt', 'note'];

export function defaultPrefs() {
  return {
    v: 1,
    filters: JSON.parse(JSON.stringify(DEFAULT_FILTERS)),
    timer: { defaultSec: 60, tick: false, pauseTyping: true, pauseHidden: true, pauseHover: true, pauseMute: true },
    theme: 'ink',
    panels: { myChat: true, legend: true, chatCollapsed: { streamer: false, mine: false } },
    saved: { order: SAVED_COLUMNS.slice(), hidden: [], widths: {}, sort: { key: '', dir: '' } }
  };
}

/* Fill gaps from defaults (older or partial prefs, cloud prefs from a
   future version) without dropping unknown keys. */
export function normalizePrefs(p) {
  const d = defaultPrefs();
  p = p && typeof p === 'object' ? p : {};
  const out = Object.assign({}, d, p);
  out.filters = Object.assign({}, d.filters, p.filters || {});
  out.timer = Object.assign({}, d.timer, p.timer || {});
  out.panels = Object.assign({}, d.panels, p.panels || {});
  out.panels.chatCollapsed = Object.assign({}, d.panels.chatCollapsed, (p.panels && p.panels.chatCollapsed) || {});
  out.saved = Object.assign({}, d.saved, p.saved || {});
  const order = Array.isArray(out.saved.order) ? out.saved.order.filter(function (k) { return SAVED_COLUMNS.indexOf(k) !== -1; }) : [];
  SAVED_COLUMNS.forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
  out.saved.order = order;
  if (!Array.isArray(out.saved.hidden)) out.saved.hidden = [];
  if (!out.saved.widths || typeof out.saved.widths !== 'object') out.saved.widths = {};
  if (!out.saved.sort || typeof out.saved.sort !== 'object') out.saved.sort = { key: '', dir: '' };
  if (['ink', 'kick', 'ember'].indexOf(out.theme) === -1) out.theme = 'ink';
  return out;
}

export function emptyRecord(slug) {
  return {
    slug: slug, userId: null, name: slug, avatar: '', note: '', tags: [],
    saved: false, blocked: false, savedAt: 0, blockedAt: 0,
    firstSeen: 0, lastSeen: 0, seenCount: 0,
    lastViewers: 0, lastCategory: '', lastTitle: '', updatedAt: 0
  };
}

/* Does the record hold anything worth keeping? */
export function recordHasData(r) {
  return !!(r && (r.saved || r.blocked || (r.note && r.note.trim()) || (r.tags && r.tags.length) || r.seenCount));
}

export function byteLength(s) {
  try { return new TextEncoder().encode(String(s || '')).length; } catch (e) { return String(s || '').length * 3; }
}

/* ---------- merge rules (PLAN 3.12) ----------
   saved / blocked: OR. Notes: concatenated with a divider when both sides
   have different text. Tags: union (capped). Seen stats: earliest first,
   latest last, larger count. History: union by id, newest first, capped.
   Prefs: the cloud's when it has any, else this device's.
   The Worker applies the same rules on POST /merge; this copy is used by
   the self-test and documents the behaviour next to the client code. */
export function mergeRecord(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = Object.assign({}, a, b);
  out.saved = !!(a.saved || b.saved);
  out.blocked = !!(a.blocked || b.blocked);
  out.savedAt = out.saved ? (minPos(a.savedAt, b.savedAt) || Date.now()) : 0;
  out.blockedAt = out.blocked ? (minPos(a.blockedAt, b.blockedAt) || Date.now()) : 0;
  const na = String(a.note || '').trim();
  const nb = String(b.note || '').trim();
  out.note = na && nb && na !== nb ? nb + NOTE_DIVIDER + na : (nb || na);
  const tags = [];
  (b.tags || []).concat(a.tags || []).forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
  out.tags = tags.slice(0, TAGS_MAX);
  out.firstSeen = minPos(a.firstSeen, b.firstSeen);
  out.lastSeen = Math.max(a.lastSeen || 0, b.lastSeen || 0);
  out.seenCount = Math.max(a.seenCount || 0, b.seenCount || 0);
  const newer = (a.lastSeen || 0) > (b.lastSeen || 0) ? a : b;
  out.lastViewers = newer.lastViewers || 0;
  out.lastCategory = newer.lastCategory || '';
  out.lastTitle = newer.lastTitle || '';
  out.name = newer.name || out.name;
  out.avatar = newer.avatar || a.avatar || b.avatar || '';
  out.userId = a.userId || b.userId || null;
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

function minPos(x, y) {
  x = x || 0; y = y || 0;
  if (!x) return y;
  if (!y) return x;
  return Math.min(x, y);
}

export function mergeHistory(a, b) {
  const seen = {};
  const out = [];
  (a || []).concat(b || []).forEach(function (h) {
    if (!h || !h.id || seen[h.id]) return;
    seen[h.id] = 1;
    out.push(h);
  });
  out.sort(function (x, y) { return y.t - x.t; });
  return out.slice(0, HISTORY_CAP);
}

export function mergeStates(local, cloud) {
  local = local || {};
  cloud = cloud || {};
  const streamers = {};
  const ls = local.streamers || {};
  const cs = cloud.streamers || {};
  Object.keys(cs).forEach(function (k) { streamers[k] = cs[k]; });
  Object.keys(ls).forEach(function (k) { streamers[k] = mergeRecord(ls[k], cs[k]); });
  return {
    prefs: cloud.prefs ? cloud.prefs : (local.prefs || null),
    streamers: streamers,
    history: mergeHistory(local.history, cloud.history)
  };
}

/* ---------- localStorage helpers (never throw) ---------- */

export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) { return fallback; }
}
export function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
export function lsDel(key) {
  try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
}

/* Verified answers per slug, 24 h, device-local (PLAN 9.1). */
const VERIFIED_TTL = 24 * 3600 * 1000;
export function verifiedGet(slug) {
  const m = lsGet(KEYS.verified, {});
  const e = m && m[slug];
  if (!e || Date.now() - e.t > VERIFIED_TTL) return null;
  return !!e.v;
}
export function verifiedSet(slug, v) {
  const m = lsGet(KEYS.verified, {}) || {};
  const now = Date.now();
  m[slug] = { v: !!v, t: now };
  // keep the cache small: drop expired entries
  Object.keys(m).forEach(function (k) { if (now - m[k].t > VERIFIED_TTL) delete m[k]; });
  lsSet(KEYS.verified, m);
}

/* ---------- the store ---------- */

export function createStore(opts) {
  const base = opts.workerBase;
  const onStatus = opts.onStatus || function () {};
  const onAuthLost = opts.onAuthLost || function () {};
  const onLimit = opts.onLimit || function () {};

  const st = {
    prefs: normalizePrefs(lsGet(KEYS.prefs, null)),
    streamers: lsGet(KEYS.streamers, {}) || {},
    history: lsGet(KEYS.history, []) || [],
    session: lsGet(KEYS.session, '') || '',
    user: lsGet(KEYS.user, null),
    pending: lsGet(KEYS.pending, null) || emptyPending()
  };
  if (!Array.isArray(st.history)) st.history = [];

  let timers = {};
  let flushing = false;
  let again = false;
  let status = { state: 'idle', at: 0, msg: '' };

  function emptyPending() { return { prefs: false, slugs: {}, history: [], clearHistory: false }; }
  function persistPending() { lsSet(KEYS.pending, st.pending); }
  function setStatus(state, msg) {
    status = { state: state, at: Date.now(), msg: msg || '' };
    onStatus(status);
  }

  function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (st.session) headers.Authorization = 'Bearer ' + st.session;
    return fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && st.session) { onAuthLost(); throw { status: 401, data: data }; }
        if (!res.ok) throw { status: res.status, data: data };
        return data;
      });
    });
  }

  function signedIn() { return !!st.session; }

  function schedule(kind) {
    if (!signedIn()) return;
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(flush, SYNC_DEBOUNCE_MS);
    setStatus('saving');
  }

  function pendingCount() {
    const p = st.pending;
    return (p.prefs ? 1 : 0) + Object.keys(p.slugs).length + p.history.length + (p.clearHistory ? 1 : 0);
  }

  async function flush() {
    if (!signedIn()) return;
    if (flushing) { again = true; return; }
    flushing = true;
    const p = st.pending;
    try {
      if (pendingCount()) setStatus('saving');
      if (p.clearHistory) {
        await api('DELETE', '/history');
        p.clearHistory = false; persistPending();
      }
      if (p.prefs) {
        p.prefs = false; persistPending();
        try { await api('PUT', '/prefs', st.prefs); }
        catch (e) { if (e.status !== 413) { p.prefs = true; persistPending(); } throw e; }
      }
      const slugs = Object.keys(p.slugs);
      for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i];
        const rec = st.streamers[slug];
        delete p.slugs[slug]; persistPending();
        try {
          if (rec) await api('PUT', '/streamers/' + encodeURIComponent(slug), rec);
          else await api('DELETE', '/streamers/' + encodeURIComponent(slug));
        } catch (e) {
          if (e.status !== 413) { p.slugs[slug] = 1; persistPending(); }
          throw e;
        }
      }
      if (p.history.length) {
        const batch = p.history.slice();
        p.history = []; persistPending();
        try { await api('POST', '/history', { entries: batch }); }
        catch (e) { p.history = batch.concat(p.history); persistPending(); throw e; }
      }
      setStatus('saved');
    } catch (e) {
      if (e && e.status === 413) {
        onLimit((e.data && e.data.error) || 'Too big to sync.');
        setStatus('failed', (e.data && e.data.error) || 'Over the size limit');
      } else if (e && e.status === 401) {
        setStatus('idle');
      } else {
        setStatus('failed', 'Could not reach the sync server');
      }
    } finally {
      flushing = false;
      if (again) { again = false; flush(); }
    }
  }

  const store = {
    get prefs() { return st.prefs; },
    get streamers() { return st.streamers; },
    get history() { return st.history; },
    get session() { return st.session; },
    get user() { return st.user; },
    get status() { return status; },
    signedIn: signedIn,
    pendingCount: pendingCount,

    savePrefs: function () {
      lsSet(KEYS.prefs, st.prefs);
      if (signedIn()) { st.pending.prefs = true; persistPending(); schedule('prefs'); }
    },
    setPrefs: function (p) { st.prefs = normalizePrefs(p); store.savePrefs(); },

    record: function (slug) { return st.streamers[slug] || null; },
    /* Get-or-create, then caller mutates and calls putStreamer. */
    ensure: function (slug) {
      if (!st.streamers[slug]) st.streamers[slug] = emptyRecord(slug);
      return st.streamers[slug];
    },
    putStreamer: function (slug) {
      const r = st.streamers[slug];
      if (r) r.updatedAt = Date.now();
      lsSet(KEYS.streamers, st.streamers);
      if (signedIn()) { st.pending.slugs[slug] = 1; persistPending(); schedule('streamers'); }
    },
    tagSet: function () {
      const m = {};
      Object.keys(st.streamers).forEach(function (k) {
        (st.streamers[k].tags || []).forEach(function (t) { m[t] = (m[t] || 0) + 1; });
      });
      return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || a.localeCompare(b); });
    },

    addHistory: function (entry) {
      st.history.unshift(entry);
      if (st.history.length > HISTORY_CAP) st.history.length = HISTORY_CAP;
      lsSet(KEYS.history, st.history);
      if (signedIn()) { st.pending.history.push(entry); persistPending(); schedule('history'); }
    },
    clearHistory: function () {
      st.history = [];
      lsSet(KEYS.history, st.history);
      if (signedIn()) {
        st.pending.history = [];
        st.pending.clearHistory = true;
        persistPending();
        schedule('history');
      }
    },

    hasLocalData: function () {
      const anyRec = Object.keys(st.streamers).some(function (k) { return recordHasData(st.streamers[k]); });
      const prefsChanged = JSON.stringify(st.prefs) !== JSON.stringify(normalizePrefs(null));
      return anyRec || st.history.length > 0 || prefsChanged;
    },
    localState: function () {
      return { prefs: st.prefs, streamers: st.streamers, history: st.history };
    },
    /* Replace local with a cloud (or merged) state. */
    applyState: function (s) {
      st.prefs = normalizePrefs(s && s.prefs);
      st.streamers = (s && s.streamers) || {};
      st.history = (s && Array.isArray(s.history)) ? s.history.slice(0, HISTORY_CAP) : [];
      lsSet(KEYS.prefs, st.prefs);
      lsSet(KEYS.streamers, st.streamers);
      lsSet(KEYS.history, st.history);
    },

    /* ----- auth + sync ----- */
    setSession: function (session, user) {
      st.session = session || '';
      st.user = user || null;
      if (session) { lsSet(KEYS.session, session); lsSet(KEYS.user, user); }
      else { lsDel(KEYS.session); lsDel(KEYS.user); }
    },
    setUser: function (user) { st.user = user; lsSet(KEYS.user, user); },
    mergedFor: function () { return lsGet(KEYS.mergedFor, ''); },
    setMergedFor: function (uid) { lsSet(KEYS.mergedFor, String(uid)); },

    fetchState: function () { return api('GET', '/state'); },
    /* Push this device's state and take back the union. */
    merge: function () {
      setStatus('saving');
      return api('POST', '/merge', store.localState()).then(function (merged) {
        store.applyState(merged);
        st.pending = emptyPending(); persistPending();
        setStatus('saved');
        return merged;
      }, function (e) { setStatus('failed', 'Merge failed'); throw e; });
    },
    /* Start-up for a returning signed-in device: send what is queued, then
       take the cloud's copy (it is the source of truth once merged). */
    pullCloud: function () {
      return flush().then(function () {
        if (pendingCount()) throw { status: 0, data: { error: 'unsynced changes' } };
        return api('GET', '/state');
      }).then(function (s) {
        if (!s.prefs) { st.pending.prefs = true; persistPending(); schedule('prefs'); s.prefs = st.prefs; }
        store.applyState(s);
        setStatus('saved');
        return s;
      });
    },
    flush: flush,
    retry: function () { return flush(); },
    logout: function () {
      const p = st.session ? api('POST', '/auth/logout').catch(function () {}) : Promise.resolve();
      return p.then(function () {
        Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
        st.pending = emptyPending(); persistPending();
        store.setSession('', null);
        setStatus('idle');
      });
    },
    dropSession: function () {
      store.setSession('', null);
      setStatus('idle');
    },
    api: api
  };
  return store;
}
