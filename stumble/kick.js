/* Stumble - everything that knows a kick.com URL.
   List scan, channel lookup, category search, player/chat URLs and the
   normalisers live here, so a change on Kick's side is a fix in one file.
   The roll maths (filter matcher, weighted picker, don't-repeat window) also
   lives here because it is pure and the self-test imports it under Node.
   No DOM access at import time: tools/selftest.mjs loads this file in Node. */
'use strict';

export const LIST_URL = 'https://kick.com/stream/livestreams/en';
export const CHANNEL_API = 'https://kick.com/api/v2/channels/';
export const SUBCAT_API = 'https://kick.com/api/v1/subcategories';
/* Probed 2026-10-16: limit=50/64/100 all come back as 32 per page, so 32 is
   Kick's cap. Asking for more only makes the URL longer. */
export const PAGE_SIZE = 32;
export const SCAN_CONCURRENCY = 3;
export const BACKOFF_MS = [2000, 4000, 8000];

const SLUG_RE = /^[a-z0-9_-]{1,40}$/;

/* ---------- URLs ---------- */

/* The one place the embed URL is built. Mute = re-create the iframe with a
   new URL (the embed exposes no volume API). */
export function playerUrl(slug, muted) {
  return 'https://player.kick.com/' + encodeURIComponent(slug) +
    '?autoplay=true&muted=' + (muted ? 'true' : 'false');
}

export function chatUrl(slug) {
  return 'https://kick.com/popout/' + encodeURIComponent(slug) + '/chat';
}

export function channelPage(slug) {
  return 'https://kick.com/' + encodeURIComponent(slug);
}

export function shareUrl(slug) {
  return 'https://bookhockeys.com/stumble/#' + encodeURIComponent(slug);
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

/* ---------- small helpers ---------- */

export function imgUrl(v) {
  if (!v) return '';
  if (typeof v === 'object') v = v.src || v.url || '';
  v = String(v);
  return /^https:\/\//i.test(v) ? v : '';
}

/* Kick sends "YYYY-MM-DD HH:MM:SS" in UTC (no zone marker). */
export function parseKickTime(s) {
  if (!s) return 0;
  const str = String(s).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(str.slice(19))) {
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  const t = Date.parse(str);
  return isNaN(t) ? 0 : t;
}

function timeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  } catch (e) { /* old browser */ }
  return undefined;
}

function sleep(ms, signal) {
  return new Promise(function (resolve) {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', function () { clearTimeout(t); resolve(); }, { once: true });
  });
}

/* ISO language code -> English name, for the official-API fallback which
   sends "en" where the unofficial list sends "English". */
export function languageName(code) {
  if (!code) return '';
  if (code.length > 3) return code;
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    }
  } catch (e) { /* unknown code */ }
  return code;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---------- normalisers ---------- */

/* One item from /stream/livestreams -> the shape the app uses.
   The channel slug is the streamer key everywhere. Note the list sends the
   avatar as `profilepic`; the channel API sends `profile_pic`. */
export function normalizeStream(it) {
  if (!it || !it.channel) return null;
  const ch = it.channel;
  const user = ch.user || {};
  const cats = Array.isArray(it.categories) ? it.categories : [];
  const c0 = cats[0] || null;
  return {
    id: it.id,
    slug: String(ch.slug || '').toLowerCase(),
    streamSlug: it.slug || '',
    userId: ch.user_id || user.id || null,
    channelId: ch.id || it.channel_id || null,
    name: user.username || ch.slug || '',
    avatar: imgUrl(user.profile_pic || user.profilepic || user.profile_picture),
    title: it.session_title || '',
    startedAt: parseKickTime(it.start_time || it.created_at),
    language: it.language || '',
    mature: !!it.is_mature,
    viewers: typeof it.viewer_count === 'number' ? it.viewer_count : (it.viewers || 0),
    thumb: imgUrl(it.thumbnail),
    tags: Array.isArray(it.tags) ? it.tags.slice(0, 12) : [],
    category: c0 ? { id: c0.id, slug: c0.slug, name: c0.name } : null,
    categories: cats.map(function (c) { return { id: c.id, slug: c.slug, name: c.name }; }),
    affiliate: !!ch.is_affiliate
  };
}

