#!/usr/bin/env node
/* Stumble self-test. Exercises the pure parts of kick.js, timer.js and
   store.js under Node 18+, against live Kick data where it matters.

     node tools/selftest.mjs            (from book/stumble)

   Needs network (kick.com). If `wrangler dev` is running in stumble-worker
   with DEV_FAKE_LOGIN=1, it also round-trips store.js sync through it. */
'use strict';

import * as K from '../kick.js';
import { createTimer, ringDash, ringPath, formatClock } from '../timer.js';
import { mergeStates, mergeRecord, normalizePrefs, createStore, NOTE_DIVIDER } from '../store.js';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}
function section(s) { console.log('\n' + s); }

// Kick's edge wants a browser-ish UA; a browser sends one anyway.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => realFetch(url, {
  ...opts,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36', Accept: 'application/json', ...(opts.headers || {}) }
});

// ---------------------------------------------------------------- parseSlug
section('parseSlug');
const slugCases = [
  ['xqc', 'xqc'], ['  XQC ', 'xqc'], ['@Some_Name', 'some_name'], ['#trainwreckstv', 'trainwreckstv'],
  ['https://kick.com/adinross', 'adinross'], ['kick.com/adinross/videos', 'adinross'],
  ['https://www.kick.com/a-b_c?x=1', 'a-b_c'], ['player.kick.com/foo?autoplay=true', 'foo'],
  ['https://kick.com/popout/bar/chat', 'bar'], ['', null], ['not a slug!', null], ['x'.repeat(41), null]
];
slugCases.forEach(([inp, want]) => ok(K.parseSlug(inp) === want, JSON.stringify(inp) + ' -> ' + JSON.stringify(want)));
ok(K.playerUrl('abc', false) === 'https://player.kick.com/abc?autoplay=true&muted=false', 'playerUrl');
ok(K.chatUrl('abc') === 'https://kick.com/popout/abc/chat', 'chatUrl');
ok(K.shareUrl('abc') === 'https://bookhockeys.com/stumble/#abc', 'shareUrl');
ok(K.parseKickTime('2026-10-16 15:42:31') === Date.UTC(2026, 9, 16, 15, 42, 31), 'parseKickTime reads UTC');

