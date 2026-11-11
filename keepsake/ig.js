/* Keepsake - link and post helpers for Instagram, Snapchat and X.
   Link parsing (which platform a link belongs to), the /resolve call to
   keepsake-worker, the error copy for each cause and platform, and the
   filename rule. No DOM in here. */
(function () {
  'use strict';

  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? 'http://127.0.0.1:8799' : 'https://keepsake-worker.sevendwarfs.workers.dev';
  var RESOLVE_TIMEOUT_MS = 20000; // the Worker's own budget is 15 s

  var NAMES = { instagram: 'Instagram', snapchat: 'Snapchat', x: 'X' };
  var IG_HOST = /^(?:www\.|m\.)?instagram\.com$/i;
  var SNAP_HOST = /^(?:www\.)?(?:snapchat\.com|story\.snapchat\.com|t\.snapchat\.com)$/i;
  var X_HOST = /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/i;
  var SNAP_USER = /^@?([A-Za-z][A-Za-z0-9._-]{1,30})$/;

  /* ---------- link parsing ---------- */

  /* Finds the first link in the text (a share often puts a sentence around
     it) and says which platform it belongs to. Returns
       { platform, url }             a link the Worker resolves
       { platform: 'snapchat', user } a bare username typed on the Snapchat tab
       { error }                     'empty' or 'link'
     The Worker checks the exact path rules again. */
  function parseLink(input, tab) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return { error: 'empty' };
    if (tab === 'snapchat' && SNAP_USER.test(s)) return { platform: 'snapchat', user: s.replace(/^@/, '') };
    var found = s.match(/https?:\/\/[^\s]+|(?:www\.|m\.|mobile\.)?(?:instagram\.com|snapchat\.com|story\.snapchat\.com|t\.snapchat\.com|x\.com|twitter\.com)\/[^\s]+/i);
    if (!found) return { error: 'link', platform: tab };
    var u;
    try { u = new URL(/^https?:/i.test(found[0]) ? found[0] : 'https://' + found[0]); } catch (e) { return { error: 'link', platform: tab }; }
    if (IG_HOST.test(u.hostname)) {
      // The Worker follows /share/ links to the post they point at.
      if (/^\/share\//.test(u.pathname)) return { platform: 'instagram', url: u.toString() };
      if (!/^\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]{5,}/.test(u.pathname)) return { error: 'link', platform: 'instagram' };
      return { platform: 'instagram', url: u.toString() };
    }
    if (SNAP_HOST.test(u.hostname)) return { platform: 'snapchat', url: u.toString() };
    if (X_HOST.test(u.hostname)) {
      if (!/\/status(?:es)?\/\d{5,}/.test(u.pathname)) return { error: 'link', platform: 'x' };
      return { platform: 'x', url: u.toString() };
    }
    return { error: 'link', platform: tab };
  }

  /* ---------- /resolve ---------- */

  function fail(cause, detail) {
    var e = new Error(cause);
    e.cause = cause;
    e.detail = detail || '';
    return e;
  }

  /* POST the parsed link; resolves to { platform, post } (Instagram, X) or
     { platform, profile } (Snapchat), shapes in keepsake-worker, or rejects
     with an Error whose .cause is one of the error keys below. */
  function resolve(link, signal) {
    var timer = new AbortController();
    var t = setTimeout(function () { timer.abort(); }, RESOLVE_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', function () { timer.abort(); });
    var body = link.user ? { platform: 'snapchat', user: link.user } : { url: link.url };
    return fetch(API + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timer.signal
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        clearTimeout(t);
        if (b && b.ok && (b.post || b.profile)) return { platform: b.platform || 'instagram', post: b.post, profile: b.profile };
        throw fail((b && b.cause) || 'changed', b && b.detail);
      });
    }, function (err) {
      clearTimeout(t);
      if (signal && signal.aborted) throw fail('cancelled');
      throw fail('network', err && err.message);
    });
  }

  /* ---------- copy (PLAN 2.5, per platform) ---------- */

  var ERRORS = {
    instagram: {
      link: ['That is not an Instagram post link.', 'Links look like instagram.com/p/... or instagram.com/reel/...'],
      share: ['Instagram did not say which post this share link opens.', 'Open it in the Instagram app, tap Share, then Copy link, and paste that link instead.'],
      private: ['Instagram will not show this post without a login.', 'It is private, deleted, or age-gated. Keepsake only works on public posts.'],
      login: ['Instagram is asking us to log in right now.', 'This usually passes in a few minutes. Try again, or open the post on instagram.com to confirm it is public.']
    },
    snapchat: {
      link: ['That is not a Snapchat profile link or username.', 'Type a username like nasa, or paste a snapchat.com/add/... link.'],
      private: ['Snapchat has no public profile with that name.', 'Check the spelling. Private accounts and friends-only stories are out of reach.'],
      empty: ['This profile has nothing public to save right now.', 'Its story is empty and it has no highlights or Spotlight videos.']
    },
    x: {
      link: ['That is not a link to an X post.', 'Links look like x.com/name/status/... Copy it from the post with Share, then Copy link.'],
      private: ['X will not show this post.', 'It may be deleted, from a protected account, or age-restricted. Keepsake only works on public posts.'],
      nomedia: ['This post has no photo or video.', 'Keepsake saves media; a text-only post has nothing to save.']
    },
    any: {
      ratelimit: ['{p} is slowing us down.', 'Wait a minute and try again.'],
      limited: ['Keepsake is limiting requests from your connection.', 'Wait a minute and try again.'],
      changed: ['{p} changed something on its side and this could not be read.', 'This tool is maintained; try again later.'],
      expired: ['The download link {p} gave us has expired.', 'Fetch it again.'],
      network: ["Could not reach Keepsake's server.", 'Check your connection and retry.']
    }
  };

  function errorCopy(cause, platform) {
    var p = platform || 'instagram';
    var copy = (ERRORS[p] && ERRORS[p][cause]) || ERRORS.any[cause] || ERRORS.any.changed;
    return copy.map(function (line) { return line.replace('{p}', NAMES[p] || 'Instagram'); });
  }

  /* ---------- names and numbers ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Local calendar date, YYYY-MM-DD, or '' when unknown. */
  function isoDay(unix) {
    if (!unix) return '';
    var d = new Date(unix * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* <username>_<YYYY-MM-DD>_<code>[_<n>].<ext>, so a folder of saves sorts
     by account, then date. The index only appears when there are several.
     The code is the post's shortcode or id, or a Snapchat story or
     highlight name. */
  function filename(post, item) {
    var user = String(post.username || post.platform || 'keepsake').replace(/[^A-Za-z0-9._-]/g, '');
    var parts = [user || 'keepsake'];
    var day = isoDay(item.takenAt || post.takenAt);
    if (day) parts.push(day);
    parts.push(post.shortcode);
    if (post.items.length > 1) parts.push(String(item.index));
    var ext = item.kind === 'video' ? 'mp4' : (item.image.ext || 'jpg');
    return parts.join('_') + '.' + ext;
  }

  function zipName(post) {
    return filename(post, { index: 0, kind: 'photo', image: { ext: 'zip' } }).replace(/_0\.zip$/, '.zip');
  }

  function bytes(n) {
    if (n == null || !isFinite(n)) return '';
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  }

  function duration(sec) {
    if (!sec || !isFinite(sec)) return '';
    var s = Math.floor(sec); // the way video players count, so 59.8 s reads 0:59 in both places
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  /* The URL that makes the Worker send Content-Disposition: attachment. */
  function downloadUrl(proxyUrl, name) {
    return proxyUrl + '&dl=1&n=' + encodeURIComponent(name);
  }

  window.KeepsakeIG = {
    API: API,
    NAMES: NAMES,
    parseLink: parseLink,
    resolve: resolve,
    errorCopy: errorCopy,
    isoDay: isoDay,
    filename: filename,
    zipName: zipName,
    bytes: bytes,
    duration: duration,
    downloadUrl: downloadUrl
  };
})();
