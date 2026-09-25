/* Stacked - Kick API + player helpers.
   Everything that knows a kick.com URL lives in this file, so a change on
   Kick's side is a one-line fix here and nowhere else. */
(function () {
  'use strict';

  var API = 'https://kick.com/api/v2/channels/';
  var SLUG_RE = /^[a-z0-9_-]{1,40}$/;

  /* The one place the embed URL is built. Mute state changes by re-creating
     the iframe with a new URL (the embed exposes no volume API). */
  function playerUrl(slug, muted) {
    return 'https://player.kick.com/' + encodeURIComponent(slug) +
      '?autoplay=true&muted=' + (muted ? 'true' : 'false');
  }

  function channelPage(slug) {
    return 'https://kick.com/' + encodeURIComponent(slug);
  }

  /* Accepts "name", "@name", "kick.com/name", "https://kick.com/name/videos",
     "player.kick.com/name?...". Returns a lowercase slug or null. */
  function parseSlug(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return null;
    var m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.|player\.)?kick\.com\/(?:popout\/)?([^\/?#\s]+)/i);
    if (m) s = m[1];
    s = s.replace(/^@/, '').replace(/\/+$/, '').toLowerCase();
    return SLUG_RE.test(s) ? s : null;
  }

  function timeoutSignal(ms) {
    try {
      if (window.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms);
    } catch (e) {}
    return undefined;
  }

  function imgUrl(v) {
    if (!v) return '';
    if (typeof v === 'object') v = v.src || v.url || '';
    v = String(v);
    return /^https:\/\//i.test(v) ? v : '';
  }

  /* Raw API JSON -> the small shape the app uses. */
  function normalize(d, slug) {
    var user = d.user || {};
    var ls = d.livestream || null;
    return {
      status: 'ok',
      slug: String(d.slug || slug).toLowerCase(),
      name: user.username || d.slug || slug,
      avatar: imgUrl(user.profile_pic),
      bio: (user.bio || '').trim(),
      banner: imgUrl(d.offline_banner_image) || imgUrl(user.profile_pic),
      live: !!(ls && (ls.is_live === undefined || ls.is_live)),
      viewers: ls && typeof ls.viewer_count === 'number' ? ls.viewer_count : 0,
      title: ls ? (ls.session_title || '') : '',
      chatroomId: d.chatroom ? d.chatroom.id : null,
      userId: d.user_id || null
    };
  }

  /* Fallback only: the public CORS proxies from chordswarm, used when the
     direct fetch throws (network error or CORS revoked). Never used for 404. */
  function viaProxies(apiUrl, slug) {
    var enc = encodeURIComponent(apiUrl);
    var proxies = [
      'https://api.allorigins.win/get?url=' + enc,
      'https://api.codetabs.com/v1/proxy?quest=' + apiUrl,
      'https://thingproxy.freeboard.io/fetch/' + apiUrl,
      'https://corsproxy.io/?' + enc
    ].sort(function () { return Math.random() - 0.5; });

    var i = 0;
    function next() {
      if (i >= proxies.length) return Promise.resolve({ status: 'error', reason: 'unreachable' });
      var url = proxies[i++];
      return fetch(url, { signal: timeoutSignal(8000) }).then(function (res) {
        if (res.status === 404) return { status: 'missing' };
        if (!res.ok) return next();
        return res.json().then(function (wrapper) {
          if (wrapper && wrapper.status && wrapper.status.http_code === 404) return { status: 'missing' };
          var raw = wrapper && wrapper.contents !== undefined ? wrapper.contents : wrapper;
          var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (data && data.id && data.slug) return normalize(data, slug);
          return next();
        });
      }).catch(function () { return next(); });
    }
    return next();
  }

  /* Resolves to one of:
       { status:'ok', slug, name, avatar, bio, banner, live, viewers, title, ... }
       { status:'missing' }            - Kick says no such channel (404)
       { status:'error', reason }      - could not tell (network, Kick hiccup)
     Never rejects. */
  function fetchChannel(slug) {
    var apiUrl = API + encodeURIComponent(slug);
    return fetch(apiUrl, { signal: timeoutSignal(10000), credentials: 'omit' }).then(function (res) {
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'error', reason: 'http ' + res.status };
      return res.json().then(function (d) {
        if (!d || !d.slug) return { status: 'missing' };
        return normalize(d, slug);
      }, function () {
        // 200 but not JSON: a challenge page. Treat like a thrown fetch.
        return viaProxies(apiUrl, slug);
      });
    }, function () {
      return viaProxies(apiUrl, slug);
    });
  }

  window.Kick = {
    playerUrl: playerUrl,
    channelPage: channelPage,
    parseSlug: parseSlug,
    fetchChannel: fetchChannel
  };
})();
