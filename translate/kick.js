/* Kick Translate - everything that knows a kick.com URL.
   Channel lookup and the slug parser are Stumble's (book/stumble/kick.js),
   copied rather than imported so a change to one tool never breaks the
   other. No DOM access at import time: tools/selftest.mjs loads this file
   in Node. */
'use strict';

export const CHANNEL_API = 'https://kick.com/api/v2/channels/';

/* The chat relay lives in stumble-worker (Kick's Centrifugo socket only
   accepts kick.com origins). The deployed Worker already allows the local
   `book` dev server's origin, so local testing needs no wrangler dev;
   `?worker=local` points at one anyway (http://127.0.0.1:8787). */
export const WORKER_LIVE = 'https://stumble-worker.sevendwarfs.workers.dev';
export const WORKER_LOCAL = 'http://127.0.0.1:8787';

const SLUG_RE = /^[a-z0-9_-]{1,40}$/;

export function isLocalHost(hostname) {
  const h = hostname || (typeof location !== 'undefined' ? location.hostname : '');
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

export function workerBase() {
  try {
    if (isLocalHost() && new URLSearchParams(location.search).get('worker') === 'local') return WORKER_LOCAL;
  } catch (e) { /* no location under Node */ }
  return WORKER_LIVE;
}

export function relayUrl(channelId, roomId) {
  return workerBase().replace(/^http/, 'ws') + '/chat-ws?channel=' + encodeURIComponent(channelId) +
    '&room=' + encodeURIComponent(roomId);
}

export function channelPage(slug) {
  return 'https://kick.com/' + encodeURIComponent(slug);
}

export function emoteUrl(id) {
  return 'https://files.kick.com/emotes/' + encodeURIComponent(id) + '/fullsize';
}

/* Accepts "name", "@name", "#name", "kick.com/name",
   "https://kick.com/name/videos", "player.kick.com/name?...",
   "kick.com/popout/name/chat". Returns a lowercase slug or null. */
export function parseSlug(input) {
  let s = String(input == null ? '' : input).trim();
  if (!s) return null;
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.|player\.)?kick\.com\/(?:popout\/)?([^\/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^[#@]/, '').replace(/\/+$/, '').toLowerCase();
  try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ }
  return SLUG_RE.test(s) ? s : null;
}

export function imgUrl(v) {
  if (!v) return '';
  if (typeof v === 'object') v = v.src || v.url || '';
  v = String(v);
  return /^https:\/\//i.test(v) ? v : '';
}

function timeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  } catch (e) { /* old browser */ }
  return undefined;
}

/* /api/v2/channels/<slug> -> the fields this page uses. `language` is the
   stream's declared language as Kick spells it ("Japanese"), empty when
   offline. */
export function normalizeChannel(d, slug) {
  const user = d.user || {};
  const ls = d.livestream || null;
  const live = !!(ls && (ls.is_live === undefined || ls.is_live));
  return {
    status: 'ok',
    slug: String(d.slug || slug).toLowerCase(),
    name: user.username || d.slug || slug,
    avatar: imgUrl(user.profile_pic || user.profilepic),
    live: live,
    viewers: ls && typeof ls.viewer_count === 'number' ? ls.viewer_count : 0,
    title: ls ? (ls.session_title || '') : '',
    language: ls ? (ls.language || '') : '',
    userId: d.user_id || user.id || null,
    channelId: d.id || null,
    chatroomId: d.chatroom ? d.chatroom.id : null
  };
}

/* Resolves to {status:'ok', ...channel} | {status:'missing'} |
   {status:'error', reason}. Never rejects. */
export function fetchChannel(slug) {
  const url = CHANNEL_API + encodeURIComponent(slug);
  return fetch(url, { signal: timeoutSignal(10000), credentials: 'omit' }).then(function (res) {
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error', reason: 'http ' + res.status };
    return res.json().then(function (d) {
      if (!d || !d.slug) return { status: 'missing' };
      return normalizeChannel(d, slug);
    }, function () { return { status: 'error', reason: 'not json' }; });
  }, function (e) {
    return { status: 'error', reason: (e && e.name) || 'network' };
  });
}