/* Official API (/public/v1/livestreams through the Worker) -> same shape.
   Field names per docs.kick.com; written defensively because this path is
   only exercised when the direct list fails. */
export function normalizeOfficial(it) {
  if (!it) return null;
  const cat = it.category || null;
  const slug = String(it.slug || it.channel_slug || '').toLowerCase();
  if (!slug) return null;
  const c = cat ? { id: cat.id, slug: slugify(cat.name || ''), name: cat.name || '' } : null;
  return {
    id: it.channel_id || it.broadcaster_user_id || slug,
    slug: slug,
    streamSlug: '',
    userId: it.broadcaster_user_id || null,
    channelId: it.channel_id || null,
    name: it.slug || slug,
    avatar: imgUrl(it.profile_picture),
    title: it.stream_title || '',
    startedAt: parseKickTime(it.started_at),
    language: languageName(it.language || ''),
    mature: !!it.has_mature_content,
    viewers: it.viewer_count || 0,
    thumb: imgUrl(it.thumbnail),
    tags: Array.isArray(it.custom_tags) ? it.custom_tags.slice(0, 12) : [],
    category: c,
    categories: c ? [c] : [],
    affiliate: false
  };
}

/* /api/v2/channels/<slug> -> channel shape (Stacked's helper, extended). */
export function normalizeChannel(d, slug) {
  const user = d.user || {};
  const ls = d.livestream || null;
  const live = !!(ls && (ls.is_live === undefined || ls.is_live));
  const cats = ls && Array.isArray(ls.categories) ? ls.categories : [];
  const c0 = cats[0] || null;
  return {
    status: 'ok',
    slug: String(d.slug || slug).toLowerCase(),
    name: user.username || d.slug || slug,
    avatar: imgUrl(user.profile_pic || user.profilepic),
    bio: (user.bio || '').trim(),
    live: live,
    viewers: ls && typeof ls.viewer_count === 'number' ? ls.viewer_count : 0,
    title: ls ? (ls.session_title || '') : '',
    startedAt: ls ? parseKickTime(ls.start_time || ls.created_at) : 0,
    language: ls ? (ls.language || '') : '',
    mature: !!(ls && ls.is_mature),
    category: c0 ? { id: c0.id, slug: c0.slug, name: c0.name } : null,
    tags: ls && Array.isArray(ls.tags) ? ls.tags.slice(0, 12) : [],
    verified: !!d.verified,
    affiliate: !!d.is_affiliate,
    userId: d.user_id || user.id || null,
    channelId: d.id || null,
    chatroomId: d.chatroom ? d.chatroom.id : null,
    streamId: ls ? ls.id : null
  };
}

/* A channel lookup turned into a stream for the card (deep links, "Roll
   this one" from Saved). */
export function streamFromChannel(c) {
  return {
    id: c.streamId || ('ch-' + c.slug),
    slug: c.slug,
    streamSlug: '',
    userId: c.userId,
    channelId: c.channelId,
    name: c.name,
    avatar: c.avatar,
    title: c.title,
    startedAt: c.startedAt,
    language: c.language,
    mature: c.mature,
    viewers: c.viewers,
    thumb: '',
    tags: c.tags || [],
    category: c.category,
    categories: c.category ? [c.category] : [],
    affiliate: c.affiliate,
    live: c.live
  };
}

/* ---------- chatters: unique people talking, from Kick's public chat ---------- */

/* Kick's chat rides on a Centrifugo websocket (checked 2026-10-16; the old
   Pusher keys are dead) that only accepts kick.com origins, so the page reads
   it through stumble-worker's /chat-ws relay, which forwards every
   publication frame untouched. Read-only: nothing is ever sent. Counting
   distinct sender ids over a sliding window gives "N chatting", a number Kick
   itself never shows. */
