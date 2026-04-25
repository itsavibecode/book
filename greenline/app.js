/* Green Line — Auto Meme Generator
 * Loads face-api.js from a CDN, detects faces + landmarks, draws a green
 * censor bar across the eyes for every face, then stamps a watermark.
 * Runs entirely client-side. No upload, no analytics on the photo itself.
 */
(function () {
  'use strict';

  // CDN sources. jsdelivr mirrors the face-api.js repo, including model weights.
  var FACEAPI_SRC = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
  var MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

  var dropEl = document.getElementById('drop');
  var fileEl = document.getElementById('file');
  var statusEl = document.getElementById('status');
  var canvasEl = document.getElementById('canvas');
  var canvasWrap = document.getElementById('canvasWrap');
  var resetBtn = document.getElementById('resetBtn');
  var downloadBtn = document.getElementById('downloadBtn');
  var shareBtn = document.getElementById('shareBtn');
  var shareFallback = document.getElementById('shareFallback');
  var shareTwitter = document.getElementById('shareTwitter');
  var shareFacebook = document.getElementById('shareFacebook');
  var shareReddit = document.getElementById('shareReddit');
  var copyLinkBtn = document.getElementById('copyLinkBtn');

  var SITE_URL = 'https://bookhockeys.com/greenline/';
  var SHARE_TEXT = 'I just made a Green Line meme — auto-detect, auto-draw. Try it:';

  function track(eventName, params) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', eventName, params || {});
    } catch (e) { /* analytics must never break UX */ }
  }

  var ctx = canvasEl.getContext('2d');
  var modelsReady = false;
  var modelsLoading = null;
  var currentImage = null;

  // Preload the BookHockeys logo for use as a watermark.
  var watermarkImg = new Image();
  var watermarkLoaded = new Promise(function (resolve) {
    watermarkImg.onload = function () { resolve(true); };
    watermarkImg.onerror = function () { resolve(false); };
  });
  watermarkImg.src = '../logo.png';

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', !!isError);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureModels() {
    if (modelsReady) return Promise.resolve();
    if (modelsLoading) return modelsLoading;

    setStatus('Loading face-detection model… (first time only)');
    modelsLoading = loadScript(FACEAPI_SRC).then(function () {
      if (!window.faceapi) throw new Error('face-api.js failed to initialize.');
      return Promise.all([
        window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
      ]);
    }).then(function () {
      modelsReady = true;
    }).catch(function (err) {
      modelsLoading = null;
      throw err;
    });

    return modelsLoading;
  }

  function readFileAsImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Please choose an image file.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('Could not decode image.')); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsDataURL(file);
    });
  }

  // Cap the long edge so detection is fast on phones and the canvas stays sane.
  var MAX_DIM = 1600;
  function fitDimensions(w, h) {
    var scale = Math.min(1, MAX_DIM / Math.max(w, h));
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }

  // Compute oriented bar from two eye-corner points.
  // Returns rectangle vertices, padded outward to fully cover the eyes.
  function eyeBarPolygon(leftCorner, rightCorner, faceBox) {
    var dx = rightCorner.x - leftCorner.x;
    var dy = rightCorner.y - leftCorner.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return null;

    var ux = dx / len, uy = dy / len;     // along the eye line
    var nx = -uy, ny = ux;                // perpendicular (downward in face)

    // Extend beyond eye corners horizontally and pad vertically.
    var faceW = Math.max(faceBox.width, len);
    var extend = faceW * 0.18;            // how far past each outer eye corner
    var thickness = Math.max(faceBox.height * 0.13, 14);

    var x1 = leftCorner.x - ux * extend;
    var y1 = leftCorner.y - uy * extend;
    var x2 = rightCorner.x + ux * extend;
    var y2 = rightCorner.y + uy * extend;

    var halfT = thickness / 2;
    return [
      { x: x1 + nx * halfT, y: y1 + ny * halfT },
      { x: x2 + nx * halfT, y: y2 + ny * halfT },
      { x: x2 - nx * halfT, y: y2 - ny * halfT },
      { x: x1 - nx * halfT, y: y1 - ny * halfT }
    ];
  }

  function drawPolygon(c, pts, fill, stroke, strokeW) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = strokeW || 2; c.stroke(); }
  }

  // 68-point landmark indices: left eye 36..41, right eye 42..47.
  // Outer corners are 36 (left) and 45 (right).
  function drawGreenLines(detections) {
    detections.forEach(function (det) {
      var pts = det.landmarks.positions;
      var left = pts[36];
      var right = pts[45];
      var poly = eyeBarPolygon(left, right, det.detection.box);
      if (!poly) return;

      // Drop shadow for punch
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = Math.max(3, det.detection.box.width * 0.012);
      ctx.shadowOffsetY = Math.max(3, det.detection.box.width * 0.012);
      drawPolygon(ctx, poly, '#39ff14', '#0a0a0a', Math.max(3, det.detection.box.width * 0.012));
      ctx.restore();
    });
  }

  // Watermark: small semi-transparent BookHockeys logo, lower-right.
  function drawWatermark() {
    if (!watermarkImg.complete || !watermarkImg.naturalWidth) return;
    var w = canvasEl.width, h = canvasEl.height;
    var pad = Math.max(10, Math.round(Math.min(w, h) * 0.018));
    var maxDim = Math.min(w, h) * 0.18;
    var iw = watermarkImg.naturalWidth;
    var ih = watermarkImg.naturalHeight;
    var scale = Math.min(maxDim / iw, maxDim / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(watermarkImg, w - dw - pad, h - dh - pad, dw, dh);
    ctx.restore();
  }

  function showCanvas() {
    canvasWrap.classList.add('visible');
    resetBtn.disabled = false;
  }

  function reset() {
    currentImage = null;
    canvasWrap.classList.remove('visible');
    resetBtn.disabled = true;
    downloadBtn.disabled = true;
    shareBtn.disabled = true;
    shareFallback.hidden = true;
    fileEl.value = '';
    setStatus('Pick an image to get started.');
  }

  function canvasToBlob() {
    return new Promise(function (resolve, reject) {
      canvasEl.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error('Could not export image.'));
      }, 'image/png');
    });
  }

  function buildFallbackShareLinks() {
    var u = encodeURIComponent(SITE_URL);
    var t = encodeURIComponent(SHARE_TEXT);
    shareTwitter.href = 'https://twitter.com/intent/tweet?url=' + u + '&text=' + t;
    shareFacebook.href = 'https://www.facebook.com/sharer/sharer.php?u=' + u;
    shareReddit.href = 'https://www.reddit.com/submit?url=' + u + '&title=' + t;
  }
  buildFallbackShareLinks();

  function nativeShare() {
    return canvasToBlob().then(function (blob) {
      var file = new File([blob], 'greenline-' + Date.now() + '.png', { type: 'image/png' });
      var data = { title: 'Green Line Meme', text: SHARE_TEXT, url: SITE_URL };
      // Only include files if the platform claims it can share them.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        data.files = [file];
      }
      if (navigator.share) {
        return navigator.share(data).then(function () { return true; });
      }
      return false;
    });
  }

  function processImage(img) {
    var dims = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);
    canvasEl.width = dims.w;
    canvasEl.height = dims.h;
    ctx.drawImage(img, 0, 0, dims.w, dims.h);
    showCanvas();
    setStatus('Detecting faces…');

    return ensureModels().then(function () {
      var options = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
      return Promise.all([
        window.faceapi.detectAllFaces(canvasEl, options).withFaceLandmarks(true),
        watermarkLoaded
      ]);
    }).then(function (results) {
      var detections = results[0];
      var count = detections ? detections.length : 0;
      if (count === 0) {
        setStatus('No faces detected — try a clearer photo. Watermark added anyway.');
        drawWatermark();
        downloadBtn.disabled = false;
        shareBtn.disabled = false;
        track('detect_complete', { faces: 0 });
        return;
      }
      drawGreenLines(detections);
      drawWatermark();
      downloadBtn.disabled = false;
      shareBtn.disabled = false;
      setStatus('Drew green lines on ' + count + ' face' + (count === 1 ? '' : 's') + '. Hit DOWNLOAD or SHARE.');
      track('detect_complete', { faces: count });
    });
  }

  function handleFile(file) {
    setStatus('Loading image…');
    downloadBtn.disabled = true;
    readFileAsImage(file)
      .then(function (img) {
        currentImage = img;
        return processImage(img);
      })
      .catch(function (err) {
        console.error(err);
        setStatus(err.message || 'Something went wrong.', true);
      });
  }

  // ---- Wire up UI ----

  fileEl.addEventListener('change', function () {
    if (fileEl.files && fileEl.files[0]) handleFile(fileEl.files[0]);
  });

  // Click on the drop label opens file picker (label[for] handles it via the
  // nested input). Drag and drop:
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropEl.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropEl.classList.remove('dragover');
    });
  });
  dropEl.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) handleFile(files[0]);
  });

  // Paste from clipboard
  window.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { handleFile(f); break; }
      }
    }
  });

  resetBtn.addEventListener('click', reset);

  downloadBtn.addEventListener('click', function () {
    if (downloadBtn.disabled) return;
    canvasEl.toBlob(function (blob) {
      if (!blob) { setStatus('Could not export image.', true); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'greenline-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      track('download');
    }, 'image/png');
  });

  shareBtn.addEventListener('click', function () {
    if (shareBtn.disabled) return;
    track('share_click');
    nativeShare()
      .then(function (shared) {
        if (shared) {
          track('share_native_complete');
        } else {
          shareFallback.hidden = false;
          setStatus('Pick a network below — your browser doesn’t support direct sharing.');
        }
      })
      .catch(function (err) {
        // AbortError = user cancelled; treat silently.
        if (err && err.name === 'AbortError') return;
        console.error(err);
        shareFallback.hidden = false;
        setStatus('Could not share directly. Pick a network below.', true);
      });
  });

  copyLinkBtn.addEventListener('click', function () {
    var doneText = 'Copied!';
    var prev = copyLinkBtn.textContent;
    var resetLabel = function () { copyLinkBtn.textContent = prev; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SITE_URL).then(function () {
        copyLinkBtn.textContent = doneText;
        setTimeout(resetLabel, 1500);
      }).catch(function () {
        copyLinkBtn.textContent = 'Press Ctrl+C';
        setTimeout(resetLabel, 1800);
      });
    } else {
      copyLinkBtn.textContent = SITE_URL;
      setTimeout(resetLabel, 2500);
    }
  });
})();