// ---------------------------------------------------------------- live data
section('live list (kick.com, real)');
const res = await fetch(K.listPageUrl(1));
ok(res.ok, 'GET ' + K.listPageUrl(1) + ' -> ' + res.status);
const page1 = await res.json();
ok(Array.isArray(page1.data) && page1.data.length === K.PAGE_SIZE, 'page 1 has ' + K.PAGE_SIZE + ' items (got ' + page1.data.length + ')');
ok(typeof page1.next_page_url === 'string', 'next_page_url present');
const raw = page1.data[0];
const s0 = K.normalizeStream(raw);
ok(s0.slug === String(raw.channel.slug).toLowerCase() && s0.slug.length > 0, 'normalize: slug = channel.slug (' + s0.slug + ')');
ok(s0.name === raw.channel.user.username, 'normalize: name = username (' + s0.name + ')');
ok(/^https:\/\//.test(s0.avatar) || s0.avatar === '', 'normalize: avatar is https or empty');
ok(typeof s0.viewers === 'number' && s0.viewers === raw.viewer_count, 'normalize: viewers (' + s0.viewers + ')');
ok(s0.startedAt > Date.UTC(2020, 0, 1) && s0.startedAt <= Date.now() + 60000, 'normalize: startedAt sane (' + new Date(s0.startedAt).toISOString() + ')');
ok(typeof s0.language === 'string' && s0.language.length > 1, 'normalize: language (' + s0.language + ')');
ok(s0.category && s0.category.slug && s0.category.name, 'normalize: category (' + (s0.category && s0.category.name) + ')');
ok(typeof s0.affiliate === 'boolean' && typeof s0.mature === 'boolean', 'normalize: affiliate/mature booleans');

const r2 = await K.fetchListPage(2);
ok(r2.status === 'ok' && r2.items.length > 0, 'fetchListPage(2) ok, ' + r2.items.length + ' items');
const pool = page1.data.map(K.normalizeStream).concat(r2.items);
const sorted = pool.every((s, i) => i === 0 || i === page1.data.length || pool[i - 1].viewers >= s.viewers);
ok(sorted, 'pages are sorted by viewers, high to low');

// ---------------------------------------------------------------- matcher
section('filter matcher (against the fetched pages)');
const now = Date.now();
function check(filters, pred, label) {
  const cf = K.compileFilters(filters);
  const m = pool.filter((s) => K.matches(s, cf, undefined, now));
  const allGood = m.every(pred);
  const noneMissed = pool.filter((s) => !m.includes(s)).every((s) => !pred(s));
  ok(allGood && noneMissed, label + ' (' + m.length + '/' + pool.length + ' match)');
  return m;
}
const vs = pool.map((s) => s.viewers).sort((a, b) => a - b);
const mid = vs[Math.floor(vs.length / 2)];
check({ minViewers: mid, maxViewers: '' }, (s) => s.viewers >= mid, 'min viewers ' + mid);
check({ minViewers: 0, maxViewers: mid }, (s) => s.viewers <= mid, 'max viewers ' + mid);
const lang = K.languageCounts(pool)[0].name;
check({ minViewers: 0, maxViewers: '', languages: [lang] }, (s) => s.language === lang, 'language = ' + lang);
check({ minViewers: 0, maxViewers: '', mature: false }, (s) => !s.mature, 'no 18+');
check({ minViewers: 0, maxViewers: '', tier: 'affiliate' }, (s) => s.affiliate, 'tier affiliate');
check({ minViewers: 0, maxViewers: '', tier: 'nonaffiliate' }, (s) => !s.affiliate, 'tier non-affiliate');
const cat = K.categoryCounts(pool)[0];
check({ minViewers: 0, maxViewers: '', catInclude: [cat] }, (s) => s.categories.some((c) => c.slug === cat.slug), 'include ' + cat.name);
check({ minViewers: 0, maxViewers: '', catExclude: [cat] }, (s) => !s.categories.some((c) => c.slug === cat.slug), 'exclude ' + cat.name);
check({ minViewers: 0, maxViewers: '', minLiveMin: 60 }, (s) => !s.startedAt || now - s.startedAt >= 3600000, 'live for at least 60 min');
const word = (pool.find((s) => /[a-z]{4,}/i.test(s.title)) || { title: 'stream' }).title.match(/[a-z]{4,}/i)[0].toLowerCase();
check({ minViewers: 0, maxViewers: '', titleHas: word }, (s) => s.title.toLowerCase().includes(word), 'title contains "' + word + '"');
check({ minViewers: 0, maxViewers: '', titleNot: word }, (s) => !s.title.toLowerCase().includes(word), 'title excludes "' + word + '"');
// tags come from our own records
const tagged = pool[3];
const recs = { [tagged.slug]: { tags: ['chill'] } };
const cfAny = K.compileFilters({ minViewers: 0, maxViewers: '', tagsAny: ['chill'] });
ok(pool.filter((s) => K.matches(s, cfAny, recs[s.slug], now)).map((s) => s.slug).join() === tagged.slug, 'tags any-of: only the tagged streamer');
const cfNever = K.compileFilters({ minViewers: 0, maxViewers: '', tagsNever: ['chill'] });
ok(!pool.filter((s) => K.matches(s, cfNever, recs[s.slug], now)).includes(tagged), 'tags never: tagged streamer out');

// ---------------------------------------------------------------- picker
section('weighted picker (100,000 draws each)');
const syn = [5, 50, 500, 5000].map((v, i) => ({ slug: 's' + i, viewers: v }));
function dist(bias) {
  const c = [0, 0, 0, 0];
  for (let i = 0; i < 100000; i++) c[syn.indexOf(K.pickWeighted(syn, bias))]++;
  return c.map((x) => x / 100000);
}
function expected(bias) {
  const w = syn.map((s) => K.weight(s.viewers, bias));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / t);
}
for (const bias of ['fair', 'underdogs', 'popular']) {
  const got = dist(bias), want = expected(bias);
  const close = got.every((g, i) => Math.abs(g - want[i]) < 0.01);
  ok(close, bias + ': got ' + got.map((x) => x.toFixed(3)).join('/') + ' want ' + want.map((x) => x.toFixed(3)).join('/'));
}
const ud = dist('underdogs'), pp = dist('popular');
ok(ud[0] > ud[1] && ud[1] > ud[2] && ud[2] > ud[3], 'underdogs favours small streams');
ok(pp[3] > pp[2] && pp[2] > pp[1] && pp[1] > pp[0], 'popular favours big streams');
ok(Math.abs(K.weight(90, 'underdogs') - 0.1) < 1e-9, 'underdogs weight = 1/sqrt(viewers+10)');
ok(Math.abs(K.weight(0, 'popular') - Math.log(10)) < 1e-9, 'popular weight = log(viewers+10)');
ok(K.pickWeighted([], 'fair') === null, 'empty list -> null');

