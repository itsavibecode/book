/* Kick Translate - the page: header, channel connect, chat buffer, the
   per-line translation flow, status bar, toasts and modals. Kick URLs live
   in kick.js, the socket and the line renderer in chat.js, languages and
   the translation pipeline in translate.js. */
'use strict';

import * as K from './kick.js';
import { chatFeed, renderRow, renderSystem, el } from './chat.js';
import * as T from './translate.js';

const VERSION = '0.5.0';
const $ = function (id) { return document.getElementById(id); };
const LS = { target: 'kt:target', cloud: 'kt:cloud', orig: 'kt:originals', mode: 'kt:mode', order: 'kt:order',
  enabled: 'kt:enabled', lingva: 'kt:lingva', settings: 'kt:settings', recent: 'kt:recent', srcOff: 'kt:srcoff' };
const RECENT_MAX = 8;
const DEFAULT_SETTINGS = { size: 'm', compact: false, tags: true, dots: true, bots: true, muted: '', words: '', glossary: '' };
const CEILING_PER_MIN = 200;   // lines to the cloud per minute before on-demand takes over
const PHONE_AUTO_DEMAND = 40;  // chat lines per minute that make phones default to on-demand
const AUTO_DEMAND_QUIET_MS = 5 * 60 * 1000;
const LAST_N = 20;
const VIEWER_REFRESH_MS = 60 * 1000;
const MAX_ROWS = 400;
const REPEAT_MS = 60 * 1000;
const RESUME_TRANSLATE = 30;   // lines translated on resume / language change
const CLOUD_RECENT_MS = 60 * 1000;
const LATIN_LANGS = new Set(['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'id', 'ro', 'sv', 'da', 'no', 'fi',
  'cs', 'sk', 'sl', 'hr', 'hu', 'lt', 'vi', 'ms', 'fil']);

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

/* Analytics never receive message text, names or the channel. */
function track(name, params) {
  try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) { /* ignore */ }
}

/* ---------- state ---------- */
const S = {
  channel: null,        // normalised channel from kick.js
  feed: null,
  status: 'idle',
  times: [],            // arrival times inside the last minute
  refreshTimer: 0,
  connectGen: 0,
  rows: new Map(),      // message id -> rec {msg, row, c, state, src}
  pinned: true,         // view is at the bottom, following live
  paused: false,
  newCount: 0,          // lines that arrived below the view
  recent: new Map(),    // userId + text -> time, for the repeat rule
  stats: { translated: 0, cache: 0, skipped: 0, failed: 0, reasons: {} },
  lastCloud: 0,         // last time a line went to a cloud provider
  lastCloudName: '',
  offered: new Set(),   // download offers already shown or dismissed ('ja>en')
  dlPair: null,         // the pair the download bar is offering
  lastPair: null,       // the last pair the device could download (for the sheet)
  sticky: '',           // the cloud provider that answered last
  cloudSends: [],       // times of lines sent to the cloud, last minute
  noAnswer: [],         // times of lines no provider answered
  onDemand: false,
  demandQuietUntil: 0,  // no automatic on-demand before this (the viewer turned it off)
  seenLangs: new Map()  // detected source language -> lines, this channel
};

/* Settings, plus the parsed lists the pipeline checks on every line. */
let SET = Object.assign({}, DEFAULT_SETTINGS);
const F = { muted: [], words: [], glossary: [], srcOff: new Set() };
function loadSettings() {
  try { SET = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(lsGet(LS.settings) || '{}')); } catch (e) { SET = Object.assign({}, DEFAULT_SETTINGS); }
  F.muted = T.parseList(SET.muted);
  F.words = T.parseList(SET.words);
  F.glossary = T.parseGlossary(SET.glossary);
  F.srcOff = new Set(lsJSON(LS.srcOff, []));
}
function saveSettings() {
  lsSet(LS.settings, JSON.stringify(SET));
  loadSettings();
  applyLook();
}
function applyLook() {
  const chat = $('chat');
  chat.dataset.size = SET.size;
  chat.classList.toggle('compact', !!SET.compact);
  chat.classList.toggle('notag', !SET.tags);
  chat.classList.toggle('nodot', !SET.dots);
}

const OD = T.createOnDevice();
const cache = T.createCache();
const PROVIDERS = {
  google: T.withCooldown(T.google),
  server: T.withCooldown(T.createWorkerProvider(K.workerBase)),
  mymemory: T.withCooldown(T.mymemory),
  lingva: T.withCooldown(T.createLingva(function () { return lsGet(LS.lingva) || ''; }))
};
const DEFAULT_ORDER = ['google', 'server', 'mymemory', 'lingva'];
const PROVIDER_NOTE = {
  google: 'Fast and good. Sent from your browser, so it uses your own connection\'s allowance.',
  server: 'Our Cloudflare Worker (Workers AI). Capped at a free daily budget shared by everyone.',
  mymemory: 'Slow and weaker on chat; about 5,000 characters a day per connection.',
  lingva: 'Volunteer-run Google front ends. Slow; a last resort so lines are never left blank.'
};
const MODE_LABEL = { 'device-first': 'On this device first', 'cloud-first': 'Cloud first', 'device-only': 'On this device only' };

function lsJSON(k, dflt) { try { const v = JSON.parse(lsGet(k)); return v == null ? dflt : v; } catch (e) { return dflt; } }
function mode() { const m = lsGet(LS.mode); return MODE_LABEL[m] ? m : 'device-first'; }
function order() {
  const o = lsJSON(LS.order, DEFAULT_ORDER).filter(function (n) { return PROVIDERS[n]; });
  DEFAULT_ORDER.forEach(function (n) { if (o.indexOf(n) === -1) o.push(n); });
  return o;
}
function enabled() { return lsJSON(LS.enabled, {}); }
function provLabel(n) { return n === 'device' ? 'this device' : n === 'cache' ? 'the cache' : (PROVIDERS[n] ? PROVIDERS[n].label : n); }
function firstCloud() { const o = order().filter(function (n) { return enabled()[n] !== false; }); return o.length ? PROVIDERS[o[0]].label : 'the cloud'; }

const engine = T.createEngine({
  onDevice: OD,
  mode: mode,
  cloud: function () { return T.chainOrder(PROVIDERS, order(), enabled(), S.sticky, Date.now()); },
  consent: function () { return lsGet(LS.cloud) || 'ask'; },
  askConsent: askCloud,
  onDownloadable: offerDownload,
  onCloudSend: noteCloudSend,
  onResult: onResult
});

