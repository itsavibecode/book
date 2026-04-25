/* Green Line — Auto Meme Generator
 * Implements the Green Line Theory: for every detected person in a photo,
 * draw a green line along their body axis (shoulder-midpoint through
 * hip-midpoint, extended head-to-toe). The lean of the line vs. their
 * partner is the meme. Pose detection via TensorFlow.js + MoveNet.
 * Runs entirely client-side. No upload.
 */
(function () {
  'use strict';

  // CDN scripts. All three Google ML libraries share the same TF.js 4.x
  // runtime, so they cooperate cleanly. face-detection (BlazeFace) finds
  // every person, then MoveNet SinglePose runs on a body-region crop
  // around each face — more reliable than MoveNet MultiPose alone for
  // overlapping or busy couple photos.
  var TFJS_SRC = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
  var POSEDET_SRC = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js';
  var FACEDET_SRC = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-detection@1.0.3/dist/face-detection.min.js';

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
  var SHARE_TEXT = 'I just ran the Green Line Theory on a photo — auto-detect, auto-draw. Try it:';

  function track(eventName, params) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', eventName, params || {});
    } catch (e) { /* analytics must never break UX */ }
  }

  var ctx = canvasEl.getContext('2d');
  var poseDetector = null;
  var faceDetector = null;
  var detectorLoading = null;
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

  function ensureDetector() {
    if (poseDetector && faceDetector) return Promise.resolve();
    if (detectorLoading) return detectorLoading;

    setStatus('Loading detection models… (~4 MB, first time only)');
    detectorLoading = loadScript(TFJS_SRC)
      .then(function () {
        return Promise.all([loadScript(POSEDET_SRC), loadScript(FACEDET_SRC)]);
      })
      .then(function () {
        if (!window.tf || !window.poseDetection || !window.faceDetection) {
          throw new Error('A detection library failed to initialize.');
        }
        return window.tf.ready();
      })
      .then(function () {
        return Promise.all([
          window.poseDetection.createDetector(
            window.poseDetection.SupportedModels.MoveNet,
            {
              modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
              enableSmoothing: false
            }
          ),
          window.faceDetection.createDetector(
            window.faceDetection.SupportedModels.MediaPipeFaceDetector,
            {
              runtime: 'tfjs',
              // 'full' covers people further from camera (5m+), which is
              // important for couple photos where both subjects can be
              // mid-distance. 'short' was missing secondary subjects.
              modelType: 'full',
              maxFaces: 6
            }
          )
        ]);
      })
      .then(function (detectors) {
        poseDetector = detectors[0];
        faceDetector = detectors[1];
      })
      .catch(function (err) {
        detectorLoading = null;
        throw err;
      });

    return detectorLoading;
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

  function getKeypoint(pose, name) {
    if (!pose || !pose.keypoints) return null;
    for (var i = 0; i < pose.keypoints.length; i++) {
      if (pose.keypoints[i].name === name) return pose.keypoints[i];
    }
    return null;
  }

  // Compute the body axis line endpoints for one pose. Returns null if
  // the four core keypoints aren't confident enough or the layout is
  // implausible (e.g. MoveNet mixed two people into one pose).
  // SinglePose Lightning often returns confident overall poses with one
  // shoulder or hip occluded (raised arm, hand on partner's shoulder).
  // We keep MIN_KEYPOINT_SCORE permissive and rely on the geometry
  // sanity checks below (shoulder/hip ratio, body length) to filter
  // out garbage.
  var MIN_KEYPOINT_SCORE = 0.15;
  var MIN_POSE_SCORE = 0.2;
  function bodyAxisEndpoints(pose) {
    if (typeof pose.score === 'number' && pose.score < MIN_POSE_SCORE) return null;

    var ls = getKeypoint(pose, 'left_shoulder');
    var rs = getKeypoint(pose, 'right_shoulder');
    var lh = getKeypoint(pose, 'left_hip');
    var rh = getKeypoint(pose, 'right_hip');
    if (!ls || !rs || !lh || !rh) return null;
    if (ls.score < MIN_KEYPOINT_SCORE || rs.score < MIN_KEYPOINT_SCORE ||
        lh.score < MIN_KEYPOINT_SCORE || rh.score < MIN_KEYPOINT_SCORE) return null;

    var shoulderWidth = Math.hypot(rs.x - ls.x, rs.y - ls.y);
    var hipWidth = Math.hypot(rh.x - lh.x, rh.y - lh.y);
    // Shoulders and hips should be roughly the same width on the same body.
    // If one is wildly larger than the other, this is a mixed/garbage pose.
    if (shoulderWidth < 8 || hipWidth < 8) return null;
    var ratio = shoulderWidth / hipWidth;
    if (ratio < 0.4 || ratio > 2.5) return null;

    var sm = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    var hm = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

    var dx = hm.x - sm.x;
    var dy = hm.y - sm.y;
    var len = Math.hypot(dx, dy);
    if (len < 4) return null;
    var ux = dx / len, uy = dy / len; // unit vector pointing from shoulders toward hips

    // Extend up by ~0.85 body-lengths (head height) and down by ~1.7
    // (legs). The canvas will clip if we go off-image, which mimics the
    // manual style where lines often run off the top/bottom edges.
    var top = { x: sm.x - ux * len * 0.85, y: sm.y - uy * len * 0.85 };
    var bot = { x: hm.x + ux * len * 1.70, y: hm.y + uy * len * 1.70 };

    return { top: top, bot: bot, shoulderWidth: shoulderWidth };
  }

  // Lean angle from vertical, in degrees (0 = perfectly upright).
  function leanAngle(endpoints) {
    var dx = endpoints.bot.x - endpoints.top.x;
    var dy = endpoints.bot.y - endpoints.top.y;
    return Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI;
  }

  function drawSingleAxis(endpoints) {
    var thickness = Math.max(8, endpoints.shoulderWidth * 0.10);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = thickness * 1.45;
    ctx.beginPath();
    ctx.moveTo(endpoints.top.x, endpoints.top.y);
    ctx.lineTo(endpoints.bot.x, endpoints.bot.y);
    ctx.stroke();

    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(endpoints.top.x, endpoints.top.y);
    ctx.lineTo(endpoints.bot.x, endpoints.bot.y);
    ctx.stroke();
    ctx.restore();
  }

  // Brutalist label pill anchored above a point. kind = 'confident' | 'insecure'.
  function drawVerdictLabel(text, anchor, kind) {
    var w = canvasEl.width, h = canvasEl.height;
    var fontPx = Math.max(18, Math.round(Math.min(w, h) * 0.026));
    var padX = Math.round(fontPx * 0.55);
    var padY = Math.round(fontPx * 0.32);

    ctx.save();
    ctx.font = '700 ' + fontPx + 'px "Luckiest Guy", "Arial Black", sans-serif';
    ctx.textBaseline = 'middle';
    var textW = ctx.measureText(text).width;
    var boxW = Math.round(textW + padX * 2);
    var boxH = Math.round(fontPx + padY * 2);

    // Center above the anchor (top of the body line), with breathing room.
    var x = Math.round(anchor.x - boxW / 2);
    var y = Math.round(anchor.y - boxH - fontPx * 0.4);

    // Clamp into the canvas so labels stay readable when the line top
    // is off-image.
    var margin = 6;
    if (x < margin) x = margin;
    if (x + boxW > w - margin) x = w - margin - boxW;
    if (y < margin) y = margin;

    var bg, fg;
    if (kind === 'confident') { bg = '#39ff14'; fg = '#0a0a0a'; }
    else                      { bg = '#0a0a0a'; fg = '#ffe82e'; }

    ctx.fillStyle = bg;
    ctx.fillRect(x, y, boxW, boxH);
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.13));
    ctx.strokeStyle = '#0a0a0a';
    ctx.strokeRect(x, y, boxW, boxH);

    ctx.fillStyle = fg;
    ctx.fillText(text, x + padX, y + boxH / 2);
    ctx.restore();
  }

  // Draw lines + verdict labels. Returns the analyzed list (so callers
  // can build a status message about who got which label).
  function drawAxisLines(poses) {
    var analyzed = [];
    poses.forEach(function (pose) {
      var endpoints = bodyAxisEndpoints(pose);
      if (!endpoints) return;
      analyzed.push({ endpoints: endpoints, angle: leanAngle(endpoints) });
    });

    // Draw all the lines first so labels render on top.
    analyzed.forEach(function (a) { drawSingleAxis(a.endpoints); });

    if (analyzed.length === 0) return analyzed;

    // Tag straightest = MOST CONFIDENT, most-leaning = LESS DOMINANT.
    // With a single subject, no comparison is meaningful so skip labels.
    if (analyzed.length >= 2) {
      var minIdx = 0, maxIdx = 0;
      for (var i = 1; i < analyzed.length; i++) {
        if (analyzed[i].angle < analyzed[minIdx].angle) minIdx = i;
        if (analyzed[i].angle > analyzed[maxIdx].angle) maxIdx = i;
      }
      // Tie-break: if every subject has the exact same angle, both bail.
      if (minIdx !== maxIdx) {
        analyzed[minIdx].label = { text: 'MOST CONFIDENT', kind: 'confident' };
        analyzed[maxIdx].label = { text: 'LESS DOMINANT', kind: 'insecure' };
      }
    }

    analyzed.forEach(function (a) {
      if (a.label) drawVerdictLabel(a.label.text, a.endpoints.top, a.label.kind);
    });

    return analyzed;
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
      var data = { title: 'Green Line Theory', text: SHARE_TEXT, url: SITE_URL };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        data.files = [file];
      }
      if (navigator.share) {
        return navigator.share(data).then(function () { return true; });
      }
      return false;
    });
  }

  // Normalize a face detection's box across face-detection API versions.
  function faceBox(face) {
    var b = face.box || face;
    var x = (b.xMin != null) ? b.xMin : (b.x != null ? b.x : (b.left != null ? b.left : 0));
    var y = (b.yMin != null) ? b.yMin : (b.y != null ? b.y : (b.top != null ? b.top : 0));
    var w = (b.width != null) ? b.width
      : (b.xMax != null ? b.xMax - x : 0);
    var h = (b.height != null) ? b.height
      : (b.yMax != null ? b.yMax - y : 0);
    return { x: x, y: y, w: w, h: h };
  }

  // For one face bounding box, crop a body region around it and run
  // pose detection. Returns a pose with keypoints translated back into
  // the original canvas coordinate system, or null if nothing usable.
  function detectPersonForFace(face) {
    var fb = faceBox(face);
    if (!fb.w || !fb.h) return Promise.resolve(null);
    // Pad: head room above, ~7 face-heights below for the body, ~1.5
    // face-widths to each side.
    var x = Math.max(0, Math.round(fb.x - fb.w * 1.5));
    var y = Math.max(0, Math.round(fb.y - fb.h * 0.4));
    var x2 = Math.min(canvasEl.width, Math.round(fb.x + fb.w * 2.5));
    var y2 = Math.min(canvasEl.height, Math.round(fb.y + fb.h * 7.5));
    var cw = x2 - x;
    var ch = y2 - y;
    if (cw < 32 || ch < 32) return Promise.resolve(null);

    var crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    crop.getContext('2d').drawImage(canvasEl, x, y, cw, ch, 0, 0, cw, ch);

    return poseDetector.estimatePoses(crop, { maxPoses: 1 }).then(function (poses) {
      if (!poses || !poses.length) return null;
      var p = poses[0];
      p.keypoints = p.keypoints.map(function (k) {
        return { name: k.name, score: k.score, x: k.x + x, y: k.y + y };
      });
      return p;
    }).catch(function (err) {
      console.warn('pose estimation failed for face', err);
      return null;
    });
  }

  function processImage(img) {
    var dims = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);
    canvasEl.width = dims.w;
    canvasEl.height = dims.h;
    ctx.drawImage(img, 0, 0, dims.w, dims.h);
    showCanvas();
    setStatus('Detecting people…');

    return ensureDetector().then(function () {
      return faceDetector.estimateFaces(canvasEl);
    }).then(function (faces) {
      if (!faces || !faces.length) return [];
      setStatus('Found ' + faces.length + ' face' + (faces.length === 1 ? '' : 's') + '. Mapping body axes…');
      return faces.reduce(function (chain, face) {
        return chain.then(function (acc) {
          return detectPersonForFace(face).then(function (p) {
            if (p) acc.push(p);
            return acc;
          });
        });
      }, Promise.resolve([]));
    }).then(function (poses) {
      return watermarkLoaded.then(function () { return poses; });
    }).then(function (poses) {
      var analyzed = drawAxisLines(poses);
      drawWatermark();
      downloadBtn.disabled = false;
      shareBtn.disabled = false;
      var drawn = analyzed.length;
      if (drawn === 0) {
        setStatus('No body axes could be mapped — try a clearer, full-body staged photo. Watermark added anyway.');
      } else if (drawn === 1) {
        setStatus('1 axis drawn. Need at least two people for a verdict — try a couple photo.');
      } else {
        var labelled = analyzed.filter(function (a) { return a.label; }).length;
        if (labelled >= 2) {
          setStatus('Verdict labelled. ' + drawn + ' axes drawn — hit DOWNLOAD or SHARE.');
        } else {
          setStatus('Drew green lines on ' + drawn + ' people. Hit DOWNLOAD or SHARE.');
        }
      }
      track('detect_complete', { people: drawn });
    });
  }

  function handleFile(file) {
    setStatus('Loading image…');
    downloadBtn.disabled = true;
    shareBtn.disabled = true;
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
