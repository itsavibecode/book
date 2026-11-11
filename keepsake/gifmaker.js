/* Keepsake - the YouTube GIF tab: a part of a video file, as a GIF.
   YouTube does not let another site read its videos (PLAN 12.5), so this
   works on a video file on the device: pick it, set the start and stop
   markers on the timeline (drag them, type the times, or "Start here" /
   "Stop here" at the playing frame), preview that part on a loop, then
   encode it in the browser with gifenc (vendor/gifenc.js, loaded on first
   use). Nothing is uploaded. Uses window.KeepsakeSave for the save. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SV = window.KeepsakeSave;
  var MAX_SECONDS = 30;
  var MAX_FRAMES = 600;
  var MIN_SECONDS = 0.2;

  var el = {
    drop: $('gifDrop'), file: $('gifFile'), note: $('gifNote'), edit: $('gifEdit'), video: $('gifVideo'),
    track: $('gifTrack'), span: $('gifSpan'), head: $('gifHead'), start: $('gifStart'), stop: $('gifStop'),
    startLab: $('gifStartLab'), stopLab: $('gifStopLab'),
    startIn: $('gifStartIn'), stopIn: $('gifStopIn'), setStart: $('gifSetStart'), setStop: $('gifSetStop'),
    len: $('gifLen'), preview: $('gifPreview'), width: $('gifWidth'), fps: $('gifFps'), loop: $('gifLoop'),
    make: $('gifMake'), work: $('gifWork'), bar: $('gifBar'), workText: $('gifWorkText'), cancel: $('gifCancel'),
    out: $('gifOut'), img: $('gifImg'), outInfo: $('gifOutInfo'), save: $('gifSave'), saveNote: $('gifSaveNote'),
    another: $('gifAnother')
  };
  if (!el.drop) return;

  var src = null;       // object URL of the chosen file
  var baseName = 'clip';
  var dur = 0;
  var a = 0, b = 0;     // the start and stop markers, in seconds
  var previewing = false;
  var job = null;       // { cancelled } while encoding
  var result = null;    // { blob, url, name }

  function note(t) { el.note.textContent = t || ''; el.note.hidden = !t; }
  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }

  function clock(t) {
    t = Math.max(0, t || 0);
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------- choosing a video ---------- */

  function load(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      note('That file is not a video. Pick an MP4, MOV or WebM file.');
      return;
    }
    note('');
    if (src) URL.revokeObjectURL(src);
    clearResult();
    src = URL.createObjectURL(file);
    baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'clip';
    el.video.src = src;
    el.video.load();
  }

  el.file.addEventListener('change', function () { load(el.file.files && el.file.files[0]); el.file.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) {
    el.drop.addEventListener(t, function (e) { e.preventDefault(); el.drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    el.drop.addEventListener(t, function () { el.drop.classList.remove('over'); });
  });
  el.drop.addEventListener('drop', function (e) {
    e.preventDefault();
    load(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  // Browser recordings (WebM from a screen or camera recorder) often carry
  // no length; seeking far past the end makes the browser work it out.
  function knownDuration() {
    var d = el.video.duration;
    if (isFinite(d) && d > 0) return Promise.resolve(d);
    return new Promise(function (resolve) {
      var done = function () {
        if (!isFinite(el.video.duration)) return;
        clearTimeout(timer);
        el.video.removeEventListener('durationchange', done);
        el.video.currentTime = 0;
        resolve(el.video.duration);
      };
      var timer = setTimeout(function () { el.video.removeEventListener('durationchange', done); resolve(0); }, 5000);
      el.video.addEventListener('durationchange', done);
      el.video.currentTime = 1e7;
    });
  }

  el.video.addEventListener('loadedmetadata', function () {
    knownDuration().then(ready);
  });

  function ready(d) {
    dur = d;
    if (!isFinite(dur) || !dur) { note('This video could not be read. Try an MP4 file.'); return; }
    a = 0;
    b = Math.min(dur, 3);
    el.drop.hidden = true;
    el.edit.hidden = false;
    el.width.querySelectorAll('option').forEach(function (o) {
      o.disabled = Number(o.value) > el.video.videoWidth && o.value !== el.width.options[0].value;
    });
    paint();
  }
  el.video.addEventListener('error', function () {
    if (!src) return;
    note('This browser cannot play that video. Try an MP4 (H.264) file.');
  });

  el.another.addEventListener('click', function () {
    stopPreview();
    clearResult();
    el.edit.hidden = true;
    el.drop.hidden = false;
    el.video.removeAttribute('src');
    el.video.load();
    if (src) { URL.revokeObjectURL(src); src = null; }
    el.file.click();
  });

  /* ---------- the start and stop markers ---------- */

  function setRange(na, nb, moved) {
    na = Math.max(0, Math.min(na, dur));
    nb = Math.max(0, Math.min(nb, dur));
    if (moved === 'a') {
      na = Math.min(na, nb - MIN_SECONDS);
      if (nb - na > MAX_SECONDS) nb = na + MAX_SECONDS;
    } else {
      nb = Math.max(nb, na + MIN_SECONDS);
      if (nb - na > MAX_SECONDS) na = nb - MAX_SECONDS;
    }
    a = Math.max(0, na);
    b = Math.min(dur, nb);
    clearResult();
    paint();
  }

  function frames() { return Math.max(1, Math.min(MAX_FRAMES, Math.round((b - a) * Number(el.fps.value)))); }

  function paint() {
    if (!dur) return;
    var pa = (a / dur) * 100;
    var pb = (b / dur) * 100;
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
    var w = outWidth();
    var h = outHeight(w);
    el.len.textContent = 'Length ' + (b - a).toFixed(1) + ' s, ' + frames() + ' frames, ' + w + ' x ' + h;
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
    el.head.style.left = (el.video.currentTime / dur) * 100 + '%';
  }

  function timeAt(clientX) {
    var r = el.track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  }

  function dragMarker(handle, which) {
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.focus();
      var move = function (ev) {
        var t = timeAt(ev.clientX);
        if (which === 'a') setRange(t, b, 'a'); else setRange(a, t, 'b');
        el.video.currentTime = which === 'a' ? a : b;
      };
      var up = function () {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('keydown', function (e) {
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
      el.video.currentTime = which === 'a' ? a : b;
    });
  }
  dragMarker(el.start, 'a');
  dragMarker(el.stop, 'b');

  // A tap on the track (not on a marker) moves the playing position there.
  el.track.addEventListener('pointerdown', function (e) {
    if (e.target === el.start || e.target === el.stop) return;
    el.video.currentTime = timeAt(e.clientX);
  });

  el.startIn.addEventListener('change', function () { setRange(Number(el.startIn.value) || 0, b, 'a'); });
  el.stopIn.addEventListener('change', function () { setRange(a, Number(el.stopIn.value) || 0, 'b'); });
  el.setStart.addEventListener('click', function () { setRange(el.video.currentTime, b, 'a'); });
  el.setStop.addEventListener('click', function () { setRange(a, el.video.currentTime, 'b'); });
  el.fps.addEventListener('change', paint);
  el.width.addEventListener('change', function () { clearResult(); paint(); });
  el.loop.addEventListener('change', clearResult);
  window.addEventListener('resize', function () { if (!el.edit.hidden) paint(); });

  /* ---------- preview: play only the marked part, on a loop ---------- */

  function stopPreview() {
    if (!previewing) return;
    previewing = false;
    el.video.pause();
    el.preview.textContent = 'Play the GIF part';
    el.preview.setAttribute('aria-pressed', 'false');
  }
  el.preview.addEventListener('click', function () {
    if (previewing) { stopPreview(); return; }
    previewing = true;
    el.preview.textContent = 'Stop playing';
    el.preview.setAttribute('aria-pressed', 'true');
    el.video.currentTime = a;
    el.video.play().catch(function () { stopPreview(); });
  });
  el.video.addEventListener('timeupdate', function () {
    paintHead();
    if (previewing && el.video.currentTime >= b) el.video.currentTime = a;
  });
  el.video.addEventListener('seeked', paintHead);
  el.video.addEventListener('pause', function () { if (previewing && !job) stopPreview(); });

  /* ---------- encoding ---------- */

  function outWidth() {
    var vw = el.video.videoWidth || 480;
    return Math.min(Number(el.width.value), vw) & ~1;
  }
  function outHeight(w) {
    var vw = el.video.videoWidth || 16;
    var vh = el.video.videoHeight || 9;
    return Math.max(2, Math.round((w * vh) / vw / 2) * 2);
  }

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

  function seek(t) {
    return new Promise(function (resolve) {
      var done = function () { clearTimeout(timer); el.video.removeEventListener('seeked', done); resolve(); };
      var timer = setTimeout(done, 3000);
      el.video.addEventListener('seeked', done);
      el.video.currentTime = t;
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
    [el.start, el.stop, el.startIn, el.stopIn, el.setStart, el.setStop, el.width, el.fps, el.loop, el.preview, el.another]
      .forEach(function (x) { x.disabled = on; });
  }

  el.cancel.addEventListener('click', function () { if (job) job.cancelled = true; });

  el.make.addEventListener('click', function () {
    if (job || !dur) return;
    stopPreview();
    clearResult();
    var w = outWidth();
    var h = outHeight(w);
    var fps = Number(el.fps.value);
    var n = frames();
    var start = a;
    var stop = b;
    var thisJob = { cancelled: false };
    job = thisJob;
    working(true);
    el.bar.style.width = '0%';
    el.workText.textContent = 'Getting ready';
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    loadEncoder().then(function (g) {
      var enc = g.GIFEncoder();
      var delay = Math.round(1000 / fps);
      var repeat = el.loop.value === 'once' ? -1 : 0;
      var i = 0;
      function next() {
        if (thisJob.cancelled) return Promise.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
        if (i >= n) return Promise.resolve();
        return seek(start + i / fps).then(function () {
          ctx.drawImage(el.video, 0, 0, w, h);
          var data = ctx.getImageData(0, 0, w, h).data;
          var palette = g.quantize(data, 256, { format: 'rgb565' });
          var index = g.applyPalette(data, palette, 'rgb565');
          enc.writeFrame(index, w, h, { palette: palette, delay: delay, repeat: repeat });
          i += 1;
          el.bar.style.width = Math.round((i / n) * 100) + '%';
          el.workText.textContent = 'Frame ' + i + ' of ' + n;
          return next();
        });
      }
      return next().then(function () {
        enc.finish();
        var blob = new Blob([enc.bytes()], { type: 'image/gif' });
        var name = baseName + '_' + start.toFixed(1) + 's-' + stop.toFixed(1) + 's.gif';
        result = { blob: blob, url: URL.createObjectURL(blob), name: name };
        el.img.src = result.url;
        el.img.alt = 'The GIF: ' + clock(start) + ' to ' + clock(stop) + ' of ' + baseName;
        el.outInfo.textContent = w + ' x ' + h + ', ' + n + ' frames, ' + (stop - start).toFixed(1) + ' s, ' + window.KeepsakeIG.bytes(blob.size);
        el.save.textContent = SV.USE_SHARE ? 'Save to Photos' : 'Download GIF';
        el.out.hidden = false;
        el.save.focus();
      });
    }).catch(function (err) {
      if (err && err.cancelled) note('Stopped. Nothing was made.');
      else note('The GIF could not be made in this browser. Try a shorter part or a smaller width.');
    }).then(function () {
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

  window.KeepsakeGif = {
    leave: function () { stopPreview(); if (job) job.cancelled = true; }
  };
})();