// ---------------------------------------------------------------- don't repeat
section("don't-repeat window + blocked");
const a = pool[0], b = pool[1], c = pool[2], d = pool[3];
const hist = [
  { id: '1', t: now - 30 * 60000, slug: a.slug, action: 'rolled' },
  { id: '2', t: now - 3 * 3600000, slug: b.slug, action: 'rolled' },
  { id: '3', t: now - 10 * 60000, slug: c.slug, action: 'saved' }
];
const seen1 = K.seenWithin(hist, 1, now);
ok(seen1[a.slug] && !seen1[b.slug] && !seen1[c.slug], '1 h window: rolled 30 min ago in, 3 h ago out, "saved" entries ignored');
ok(K.seenWithin(hist, 4, now)[b.slug], '4 h window catches the 3 h-old roll');
ok(Object.keys(K.seenWithin(hist, 0, now)).length === 0, '0 h window remembers nothing');
const loose = { minViewers: 0, maxViewers: '', repeatHours: 1 };
const streamers = { [d.slug]: { blocked: true } };
const cand = K.candidatesFor(pool, loose, streamers, hist, now, c.slug);
const slugs = new Set(pool.map((s) => s.slug));
ok(!cand.candidates.some((s) => s.slug === a.slug), 'recently rolled streamer is not a candidate');
ok(cand.candidates.some((s) => s.slug === b.slug), 'streamer outside the window is a candidate');
ok(!cand.candidates.some((s) => s.slug === c.slug), 'stream on screen is not a candidate');
ok(!cand.matching.some((s) => s.slug === d.slug) && !cand.candidates.some((s) => s.slug === d.slug), 'blocked streamer is neither matching nor candidate');
ok(cand.matching.length === slugs.size - 1 && cand.candidates.length === slugs.size - 3, 'counts: matching ' + cand.matching.length + ', candidates ' + cand.candidates.length);
// "seen them all" state
const allSeen = pool.map((s, i) => ({ id: 'x' + i, t: now - 1000, slug: s.slug, action: 'rolled' }));
const none = K.candidatesFor(pool, loose, {}, allSeen, now, '');
ok(none.candidates.length === 0 && none.matching.length === slugs.size, 'all seen -> 0 candidates, ' + none.matching.length + ' matching (the empty-state count)');

