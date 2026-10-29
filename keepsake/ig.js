/* Keepsake - Instagram link and post helpers.
   Link parsing, the /resolve call to keepsake-worker, the error copy for each
   cause, and the filename rule. No DOM in here. */
(function () {
  'use strict';

  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? 'http://127.0.0.1:8799' : 'https://keepsake-worker.sevendwarfs.workers.dev';
  var RESOLVE_TIMEOUT_MS = 20000; // the Worker's own budget is 15 s
  var HOSTS = /^(?:www\.|m\.)?instagram\.com$/i;

  /* ---------- link parsing ---------- */

  /* The first instagram.com link in the text (Instagram's share often puts
     a sentence around it). Returns { shortcode, url } or { error }:
     'link' when there is no post link, 'share' for instagram.com/share/
     links, which need a redirect lookup that arrives in M2. Same rules as
     the Worker's parseLink. */
  function parseLink(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return { error: 'empty' };
    var found = s.match(/https?:\/\/[^\s]+|(?:www\.|m\.)?instagram\.com\/[^\s]+/i);
    if (!found) return { error: 'link' };
    var u;
    try { u = new URL(/^https?:/i.test(found[0]) ? found[0] : 'https://' + found[0]); } catch (e) { return { error: 'link' }; }
    if (!HOSTS.test(u.hostname)) return { error: 'link' };
    if (/^\/share\//.test(u.pathname)) return { error: 'share' };
    var m = u.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/);
    if (!m) return { error: 'link' };
    return { shortcode: m[1], url: u.toString() };
  }

  /* ---------- /resolve ---------- */

  function fail(cause, detail) {
    var e = new Error(cause);
    e.cause = cause;
    e.detail = detail || '';
    return e;
  }

  /* POST the link; resolves to the post (shape in keepsake-worker/src/post.js)
     or rejects with an Error whose .cause is one of the ERRORS keys. */
  function resolve(url, signal) {
    var timer = new AbortController();
    var t = setTimeout(function () { timer.abort(); }, RESOLVE_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', function () { timer.abort(); });
    return fetch(API + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url }),
      signal: timer.signal
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        clearTimeout(t);
        if (body && body.ok && body.post) return body.post;
        throw fail((body && body.cause) || 'changed', body && body.detail);
      });
    }, function (err) {
      clearTimeout(t);
      if (signal && signal.aborted) throw fail('cancelled');
      throw fail('network', err && err.message);
    });
  }

  /* ---------- copy (PLAN 2.5) ---------- */

  var ERRORS = {
    link: ['That is not an Instagram post link.', 'Links look like instagram.com/p/... or instagram.com/reel/...'],
    share: ['Share links do not work here yet.', 'In Instagram tap Share, then Copy link, and paste that link instead.'],
    private: ['Instagram will not show this post without a login.', 'It is private, deleted, or age-gated. Keepsake only works on public posts.'],
    login: ['Instagram is asking us to log in right now.', 'This usually passes in a few minutes. Try again, or open the post on instagram.com to confirm it is public.'],
    ratelimit: ['Instagram is slowing us down.', 'Wait a minute and try again.'],
    limited: ['Keepsake is limiting requests from your connection.', 'Wait a minute and try again.'],
    changed: ['Instagram changed something on its side and the post could not be read.', 'This tool is maintained; try again later.'],
    expired: ['The download link Instagram gave us has expired.', 'Fetch the post again.'],
    network: ["Could not reach Keepsake's server.", 'Check your connection and retry.']
  };

  /* ---------- names and numbers ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Local calendar date of the post, YYYY-MM-DD, or '' when unknown. */
  function isoDay(unix) {
    if (!unix) return '';
    var d = new Date(unix * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* <username>_<YYYY-MM-DD>_<shortcode>[_<n>].<ext>, so a folder of saves
     sorts by account, then date. The index only appears on carousels. */
  function filename(post, item) {
    var user = String(post.username || 'instagram').replace(/[^A-Za-z0-9._-]/g, '');
    var parts = [user || 'instagram'];
    var day = isoDay(post.takenAt);
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
    var s = Math.round(sec);
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  /* The URL that makes the Worker send Content-Disposition: attachment. */
  function downloadUrl(proxyUrl, name) {
    return proxyUrl + '&dl=1&n=' + encodeURIComponent(name);
  }

  window.KeepsakeIG = {
    API: API,
    parseLink: parseLink,
    resolve: resolve,
    ERRORS: ERRORS,
    isoDay: isoDay,
    filename: filename,
    zipName: zipName,
    bytes: bytes,
    duration: duration,
    downloadUrl: downloadUrl
  };
})();
