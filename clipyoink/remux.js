/* Clip Yoink - ffmpeg.wasm loader + stream-copy remux.
   Loaded lazily by index.html only when Kick has no ready-made MP4, so most
   visits never fetch the 32 MB core. The core is Baited's pinned copy on R2
   (single-threaded, so no SharedArrayBuffer and no COOP/COEP headers); the
   wrapper and its worker chunk are vendored in vendor/ because the worker
   must be same-origin. */
(function () {
  'use strict';

  var CORE_BASE = 'https://pub-516bf519bcaf4ebba2d1e3006fafce78.r2.dev/ffmpeg/0.12.10';
  var CORE = {
    js: {
      url: CORE_BASE + '/ffmpeg-core.js',
      mime: 'text/javascript',
      sha256: 'b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21',
      bytes: 112059
    },
    wasm: {
      url: CORE_BASE + '/ffmpeg-core.wasm',
      mime: 'application/wasm',
      sha256: '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7',
      bytes: 32232419
    }
  };
  var WRAPPER_SRC = 'vendor/ffmpeg.js';

  // No re-encode: copy video and audio as they are, fix AAC framing for MP4,
  // put the index up front. -map drops Kick's timed_id3 data stream on purpose.
  function remuxArgs(input, output) {
    return ['-i', input, '-map', '0:v', '-map', '0:a', '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', output];
  }

  var ffmpeg = null;        // live FFmpeg instance, or null
  var loading = null;       // promise while a load is in flight
  var coreUrls = null;      // verified blob URLs, kept so a reload after Cancel skips the download
  var progressCb = null;
  var logLines = [];

  /* ---------- wrapper script ---------- */

  function loadWrapper() {
    if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = WRAPPER_SRC;
      s.onload = function () {
        if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) resolve();
        else reject(new Error('The vendored ffmpeg wrapper did not load.'));
      };
      s.onerror = function () { reject(new Error('Could not load ' + WRAPPER_SRC)); };
      document.head.appendChild(s);
    });
  }

  /* ---------- core: fetch, verify sha256, blob-wrap (same as Baited) ---------- */

  async function fetchWithProgress(spec, onProgress) {
    var res = await fetch(spec.url);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' fetching ' + spec.url);
    var total = Number(res.headers.get('content-length')) || spec.bytes || 0;
    if (!res.body || !res.body.getReader) {
      var buf = new Uint8Array(await res.arrayBuffer());
      if (onProgress) onProgress(1);
      return buf;
    }
    var reader = res.body.getReader();
    var chunks = [];
    var got = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      got += step.value.length;
      if (onProgress && total) onProgress(Math.min(1, got / total));
    }
    var out = new Uint8Array(got);
    var at = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], at); at += chunks[i].length; }
    return out;
  }

  async function sha256Hex(data) {
    if (!window.crypto || !crypto.subtle || !crypto.subtle.digest) return null;
    var digest = await crypto.subtle.digest('SHA-256', data);
    var view = new Uint8Array(digest);
    var hex = '';
    for (var i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
    return hex;
  }

  async function toVerifiedBlobURL(spec, onProgress) {
    var data = await fetchWithProgress(spec, onProgress);
    var hash = await sha256Hex(data);
    if (hash === null) {
      console.warn('[Clip Yoink] SHA-256 check skipped: WebCrypto is unavailable here (needs https or localhost).');
    } else if (hash !== spec.sha256) {
      throw new Error('Checksum mismatch for ' + spec.url + ' - refusing to run it.');
    }
    return URL.createObjectURL(new Blob([data], { type: spec.mime }));
  }

  /* Resolves to a ready FFmpeg instance. onProgress(fraction 0..1) covers
     the core download; it is called with 1 straight away when already cached. */
  function load(onProgress) {
    if (ffmpeg) { if (onProgress) onProgress(1); return Promise.resolve(ffmpeg); }
    if (loading) return loading;
    loading = (async function () {
      await loadWrapper();
      if (!coreUrls) {
        var js = await toVerifiedBlobURL(CORE.js, null);
        var wasm = await toVerifiedBlobURL(CORE.wasm, onProgress);
        coreUrls = { coreURL: js, wasmURL: wasm };
      } else if (onProgress) {
        onProgress(1);
      }
      var ff = new window.FFmpegWASM.FFmpeg();
      ff.on('progress', function (ev) { if (progressCb) progressCb(ev); });
      ff.on('log', function (ev) { if (ev && ev.message) logLines.push(ev.message); });
      await ff.load(coreUrls);
      ffmpeg = ff;
      return ff;
    })();
    return loading.finally(function () { loading = null; });
  }

  /* Pulls codec + fps out of ffmpeg's input description, e.g.
     "Stream #0:0[0x100]: Video: h264 (High) ..., 1920x1080 ..., 60 fps, ..." */
  function videoInfo(lines) {
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/Video:\s*([a-z0-9_]+)/i);
      if (!m) continue;
      var f = lines[i].match(/([\d.]+)\s*fps/);
      return { codec: m[1].toLowerCase(), fps: f ? Math.round(parseFloat(f[1])) : 0 };
    }
    return { codec: '', fps: 0 };
  }

  /* Remuxes MPEG-TS bytes to MP4 with a stream copy. NOTE: writeFile transfers
     the buffer to the worker, so `ts` is unusable afterwards; on failure the
     result carries the .ts read back from ffmpeg's FS (when the worker is still
     alive) so the caller can offer the raw file.
     Resolves { mp4, info } or rejects with err.ts (Uint8Array|null) attached. */
  async function remux(ts, onProgress) {
    var ff = await load(null);
    var written = [];
    logLines = [];
    progressCb = function (ev) {
      if (onProgress) onProgress(Math.max(0, Math.min(1, ev.progress || 0)));
    };
    try {
      await ff.writeFile('in.ts', ts);
      written.push('in.ts');
      var code = await ff.exec(remuxArgs('in.ts', 'out.mp4'));
      written.push('out.mp4');
      if (code !== 0) throw new Error('ffmpeg exited with code ' + code);
      var data = await ff.readFile('out.mp4');
      if (!data || !data.length) throw new Error('ffmpeg wrote an empty file');
      return { mp4: data, info: videoInfo(logLines) };
    } catch (err) {
      var e = err instanceof Error ? err : new Error(String(err));
      e.ts = null;
      if (written.indexOf('in.ts') !== -1 && ffmpeg) {
        try { e.ts = await ff.readFile('in.ts'); } catch (ignore) { /* worker gone */ }
      }
      throw e;
    } finally {
      progressCb = null;
      // Clear the virtual FS whether it worked or not.
      for (var i = 0; i < written.length; i++) {
        try { await ff.deleteFile(written[i]); } catch (e2) { /* already gone, or the worker is dead */ }
      }
    }
  }

  /* Stops a running exec (Cancel / Esc). The next load() makes a fresh
     instance from the cached blob URLs, so nothing is downloaded again. */
  function abort() {
    if (!ffmpeg) return;
    try { ffmpeg.terminate(); } catch (e) { /* nothing to stop */ }
    ffmpeg = null;
  }

  window.ClipRemux = {
    load: load,
    remux: remux,
    abort: abort,
    remuxArgs: remuxArgs,
    isLoaded: function () { return !!ffmpeg; },
    coreBytes: CORE.wasm.bytes
  };
})();