// ---------------------------------------------------------------- scan
section('scan (fake pages: floor stop, concurrency)');
let inflight = 0, peak = 0, asked = [];
const fakePage = (p) => {
  inflight++; peak = Math.max(peak, inflight); asked.push(p);
  return new Promise((resolve) => setTimeout(() => {
    inflight--;
    const top = 1000 - (p - 1) * 100; // page p: viewers top .. top-31
    // like Kick: 50 pages, then empty pages with no next link
    const items = p > 50 ? [] : Array.from({ length: 32 }, (_, i) => ({ id: p * 100 + i, slug: 'p' + p + 'i' + i, viewers: top - i }));
    resolve({ status: 'ok', items, next: p < 50 ? 'next' : null });
  }, 5));
};
const got = [];
const sres = await K.scan({ floor: 650, fetchPage: fakePage, onItems: (it) => got.push(...it) });
ok(sres.cutByFloor && !sres.complete, 'floor 650 cuts the scan short');
ok(peak === K.SCAN_CONCURRENCY, 'at most ' + K.SCAN_CONCURRENCY + ' requests in flight (peak ' + peak + ')');
ok(Math.max(...asked) <= 4 + K.SCAN_CONCURRENCY, 'stopped near the floor page (asked pages ' + asked.join(',') + ')');
ok(got.some((s) => s.viewers < 650) && got.some((s) => s.viewers >= 650), 'items around the floor were delivered');
asked = []; peak = 0;
const full = await K.scan({ floor: 0, fetchPage: fakePage, onItems: () => {} });
ok(full.complete && full.fetched === 50 * 32 && Math.max(...asked) <= 50 + K.SCAN_CONCURRENCY - 1, 'floor 0 runs to next_page_url = null (' + full.fetched + ' streams; pages past the end already in flight: ' + (Math.max(...asked) - 50) + ')');
let firstErr = false;
try { await K.scan({ fetchPage: () => Promise.reject(new Error('cors')), onItems: () => {} }); } catch (e) { firstErr = !!(e && e.network); }
ok(firstErr, 'page 1 network failure rejects with {network:true} (the Worker fallback cue)');
ok(K.scanFraction(10000, 10000, 10) === 0 && K.scanFraction(10000, 10, 10) === 1 && K.scanFraction(10000, 300, 10) > 0.4, 'scanFraction log estimate');

section('scan (real kick.com, floor 3000)');
const realItems = [];
const t0 = Date.now();
const real = await K.scan({ floor: 3000, onItems: (it) => realItems.push(...it) });
ok(real.pages >= 1 && realItems.length > 0, 'real scan read ' + real.pages + ' pages, ' + realItems.length + ' streams in ' + (Date.now() - t0) + ' ms');
ok(real.cutByFloor, 'real scan stopped at the floor');
ok(real.gaveUp === 0, 'no pages given up (no 429/5xx)');

// ---------------------------------------------------------------- timer
section('timer');
let clock = 0, expired = 0;
const tm = createTimer({ now: () => clock, onExpire: () => expired++ });
tm.start(60);
clock += 10000;
ok(Math.round(tm.state().remainingMs / 1000) === 50, '60 s, 10 s later: 50 s left');
tm.togglePause(); clock += 20000;
ok(Math.round(tm.state().remainingMs / 1000) === 50 && !tm.state().running, 'manual pause holds the time');
tm.togglePause(); tm.add(30);
ok(Math.round(tm.state().remainingMs / 1000) === 80 && tm.state().lengthMs === 90000, '+30 s -> 80 left of 90');
ok(tm.state().differsFromDefault && tm.currentLengthSec() === 90, '"Make this the default" offered with 90 s');
tm.add(-30); tm.add(-30); tm.add(-30);
ok(tm.state().remainingMs === 5000, '-30 s never goes below 5 s');
tm.setReason('typing', true); clock += 3000;
ok(tm.state().remainingMs === 5000 && tm.state().autoReason === 'typing', 'auto-pause while typing, with reason');
tm.setReason('typing', false);
tm.toggleLock(); clock += 60000; tm.tick();
ok(expired === 0 && tm.state().locked && tm.state().fraction === 1, 'locked: no expiry, ring full');
tm.toggleLock(); clock += 4000; tm.tick();
ok(expired === 0 && tm.state().warning, 'last 5 s -> warning');
clock += 2000; tm.tick(); tm.tick();
ok(expired === 1 && !tm.state().active, 'expires exactly once');
tm.start(0);
ok(!tm.state().active, 'default 0 = timer off');
tm.setRemaining(42);
ok(tm.state().active && tm.state().remainingMs === 42000, '"Set for this one" starts a 42 s countdown');
ok(formatClock(61000) === '1:01' && formatClock(4100) === '0:05', 'formatClock');
ok(ringDash({ locked: true }).array === '100 0', 'ring locked = solid');
ok(ringDash({ active: true, running: true, fraction: 0.25 }).array === '25.00 100' && ringDash({ active: true, running: true, fraction: 0.25 }).offset === -75, 'ring drains clockwise (25% left)');
ok(ringDash({ active: true, running: false, fraction: 0.5 }).array.split(' ').length > 4, 'ring paused = dashed');
ok(/^M52 3 H/.test(ringPath(104, 104, 3)), 'ring path starts at top centre');

