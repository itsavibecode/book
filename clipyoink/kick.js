/* Clip Yoink - Kick clip helpers.
   Everything that knows a kick.com or clips.kick.com URL lives in this file:
   link parsing, the clip metadata call, the fast-path MP4 check, the HLS
   playlist parser and the byte-range segment fetcher. No DOM in here, so a
   change on Kick's side is a fix in this one file. */
(function () {
  'use strict';

  var API = 'https://kick.com/api/v2/clips/';
  var TMP = 'https://clips.kick.com/tmp/';
  var META_TIMEOUT_MS = 15000;
  var SEGMENT_TIMEOUT_MS = 60000;
  var ID_RE = /clip_([0-9A-Za-z]{26})(?![0-9A-Za-z])/;
  var SLUG_RE = /^[A-Za-z0-9_-]{1,40}$/;

  /* ---------- link parsing ---------- */

  /* Accepts kick.com/<ch>/clips/<id>, kick.com/<ch>?clip=<id> (any query
     order), kick.com/clips/<id>, www./m./player. prefixes, a bare clip_ id,
     and any text that contains a clip id. Tracking params are ignored because
     only the id is kept. Returns { id, channel } (channel may be null) or null. */
  function parseClipInput(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return null;
    var m = s.match(ID_RE);
    if (!m) return null;
    var id = 'clip_' + m[1].toUpperCase();
    var channel = null;
    var u = s.match(/(?:^|\/\/|\s)(?:www\.|m\.|player\.)?kick\.com\/([^\/?#\s]+)/i);
    if (u && SLUG_RE.test(u[1]) && u[1].toLowerCase() !== 'clips' && u[1].indexOf('clip_') !== 0) {
      channel = u[1].toLowerCase();
    }
    return { id: id, channel: channel };
  }

  function clipPageUrl(slug, id) {
    return 'https://kick.com/' + encodeURIComponent(slug) + '/clips/' + encodeURIComponent(id);
  }

  function channelPageUrl(slug) {
    return 'https://kick.com/' + encodeURIComponent(slug);
  }

  /* ---------- small fetch helpers ---------- */

  /* One signal that fires on the caller's abort OR after ms. */
  function withTimeout(signal, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () {
      ctl.abort(new DOMException('Timed out', 'TimeoutError'));
    }, ms);
    function onAbort() { ctl.abort(signal.reason); }
    if (signal) {
      if (signal.aborted) ctl.abort(signal.reason);
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    return {
      signal: ctl.signal,
      done: function () {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    };
  }

  function isAbort(err) {
    return !!err && (err.name === 'AbortError' || err.code === 20);
  }

  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      var t = setTimeout(done, ms);
      function done() { if (signal) signal.removeEventListener('abort', stop); resolve(); }
      function stop() { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }
      if (signal) signal.addEventListener('abort', stop, { once: true });
    });
  }

  function httpsOnly(v) {
    v = v == null ? '' : String(v);
    return /^https:\/\//i.test(v) ? v : '';
  }

  /* ---------- clip metadata ---------- */

  function normalize(c) {
    var ch = c.channel || {};
    var cr = c.creator || {};
    var cat = c.category || {};
    return {
      id: c.id,
      title: (c.title || '').trim(),
      duration: Number(c.duration) || 0,
      playlist: httpsOnly(c.clip_url || c.video_url),
      thumbnail: httpsOnly(c.thumbnail_url),
      privacy: c.privacy || '',
      mature: !!c.is_mature,
      views: typeof c.view_count === 'number' ? c.view_count : (Number(c.views) || 0),
      likes: typeof c.likes_count === 'number' ? c.likes_count : (Number(c.likes) || 0),
      createdAt: c.created_at || '',
      channel: { slug: String(ch.slug || '').toLowerCase(), name: ch.username || ch.slug || '', avatar: httpsOnly(ch.profile_picture) },
      creator: { slug: String(cr.slug || '').toLowerCase(), name: cr.username || cr.slug || '' },
      category: cat.name || ''
    };
  }

  /* Resolves to one of:
       { status:'ok', clip }      public clip, normalized
       { status:'missing' }       404, or not public (deleted / private)
       { status:'error', reason } network, timeout, Kick hiccup, challenge page
     Rejects only when the caller's signal aborts. */
  function fetchClip(id, signal) {
    var t = withTimeout(signal, META_TIMEOUT_MS);
    return fetch(API + encodeURIComponent(id), { signal: t.signal, credentials: 'omit' }).then(function (res) {
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'error', reason: 'http ' + res.status };
      return res.json().then(function (d) {
        var c = d && d.clip;
        if (!c || !c.id) return { status: 'missing' };
        if (c.privacy !== 'public') return { status: 'missing' };
        var clip = normalize(c);
        if (!clip.playlist) return { status: 'error', reason: 'no playlist' };
        return { status: 'ok', clip: clip };
      }, function () {
        return { status: 'error', reason: 'not json' };   // a challenge page, most likely
      });
    }).catch(function (err) {
      if (signal && signal.aborted) throw err;
      return { status: 'error', reason: err && err.name === 'TimeoutError' ? 'timeout' : 'network' };
    }).finally(t.done);
  }

  /* ---------- fast path: Kick's own ready-made MP4 ---------- */

  function tmpMp4Url(id) {
    return TMP + encodeURIComponent(id) + '.mp4';
  }

  /* Anything but 200 is a miss (a miss is 403, not 404). Resolves to
     { hit, bytes } and never rejects unless the caller aborts. */
  function checkTmpMp4(id, signal) {
    var t = withTimeout(signal, META_TIMEOUT_MS);
    return fetch(tmpMp4Url(id), { method: 'HEAD', signal: t.signal, credentials: 'omit' }).then(function (res) {
      return { hit: res.status === 200, bytes: Number(res.headers.get('content-length')) || 0 };
    }).catch(function (err) {
      if (signal && signal.aborted) throw err;
      return { hit: false, bytes: 0 };
    }).finally(t.done);
  }

  /* GET with streamed progress. onProgress(gotBytes, totalBytes). */
  function fetchBytes(url, opts) {
    opts = opts || {};
    return fetch(url, { signal: opts.signal, credentials: 'omit', headers: opts.headers }).then(function (res) {
      if (!(res.status === 200 || res.status === 206)) throw new Error('HTTP ' + res.status);
      var total = Number(res.headers.get('content-length')) || opts.expected || 0;
      if (!res.body || !res.body.getReader) {
        return res.arrayBuffer().then(function (b) { return { status: res.status, bytes: new Uint8Array(b) }; });
      }
      var reader = res.body.getReader();
      var chunks = [], got = 0;
      function pump() {
        return reader.read().then(function (step) {
          if (step.done) return;
          chunks.push(step.value);
          got += step.value.length;
          if (opts.onProgress) opts.onProgress(got, total);
          return pump();
        });
      }
      return pump().then(function () {
        var out = new Uint8Array(got), at = 0;
        for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], at); at += chunks[i].length; }
        chunks = null;
        return { status: res.status, bytes: out };
      });
    });
  }

  /* ---------- HLS playlist ---------- */

  /* Every media entry as { url, offset, length, duration }. offset/length are
     null when the entry has no #EXT-X-BYTERANGE (a whole file). A BYTERANGE
     without "@offset" continues where the previous range of the same file ended. */
  function parseByteRanges(text, baseUrl) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    var pending = null, dur = 0;
    var lastEnd = {};
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXT-X-BYTERANGE:') === 0) {
        var m = line.slice(17).match(/^(\d+)(?:@(\d+))?/);
        if (m) pending = { length: Number(m[1]), offset: m[2] != null ? Number(m[2]) : null };
        continue;
      }
      if (line.indexOf('#EXTINF:') === 0) { dur = parseFloat(line.slice(8)) || 0; continue; }
      if (line.charAt(0) === '#') continue;
      var url = new URL(line, baseUrl).href;
      var seg = { url: url, offset: null, length: null, duration: dur };
      if (pending) {
        seg.length = pending.length;
        seg.offset = pending.offset != null ? pending.offset : (lastEnd[url] || 0);
        lastEnd[url] = seg.offset + seg.length;
      }
      out.push(seg);
      pending = null; dur = 0;
    }
    return out;
  }

  function fetchPlaylist(url, signal) {
    var t = withTimeout(signal, META_TIMEOUT_MS);
    return fetch(url, { signal: t.signal, credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('playlist HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      var segs = parseByteRanges(text, url);
      if (!segs.length) throw new Error('playlist has no segments');
      return segs;
    }).finally(t.done);
  }

  /* Sum of the BYTERANGE lengths, or 0 when any entry is a whole file. */
  function expectedBytes(segs) {
    var n = 0;
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].length == null) return 0;
      n += segs[i].length;
    }
    return n;
  }

  /* ---------- segment fetcher ---------- */

  function fetchSegment(seg, signal) {
    var headers;
    if (seg.length != null) headers = { Range: 'bytes=' + seg.offset + '-' + (seg.offset + seg.length - 1) };
    // A stalled segment times out after 60 s and is retried like any other failure.
    var t = withTimeout(signal, SEGMENT_TIMEOUT_MS);
    return fetchBytes(seg.url, { signal: t.signal, headers: headers }).finally(t.done).then(function (r) {
      var b = r.bytes;
      if (seg.length == null) return b;
      // A server that ignores Range sends the whole file with a 200: cut our part out.
      if (r.status === 200 && b.length > seg.length) b = b.subarray(seg.offset, seg.offset + seg.length);
      if (b.length !== seg.length) throw new Error('short segment: ' + b.length + ' of ' + seg.length + ' bytes');
      return b;
    });
  }

  function fetchSegmentRetry(seg, signal, retries) {
    var attempt = 0;
    function go() {
      return fetchSegment(seg, signal).catch(function (err) {
        if ((signal && signal.aborted) || isAbort(err) || attempt >= retries) throw err;
        attempt++;
        return sleep(500 * Math.pow(2, attempt - 1), signal).then(go);   // 0.5 s, 1 s, 2 s
      });
    }
    return go();
  }

  /* Fetches every segment, `concurrency` at a time, each retried `retries`
     times with backoff, and returns ONE Uint8Array in playlist order. When the
     total is known it is allocated once and each segment is copied straight
     into place, so peak memory is the clip plus the few segments in flight.
     onProgress(segmentsDone, segmentsTotal, bytesDone). */
  function fetchSegments(segs, opts) {
    opts = opts || {};
    var signal = opts.signal;
    var concurrency = opts.concurrency || 4;
    var retries = opts.retries == null ? 3 : opts.retries;
    var total = expectedBytes(segs);
    var out = total ? new Uint8Array(total) : null;
    var parts = total ? null : new Array(segs.length);
    var starts = [], at = 0;
    for (var i = 0; i < segs.length; i++) { starts.push(at); at += segs[i].length || 0; }
    var next = 0, done = 0, bytes = 0;

    function worker() {
      if (signal && signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      if (next >= segs.length) return Promise.resolve();
      var idx = next++;
      return fetchSegmentRetry(segs[idx], signal, retries).then(function (b) {
        if (out) out.set(b, starts[idx]); else parts[idx] = b;
        done++; bytes += b.length;
        if (opts.onProgress) opts.onProgress(done, segs.length, bytes);
        return worker();
      });
    }

    var lanes = [];
    for (var k = 0; k < Math.min(concurrency, segs.length); k++) lanes.push(worker());
    return Promise.all(lanes).then(function () {
      if (out) return out;
      var n = 0, j;
      for (j = 0; j < parts.length; j++) n += parts[j].length;
      var joined = new Uint8Array(n), pos = 0;
      for (j = 0; j < parts.length; j++) { joined.set(parts[j], pos); pos += parts[j].length; }
      return joined;
    });
  }

  /* ---------- filenames ---------- */

  function slugify(s, max) {
    var t = String(s || '');
    try { t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    t = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (max && t.length > max) t = t.slice(0, max).replace(/-+$/, '');
    return t;
  }

  /* <channel>_<title-slug>.<ext>, or <channel>_<clip-id>.<ext> when the title
     slugs to nothing (a title of "." is common). */
  function fileName(clip, ext) {
    var ch = slugify(clip.channel.slug || clip.channel.name, 40) || 'kick';
    var t = slugify(clip.title, 60);
    return ch + '_' + (t || clip.id) + '.' + ext;
  }

  window.ClipKick = {
    parseClipInput: parseClipInput,
    clipPageUrl: clipPageUrl,
    channelPageUrl: channelPageUrl,
    fetchClip: fetchClip,
    tmpMp4Url: tmpMp4Url,
    checkTmpMp4: checkTmpMp4,
    fetchBytes: fetchBytes,
    fetchPlaylist: fetchPlaylist,
    parseByteRanges: parseByteRanges,
    expectedBytes: expectedBytes,
    fetchSegments: fetchSegments,
    fileName: fileName,
    slugify: slugify,
    isAbort: isAbort
  };
})();