export const CHATTER_WINDOW_MS = 5 * 60 * 1000;

/* Starts counting from relay socket `wsUrl`. `onUpdate({chatters, msgsPerMin,
   status})` fires on every message and every 10 s (so the window can shrink);
   status is 'connecting' | 'live' | 'reconnecting' | 'failed'. Returns {stop}. */
export function chatCounter(wsUrl, onUpdate) {
  const seen = new Map();          // sender id -> last message time
  const times = [];                // message times inside the window
  let ws = null, ready = false, stopped = false, tickTimer = 0, pingTimer = 0, status = 'connecting', attempts = 0;

  function prune(now) {
    const cut = now - CHATTER_WINDOW_MS;
    seen.forEach(function (t, id) { if (t < cut) seen.delete(id); });
    while (times.length && times[0] < cut) times.shift();
  }
  function emit() {
    const now = Date.now();
    prune(now);
    const span = Math.min(CHATTER_WINDOW_MS, Math.max(now - (times[0] || now), 15000));
    onUpdate({ chatters: seen.size, msgsPerMin: times.length / (span / 60000), status: status });
  }
  function setStatus(s) { status = s; emit(); }

  function noteMessage(pub) {
    // pub.data = { event: 'App\\Events\\ChatMessageEvent', data: '<json string>' }
    const d = pub && pub.data;
    if (!d || !/ChatMessage(Sent)?Event$/.test(String(d.event || ''))) return;
    let m = d.data;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
    const sender = (m && (m.sender || m.user)) || {};
    const id = sender.id || sender.user_id || sender.username || sender.slug;
    if (!id) return;
    const now = Date.now();
    seen.set(String(id), now);
    times.push(now);
    emit();
  }

  function open() {
    if (stopped) return;
    try { ws = new WebSocket(wsUrl); } catch (e) { setStatus('failed'); return; }
    const sock = ws;
    ready = false;
    const to = setTimeout(function () { if (!ready && sock === ws) { try { sock.close(); } catch (e) { /* ignore */ } } }, 12000);
    sock.onmessage = function (raw) {
      const text = String(raw.data);
      if (text === '{}') return;                                   // our keep-alive echoed back
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (m.ready) { clearTimeout(to); ready = true; attempts = 0; setStatus('live'); return; }
      if (m.push && m.push.pub) noteMessage(m.push.pub);
    };
    sock.onclose = function () {
      clearTimeout(to);
      if (sock !== ws || stopped) return;
      if (++attempts > 4) { setStatus('failed'); return; }
      setStatus('reconnecting');
      setTimeout(open, 1500 * attempts);
    };
  }

  open();
  tickTimer = setInterval(emit, 10000);
  pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('{}'); }, 25000);
  return {
    stop: function () {
      stopped = true;
      clearInterval(tickTimer); clearInterval(pingTimer);
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }
  };
}

/* ---------- network ---------- */

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

export function listPageUrl(page, subcategory) {
  return LIST_URL + '?page=' + page + '&limit=' + PAGE_SIZE + '&sort=desc' +
    (subcategory ? '&subcategory=' + encodeURIComponent(subcategory) : '');
}

/* One page of the live list with the 2/4/8 s backoff on 429/5xx.
   Resolves {status:'ok', items, next} or {status:'gaveup', code}.
   Rejects only on a network/CORS failure (the caller's fallback cue). */
