/* Kick Translate - the page: header, channel connect, chat buffer, status
   bar, toasts. Kick URLs live in kick.js, the socket and the line renderer
   in chat.js, languages and translation in translate.js. */
'use strict';

import * as K from './kick.js';
import { chatFeed, renderRow, renderSystem } from './chat.js';
import { TARGETS, langName, browserLang, codeFromName } from './translate.js';

const VERSION = '0.2.0';
const $ = function (id) { return document.getElementById(id); };
const LS = { target: 'kt:target' };
const VIEWER_REFRESH_MS = 60 * 1000;
const MAX_ROWS = 400;

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
  rows: new Map(),      // message id -> {msg, row}, same 400 as the DOM
  pinned: true,         // view is at the bottom, following live
  paused: false,
  newCount: 0           // lines that arrived below the view
};

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
  const mine = browserLang();
  sel.innerHTML = '';
  const ph = new Option('Your language', '');
  ph.disabled = true;
  sel.appendChild(ph);
  // The browser's language first, so it is one click away; the rest A-Z.
  sel.appendChild(new Option(langName(mine) + ' (this browser)', mine));
  TARGETS.filter(function (c) { return c !== mine; })
    .map(function (c) { return { c: c, n: langName(c) }; })
    .sort(function (a, b) { return a.n.localeCompare(b.n); })
    .forEach(function (x) { sel.appendChild(new Option(x.n, x.c)); });
  if (saved && TARGETS.indexOf(saved) !== -1) sel.value = saved;
  else sel.value = '';
  syncLangGlow();
  sel.addEventListener('change', function () {
    lsSet(LS.target, sel.value);
    syncLangGlow();
    track('kt_target_set', { target: sel.value });
  });
}
function syncLangGlow() {
  const sel = $('lang');
  sel.classList.toggle('unset', !sel.value);
}
export function target() { return $('lang').value || ''; }

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
  const code = codeFromName(c.language);
  $('chLang').textContent = c.language ? c.language + ' chat' : 'language not declared';
  $('chLang').dataset.code = code;
  $('chOpen').href = K.channelPage(c.slug);
  document.title = c.name + ' chat - Kick Translate v' + VERSION;
}

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
  if (S.pinned && !S.paused) scrollToLive();
  else { S.newCount++; renderJump(); }
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

function setPaused(p) {
  S.paused = p;
  const b = $('pauseBtn');
  b.classList.toggle('on', p);
  b.setAttribute('aria-pressed', p ? 'true' : 'false');
  b.querySelector('.lbl').textContent = p ? 'Resume' : 'Pause';
  b.querySelector('svg').innerHTML = p ? '<path d="M7 5l12 7-12 7z"/>' : '<path d="M8 5v14M16 5v14"/>';
  if (!p) scrollToLive();
  renderJump();
  setConn(S.status);
}

function onEvent(ev) {
  if (ev.kind === 'message') {
    S.times.push(Date.now());
    const row = renderRow(ev);
    S.rows.set(ev.id, { msg: ev, row: row });
    addRow(row);
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

function tickRate() {
  const cut = Date.now() - 60000;
  while (S.times.length && S.times[0] < cut) S.times.shift();
  $('lpm').textContent = String(S.times.length);
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
  if (!slug) { toast('That does not look like a Kick channel name.', 'err'); $('chanIn').focus(); return; }
  $('chanIn').value = slug;
  $('chanIn').blur();
  connect(slug);
});
$('retryBtn').addEventListener('click', retry);
$('lines').addEventListener('scroll', onScroll, { passive: true });
$('jump').addEventListener('click', function () { if (S.paused) setPaused(false); else scrollToLive(); });
$('pauseBtn').addEventListener('click', function () { setPaused(!S.paused); });
$('errRetry').addEventListener('click', retry);
setInterval(tickRate, 2000);
buildLangSelect();
initConsent();