/* ---------- toasts (top-center, passive) ---------- */
function toast(msg, kind) {
  const box = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(function () {
    t.classList.add('out');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, kind === 'err' ? 5000 : 3500);
}

/* ---------- target language ---------- */
function buildLangSelect() {
  const sel = $('lang');
  const saved = lsGet(LS.target);
  const mine = T.browserLang();
  sel.innerHTML = '';
  const ph = new Option('Your language', '');
  ph.disabled = true;
  sel.appendChild(ph);
  // The browser's language first, so it is one click away; the rest A-Z.
  sel.appendChild(new Option(T.langName(mine) + ' (this browser)', mine));
  T.TARGETS.filter(function (c) { return c !== mine; })
    .map(function (c) { return { c: c, n: T.langName(c) }; })
    .sort(function (a, b) { return a.n.localeCompare(b.n); })
    .forEach(function (x) { sel.appendChild(new Option(x.n, x.c)); });
  if (saved && T.TARGETS.indexOf(saved) !== -1) sel.value = saved;
  else sel.value = '';
  syncLangGlow();
  sel.addEventListener('change', function () {
    lsSet(LS.target, sel.value);
    syncLangGlow();
    track('kt_target_set', { target: sel.value });
    retranslateRecent();
  });
}
function syncLangGlow() {
  const sel = $('lang');
  sel.classList.toggle('unset', !sel.value);
  renderPill();
}
function target() { return $('lang').value || ''; }

/* ---------- connection ---------- */
function setConn(status) {
  S.status = status;
  const c = $('conn');
  const label = { idle: 'not connected', lookup: 'looking up channel', connecting: 'connecting', live: 'live',
    reconnecting: 'reconnecting', failed: 'failed after 4 tries' }[status] || status;
  const paused = S.paused && status === 'live';
  c.textContent = paused ? 'live, paused' : label;
  c.className = 'conn' + (status === 'live' && !paused ? '' : (status === 'failed' || status === 'idle') ? ' bad' : ' wait');
  $('retryBtn').hidden = status !== 'failed';
  $('lpmWrap').hidden = status !== 'live';
  if (status === 'failed') {
    showError('Lost the chat', 'The relay stopped answering (it is on bookhockeys.com\'s side, not Kick\'s). The lines you already have stay above.', true);
  } else if (status === 'live') {
    hideError();
  }
}

function showError(title, text, retry) {
  $('errTitle').textContent = title;
  $('errText').textContent = text;
  $('errRetry').hidden = !retry;
  $('errCard').hidden = false;
}
function hideError() { $('errCard').hidden = true; }

function stopFeed() {
  if (S.feed) { S.feed.stop(); S.feed = null; }
  clearInterval(S.refreshTimer);
  S.refreshTimer = 0;
}

async function connect(slug) {
  const gen = ++S.connectGen;
  stopFeed();
  hideError();
  $('goBtn').disabled = true;
  setConn('lookup');
  const c = await K.fetchChannel(slug);
  $('goBtn').disabled = false;
  if (gen !== S.connectGen) return;
  if (c.status === 'missing') {
    setConn('idle');
    showError('Channel not found', 'Kick has no channel called "' + slug + '". Check the spelling, or paste the kick.com link.', false);
    return;
  }
  if (c.status !== 'ok' || !c.channelId || !c.chatroomId) {
    setConn('idle');
    showError('Could not reach Kick', 'Kick did not answer the channel lookup (' + (c.reason || 'no chat room') + '). It sometimes shows a bot check for a minute; try again shortly.', true);
    S.channel = { slug: slug, retryLookup: true };
    return;
  }
  S.channel = c;
  $('idle').hidden = true;
  $('lines').innerHTML = '';
  S.rows.clear();
  S.recent.clear();
  S.seenLangs.clear();
  renderLangBtn();
  rememberChannel(c.slug);
  // The address is the channel, so the link can be shared.
  if (location.hash.slice(1).toLowerCase() !== c.slug) {
    try { history.replaceState(null, '', '#' + c.slug); } catch (e) { location.hash = c.slug; }
  }
  engine.clear();
  S.times = [];
  S.newCount = 0;
  S.pinned = true;
  if (S.paused) setPaused(false);
  renderStrip();
  openFeed();
  S.refreshTimer = setInterval(refreshChannel, VIEWER_REFRESH_MS);
  track('kt_connect', { live: c.live ? 1 : 0 });
  if (!c.live) toast(c.name + ' is offline. Chat still works; it is just quieter.');
}

function openFeed() {
  const c = S.channel;
  if (S.feed) S.feed.stop();
  S.feed = chatFeed(K.relayUrl(c.channelId, c.chatroomId), setConn, onEvent);
}

function retry() {
  if (!S.channel) return;
  if (S.channel.retryLookup) { connect(S.channel.slug); return; }
  hideError();
  openFeed();
}

async function refreshChannel() {
  if (!S.channel || document.hidden) return;
  const c = await K.fetchChannel(S.channel.slug);
  if (c.status !== 'ok' || !S.channel || c.slug !== S.channel.slug) return;
  Object.assign(S.channel, { live: c.live, viewers: c.viewers, language: c.language || S.channel.language, title: c.title });
  renderStrip();
}

function renderStrip() {
  const c = S.channel;
  $('strip').hidden = false;
  const av = $('chAv');
  if (c.avatar) av.src = c.avatar; else av.removeAttribute('src');
  $('chName').textContent = c.name;
  const live = $('chLive');
  live.textContent = c.live ? 'LIVE' : 'OFFLINE';
  live.className = 'tag' + (c.live ? ' live' : '');
  live.title = c.live ? (c.title || 'Live now') : 'Not streaming right now; the chat still works';
  $('chViewers').textContent = c.live ? Number(c.viewers || 0).toLocaleString('en-US') + ' viewers' : '';
  $('chViewers').hidden = !c.live;
  $('chLang').textContent = c.language ? c.language + ' chat' : 'language not declared';
  $('chOpen').href = K.channelPage(c.slug);
  document.title = c.name + ' chat - Kick Translate v' + VERSION;
}

function channelLang() { return S.channel ? T.codeFromName(S.channel.language) : ''; }

/* ---------- lines ---------- */
/* The chat is pinned to the bottom until the viewer scrolls up (or pauses);
   then new lines count into the "N new, jump to live" pill instead of
   pulling the view down. */
function addRow(row) {
  const box = $('lines');
  // Read the position now rather than trusting the last scroll event:
  // background tabs deliver scroll events late or not at all.
  S.pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.appendChild(row);
  // Ring buffer: drop the oldest rows. When the viewer is reading back,
  // shift the scroll by what was removed so the text under their eyes stays put.
  let removed = 0;
  while (box.children.length > MAX_ROWS) {
    const first = box.firstChild;
    if (!S.pinned || S.paused) removed += first.offsetHeight;
    S.rows.delete(first.dataset.id);
    box.removeChild(first);
  }
  if (removed) box.scrollTop -= removed;
  stick();
  if (!(S.pinned && !S.paused)) { S.newCount++; renderJump(); }
}

/* Keep following live after a row grows (a translation landing under it). */
function stick() {
  if (S.pinned && !S.paused) { const box = $('lines'); box.scrollTop = box.scrollHeight; }
}

function scrollToLive() {
  const box = $('lines');
  box.scrollTop = box.scrollHeight;
  S.pinned = true;
  S.newCount = 0;
  renderJump();
}

function onScroll() {
  const box = $('lines');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  S.pinned = atBottom;
  if (atBottom && !S.paused) { S.newCount = 0; renderJump(); }
}

function renderJump() {
  const j = $('jump');
  const show = S.paused || (!S.pinned && S.newCount > 0);
  j.hidden = !show;
  if (!show) return;
  if (S.paused) j.textContent = (S.newCount ? S.newCount + ' new, ' : '') + 'paused - resume';
  else j.textContent = S.newCount + ' new, jump to live';
}

/* Paused: the socket stays open and lines keep arriving, but nothing is
   sent to any provider and the view holds still. Resume translates only
   the last 30 waiting lines; older ones get a Translate chip, so a long
   pause never turns into a 500-line bill. */
function setPaused(p) {
  S.paused = p;
  engine.setPaused(p);
  const b = $('pauseBtn');
  b.classList.toggle('on', p);
  b.setAttribute('aria-pressed', p ? 'true' : 'false');
  b.querySelector('.lbl').textContent = p ? 'Resume' : 'Pause';
  b.querySelector('svg').innerHTML = p ? '<path d="M7 5l12 7-12 7z"/>' : '<path d="M8 5v14M16 5v14"/>';
  if (!p) {
    const waiting = [];
    S.rows.forEach(function (r) { if (r.state === 'paused') waiting.push(r); });
    waiting.forEach(function (r, i) {
      if (i >= waiting.length - RESUME_TRANSLATE) process(r, true);
      else addChip(r);
    });
    scrollToLive();
  }
  renderJump();
  renderPill();
  setConn(S.status);
}

function onEvent(ev) {
  if (ev.kind === 'message') {
    S.times.push(Date.now());
    // Muted people and lines with a blocked word are not shown at all.
    if (F.muted.indexOf(ev.user.slug) !== -1 || F.muted.indexOf(ev.user.name.toLowerCase()) !== -1) { countFiltered('muted user'); return; }
    if (T.hasBlockedWord(ev.content, F.words)) { countFiltered('blocked word'); return; }
    const row = renderRow(ev);
    const rec = { msg: ev, row: row, state: 'new' };
    S.rows.set(ev.id, rec);
    addRow(row);
    process(rec, false);
    return;
  }
  // Moderation: strike the line and keep it, so the conversation around it
  // still makes sense.
  if (ev.kind === 'deleted') {
    const r = S.rows.get(ev.id);
    if (r) strike(r.row, 'Deleted by a moderator');
  } else if (ev.kind === 'banned') {
    S.rows.forEach(function (r) {
      if ((ev.userId && r.msg.user.id === ev.userId) || (ev.name && r.msg.user.slug === ev.name)) strike(r.row, 'This user was banned or timed out');
    });
  } else if (ev.kind === 'cleared') {
    S.rows.forEach(function (r) { strike(r.row, 'Chat cleared by a moderator'); });
    addRow(renderSystem('A moderator cleared the chat.'));
  }
}

function strike(row, why) {
  row.classList.add('del');
  row.title = why;
}

/* ---------- translation, per line ---------- */

/* clean -> skip rules -> cache -> detect -> same language? -> queue.
   `force` (a Translate chip, resume, language change) skips the repeat and
   pause checks. */
async function process(rec, force) {
  const tgt = target();
  clearTr(rec);
  if (!tgt) { rec.state = 'new'; return; }
  if (!rec.c) rec.c = T.clean(rec.msg.content);
  let reason = SET.bots && T.isBot(rec.msg.user.slug) ? 'filtered (bot)' : T.skipReason(rec.c);
  if (!reason && !force) {
    const key = rec.msg.user.id + '\u0001' + rec.c.text.toLowerCase();
    const now = Date.now();
    const seen = S.recent.get(key);
    S.recent.set(key, now);
    if (S.recent.size > 2000) S.recent.forEach(function (t, k) { if (now - t > REPEAT_MS) S.recent.delete(k); });
    if (seen && now - seen < REPEAT_MS) reason = 'repeat';
  }
  if (reason) { markSkip(rec, reason); return; }
  if (S.paused && !force) { rec.state = 'paused'; setSkipNote(rec, 'paused'); return; }
  const gen = rec.gen = (rec.gen || 0) + 1;
  const hit = await cache.get(rec.c.text, tgt);
  if (gen !== rec.gen) return;
  if (hit) {
    if (hit.src === tgt || !hit.text) { markSkip(rec, 'already ' + T.langName(tgt)); return; }
    S.stats.cache++;
    showTr(rec, hit.text, hit.src, 'cache');
    return;
  }
  const src = await detectLang(rec.c.text);
  if (gen !== rec.gen) return;
  if (src && src === tgt) { markSkip(rec, 'already ' + T.langName(tgt)); return; }
  rec.src = src;
  if (src && !rec.counted) { rec.counted = true; S.seenLangs.set(src, (S.seenLangs.get(src) || 0) + 1); renderLangBtn(); }
  if (src && F.srcOff.has(src) && !force) { markSkip(rec, 'filtered (' + T.langName(src) + ' is off)'); return; }
  if (S.onDemand && !force) { addChip(rec); return; }
  showWait(rec);
  engine.enqueue({ id: rec.msg.id, text: rec.c.text, src: src, target: tgt, rec: rec, gen: gen });
}

/* On-device detector (desktop Chrome/Edge) ; else the script (kana = ja,
   Hangul = ko, ...) ; for Latin script a stopword vote, then the channel's
   declared language when that is a Latin-script one ; else '' and the cloud
   detects it. */
async function detectLang(text) {
  const d = await OD.detect(text);
  const script = T.detectScript(text);
  const hint = channelLang();
  const latinHint = LATIN_LANGS.has(hint) ? hint : '';
  if (d) {
    // Short Latin lines fool the small model ("dentro da agua mds" came back
    // Turkish in a Portuguese chat); unless it is sure, the stopword vote
    // and the channel's own language win.
    if (script === 'latin' && d.confidence < 0.85) {
      const g = T.guessLatin(text) || latinHint;
      if (g && g !== d.lang) return g;
    }
    return d.lang;
  }
  if (script === 'latin') return T.guessLatin(text) || latinHint;
  return script || hint;
}

function onResult(job, res) {
  const rec = job.rec;
  if (job.gen !== rec.gen) return;
  const tgt = job.target;
  if (res.error) {
    rec.state = 'failed';
    S.stats.failed++;
    hideWait(rec);
    setSkipNote(rec, res.error);
    if (res.error !== 'cloud is off' && res.error !== 'on-device only') addChip(rec);
    renderStats();
    if (res.error === 'no provider answered') noteNoAnswer();
    return;
  }
  if (res.provider !== 'device') { S.lastCloud = Date.now(); S.lastCloudName = res.provider; S.sticky = res.provider; renderPill(); }
  const same = res.src === tgt || T.clean(res.text).text.toLowerCase() === job.text.toLowerCase();
  cache.put(job.text, tgt, { text: same ? '' : res.text, src: same ? tgt : res.src, provider: res.provider });
  if (same) { hideWait(rec); markSkip(rec, 'already ' + T.langName(tgt)); return; }
  S.stats.translated++;
  showTr(rec, res.text, res.src || job.src, res.provider);
}

const PROVIDER_TIP = {
  device: 'Translated on this device: nothing was sent',
  cache: 'From the cache: seen this line before, nothing was sent'
};

/* ---------- on-demand ---------- */

/* On demand: nothing is translated by itself; foreign lines get a Translate
   chip. Turned on by hand, or by the page when the cloud gets too busy:
   over 200 lines a minute, a phone in a chat over 40 a minute, or no
   provider answering. */
function setOnDemand(on, why) {
  if (S.onDemand === on) return;
  S.onDemand = on;
  const b = $('demandBtn');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('lastBtn').hidden = !on;
  if (!on) {
    if (!why) S.demandQuietUntil = Date.now() + AUTO_DEMAND_QUIET_MS;
    translateLast(RESUME_TRANSLATE, true);
  }
  if (on && why) toast(why, 'warn');
  track('kt_on_demand', { on: on ? 1 : 0, auto: why ? 1 : 0 });
  renderPill();
}

function autoDemand(why) {
  if (S.onDemand || Date.now() < S.demandQuietUntil) return;
  setOnDemand(true, why);
}

function noteCloudSend(n) {
  const now = Date.now();
  for (let i = 0; i < n; i++) S.cloudSends.push(now);
  while (S.cloudSends.length && S.cloudSends[0] < now - 60000) S.cloudSends.shift();
  if (S.cloudSends.length > CEILING_PER_MIN) {
    autoDemand('Over ' + CEILING_PER_MIN + ' lines a minute were going to the cloud, so translation is now on demand: tap Translate on the lines you want.');
  }
}

function noteNoAnswer() {
  const now = Date.now();
  S.noAnswer.push(now);
  while (S.noAnswer.length && S.noAnswer[0] < now - 60000) S.noAnswer.shift();
  if (S.noAnswer.length >= 3) autoDemand('No translator is answering right now (limits reached), so translation is on demand until you switch it back.');
}

/* "Translate the last 20": the newest lines still waiting for a tap. */
function translateLast(n, onlyChips) {
  const all = Array.from(S.rows.values()).filter(function (r) { return r.state === 'chip' || (!onlyChips && r.state === 'failed'); });
  all.slice(-n).forEach(function (r) { process(r, true); });
}

function isPhone() {
  return !OD.hasTranslator && !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function clearTr(rec) {
  rec.row.classList.remove('has-tr', 'tappable');
  rec.row.querySelectorAll('.tr,.skip,.chip').forEach(function (n) { n.remove(); });
}

function showWait(rec) {
  rec.state = 'pending';
  const t = el('div', 'tr pend');
  if (rec.src) { const lg = el('span', 'lg', T.shortTag(rec.src)); lg.title = T.langName(rec.src); t.appendChild(lg); }
  const w = el('span', 'wait');
  w.title = 'Translating';
  w.innerHTML = '<i></i><i></i><i></i>';
  t.appendChild(w);
  rec.row.appendChild(t);
  stick();
}
function hideWait(rec) { const p = rec.row.querySelector('.tr.pend'); if (p) p.remove(); }

function showTr(rec, text, src, provider) {
  clearTr(rec);
  rec.state = 'done';
  const t = el('div', 'tr');
  if (src) { const lg = el('span', 'lg', T.shortTag(src)); lg.title = 'Translated from ' + T.langName(src); t.appendChild(lg); }
  t.appendChild(el('span', 'tt', T.applyGlossary(text, F.glossary)));
  const kind = provider === 'device' ? 'local' : provider === 'cache' ? 'cache' : 'cloud';
  const d = el('span', 'pd ' + kind);
  d.title = PROVIDER_TIP[provider] || ('Translated by ' + provLabel(provider) + ': the text of this line was sent to it');
  t.appendChild(d);
  rec.row.appendChild(t);
  rec.row.classList.add('has-tr');
  stick();
  renderStats();
}

function setSkipNote(rec, reason) {
  const s = el('div', 'skip', 'not translated: ' + reason);
  rec.row.appendChild(s);
}

function markSkip(rec, reason) {
  rec.state = 'skip';
  S.stats.skipped++;
  const key = reason.indexOf('already') === 0 ? 'already your language' : reason.indexOf('filtered (') === 0 && reason !== 'filtered (bot)' ? 'filtered language' : reason;
  S.stats.reasons[key] = (S.stats.reasons[key] || 0) + 1;
  setSkipNote(rec, reason);
  renderStats();
}

function countFiltered(why) {
  S.stats.skipped++;
  S.stats.reasons[why] = (S.stats.reasons[why] || 0) + 1;
  renderStats();
}

function addChip(rec) {
  rec.state = rec.state === 'failed' ? 'failed' : 'chip';
  rec.row.classList.add('tappable');
  if (rec.row.querySelector('.chip')) return;
  const b = el('button', 'chip', 'Translate');
  b.type = 'button';
  b.title = 'Translate this line now, through the same providers as everything else';
  b.addEventListener('click', function (e) { e.stopPropagation(); rec.row.classList.remove('tappable'); process(rec, true); });
  rec.row.appendChild(b);
}

/* The language changed: drop what is queued and redo the last 30 lines. */
function retranslateRecent() {
  engine.clear();
  const all = Array.from(S.rows.values());
  all.forEach(function (r) { r.gen = (r.gen || 0) + 1; clearTr(r); r.state = 'new'; });
  all.slice(-RESUME_TRANSLATE).forEach(function (r) { process(r, true); });
}

function renderStats() {
  const s = S.stats;
  $('stats').hidden = false;
  $('nT').textContent = s.translated;
  $('nS').textContent = s.skipped;
  $('nC').textContent = s.cache;
  const parts = Object.keys(s.reasons).sort(function (a, b) { return s.reasons[b] - s.reasons[a]; })
    .map(function (k) { return k + ' ' + s.reasons[k]; });
  $('stats').title = 'Skipped lines by reason: ' + (parts.join(', ') || 'none yet') +
    (s.failed ? '. Not answered by any provider: ' + s.failed : '') +
    '. Cache hits are lines seen before, translated without sending anything.';
}

/* ---------- provider pill + cloud banner ---------- */
const ICO = {
  local: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .4-9A7 7 0 0 0 4.3 12.5 3.5 3.5 0 0 0 5 19z"/>',
  off: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'
};

function pillState() {
  if (!target()) return { kind: 'off', text: 'Pick your language', tip: 'Choose the language you read first; until then the chat is shown as it is.', sb: 'not translating' };
  if (S.paused) return { kind: 'off', text: 'Paused', tip: 'Nothing is being translated or sent while paused.', sb: 'paused' };
  const consent = lsGet(LS.cloud) || 'ask';
  const m = mode();
  const device = OD.hasTranslator && !OD.isBroken();
  const cloudOk = consent === 'yes' && m !== 'device-only';
  const demand = S.onDemand ? ', on demand' : '';
  if (cloudOk && (Date.now() - S.lastCloud < CLOUD_RECENT_MS || m === 'cloud-first')) {
    const n = Date.now() - S.lastCloud < CLOUD_RECENT_MS ? provLabel(S.lastCloudName) : firstCloud();
    return { kind: 'cloud', text: 'Cloud: ' + n, cloud: n, sb: n + ' (cloud' + demand + ')',
      tip: 'The text of chat lines is sent to ' + n + ' to translate. Names, badges and the channel are not. Click to choose who translates.' };
  }
  if (device) return { kind: 'local', text: 'On this device', sb: 'on this device' + demand,
    tip: 'Translations run inside this browser (its built-in translator). Nothing leaves your machine. Click to choose who translates.' };
  if (!cloudOk && consent !== 'ask') return { kind: 'off', text: 'Not translating', sb: 'not translating',
    tip: m === 'device-only' ? 'Set to on-device only, and this browser has no on-device translator. Click to change.'
      : 'This browser has no on-device translator and cloud translation is off. Click to change.' };
  const n = firstCloud();
  return { kind: 'cloud', text: 'Cloud: ' + n, cloud: n, sb: n + ' (cloud' + demand + ')',
    tip: 'This browser cannot translate on the device, so the text of chat lines goes to ' + n + '. Names, badges and the channel do not. Click to choose who translates.' };
}

function renderPill() {
  const st = pillState();
  const p = $('pill');
  p.className = 'pill ' + st.kind;
  p.title = st.tip;
  p.querySelector('svg').innerHTML = ICO[st.kind];
  $('pillTx').textContent = st.text;
  $('provSb').textContent = st.sb;
  const banner = $('cloudBanner');
  banner.hidden = !(st.kind === 'cloud' && lsGet(LS.cloud) === 'yes' && S.channel);
  if (!banner.hidden) $('bannerProv').textContent = st.cloud;
}

/* ---------- modals (close only via their buttons) ---------- */
let cloudResolve = null;
function askCloud() {
  return new Promise(function (resolve) {
    cloudResolve = resolve;
    showCloudModal();
  });
}
/* From the pill: the same question, to change an earlier answer. */
function openCloudChoice() {
  if (!$('cloudModal').hidden) return;
  showCloudModal();
}
function showCloudModal() {
  const tgt = T.langName(target()) || 'your language';
  const first = firstCloud();
  $('cloudTitle').textContent = 'Translate through ' + first + '?';
  $('cloudYes').textContent = 'Use ' + first;
  $('cloudWhy').textContent = (OD.hasTranslator && !OD.isBroken()
    ? 'Some lines are in a language this browser cannot translate on the device yet, so they would be sent to ' + first + ' to translate into ' + tgt + '.'
    : 'This browser has no on-device translator, so chat lines would be sent to ' + first + ' to translate into ' + tgt + '.') +
    ' If it is busy, the next cloud translator in your list takes over.';
  $('cloudModal').hidden = false;
  $('cloudYes').focus();
  renderPill();
}
function answerCloud(yes) {
  lsSet(LS.cloud, yes ? 'yes' : 'no');
  $('cloudModal').hidden = true;
  track('kt_cloud_choice', { cloud: yes ? 1 : 0 });
  if (cloudResolve) { const r = cloudResolve; cloudResolve = null; r(yes); }
  else if (yes) retranslateRecent();
  renderPill();
}

/* ---------- on-device download offer ---------- */
function offerDownload(src, tgt) {
  const k = src + '>' + tgt;
  S.lastPair = { src: src, tgt: tgt };
  if (S.offered.has(k) || S.dlPair) return;
  S.offered.add(k);
  S.dlPair = { src: src, tgt: tgt };
  $('dlText').textContent = T.langName(src) + ' to ' + T.langName(tgt) + ' can run on this device, so those lines never leave it.';
  $('dlBtn').textContent = 'Download ' + T.langName(src) + ' to ' + T.langName(tgt) + ' (one time)';
  $('dlBar').hidden = false;
}

async function startDownload(pair) {
  const p = pair && pair.src ? pair : S.dlPair;
  if (!p) return;
  S.dlPair = p;
  $('dlBar').hidden = true;
  const prog = $('prog');
  prog.hidden = false;
  $('progTx').textContent = 'Downloading ' + T.shortTag(p.src).toLowerCase() + ' to ' + T.shortTag(p.tgt).toLowerCase();
  $('progBar').style.width = '0%';
  try {
    await OD.download(p.src, p.tgt, function (f) { $('progBar').style.width = Math.round(f * 100) + '%'; $('progPct').textContent = Math.round(f * 100) + '%'; });
    toast(T.langName(p.src) + ' to ' + T.langName(p.tgt) + ' now runs on this device.');
    track('kt_pack_download', { ok: 1 });
  } catch (e) {
    toast('The download did not finish (' + e.message + '). Lines keep using the cloud or stay untranslated.', 'err');
    track('kt_pack_download', { ok: 0 });
  }
  prog.hidden = true;
  S.dlPair = null;
  renderPill();
  if (!$('provSheet').hidden) renderSheet();
}

/* ---------- Providers sheet ---------- */
/* Who translates: the mode, the cloud list (order and on/off), the
   on-device pack, your own Lingva instance, and Clear cache. Has form
   fields, so it closes only via Done or Esc, never an outside click. */
function openSheet() {
  renderSheet();
  $('provSheet').hidden = false;
  $('sheetDone').focus();
}
function closeSheet() { $('provSheet').hidden = true; renderPill(); }

function renderSheet() {
  const m = mode();
  document.querySelectorAll('input[name="pmode"]').forEach(function (r) { r.checked = r.value === m; });
  // on this device
  let od;
  if (!OD.hasTranslator) od = 'This browser has no on-device translator (it needs desktop Chrome or Edge 138 or newer).';
  else if (OD.isBroken()) od = 'This browser lists an on-device translator but it did not answer within 3 seconds, so it is skipped for now.';
  else {
    const p = S.lastPair;
    const st = p ? OD.state(p.src, p.tgt) : '';
    od = 'Available. Language packs download once, after a click, and then stay in the browser.' +
      (p && st === 'downloadable' ? ' ' + T.langName(p.src) + ' to ' + T.langName(p.tgt) + ' is not downloaded yet.' : '');
  }
  $('odStatus').textContent = od;
  const p = S.lastPair;
  const dl = $('sheetDl');
  dl.hidden = !(p && OD.hasTranslator && !OD.isBroken() && OD.state(p.src, p.tgt) === 'downloadable');
  if (!dl.hidden) dl.textContent = 'Download ' + T.langName(p.src) + ' to ' + T.langName(p.tgt) + ' (one time)';
  // cloud
  const consent = lsGet(LS.cloud) || 'ask';
  $('cloudOk').checked = consent === 'yes';
  const list = $('provList');
  list.innerHTML = '';
  const o = order(), en = enabled(), now = Date.now();
  o.forEach(function (name, i) {
    const pv = PROVIDERS[name];
    const li = el('li', 'pv');
    const lab = el('label', 'pv-on');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = en[name] !== false;
    cb.title = 'Use ' + pv.label + ' when the providers above it cannot translate a line';
    cb.addEventListener('change', function () { const e2 = enabled(); e2[name] = cb.checked; lsSet(LS.enabled, JSON.stringify(e2)); renderSheet(); });
    lab.appendChild(cb);
    lab.appendChild(el('b', null, pv.label.charAt(0).toUpperCase() + pv.label.slice(1)));
    li.appendChild(lab);
    const note = el('span', 'pv-note');
    note.dataset.name = name;
    li.appendChild(note);
    const mv = el('span', 'pv-mv');
    [['up', -1, 'M6 15l6-6 6 6', 'Try ' + pv.label + ' earlier'], ['down', 1, 'M6 9l6 6 6-6', 'Try ' + pv.label + ' later']].forEach(function (d) {
      const b = el('button', 'ib');
      b.type = 'button';
      b.title = d[3];
      b.setAttribute('aria-label', d[3]);
      b.disabled = (d[1] < 0 && i === 0) || (d[1] > 0 && i === o.length - 1);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d[2] + '"/></svg>';
      b.addEventListener('click', function () {
        const o2 = order();
        const j = i + d[1];
        const t = o2[i]; o2[i] = o2[j]; o2[j] = t;
        lsSet(LS.order, JSON.stringify(o2));
        renderSheet();
      });
      mv.appendChild(b);
    });
    li.appendChild(mv);
    list.appendChild(li);
  });
  list.classList.toggle('dim', consent !== 'yes' || m === 'device-only');
  $('lingvaIn').value = lsGet(LS.lingva) || '';
  cache.count().then(function (n) { $('cacheCount').textContent = n + ' saved'; });
  renderProvNotes();
}

/* The live part of the sheet (cooldowns), refreshed without rebuilding the
   list so focus and typing are never disturbed. */
function renderProvNotes() {
  const now = Date.now();
  document.querySelectorAll('#provList .pv-note').forEach(function (n) {
    const name = n.dataset.name, pv = PROVIDERS[name];
    let state = '';
    if (!pv.ready(now)) state = 'resting ' + Math.ceil((pv.until - now) / 1000) + ' s after "' + pv.lastError + '"';
    else if (S.sticky === name) state = 'answered last, so it goes first';
    n.textContent = PROVIDER_NOTE[name] + (state ? ' Now: ' + state + '.' : '');
  });
}

function setMode(m) {
  lsSet(LS.mode, m);
  track('kt_mode', { mode: m });
  renderPill();
}

function saveLingva() {
  const v = $('lingvaIn').value.trim().replace(/\/+$/, '');
  if (v && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v)) {
    toast('A Lingva instance is an https:// address with no path, like https://lingva.example.org.', 'err');
    return;
  }
  lsSet(LS.lingva, v);
  if (v) toast('Lingva will try ' + v + ' first.');
}

/* ---------- Languages sheet (source-language filter) ---------- */
/* Chips for every language seen in this chat, with counts. Turning one off
   stops translating it, which saves budget in mixed chats. Remembered
   across channels. */
function renderLangBtn() {
  const off = F.srcOff.size;
  const top = Array.from(S.seenLangs.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3)
    .map(function (e) { return e[0]; });
  $('srcSum').textContent = top.length ? top.join(' ') + (off ? ' (' + off + ' off)' : '') : (off ? off + ' off' : '');
  $('srcBtn').classList.toggle('warn', off > 0);
  if (!$('srcSheet').hidden) renderSrcSheet();
}

function renderSrcSheet() {
  const box = $('srcChips');
  box.innerHTML = '';
  const seen = Array.from(S.seenLangs.entries());
  F.srcOff.forEach(function (c) { if (!S.seenLangs.has(c)) seen.push([c, 0]); });
  seen.sort(function (a, b) { return b[1] - a[1]; });
  $('srcEmpty').hidden = seen.length > 0;
  seen.forEach(function (e) {
    const code = e[0];
    const on = !F.srcOff.has(code);
    const b = el('button', 'lchip' + (on ? ' on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Translating ' + T.langName(code) + '. Click to stop translating it.' : T.langName(code) + ' is off: its lines are shown but not translated. Click to turn it back on.';
    b.appendChild(el('span', null, T.langName(code)));
    b.appendChild(el('small', null, String(e[1])));
    b.addEventListener('click', function () { toggleSrc(code); });
    box.appendChild(b);
  });
  const top = seen.length ? seen[0][0] : '';
  const only = $('srcOnly');
  only.hidden = !top || seen.length < 2;
  if (top) { only.textContent = 'Only ' + T.langName(top); only.dataset.code = top; }
  const skipEn = $('srcSkipEn');
  skipEn.hidden = target() === 'en' || F.srcOff.has('en');
}

function toggleSrc(code) {
  if (F.srcOff.has(code)) F.srcOff.delete(code); else F.srcOff.add(code);
  lsSet(LS.srcOff, JSON.stringify(Array.from(F.srcOff)));
  renderLangBtn();
  renderSrcSheet();
}

function srcOnly(code) {
  S.seenLangs.forEach(function (n, c) { if (c !== code) F.srcOff.add(c); });
  F.srcOff.delete(code);
  lsSet(LS.srcOff, JSON.stringify(Array.from(F.srcOff)));
  renderLangBtn();
  renderSrcSheet();
}

/* ---------- Settings sheet ---------- */
function openSettings() {
  $('setSize').value = SET.size;
  $('setCompact').checked = !!SET.compact;
  $('setTags').checked = !!SET.tags;
  $('setDots').checked = !!SET.dots;
  $('setBots').checked = !!SET.bots;
  $('setMuted').value = SET.muted;
  $('setWords').value = SET.words;
  $('setGloss').value = SET.glossary;
  let off = false;
  try { off = localStorage.getItem('bookhockeys_ga_optout') === '1'; } catch (e) { /* ignore */ }
  $('gaState').textContent = off ? 'Analytics are off for this browser.' : 'Anonymous visit counts are on for this browser (never chat text, names or channels).';
  const a = $('gaLink');
  a.textContent = off ? 'Turn analytics back on' : 'Turn analytics off for this browser';
  a.href = '?ga=' + (off ? 'on' : 'off') + location.hash;
  $('aboutVer').textContent = 'v' + VERSION;
  $('setSheet').hidden = false;
  $('setDone').focus();
}
function closeSettings() {
  SET.size = $('setSize').value;
  SET.compact = $('setCompact').checked;
  SET.tags = $('setTags').checked;
  SET.dots = $('setDots').checked;
  SET.bots = $('setBots').checked;
  SET.muted = $('setMuted').value;
  SET.words = $('setWords').value;
  SET.glossary = $('setGloss').value;
  saveSettings();
  $('setSheet').hidden = true;
}

/* ---------- recent channels ---------- */
function recentList() { return lsJSON(LS.recent, []).filter(function (s) { return K.parseSlug(s); }); }
function rememberChannel(slug) {
  const l = recentList().filter(function (s) { return s !== slug; });
  l.unshift(slug);
  lsSet(LS.recent, JSON.stringify(l.slice(0, RECENT_MAX)));
  renderRecent();
}
function renderRecent() {
  const l = recentList();
  [$('recentBox'), $('idleRecent')].forEach(function (box) {
    box.innerHTML = '';
    l.forEach(function (s) {
      const b = el('button', 'rchip', s);
      b.type = 'button';
      b.title = 'Open ' + s + '\'s chat again';
      // mousedown, so it fires before the field's blur hides the list
      b.addEventListener('mousedown', function (e) { e.preventDefault(); go(s); });
      b.addEventListener('click', function () { go(s); });
      box.appendChild(b);
    });
  });
  $('idleRecentWrap').hidden = !l.length;
}

function go(slug) {
  OD.initDetector();   // inside a click, so a first-time model download is allowed
  $('chanIn').value = slug;
  $('chanIn').blur();
  $('recentBox').hidden = true;
  if (!S.channel || S.channel.slug !== slug || S.status === 'failed' || S.status === 'idle') connect(slug);
}

/* ---------- keyboard ---------- */
/* "/" channel field, Space pause, o originals, d on demand, t translate the
   last 20, Esc closes sheets. Never while typing or while a question is open. */
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
  const blocking = !$('confirmModal').hidden || !$('cloudModal').hidden;
  if (e.key === 'Escape') {
    if (blocking) return;   // the questions need an answer
    if (!$('setSheet').hidden) { closeSettings(); return; }
    if (!$('srcSheet').hidden) { $('srcSheet').hidden = true; return; }
    if (!$('provSheet').hidden) { saveLingva(); closeSheet(); return; }
    if (!$('dlBar').hidden) { $('dlBar').hidden = true; S.dlPair = null; return; }
    if (tag === 'INPUT') e.target.blur();
    return;
  }
  if (typing || blocking || !$('provSheet').hidden || !$('setSheet').hidden || !$('srcSheet').hidden) return;
  if (e.key === '/') { e.preventDefault(); $('chanIn').focus(); $('chanIn').select(); }
  else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { if (!S.channel) return; e.preventDefault(); setPaused(!S.paused); }
  else if (e.key === 'o' || e.key === 'O') setOriginals($('chat').classList.contains('hideorig'));
  else if (e.key === 'd' || e.key === 'D') setOnDemand(!S.onDemand);
  else if (e.key === 't' || e.key === 'T') translateLast(LAST_N, false);
}

/* ---------- confirm modal (decisions; closes only via its buttons) ---------- */
let confirmCb = null;
function confirmBox(title, text, okLabel, cb) {
  $('cfTitle').textContent = title;
  $('cfText').textContent = text;
  $('cfOk').textContent = okLabel;
  confirmCb = cb;
  $('confirmModal').hidden = false;
  $('cfCancel').focus();
}
function closeConfirm(ok) {
  $('confirmModal').hidden = true;
  const cb = confirmCb;
  confirmCb = null;
  if (ok && cb) cb();
}

/* ---------- misc ---------- */
function setOriginals(show) {
  $('chat').classList.toggle('hideorig', !show);
  const b = $('origBtn');
  b.classList.toggle('on', show);
  b.setAttribute('aria-pressed', show ? 'true' : 'false');
  lsSet(LS.orig, show ? '1' : '0');
}

function tickRate() {
  const cut = Date.now() - 60000;
  while (S.times.length && S.times[0] < cut) S.times.shift();
  $('lpm').textContent = String(S.times.length);
  renderPill();   // cloud use ages out; the on-device check can fail late
  // Phones translate everything in the cloud, so a busy chat defaults to on demand.
  if (isPhone() && S.status === 'live' && target() && S.times.length > PHONE_AUTO_DEMAND) {
    autoDemand('This chat is busy (over ' + PHONE_AUTO_DEMAND + ' lines a minute) and phones translate in the cloud, so translation is on demand: tap the lines you want.');
  }
  if (!$('provSheet').hidden) renderProvNotes();
}

/* ---------- consent banner (site-wide `greenline-consent` key) ---------- */
function initConsent() {
  const banner = $('consentBanner');
  function record(state) {
    try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': state }); } catch (e) { /* ignore */ }
    lsSet('greenline-consent', state);
    banner.hidden = true;
  }
  $('consentAccept').addEventListener('click', function () { record('granted'); });
  $('consentReject').addEventListener('click', function () { record('denied'); });
  $('cookieReset').addEventListener('click', function () {
    try { localStorage.removeItem('greenline-consent'); } catch (e) { /* ignore */ }
    try { if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': 'denied' }); } catch (e) { /* ignore */ }
    banner.hidden = false;
  });
  if (window.__needsConsent) banner.hidden = false;
}

/* ---------- boot ---------- */
$('chanForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const slug = K.parseSlug($('chanIn').value);
  if (!slug) { OD.initDetector(); toast('That does not look like a Kick channel name.', 'err'); $('chanIn').focus(); return; }
  go(slug);
});
$('chanIn').addEventListener('focus', function () { $('recentBox').hidden = !recentList().length; });
$('chanIn').addEventListener('blur', function () { $('recentBox').hidden = true; });
$('retryBtn').addEventListener('click', retry);
$('lines').addEventListener('scroll', onScroll, { passive: true });
$('jump').addEventListener('click', function () { if (S.paused) setPaused(false); else scrollToLive(); });
$('pauseBtn').addEventListener('click', function () { setPaused(!S.paused); });
$('origBtn').addEventListener('click', function () { setOriginals($('chat').classList.contains('hideorig')); });
$('errRetry').addEventListener('click', retry);
$('pill').addEventListener('click', openSheet);
$('cloudYes').addEventListener('click', function () { answerCloud(true); });
$('cloudNo').addEventListener('click', function () { answerCloud(false); });
$('dlBtn').addEventListener('click', startDownload);
$('dlClose').addEventListener('click', function () { $('dlBar').hidden = true; S.dlPair = null; });
$('demandBtn').addEventListener('click', function () { setOnDemand(!S.onDemand); });
$('lastBtn').addEventListener('click', function () { translateLast(LAST_N, false); });
// Phones: the whole row is the tap target for a waiting line.
$('lines').addEventListener('click', function (e) {
  const row = e.target.closest('.row.tappable');
  if (!row || e.target.closest('a,button') || window.innerWidth > 700) return;
  const rec = S.rows.get(row.dataset.id);
  if (rec) process(rec, true);
});
document.querySelectorAll('input[name="pmode"]').forEach(function (r) {
  r.addEventListener('change', function () { if (r.checked) setMode(r.value); renderSheet(); });
});
$('cloudOk').addEventListener('change', function () { answerCloud($('cloudOk').checked); renderSheet(); });
$('sheetDl').addEventListener('click', function () { startDownload(S.lastPair); });
$('lingvaIn').addEventListener('change', saveLingva);
$('sheetDone').addEventListener('click', function () { saveLingva(); closeSheet(); });
$('clearCacheBtn').addEventListener('click', function () {
  cache.count().then(function (n) {
    confirmBox('Clear the translation cache?', 'This forgets ' + n + ' saved translations on this browser. Lines seen again will be translated again, which can mean sending them to the cloud again.', 'Clear cache', function () {
      cache.clear().then(function () { toast('Cache cleared.'); renderSheet(); });
    });
  });
});
$('cfOk').addEventListener('click', function () { closeConfirm(true); });
$('cfCancel').addEventListener('click', function () { closeConfirm(false); });
$('srcBtn').addEventListener('click', function () { renderSrcSheet(); $('srcSheet').hidden = false; $('srcDone').focus(); });
$('srcDone').addEventListener('click', function () { $('srcSheet').hidden = true; });
$('srcOnly').addEventListener('click', function () { srcOnly($('srcOnly').dataset.code); });
$('srcSkipEn').addEventListener('click', function () { if (!F.srcOff.has('en')) toggleSrc('en'); });
$('srcAll').addEventListener('click', function () { F.srcOff.clear(); lsSet(LS.srcOff, '[]'); renderLangBtn(); renderSrcSheet(); });
$('setBtn').addEventListener('click', openSettings);
$('setDone').addEventListener('click', closeSettings);
$('aboutBtn').addEventListener('click', openSettings);
document.addEventListener('keydown', onKey);
window.addEventListener('hashchange', function () {
  const slug = K.parseSlug(location.hash);
  if (slug && (!S.channel || S.channel.slug !== slug)) go(slug);
});
setInterval(tickRate, 2000);
loadSettings();
applyLook();
buildLangSelect();
setOriginals(lsGet(LS.orig) !== '0');
renderPill();
renderRecent();
renderLangBtn();
initConsent();
// bookhockeys.com/translate/#channel opens that chat straight away.
(function () {
  const slug = K.parseSlug(location.hash);
  if (slug) { $('chanIn').value = slug; connect(slug); }
})();