export async function fetchListPage(page, opts) {
  opts = opts || {};
  const url = listPageUrl(page, opts.subcategory);
  for (let attempt = 0; ; attempt++) {
    if (opts.signal && opts.signal.aborted) return { status: 'aborted' };
    const res = await fetch(url, { credentials: 'omit', signal: opts.signal });
    if (res.ok) {
      let d = null;
      try { d = await res.json(); } catch (e) { return { status: 'gaveup', code: 'json' }; }
      const raw = Array.isArray(d && d.data) ? d.data : [];
      const items = [];
      for (let i = 0; i < raw.length; i++) {
        const s = normalizeStream(raw[i]);
        if (s && s.slug) items.push(s);
      }
      return { status: 'ok', items: items, next: d ? d.next_page_url : null };
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= BACKOFF_MS.length) return { status: 'gaveup', code: res.status };
    if (opts.onBackoff) opts.onBackoff(true, res.status);
    await sleep(BACKOFF_MS[attempt], opts.signal);
    if (opts.onBackoff) opts.onBackoff(false, res.status);
  }
}

/* A scan: page 1 onward, SCAN_CONCURRENCY in flight, stopping when a page's
   last item is under the viewer floor (pages are sorted desc) or Kick says
   there is no next page. Items are handed to onItems as each page lands, so
   the first roll can happen long before the scan ends.
   Resolves {complete, cutByFloor, fetched, pages, gaveUp}. Rejects with
   {network:true} only when page 1 itself could not be fetched at all. */
export function scan(opts) {
  const floor = Math.max(0, opts.floor || 0);
  const fetchPage = opts.fetchPage || fetchListPage;
  const maxPages = opts.maxPages || 2000;
  let nextPage = 1;
  let stopAt = Infinity;
  let fetched = 0;
  let pages = 0;
  let gaveUp = 0;
  let cutByFloor = false;
  let firstError = null;
  let finished = false;
  let inflight = 0;

  return new Promise(function (resolve, reject) {
    function aborted() { return !!(opts.signal && opts.signal.aborted); }
    function finish() {
      if (finished) return;
      finished = true;
      if (firstError) { reject({ network: true, error: firstError }); return; }
      resolve({ complete: !cutByFloor && !aborted(), cutByFloor: cutByFloor, fetched: fetched, pages: pages, gaveUp: gaveUp });
    }
    function moreToDo() { return !aborted() && nextPage <= stopAt && nextPage <= maxPages; }
    function settle() {
      if (moreToDo()) pump();
      else if (inflight === 0) finish();
    }
    function pump() {
      while (inflight < SCAN_CONCURRENCY && moreToDo()) {
        const p = nextPage++;
        inflight++;
        fetchPage(p, { subcategory: opts.subcategory, signal: opts.signal, onBackoff: opts.onBackoff }).then(function (r) {
          inflight--;
          if (r.status === 'ok') {
            pages++;
            fetched += r.items.length;
            if (r.items.length) opts.onItems(r.items, p);
            const last = r.items[r.items.length - 1];
            if (!r.items.length || !r.next) stopAt = Math.min(stopAt, p);
            else if (floor > 0 && last.viewers < floor) { stopAt = Math.min(stopAt, p); cutByFloor = true; }
            if (opts.onProgress) opts.onProgress({ page: p, lastViewers: last ? last.viewers : 0, fetched: fetched });
          } else if (r.status === 'gaveup') {
            gaveUp++;
          }
          settle();
        }, function (err) {
          inflight--;
          if (p === 1) { firstError = err || new Error('network'); stopAt = 0; }
          else gaveUp++;
          settle();
        });
      }
      if (inflight === 0) finish();
    }
    pump();
  });
}

/* Scan progress estimate for the header bar. Kick's list has no total, but
   it is sorted by viewers, so how far the last seen viewer count has fallen
   from the top toward the floor (on a log scale) is an honest proxy. */
export function scanFraction(topViewers, lastViewers, floor) {
  const top = Math.log((topViewers || 1) + 1);
  const end = Math.log(Math.max(floor || 0, 0) + 1);
  const cur = Math.log((lastViewers || 0) + 1);
  if (top <= end) return 1;
  return Math.max(0, Math.min(1, (top - cur) / (top - end)));
}

/* Categories. /api/search answered 400 "Please enter at least 3 characters"
   to every parameter spelling we tried on 2026-10-16 (searchTerm, query, q;
   GET, and POST is 405), so it is not usable from the page. Instead: the
   first five pages of /api/v1/subcategories (sorted by viewers, 32 each)
   with a client-side substring match, plus whatever the pool has seen. */
