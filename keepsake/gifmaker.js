/* Keepsake - the YouTube GIF tab: a part of a YouTube video, as a GIF.
   A page cannot read the pixels of YouTube's player, and downloading the
   video is against YouTube's terms (PLAN 12.5), so this records the player
   instead: paste a link, the video plays in YouTube's own embedded player
   (youtube-nocookie.com), set the start and stop markers on the timeline,
   then "Record the GIF" asks the browser for permission to record this tab,
   plays the marked part while recording it as a video, then steps through
   that recording to make the GIF on the device (gifenc, vendor/gifenc.js,
   loaded on first use). Chrome and Edge
   crop the recording to the player exactly (Region Capture); elsewhere the
   player's place on the page is cut out of the tab recording. Tab
   recording needs a desktop browser; phones cannot record a tab. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SV = window.KeepsakeSave;
  var MAX_SECONDS = 30;
  var MAX_FRAMES = 600;
  var MIN_SECONDS = 0.2;
  var LEAD_IN = 6; // seconds played before the start marker, while YouTube's overlay fades
  var WINDOW = 40;  // seconds the timeline shows at once, so a short part is not a sliver

  var el = {
    form: $('gifForm'), url: $('gifUrl'), load: $('gifLoad'), note: $('gifNote'), support: $('gifSupport'),
    edit: $('gifEdit'), frame: $('gifFrame'), play: $('gifPlay'),
    earlier: $('gifEarlier'), later: $('gifLater'), view: $('gifView'),
    track: $('gifTrack'), span: $('gifSpan'), head: $('gifHead'), start: $('gifStart'), stop: $('gifStop'),
    startLab: $('gifStartLab'), stopLab: $('gifStopLab'),
    startIn: $('gifStartIn'), stopIn: $('gifStopIn'), setStart: $('gifSetStart'), setStop: $('gifSetStop'),
    len: $('gifLen'), preview: $('gifPreview'), width: $('gifWidth'), fps: $('gifFps'), loop: $('gifLoop'),
    make: $('gifMake'), work: $('gifWork'), bar: $('gifBar'), workText: $('gifWorkText'), cancel: $('gifCancel'),
    out: $('gifOut'), img: $('gifImg'), outInfo: $('gifOutInfo'), save: $('gifSave'), saveNote: $('gifSaveNote')
  };
  if (!el.form) return;

  // Tab recording: desktop Chrome, Edge and other Chromium browsers. Phones
  // and Safari have no tab recording, so the GIF button explains instead.
  var CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) &&
    !window.matchMedia('(pointer: coarse)').matches;

  var player = null;     // YT.Player
  var apiReady = null;   // promise for the IFrame API
  var videoId = '';
  var dur = 0;
  var a = 0, b = 0;      // the start and stop markers, in seconds
  var vs = 0, ve = 0;    // the stretch of the video the timeline shows
  var previewing = false;
  var job = null;        // { cancelled } while recording
  var result = null;     // { blob, url, name }
  var ticker = null;

  function note(t) { el.note.textContent = t || ''; el.note.hidden = !t; }
  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }

  function clock(t) {
    t = Math.max(0, t || 0);
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------- the link ---------- */

  // watch?v=, youtu.be/, /shorts/, /embed/, /live/, m. and music. hosts; a
  // t= start time becomes the start marker.
  function parseYouTube(text) {
    var s = String(text || '').trim();
    var found = s.match(/https?:\/\/[^\s]+|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s]+/i);
    if (!found) return null;
    var u;
    try { u = new URL(/^https?:/i.test(found[0]) ? found[0] : 'https://' + found[0]); } catch (e) { return null; }
    var host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    var id = null;
    var shorts = false;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      var m = u.pathname.match(/^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) { id = m[2]; shorts = m[1] === 'shorts'; }
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    var t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    var tm = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    var start = tm ? (Number(tm[1] || 0) * 3600 + Number(tm[2] || 0) * 60 + Number(tm[3] || 0)) : 0;
    return { id: id, start: start, shorts: shorts };
  }

  function loadApi() {
    if (apiReady) return apiReady;
    apiReady = new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); resolve(window.YT); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { apiReady = null; reject(new Error('api')); };
      document.head.appendChild(s);
    });
    return apiReady;
  }

  var ERRORS = {
    2: 'That link does not point to a YouTube video.',
    5: 'YouTube could not play this video in the page.',
    100: 'This video is private, removed or not found.',
    101: "This video's owner does not allow it to play on other sites, so it cannot be turned into a GIF here.",
    150: "This video's owner does not allow it to play on other sites, so it cannot be turned into a GIF here."
  };

  function open(link) {
    var v = parseYouTube(link);
    if (!v) { note('That is not a YouTube video link. Links look like youtube.com/watch?v=... or youtu.be/...'); el.url.focus(); return; }
    note('');
    clearResult();
    stopPreview();
    videoId = v.id;
    dur = 0;
    a = v.start;
    b = v.start + 3;
    el.frame.classList.toggle('tall', v.shorts);
    el.edit.hidden = false;
    el.load.disabled = true;
    loadApi().then(function (YT) {
      if (player) {
        player.cueVideoById({ videoId: videoId, startSeconds: a });
        return;
      }
      player = new YT.Player('gifPlayer', {
        host: 'https://www.youtube-nocookie.com',
        videoId: videoId,
        playerVars: { controls: 0, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1, start: Math.floor(a) },
        events: {
          onReady: function () { measure(); },
          onStateChange: onState,
          onError: function (e) { note(ERRORS[e.data] || 'YouTube could not play this video.'); }
        }
      });
    }).catch(function () {
      note("YouTube's player did not load. Check your connection, or a blocker may be stopping youtube.com.");
    }).then(function () { el.load.disabled = false; });
  }

  // The length is known once YouTube has the video's details; cued videos
  // can report 0 until then, so keep asking for a moment.
  function measure() {
    var tries = 0;
    (function again() {
      var d = player && player.getDuration ? player.getDuration() : 0;
      if (d > 0) {
        dur = d;
        vs = 0;
        ve = 0;
        setRange(Math.min(a, Math.max(0, dur - MIN_SECONDS)), Math.min(b, dur), 'b');
        fitView(true);
        paint();
        startTicker();
        return;
      }
      if (++tries < 40) setTimeout(again, 250);
    })();
  }

  function onState(e) {
    var YT = window.YT;
    if (e.data === YT.PlayerState.CUED || e.data === YT.PlayerState.PLAYING) { if (!dur) measure(); }
    el.play.textContent = e.data === YT.PlayerState.PLAYING ? 'Pause' : 'Play';
    el.play.setAttribute('aria-pressed', String(e.data === YT.PlayerState.PLAYING));
    if (previewing && e.data === YT.PlayerState.PAUSED && !job) stopPreview();
  }

  function now() { return player && player.getCurrentTime ? player.getCurrentTime() : 0; }
  function seek(t) { if (player && player.seekTo) player.seekTo(t, true); }

  el.form.addEventListener('submit', function (e) { e.preventDefault(); open(el.url.value); });
  el.url.addEventListener('paste', function (e) {
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (!parseYouTube(text)) return;
    e.preventDefault();
    el.url.value = text.trim();
    open(text);
  });

  el.play.addEventListener('click', function () {
    if (!player || !player.getPlayerState) return;
    stopPreview();
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo(); else player.playVideo();
  });

  /* ---------- the start and stop markers ---------- */

  function setRange(na, nb, moved) {
    if (!dur) { a = na; b = nb; return; }
    na = Math.max(0, Math.min(na, dur));
    nb = Math.max(0, Math.min(nb, dur));
    var side = moved === 'drag-a' ? 'a' : moved === 'drag-b' ? 'b' : moved;
    // A typed or "here" time past the other marker carries that marker
    // along, keeping the part's length; dragging just stops at it.
    var keep = Math.max(MIN_SECONDS, b - a);
    if (!/^drag/.test(moved)) {
      if (side === 'a' && na > nb - MIN_SECONDS) nb = Math.min(dur, na + keep);
      if (side === 'b' && nb < na + MIN_SECONDS) na = Math.max(0, nb - keep);
    }
    if (side === 'a') {
      na = Math.min(na, nb - MIN_SECONDS);
      if (nb - na > MAX_SECONDS) nb = na + MAX_SECONDS;
    } else {
      nb = Math.max(nb, na + MIN_SECONDS);
      if (nb - na > MAX_SECONDS) na = nb - MAX_SECONDS;
    }
    a = Math.max(0, na);
    b = Math.min(dur, nb);
    if (!/^drag/.test(moved)) fitView(false);
    clearResult();
    paint();
  }

  // Keep both markers in view: a 40 s stretch around them, or the whole
  // video when it is shorter.
  function fitView(force) {
    var span = Math.min(dur, WINDOW);
    if (!force && a >= vs && b <= ve && ve - vs === span) return;
    var mid = (a + b) / 2;
    vs = Math.max(0, Math.min(dur - span, mid - span / 2));
    ve = vs + span;
  }
  function pan(dir) {
    var span = ve - vs;
    vs = Math.max(0, Math.min(dur - span, vs + dir * span * 0.75));
    ve = vs + span;
    paint();
  }
  function pct(t) { return ((Math.max(vs, Math.min(ve, t)) - vs) / Math.max(0.001, ve - vs)) * 100; }

  function frames() { return Math.max(1, Math.min(MAX_FRAMES, Math.round((b - a) * Number(el.fps.value)))); }

  function outSize() {
    var r = el.frame.getBoundingClientRect();
    var w = Math.min(Number(el.width.value), Math.round(r.width * (window.devicePixelRatio || 1))) & ~1;
    var h = Math.max(2, Math.round((w * r.height) / Math.max(1, r.width) / 2) * 2);
    return { w: w, h: h };
  }

  function paint() {
    if (!dur) return;
    var pa = pct(a);
    var pb = pct(b);
    el.start.style.visibility = a < vs || a > ve ? 'hidden' : '';
    el.stop.style.visibility = b < vs || b > ve ? 'hidden' : '';
    var whole = vs <= 0 && ve >= dur;
    el.view.textContent = whole ? 'Showing the whole video, ' + clock(dur) : 'Showing ' + clock(vs) + ' to ' + clock(ve) + ' of ' + clock(dur);
    el.earlier.disabled = !!job || vs <= 0;
    el.later.disabled = !!job || ve >= dur;
    el.start.style.left = pa + '%';
    el.stop.style.left = pb + '%';
    el.span.style.left = pa + '%';
    el.span.style.width = Math.max(0, pb - pa) + '%';
    el.start.setAttribute('aria-valuenow', a.toFixed(1));
    el.start.setAttribute('aria-valuetext', 'Start at ' + clock(a));
    el.start.setAttribute('aria-valuemax', dur.toFixed(1));
    el.stop.setAttribute('aria-valuenow', b.toFixed(1));
    el.stop.setAttribute('aria-valuetext', 'Stop at ' + clock(b));
    el.stop.setAttribute('aria-valuemax', dur.toFixed(1));
    if (document.activeElement !== el.startIn) el.startIn.value = a.toFixed(1);
    if (document.activeElement !== el.stopIn) el.stopIn.value = b.toFixed(1);
    el.startIn.max = el.stopIn.max = dur.toFixed(1);
    el.startLab.textContent = 'Start ' + clock(a);
    el.stopLab.textContent = 'Stop ' + clock(b);
    placeLabels(pa, pb);
    var size = outSize();
    el.len.textContent = 'Length ' + (b - a).toFixed(1) + ' s, ' + frames() + ' frames, ' + size.w + ' x ' + size.h;
    paintHead();
  }

  /* The start label sits left of its marker, the stop label right of its
     own, both kept inside the track. */
  function placeLabels(pa, pb) {
    var tw = el.track.clientWidth || 1;
    var ax = (pa / 100) * tw;
    var bx = (pb / 100) * tw;
    var aw = el.startLab.offsetWidth;
    var bw = el.stopLab.offsetWidth;
    var al = Math.max(0, Math.min(ax - aw, tw - aw - bw - 4));
    var bl = Math.min(tw - bw, Math.max(bx, al + aw + 4));
    el.startLab.style.left = al + 'px';
    el.stopLab.style.left = bl + 'px';
  }

  function paintHead() {
    if (!dur) return;
    var t = now();
    el.head.style.visibility = t < vs || t > ve ? 'hidden' : '';
    el.head.style.left = pct(t) + '%';
  }

  // The player reports its time only when asked: follow it a few times a
  // second for the playhead and the preview loop.
  function startTicker() {
    if (ticker) return;
    ticker = setInterval(function () {
      if (el.edit.hidden) return;
      paintHead();
      if (previewing && !job && now() >= b) seek(a);
    }, 100);
  }

  function timeAt(clientX) {
    var r = el.track.getBoundingClientRect();
    return vs + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (ve - vs);
  }

  function dragMarker(handle, which) {
    handle.addEventListener('pointerdown', function (e) {
      if (!dur || handle.disabled) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.focus();
      var move = function (ev) {
        var t = timeAt(ev.clientX);
        if (which === 'a') setRange(t, b, 'drag-a'); else setRange(a, t, 'drag-b');
      };
      var up = function () {
        seek(which === 'a' ? a : b);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('keydown', function (e) {
      if (!dur) return;
      var step = e.shiftKey ? 1 : 0.1;
      var t = which === 'a' ? a : b;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t -= step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t += step;
      else if (e.key === 'Home') t = 0;
      else if (e.key === 'End') t = dur;
      else return;
      e.preventDefault();
      e.stopPropagation();
      if (which === 'a') setRange(t, b, 'a'); else setRange(a, t, 'b');
      seek(which === 'a' ? a : b);
    });
  }
  dragMarker(el.start, 'a');
  dragMarker(el.stop, 'b');

  // A tap on the strip (not on a marker) moves the player there.
  el.track.addEventListener('pointerdown', function (e) {
    if (!dur || e.target === el.start || e.target === el.stop || job) return;
    seek(timeAt(e.clientX));
  });

  el.earlier.addEventListener('click', function () { pan(-1); });
  el.later.addEventListener('click', function () { pan(1); });
  el.startIn.addEventListener('change', function () { setRange(Number(el.startIn.value) || 0, b, 'a'); });
  el.stopIn.addEventListener('change', function () { setRange(a, Number(el.stopIn.value) || 0, 'b'); });
  el.setStart.addEventListener('click', function () { setRange(now(), b, 'a'); });
  el.setStop.addEventListener('click', function () { setRange(a, now(), 'b'); });
  el.fps.addEventListener('change', paint);
  el.width.addEventListener('change', function () { clearResult(); paint(); });
  el.loop.addEventListener('change', clearResult);
  window.addEventListener('resize', function () { if (!el.edit.hidden) paint(); });

  /* ---------- preview: play only the marked part, on a loop ---------- */

  function stopPreview() {
    if (!previewing) return;
    previewing = false;
    if (player && player.pauseVideo) player.pauseVideo();
    el.preview.textContent = 'Play the GIF part';
    el.preview.setAttribute('aria-pressed', 'false');
  }
  el.preview.addEventListener('click', function () {
    if (!player || !dur) return;
    if (previewing) { stopPreview(); return; }
    previewing = true;
    el.preview.textContent = 'Stop playing';
    el.preview.setAttribute('aria-pressed', 'true');
    seek(a);
    player.playVideo();
  });

  /* ---------- recording ---------- */

  var gifenc = null;
  function loadEncoder() {
    if (gifenc) return Promise.resolve(gifenc);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'vendor/gifenc.js';
      s.onload = function () { gifenc = window.gifenc; gifenc ? resolve(gifenc) : reject(new Error('encoder missing')); };
      s.onerror = function () { reject(new Error('encoder did not load')); };
      document.head.appendChild(s);
    });
  }

  function clearResult() {
    if (result) { URL.revokeObjectURL(result.url); result = null; }
    el.out.hidden = true;
    el.saveNote.textContent = '';
  }

  function working(on) {
    el.work.hidden = !on;
    el.make.hidden = on;
    el.frame.classList.toggle('recording', on);
    [el.start, el.stop, el.startIn, el.stopIn, el.setStart, el.setStop, el.width, el.fps, el.loop, el.preview, el.play, el.load, el.url, el.earlier, el.later]
      .forEach(function (x) { x.disabled = on; });
    if (!on) paint();
  }

  // Resolves once the player is past `t` and playing (an ad or buffering
  // keeps the clock still, and nothing is recorded until it moves).
  function untilPlaying(t, job) {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function check() {
        if (job.cancelled) { reject(Object.assign(new Error('cancelled'), { cancelled: true })); return; }
        var playing = player.getPlayerState() === window.YT.PlayerState.PLAYING;
        if (playing && now() >= t) { resolve(); return; }
        if (++tries > 400) { reject(new Error('the video did not start')); return; }
        setTimeout(check, 50);
      })();
    });
  }

  // Records the tab (already cropped to the player where the browser can)
  // as a video until the player passes `stop`. Recording first and making
  // the GIF afterwards keeps every frame: encoding while playing dropped
  // about half of them. Resolves { blob, from } where `from` is the
  // player's time when recording began.
  function recordPart(stream, stop, job) {
    return new Promise(function (resolve, reject) {
      var types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      var type = types.filter(function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); })[0];
      var rec;
      try {
        rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12000000 } : { videoBitsPerSecond: 12000000 });
      } catch (e) { reject(e); return; }
      var chunks = [];
      var from = now();
      var cancelled = false;
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        if (cancelled) reject(Object.assign(new Error('cancelled'), { cancelled: true }));
        else resolve({ blob: new Blob(chunks, { type: rec.mimeType || type || 'video/webm' }), from: from });
      };
      rec.onerror = function () { reject(new Error('recorder')); };
      rec.start(250);
      (function check() {
        if (job.cancelled) { cancelled = true; rec.stop(); return; }
        var t = now();
        el.bar.style.width = Math.min(100, Math.round(((t - from) / Math.max(0.1, stop - from)) * 100)) + '%';
        el.workText.textContent = 'Recording ' + clock(t) + ' of ' + clock(stop);
        if (t >= stop) { rec.stop(); return; }
        setTimeout(check, 50);
      })();
    });
  }

  function seekVideo(v, t) {
    return new Promise(function (resolve) {
      var done = function () { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); };
      var timer = setTimeout(done, 3000);
      v.addEventListener('seeked', done);
      v.currentTime = t;
    });
  }

  // Recorded WebM carries no length; seeking far past the end makes the
  // browser work it out.
  function lengthOf(v) {
    if (isFinite(v.duration) && v.duration > 0) return Promise.resolve(v.duration);
    return new Promise(function (resolve) {
      var done = function () {
        if (!isFinite(v.duration)) return;
        clearTimeout(timer);
        v.removeEventListener('durationchange', done);
        resolve(v.duration);
      };
      var timer = setTimeout(function () { v.removeEventListener('durationchange', done); resolve(0); }, 5000);
      v.addEventListener('durationchange', done);
      v.currentTime = 1e7;
    });
  }

  // Steps through the recording at the chosen frame rate and writes each
  // frame into the GIF, cut down to the player when the browser could not
  // crop the recording itself.
  function encodeFrom(blob, size, fps, length, cropRect, job) {
    var g = gifenc;
    var v = document.createElement('video');
    var url = URL.createObjectURL(blob);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    var canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var enc = g.GIFEncoder();
    var repeat = el.loop.value === 'once' ? -1 : 0;
    var delay = Math.round(1000 / fps);
    return new Promise(function (resolve, reject) {
      v.addEventListener('loadedmetadata', function () { resolve(); }, { once: true });
      v.addEventListener('error', function () { reject(new Error('recording unreadable')); }, { once: true });
    }).then(function () {
      return lengthOf(v);
    }).then(function (recorded) {
      var span = Math.min(length, recorded || length);
      var n = Math.max(1, Math.min(MAX_FRAMES, Math.round(span * fps)));
      var i = 0;
      function next() {
        if (job.cancelled) return Promise.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
        if (i >= n) return Promise.resolve(n);
        return seekVideo(v, i / fps + 0.001).then(function () {
          var vw = v.videoWidth;
          var vh = v.videoHeight;
          if (cropRect) ctx.drawImage(v, cropRect.x * vw, cropRect.y * vh, cropRect.w * vw, cropRect.h * vh, 0, 0, size.w, size.h);
          else ctx.drawImage(v, 0, 0, vw, vh, 0, 0, size.w, size.h);
          var data = ctx.getImageData(0, 0, size.w, size.h).data;
          var palette = g.quantize(data, 256, { format: 'rgb565' });
          var index = g.applyPalette(data, palette, 'rgb565');
          enc.writeFrame(index, size.w, size.h, { palette: palette, delay: delay, repeat: repeat });
          i += 1;
          el.bar.style.width = Math.round((i / n) * 100) + '%';
          el.workText.textContent = 'Making the GIF, frame ' + i + ' of ' + n;
          return next();
        });
      }
      return next();
    }).then(function (count) {
      enc.finish();
      return { blob: new Blob([enc.bytes()], { type: 'image/gif' }), count: count };
    }).then(function (r) {
      URL.revokeObjectURL(url);
      return r;
    }, function (err) {
      URL.revokeObjectURL(url);
      throw err;
    });
  }

  el.cancel.addEventListener('click', function () { if (job) job.cancelled = true; });

  el.make.addEventListener('click', function () {
    if (job || !player || !dur) return;
    if (!CAN_RECORD) return;
    stopPreview();
    clearResult();
    player.pauseVideo();
    seek(a);
    // A GIF has no sound, and a muted player may start without a fresh tap
    // (the permission prompt uses up the click that started all this).
    var wasMuted = player.isMuted();
    player.mute();
    el.frame.scrollIntoView({ block: 'center' });
    var thisJob = { cancelled: false };
    job = thisJob;
    working(true);
    el.bar.style.width = '0%';
    el.workText.textContent = 'Allow recording this tab when your browser asks';
    var stream = null;
    var size = outSize();
    var fps = Number(el.fps.value);
    var start = a;
    var stop = b;
    var cropRect = null; // without Region Capture: the player's place in the tab, as fractions

    loadEncoder().then(function () {
      return navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude'
      });
    }).then(function (s) {
      stream = s;
      var track = stream.getVideoTracks()[0];
      track.addEventListener('ended', function () { thisJob.cancelled = true; });
      var surface = track.getSettings().displaySurface;
      if (surface && surface !== 'browser') {
        throw Object.assign(new Error('surface'), { surface: true });
      }
      // Chrome and Edge crop the recording to the player itself.
      return window.CropTarget && track.cropTo
        ? window.CropTarget.fromElement(el.frame).then(function (t) { return track.cropTo(t); }).then(function () { return true; }, function () { return false; })
        : false;
    }).then(function (cropped) {
      if (!cropped) {
        var r = el.frame.getBoundingClientRect();
        cropRect = { x: r.left / window.innerWidth, y: r.top / window.innerHeight, w: r.width / window.innerWidth, h: r.height / window.innerHeight };
      }
      // YouTube shows its title and a pause sign for a few seconds after
      // playback starts, so play from a little before the start marker and
      // begin recording only once the video reaches it.
      el.workText.textContent = 'Starting the video';
      seek(Math.max(0, start - LEAD_IN));
      player.playVideo();
      return untilPlaying(start, thisJob);
    }).then(function () {
      return recordPart(stream, stop, thisJob);
    }).then(function (rec) {
      player.pauseVideo();
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
      return encodeFrom(rec.blob, size, fps, stop - rec.from, cropRect, thisJob);
    }).then(function (done) {
      var blob = done.blob;
      var name = 'youtube_' + videoId + '_' + start.toFixed(1) + 's-' + stop.toFixed(1) + 's.gif';
      result = { blob: blob, url: URL.createObjectURL(blob), name: name };
      el.img.src = result.url;
      el.img.alt = 'The GIF: ' + clock(start) + ' to ' + clock(stop) + ' of the YouTube video';
      el.outInfo.textContent = size.w + ' x ' + size.h + ', ' + done.count + ' frames, ' + (stop - start).toFixed(1) + ' s, ' + window.KeepsakeIG.bytes(blob.size);
      el.save.textContent = SV.USE_SHARE ? 'Save to Photos' : 'Download GIF';
      el.out.hidden = false;
      el.save.focus();
      track('keepsake_resolve', { method: 'youtube-record', platform: 'youtube' });
    }).catch(function (err) {
      if (player && player.pauseVideo) player.pauseVideo();
      if (err && err.cancelled) note('Stopped. Nothing was made.');
      else if (err && err.surface) note('Pick "This tab" when your browser asks. A window or the whole screen cannot be cut down to the player.');
      else if (err && err.name === 'NotAllowedError') note('Recording was not allowed, so no GIF was made. Press Record the GIF to be asked again.');
      else note('The GIF could not be recorded in this browser. Try Chrome or Edge on a computer.');
    }).then(function () {
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      if (!wasMuted && player.unMute) player.unMute();
      job = null;
      working(false);
    });
  });

  el.save.addEventListener('click', function () {
    if (!result) return;
    if (SV.USE_SHARE) {
      var f = new File([result.blob], result.name, { type: 'image/gif' });
      SV.shareFile(f).then(function (r) {
        el.saveNote.textContent = r === 'shared' ? 'Saved through the share sheet.'
          : r === 'needs-tap' ? 'Tap Save to Photos once more.' : 'Share sheet closed.';
        if (r === 'shared') track('keepsake_save', { method: 'gif-share' });
      });
      return;
    }
    SV.downloadBlob(result.blob, result.name);
    el.saveNote.textContent = 'Saved ' + result.name + '.';
    track('keepsake_save', { method: 'gif' });
  });

  // Phones and Safari: the player and markers still work for finding the
  // moment, but the record button says why it cannot run here.
  el.support.hidden = CAN_RECORD;
  el.make.setAttribute('aria-describedby', 'gifSupport');
  if (!CAN_RECORD) {
    el.make.disabled = true;
    el.make.textContent = 'Recording needs a computer';
  }

  window.KeepsakeGif = {
    parse: parseYouTube,
    open: function (link) { el.url.value = link; open(link); },
    leave: function () { stopPreview(); if (job) job.cancelled = true; if (player && player.pauseVideo) player.pauseVideo(); }
  };
})();