// ---------------------------------------------------------------- merge rules
section('store merge rules');
const mr = mergeRecord(
  { note: 'local note', tags: ['a', 'b'], saved: true, savedAt: 50, seenCount: 2, lastSeen: 10, firstSeen: 5 },
  { note: 'cloud note', tags: ['b', 'c'], blocked: true, blockedAt: 7, seenCount: 4, lastSeen: 8, firstSeen: 3 }
);
ok(mr.saved && mr.blocked, 'saved/blocked OR');
ok(mr.note === 'cloud note' + NOTE_DIVIDER + 'local note', 'notes concatenated with divider');
ok(mr.tags.join() === 'b,c,a', 'tags union');
ok(mr.seenCount === 4 && mr.firstSeen === 3 && mr.lastSeen === 10, 'seen stats');
const ms = mergeStates({ prefs: { theme: 'ink' }, streamers: { x: { note: 'n' } }, history: [{ id: '1', t: 1 }, { id: '2', t: 2 }] },
  { prefs: null, streamers: { y: { saved: true } }, history: [{ id: '2', t: 2 }, { id: '3', t: 3 }] });
ok(ms.prefs.theme === 'ink' && ms.streamers.x && ms.streamers.y && ms.history.map((h) => h.id).join() === '3,2,1', 'state merge: local prefs when cloud has none, streamer union, history union');
const np = normalizePrefs({ filters: { minViewers: 5 }, theme: 'bogus' });
ok(np.filters.minViewers === 5 && np.filters.maxViewers === 2000 && np.theme === 'ink' && np.saved.order.length === 7, 'normalizePrefs fills defaults');

// ---------------------------------------------------------------- sync (optional)
section('store.js sync through a local Worker (optional)');
let workerUp = false;
try { workerUp = (await realFetch('http://127.0.0.1:8787/health')).ok; } catch (e) { /* not running */ }
if (!workerUp) {
  console.log('  SKIP wrangler dev is not running on 127.0.0.1:8787');
} else {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  };
  const login = await (await realFetch('http://127.0.0.1:8787/auth/dev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'selftest' + (Date.now() % 1e6) }) })).json();
  ok(!!login.session, 'dev sign-in for ' + login.user.id);
  const statuses = [];
  const st = createStore({ workerBase: 'http://127.0.0.1:8787', onStatus: (s) => statuses.push(s.state) });
  st.setSession(login.session, login.user);
  st.prefs.theme = 'kick'; st.savePrefs();
  const r1 = st.ensure('selftestchan'); r1.saved = true; r1.note = 'from selftest'; r1.tags = ['probe']; st.putStreamer('selftestchan');
  st.addHistory({ id: 'st-1', t: Date.now(), slug: 'selftestchan', action: 'rolled' });
  await new Promise((r) => setTimeout(r, 1500)); // 800 ms debounce + flush
  ok(st.pendingCount() === 0 && statuses.includes('saving') && statuses[statuses.length - 1] === 'saved', 'debounced write-through finished (' + statuses.join(' > ') + ')');
  const cloud = await st.fetchState();
  ok(cloud.prefs.theme === 'kick' && cloud.streamers.selftestchan.note === 'from selftest' && cloud.history[0].id === 'st-1', 'cloud has prefs, record and history');
  st.clearHistory();
  await new Promise((r) => setTimeout(r, 1500));
  ok((await st.fetchState()).history.length === 0, 'clear history synced');
  const pulled = await st.pullCloud();
  ok(pulled.streamers.selftestchan.saved === true, 'pullCloud round-trip');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