let subcatCache = null;
export function loadTopCategories() {
  if (subcatCache) return subcatCache;
  const pages = [1, 2, 3, 4, 5].map(function (p) {
    return fetch(SUBCAT_API + '?page=' + p + '&limit=32', { credentials: 'omit', signal: timeoutSignal(10000) })
      .then(function (r) { return r.ok ? r.json() : { data: [] }; })
      .then(function (d) { return Array.isArray(d && d.data) ? d.data : []; }, function () { return []; });
  });
  subcatCache = Promise.all(pages).then(function (lists) {
    const out = [];
    const seen = {};
    lists.forEach(function (l) {
      l.forEach(function (c) {
        if (!c || !c.slug || seen[c.slug]) return;
        seen[c.slug] = 1;
        out.push({ id: c.id, slug: c.slug, name: c.name, viewers: c.viewers || 0 });
      });
    });
    if (!out.length) subcatCache = null; // try again next time
    return out;
  });
  return subcatCache;
}

export function matchCategories(list, term, limit) {
  const t = String(term || '').trim().toLowerCase();
  if (!t) return list.slice(0, limit || 12);
  return list.filter(function (c) {
    return c.name.toLowerCase().indexOf(t) !== -1 || c.slug.indexOf(t) !== -1;
  }).slice(0, limit || 12);
}

/* ---------- filters and the roll ---------- */

export const DEFAULT_FILTERS = Object.freeze({
  minViewers: 10,
  maxViewers: 2000,
  minLiveMin: 0,
  repeatHours: 1,
  mature: true,
  languages: [],
  catInclude: [],
  catExclude: [],
  titleHas: '',
  titleNot: '',
  tagsAny: [],
  tagsNever: [],
  bias: 'underdogs',
  tier: 'any',
  verifiedOnly: false
});

export function splitList(s) {
  return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
}

/* Prepare once per filter change, then match many. */
export function compileFilters(f) {
  f = Object.assign({}, DEFAULT_FILTERS, f || {});
  const maxRaw = f.maxViewers;
  return {
    min: Number(f.minViewers) || 0,
    max: maxRaw === '' || maxRaw == null || Number(maxRaw) <= 0 ? Infinity : Number(maxRaw),
    minLiveMs: Math.max(0, Number(f.minLiveMin) || 0) * 60000,
    mature: !!f.mature,
    langs: (f.languages || []).map(function (x) { return String(x).toLowerCase(); }),
    inc: (f.catInclude || []).map(function (c) { return c.slug; }),
    exc: (f.catExclude || []).map(function (c) { return c.slug; }),
    has: splitList(f.titleHas),
    not: splitList(f.titleNot),
    tagsAny: (f.tagsAny || []).map(function (t) { return String(t).toLowerCase(); }),
    tagsNever: (f.tagsNever || []).map(function (t) { return String(t).toLowerCase(); }),
    tier: f.tier || 'any'
  };
}

/* Does one stream pass the filters? `rec` is our own record for the
   streamer (tags live there), or undefined. Blocked and don't-repeat are
   separate steps so the empty-state message can count "matching" honestly.
   Verified-only is not here: it needs a lookup per streamer, so the roll
   checks it lazily on the drawn candidate. */
