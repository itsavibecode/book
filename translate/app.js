/* Kick Translate - the page: header, channel connect, chat buffer, the
   per-line translation flow, status bar, toasts and modals. Kick URLs live
   in kick.js, the socket and the line renderer in chat.js, languages and
   the translation pipeline in translate.js. */
'use strict';

import * as K from './kick.js';
import { chatFeed, renderRow, renderSystem, el } from './chat.js';
import * as T from './translate.js';

const VERSION = '0.3.0';
const $ = function (id) { return document.getElementById(id); };
const LS = { target: 'kt:target', cloud: 'kt:cloud', orig: 'kt:originals' };
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
  dlPair: null          // the pair the download bar is offering
};

const OD = T.createOnDevice();
const cache = T.createCache();
const engine = T.createEngine({
  onDevice: OD,
  cloud: function () { return [T.google]; },
  consent: function () { return lsGet(LS.cloud) || 'ask'; },
  askConsent: askCloud,
  onDownloadable: offerDownload,
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
  let reason = T.skipReason(rec.c);
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
    return;
  }
  if (res.provider !== 'device') { S.lastCloud = Date.now(); S.lastCloudName = res.provider; renderPill(); }
  const same = res.src === tgt || T.clean(res.text).text.toLowerCase() === job.text.toLowerCase();
  cache.put(job.text, tgt, { text: same ? '' : res.text, src: same ? tgt : res.src, provider: res.provider });
  if (same) { hideWait(rec); markSkip(rec, 'already ' + T.langName(tgt)); return; }
  S.stats.translated++;
  showTr(rec, res.text, res.src || job.src, res.provider);
}

const PROVIDER_TIP = {
  device: 'Translated on this device: nothing was sent',
  cache: 'From the cache: seen this line before, nothing was sent',
  google: 'Translated by Google: the text of this line was sent to it'
};

function clearTr(rec) {
  rec.row.classList.remove('has-tr');
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
  t.appendChild(el('span', 'tt', text));
  const kind = provider === 'device' ? 'local' : provider === 'cache' ? 'cache' : 'cloud';
  const d = el('span', 'pd ' + kind);
  d.title = PROVIDER_TIP[provider] || ('Translated by ' + provider + ': the text of this line was sent to it');
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
  const key = reason.indexOf('already') === 0 ? 'already your language' : reason;
  S.stats.reasons[key] = (S.stats.reasons[key] || 0) + 1;
  setSkipNote(rec, reason);
  renderStats();
}

function addChip(rec) {
  rec.state = rec.state === 'failed' ? 'failed' : 'chip';
  if (rec.row.querySelector('.chip')) return;
  const b = el('button', 'chip', 'Translate');
  b.type = 'button';
  b.title = 'Translate this line now';
  b.addEventListener('click', function () { process(rec, true); });
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
  const device = OD.hasTranslator && !OD.isBroken();
  if (Date.now() - S.lastCloud < CLOUD_RECENT_MS && consent === 'yes') {
    const n = S.lastCloudName === 'google' ? 'Google' : S.lastCloudName;
    return { kind: 'cloud', text: 'Cloud: ' + n, cloud: n, sb: n + ' (cloud)',
      tip: 'The text of chat lines is sent to ' + n + ' to translate. Names, badges and the channel are not. Click to change.' };
  }
  if (device) return { kind: 'local', text: 'On this device', sb: 'on this device',
    tip: 'Translations run inside this browser (its built-in translator). Nothing leaves your machine. Click to change the cloud choice.' };
  if (consent === 'no') return { kind: 'off', text: 'Not translating', sb: 'not translating',
    tip: 'This browser has no on-device translator and cloud translation is off. Click to change.' };
  return { kind: 'cloud', text: 'Cloud: Google', cloud: 'Google', sb: 'Google (cloud)',
    tip: 'This browser cannot translate on the device, so the text of chat lines goes to Google. Names, badges and the channel do not. Click to change.' };
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
  $('cloudWhy').textContent = OD.hasTranslator && !OD.isBroken()
    ? 'Some lines are in a language this browser cannot translate on the device yet, so they would be sent to Google to translate into ' + tgt + '.'
    : 'This browser has no on-device translator, so chat lines would be sent to Google to translate into ' + tgt + '.';
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
  if (S.offered.has(k) || S.dlPair) return;
  S.offered.add(k);
  S.dlPair = { src: src, tgt: tgt };
  $('dlText').textContent = T.langName(src) + ' to ' + T.langName(tgt) + ' can run on this device, so those lines never leave it.';
  $('dlBtn').textContent = 'Download ' + T.langName(src) + ' to ' + T.langName(tgt) + ' (one time)';
  $('dlBar').hidden = false;
}

async function startDownload() {
  const p = S.dlPair;
  if (!p) return;
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
  OD.initDetector();   // inside the click, so a first-time model download is allowed
  const slug = K.parseSlug($('chanIn').value);
  if (!slug) { toast('That does not look like a Kick channel name.', 'err'); $('chanIn').focus(); return; }
  $('chanIn').value = slug;
  $('chanIn').blur();
  connect(slug);
});
$('retryBtn').addEventListener('click', retry);
$('lines').addEventListener('scroll', onScroll, { passive: true });
$('jump').addEventListener('click', function () { if (S.paused) setPaused(false); else scrollToLive(); });
$('pauseBtn').addEventListener('click', function () { setPaused(!S.paused); });
$('origBtn').addEventListener('click', function () { setOriginals($('chat').classList.contains('hideorig')); });
$('errRetry').addEventListener('click', retry);
$('pill').addEventListener('click', openCloudChoice);
$('cloudYes').addEventListener('click', function () { answerCloud(true); });
$('cloudNo').addEventListener('click', function () { answerCloud(false); });
$('dlBtn').addEventListener('click', startDownload);
$('dlClose').addEventListener('click', function () { $('dlBar').hidden = true; S.dlPair = null; });
document.addEventListener('keydown', function (e) {
  // Esc never closes the cloud question: it needs an answer.
  if (e.key === 'Escape' && !$('dlBar').hidden) { $('dlBar').hidden = true; S.dlPair = null; }
});
setInterval(tickRate, 2000);
buildLangSelect();
setOriginals(lsGet(LS.orig) !== '0');
renderPill();
initConsent();
