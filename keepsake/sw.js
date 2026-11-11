/* Keepsake - app-shell cache (PLAN 2.7).
   Keeps the page's own files so the installed app opens without a network
   and starts fast. Network first, so a new version shows as soon as it is
   online; the cache is only the fallback. Never touches the Worker, Instagram
   or analytics: those are other origins, and this only answers same-origin
   GETs inside /keepsake/. Bump VERSION with the page's version. */
var VERSION = '0.4.0';
var CACHE = 'keepsake-' + VERSION;
var SHELL = [
  './', 'index.html', 'ig.js', 'save.js', 'terms.html', 'manifest.webmanifest',
  'favicon.svg', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png',
  // The GIF maker works offline too: it never needs the network.
  'gifmaker.js', 'vendor/gifenc.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('keepsake-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(new URL('./', self.registration.scope).pathname) !== 0) return;
  // Pages are kept by path, so ?url=... launches share one copy of the page.
  var key = req.mode === 'navigate' ? url.origin + url.pathname : req;
  event.respondWith(fetch(req).then(function (res) {
    // mux.js and the vendored muxer join the cache the first time they load.
    if (res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(key, copy); });
    }
    return res;
  }).catch(function () {
    // Offline: a ?url= or share-target launch still gets the page.
    return caches.match(key, { ignoreSearch: true })
      .then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('./') : null); })
      .then(function (hit) { return hit || Response.error(); });
  }));
});