export function matches(s, cf, rec, now) {
  if (s.viewers < cf.min || s.viewers > cf.max) return false;
  if (cf.minLiveMs && s.startedAt && (now - s.startedAt) < cf.minLiveMs) return false;
  if (!cf.mature && s.mature) return false;
  if (cf.langs.length && cf.langs.indexOf(String(s.language).toLowerCase()) === -1) return false;
  const cats = s.categories && s.categories.length ? s.categories : (s.category ? [s.category] : []);
  if (cf.inc.length && !cats.some(function (c) { return cf.inc.indexOf(c.slug) !== -1; })) return false;
  if (cf.exc.length && cats.some(function (c) { return cf.exc.indexOf(c.slug) !== -1; })) return false;
  if (cf.tier === 'affiliate' && !s.affiliate) return false;
  if (cf.tier === 'nonaffiliate' && s.affiliate) return false;
  if (cf.has.length || cf.not.length) {
    const title = String(s.title || '').toLowerCase();
    if (cf.has.length && !cf.has.some(function (w) { return title.indexOf(w) !== -1; })) return false;
    if (cf.not.some(function (w) { return title.indexOf(w) !== -1; })) return false;
  }
  if (cf.tagsAny.length || cf.tagsNever.length) {
    const mine = rec && rec.tags ? rec.tags.map(function (t) { return String(t).toLowerCase(); }) : [];
    if (cf.tagsAny.length && !mine.some(function (t) { return cf.tagsAny.indexOf(t) !== -1; })) return false;
    if (mine.some(function (t) { return cf.tagsNever.indexOf(t) !== -1; })) return false;
  }
  return true;
}

/* Slugs rolled within the don't-repeat window, from History. Deriving it
   from History (not from the record's lastSeen) is what makes "Clear
   history" also clear the don't-repeat memory, as its confirm text says. */
export function seenWithin(history, hours, now) {
  const out = {};
  if (!hours || hours <= 0) return out;
  const cutoff = now - hours * 3600000;
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (h && h.t >= cutoff && h.action === 'rolled') out[h.slug] = 1;
  }
  return out;
}

export function weight(viewers, bias) {
  const v = Math.max(0, viewers || 0);
  if (bias === 'underdogs') return 1 / Math.sqrt(v + 10);
  if (bias === 'popular') return Math.log(v + 10);
  return 1;
}

/* Weighted pick. `rand` is injectable so the self-test can check bias. */
export function pickWeighted(list, bias, rand) {
  if (!list.length) return null;
  const r = rand || Math.random;
  if (bias !== 'underdogs' && bias !== 'popular') return list[Math.floor(r() * list.length)];
  let total = 0;
  const w = new Array(list.length);
  for (let i = 0; i < list.length; i++) { w[i] = weight(list[i].viewers, bias); total += w[i]; }
  let x = r() * total;
  for (let i = 0; i < list.length; i++) { x -= w[i]; if (x <= 0) return list[i]; }
  return list[list.length - 1];
}

/* The whole candidate pipeline. Returns {candidates, matching}: matching =
   passes filters and not blocked (what the empty state counts); candidates =
   matching minus the don't-repeat window and the stream on screen. */
export function candidatesFor(pool, filters, streamers, history, now, currentSlug) {
  const cf = compileFilters(filters);
  const seen = seenWithin(history || [], Number(filters.repeatHours) || 0, now);
  const matching = [];
  const candidates = [];
  const bySlug = {};
  pool.forEach(function (s) {
    if (bySlug[s.slug]) return; // one entry per streamer
    const rec = streamers[s.slug];
    if (rec && rec.blocked) return;
    if (!matches(s, cf, rec, now)) return;
    bySlug[s.slug] = 1;
    matching.push(s);
    if (seen[s.slug] || s.slug === currentSlug) return;
    candidates.push(s);
  });
  return { candidates: candidates, matching: matching };
}

/* Language chips: live counts from the pool, most first. */
export function languageCounts(pool) {
  const m = {};
  pool.forEach(function (s) { if (s.language) m[s.language] = (m[s.language] || 0) + 1; });
  return Object.keys(m).map(function (k) { return { name: k, count: m[k] }; })
    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
}

export function categoryCounts(pool) {
  const m = {};
  pool.forEach(function (s) {
    if (!s.category || !s.category.slug) return;
    const k = s.category.slug;
    if (!m[k]) m[k] = { id: s.category.id, slug: k, name: s.category.name, count: 0 };
    m[k].count++;
  });
  return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.count - a.count; });
}
