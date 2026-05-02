/*
 * Cx Zombies — boot + game loop (v0.2.2).
 *
 * v0.2.2 — true seamless transitions via bridge images:
 *   - 6 new bridge PNGs (bridge-00-01 through bridge-05-06) explicitly
 *     painted to transition between adjacent anchor scenes
 *   - WORLD_LAYOUT array interleaves scenes + bridges (13 segments
 *     instead of 7). Each segment has its own ground line; bridges'
 *     ground lines are the average of their two adjacent scenes
 *   - World width grows from 14336 to 17408 (7*2048 + 6*512)
 *   - groundYAt() and the bg render loop now walk WORLD_LAYOUT
 *     instead of doing pure scene-index math
 *   - Soft shadow band hack from v0.2.1 removed (bridges replace it)
 *   - SCENE_FX positions now look up the scene's worldX via
 *     WORLD_LAYOUT (since scene index no longer equals worldX/2048)
 *
 * v0.2.1 patch — feedback fixes from live test:
 *   - Player sprite scaled up ~2.3x (was way too small)
 *   - Color-key transparency on ice walk atlas (white halo removed)
 *   - Per-scene ground line array with smooth interpolation between
 *     scenes (player no longer walks through fences / floats above
 *     sidewalks)
 *   - Soft alpha crossfade in ~150-px overlap zone at scene seams
 *     (won't fully hide content mismatch but softens hard cuts)
 *   - Animated FX overlay system. v0.2.1 ships with: bg-06 Alamo
 *     boss arena gets flickering ALAMO marquee + HighBall neon
 *     signs + ambulance roof lights pulsing red/blue.
 *
 * v0.2.0 baseline (still here):
 *
 * v0.2.0 (Phase 1) adds the actual game loop, asset preloader, player
 * walk/jump, scrolling camera through bg-00 → bg-06, mobile touch
 * controls, and per-character stats (maxHP, moveSpeed) wired from the
 * loadout screen.
 *
 * What v0.2.0 does NOT have yet:
 *   - Shooting / bullets / zombies (Phase 2 — v0.3.0)
 *   - HP damage (no enemies yet)
 *   - Audio (Phase 6 — v0.7.0)
 *   - Real leaderboard wiring (Phase 4 — v0.5.0)
 *
 * Architecture:
 *   - Single IIFE, no modules.
 *   - State machine: 'title' | 'loadout' | 'loading' | 'playing' |
 *     'paused' | 'gameover'. The 'loading' state is brief — shown
 *     while the asset preloader runs after the user clicks PLAY.
 *   - World coordinates: bg-00 starts at world x=0. Each scene is
 *     2048 game-units wide. Total world width = 7 * 2048 = 14336.
 *     The camera x position determines what world slice is visible.
 *   - Player physics: simple gravity + jump. Walks within the world
 *     and the camera follows with a slight lead so the player tends
 *     to be left-of-center, leaving most of the screen for incoming
 *     content.
 */

(function () {
  'use strict';

  // ============================================================
  // Constants
  // ============================================================
  var SCENE_WIDTH = 2048;        // each bg image is 2048 wide
  var SCENE_HEIGHT = 768;        // each bg image is 768 tall (also bridge height)
  var SCENE_COUNT = 7;           // bg-00 through bg-06
  var BRIDGE_WIDTH = 512;        // each bridge image's world-coord width
  var BRIDGE_COUNT = SCENE_COUNT - 1;  // 6 bridges between 7 scenes
  // World width: 7 scenes + 6 bridges = 7*2048 + 6*512 = 17408
  var WORLD_WIDTH = SCENE_WIDTH * SCENE_COUNT + BRIDGE_WIDTH * BRIDGE_COUNT;
  var GRAVITY = 0.6;             // px/frame^2 (in scene-coord px)
  var JUMP_VELOCITY = -13;       // px/frame
  var BASE_MOVE_SPEED = 4;       // px/frame multiplied by char.speedMul
  var CAMERA_LEAD = 0.35;        // 0 = camera centered on player, 1 = far right
  var PLAYER_HEIGHT = 220;       // sprite display height in scene-coord px

  // Per-scene ground line as a fraction of SCENE_HEIGHT (0..1, 1=bottom).
  // Eyeballed from each bg-XX-final.png; tweak if Ice's feet float or sink.
  var SCENE_GROUND_LINES = [
    0.80,  // bg-00 garage flagstone driveway
    0.82,  // bg-01 craftsman walkway
    0.85,  // bg-02 in front of wood fence (sidewalk near bottom)
    0.78,  // bg-03 treadwell street level
    0.80,  // bg-04 lamar plaza
    0.78,  // bg-05 lamar corridor asphalt
    0.82   // bg-06 alamo planter level
  ];

  // World layout: alternating scenes and bridges.
  //   [scene-0] [bridge-0-1] [scene-1] [bridge-1-2] ... [scene-6]
  // 13 segments total. Each entry: { type, idx, worldX, w, groundLine }.
  // Built once at boot. The render loop and groundYAt() walk this array
  // instead of doing pure scene-index math.
  var WORLD_LAYOUT = [];
  (function buildWorldLayout() {
    var x = 0;
    for (var i = 0; i < SCENE_COUNT; i++) {
      WORLD_LAYOUT.push({
        type: 'scene', idx: i, worldX: x, w: SCENE_WIDTH,
        groundLine: SCENE_GROUND_LINES[i]
      });
      x += SCENE_WIDTH;
      if (i < BRIDGE_COUNT) {
        WORLD_LAYOUT.push({
          type: 'bridge', idx: i, worldX: x, w: BRIDGE_WIDTH,
          // Bridge ground line = average of adjacent scenes (close enough)
          groundLine: (SCENE_GROUND_LINES[i] + SCENE_GROUND_LINES[i+1]) / 2
        });
        x += BRIDGE_WIDTH;
      }
    }
  })();

  // Animated FX overlays. Each entry is (sceneIndex, x, y, w, h in
  // scene-coords) plus a `type` and per-type params. Drawn AFTER the
  // bg, BEFORE the player. Phase 2 will add zombie/bullet entities
  // between these and the player.
  var SCENE_FX = {
    6: [
      // ALAMO marquee (sits above the entrance) — slow neon flicker
      { type: 'flicker', x: 1080, y: 280, w: 380, h: 70, color: '#ff5a3d', period: 280, jitter: 0.45 },
      // HighBall vertical sign — faster flicker, warmer hue
      { type: 'flicker', x: 1500, y: 240, w: 70,  h: 230, color: '#ffaa3d', period: 180, jitter: 0.55 },
      // Ambulance roof light bar — alternating red/blue blink
      { type: 'pulseRed',  x: 1730, y: 540, w: 60, h: 22, period: 700, duty: 0.35 },
      { type: 'pulseBlue', x: 1730, y: 540, w: 60, h: 22, period: 700, duty: 0.35, offset: 350 }
    ]
  };

  // Per-character stats. Keys match the loadout-card data-char values.
  var CHARACTERS = {
    ice:     { name: 'Ice Poseidon', maxHP: 100, speedMul: 1.0, jumpMul: 1.0 },
    scout:   { name: 'Scout',        maxHP:  75, speedMul: 1.2, jumpMul: 1.1 },
    heavy:   { name: 'Heavy',        maxHP: 150, speedMul: 0.8, jumpMul: 0.9 }
  };

  // ============================================================
  // Version pill
  // ============================================================
  var versionMeta = document.querySelector('meta[name="version"]');
  var VERSION = versionMeta ? versionMeta.getAttribute('content') : '0.0.0';
  var versionPanel = document.getElementById('audio-panel-version');
  if (versionPanel) versionPanel.textContent = 'Cx Zombies v' + VERSION;

  // ============================================================
  // Canvas + viewport
  // ============================================================
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var viewportW = 0, viewportH = 0;
  // Scene draw scale — backgrounds are 768 tall; we scale to fit viewport
  // height so the ground line lands consistently regardless of window size.
  var sceneScale = 1;

  // Find the WORLD_LAYOUT segment containing the given world x. Returns
  // null if past the world end. O(n) walk; n=13 so it's fine.
  function findSegment(worldX) {
    for (var i = 0; i < WORLD_LAYOUT.length; i++) {
      var seg = WORLD_LAYOUT[i];
      if (worldX >= seg.worldX && worldX < seg.worldX + seg.w) {
        return { idx: i, seg: seg, t: (worldX - seg.worldX) / seg.w };
      }
    }
    var last = WORLD_LAYOUT[WORLD_LAYOUT.length - 1];
    return { idx: WORLD_LAYOUT.length - 1, seg: last, t: 1 };
  }

  // Ground-y for the current world position. Walks WORLD_LAYOUT to find
  // the current segment, then linearly interpolates the ground line
  // toward the next segment's ground line so the player rises/falls
  // smoothly across segment boundaries instead of teleporting.
  function groundYAt(worldX) {
    var info = findSegment(worldX);
    var nextIdx = Math.min(WORLD_LAYOUT.length - 1, info.idx + 1);
    var a = info.seg.groundLine;
    var b = WORLD_LAYOUT[nextIdx].groundLine;
    return SCENE_HEIGHT * (a + (b - a) * info.t);
  }

  function resize() {
    viewportW = canvas.width = Math.floor(window.innerWidth);
    viewportH = canvas.height = Math.floor(window.innerHeight);
    sceneScale = viewportH / SCENE_HEIGHT;
    if (!gameStarted) drawSplash();
  }

  function drawSplash() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, viewportW, viewportH);
    var grad = ctx.createRadialGradient(viewportW / 2, viewportH / 2, 0,
                                         viewportW / 2, viewportH / 2, Math.max(viewportW, viewportH) / 1.5);
    grad.addColorStop(0, 'rgba(57, 255, 20, 0.04)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewportW, viewportH);
  }

  window.addEventListener('resize', resize);
  resize();

  // ============================================================
  // Asset loader
  // ============================================================
  var assets = { bgs: [], bridges: [], iceWalk: null };

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load ' + src)); };
      img.src = src;
    });
  }

  function preloadAssets() {
    var bgPromises = [];
    for (var i = 0; i < SCENE_COUNT; i++) {
      var idx = i.toString().padStart(2, '0');
      bgPromises.push(loadImage('art/bg-' + idx + '-final.png'));
    }
    var bridgePromises = [];
    for (var j = 0; j < BRIDGE_COUNT; j++) {
      var idxA = j.toString().padStart(2, '0');
      var idxB = (j + 1).toString().padStart(2, '0');
      bridgePromises.push(loadImage('art/bridge-' + idxA + '-' + idxB + '.png'));
    }
    return Promise.all(bgPromises).then(function (bgs) {
      assets.bgs = bgs;
      return Promise.all(bridgePromises);
    }).then(function (bridges) {
      assets.bridges = bridges;
      return loadImage('art/ice-poseidon-walk.png');
    }).then(function (img) {
      // Color-key any near-white pixels to transparent. The AI-generated
      // atlas has an opaque white-ish background which shows up as a halo
      // around the player. We do this once at load (not per-frame) and
      // cache the result on an offscreen canvas that drawImage can use.
      var off = document.createElement('canvas');
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      var octx = off.getContext('2d');
      octx.drawImage(img, 0, 0);
      try {
        var data = octx.getImageData(0, 0, off.width, off.height);
        var px = data.data;
        for (var i = 0; i < px.length; i += 4) {
          var r = px[i], g = px[i+1], b = px[i+2];
          // Threshold: if pixel is near-white (sum > 700, i.e., each channel > ~230 avg)
          // OR if it's exactly the corner color of the atlas, treat as background.
          if (r + g + b > 700 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
            px[i+3] = 0; // alpha = 0
          }
        }
        octx.putImageData(data, 0, 0);
        assets.iceWalk = off;
      } catch (e) {
        // CORS / canvas tainted — fall back to original image (with halo)
        console.warn('[Cx Zombies] alpha-key failed, using raw atlas:', e);
        assets.iceWalk = img;
      }
    });
  }

  // ============================================================
  // Game state
  // ============================================================
  var gameStarted = false;
  var lastTime = 0;
  var rafId = null;
  // Wall-clock-style accumulator (ms since game start) used for FX timing.
  var gameTime = 0;

  var state = 'title';
  var selectedChar = 'ice';

  var player = {
    x: 100,         // world x (scene-coord px)
    y: SCENE_HEIGHT * 0.80,  // initial world y (set properly in startGame)
    vx: 0,
    vy: 0,
    onGround: true,
    facing: 1,      // 1 = right, -1 = left
    walkFrame: 0,
    walkAccum: 0,   // tracks walk-cycle frame timing
    hp: 100,
    maxHP: 100,
    speedMul: 1.0,
    jumpMul: 1.0
  };

  var camera = { x: 0 };

  var input = { left: false, right: false, jump: false, jumpHeld: false };

  // ============================================================
  // State machine — overlays + visibility
  // ============================================================
  function setState(next) {
    state = next;
    var overlays = {
      title: 'overlay-start',
      loadout: 'overlay-loadout',
      paused: 'overlay-pause',
      gameover: 'overlay-gameover'
    };
    document.querySelectorAll('.overlay').forEach(function (el) {
      el.classList.add('hidden');
    });
    if (overlays[next]) {
      var el = document.getElementById(overlays[next]);
      if (el) el.classList.remove('hidden');
    }
    var pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.classList.toggle('paused', next === 'paused');
    // Toggle body class so touch controls show only during gameplay
    document.body.classList.toggle('in-game', next === 'playing');
    // Toggle pause button visibility based on whether we're in/around gameplay
    var showPause = (next === 'playing' || next === 'paused');
    pauseBtn.style.display = showPause ? 'flex' : 'none';
  }

  // ============================================================
  // Game loop entry — called when user clicks PLAY in loadout
  // ============================================================
  function startGame() {
    var char = CHARACTERS[selectedChar] || CHARACTERS.ice;
    player.x = 100;
    player.y = groundYAt(player.x);
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.facing = 1;
    player.maxHP = char.maxHP;
    player.hp = char.maxHP;
    player.speedMul = char.speedMul;
    player.jumpMul = char.jumpMul;
    camera.x = 0;
    gameTime = 0;
    updateHUD();
    gameStarted = true;
    setState('playing');
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  // ============================================================
  // Update — input, physics
  // ============================================================
  function update(dt) {
    if (state !== 'playing') return;

    // Horizontal movement
    var moveSpeed = BASE_MOVE_SPEED * player.speedMul;
    if (input.left && !input.right) {
      player.vx = -moveSpeed;
      player.facing = -1;
    } else if (input.right && !input.left) {
      player.vx = moveSpeed;
      player.facing = 1;
    } else {
      player.vx = 0;
    }
    player.x += player.vx;
    // Clamp to world bounds
    if (player.x < 0) player.x = 0;
    if (player.x > WORLD_WIDTH - 100) player.x = WORLD_WIDTH - 100;

    // Jump
    if (input.jump && player.onGround) {
      player.vy = JUMP_VELOCITY * player.jumpMul;
      player.onGround = false;
      input.jump = false; // single-fire; player must release+repress
    }

    // Gravity (per-scene ground line, smoothly interpolated)
    var currentGroundY = groundYAt(player.x);
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= currentGroundY) {
      player.y = currentGroundY;
      player.vy = 0;
      player.onGround = true;
    }

    // Walk-cycle frame advance (only when moving on ground)
    if (Math.abs(player.vx) > 0 && player.onGround) {
      player.walkAccum += Math.abs(player.vx);
      if (player.walkAccum > 12) {
        player.walkAccum = 0;
        player.walkFrame = (player.walkFrame + 1) % 8;
      }
    } else {
      player.walkFrame = 0;
    }

    // Camera — follow player with slight left-of-center bias
    var targetCamX = player.x - viewportW / sceneScale * (1 - CAMERA_LEAD);
    if (targetCamX < 0) targetCamX = 0;
    var maxCamX = WORLD_WIDTH - viewportW / sceneScale;
    if (targetCamX > maxCamX) targetCamX = maxCamX;
    // Smooth interpolation toward target (lerp)
    camera.x += (targetCamX - camera.x) * 0.12;
  }

  // ============================================================
  // Render
  // ============================================================
  function render() {
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, viewportW, viewportH);

    // ============ Backgrounds via WORLD_LAYOUT ============
    // Walk the layout (alternating scenes + bridges), draw any segment that
    // intersects the camera viewport. Bridges replace the v0.2.1 seam-
    // shadow-band hack — scenes now flow seamlessly into each other through
    // explicitly painted transitions.
    var leftEdge = camera.x;
    var rightEdge = camera.x + viewportW / sceneScale;
    for (var i = 0; i < WORLD_LAYOUT.length; i++) {
      var seg = WORLD_LAYOUT[i];
      if (seg.worldX + seg.w < leftEdge) continue;   // off-screen left
      if (seg.worldX > rightEdge) break;             // off-screen right (and rest are too)
      var img = (seg.type === 'scene') ? assets.bgs[seg.idx] : assets.bridges[seg.idx];
      if (!img) continue;
      var screenX = (seg.worldX - camera.x) * sceneScale;
      ctx.drawImage(img, screenX, 0, seg.w * sceneScale, SCENE_HEIGHT * sceneScale);
    }

    // ============ Animated FX overlays (per-scene) ============
    // FX positions are stored in scene-local coords (x relative to scene's
    // left edge). Translate to world coords using the scene's worldX from
    // WORLD_LAYOUT, then to screen.
    for (var sceneIdx = 0; sceneIdx < SCENE_COUNT; sceneIdx++) {
      var fxList = SCENE_FX[sceneIdx];
      if (!fxList) continue;
      // Find this scene's segment in the layout (scenes are at even positions: 0,2,4,...)
      var sceneSeg = WORLD_LAYOUT[sceneIdx * 2];
      if (!sceneSeg) continue;
      // Skip if the entire scene is off-screen
      if (sceneSeg.worldX + sceneSeg.w < leftEdge) continue;
      if (sceneSeg.worldX > rightEdge) continue;
      for (var f = 0; f < fxList.length; f++) {
        var fx = fxList[f];
        var fxWorldX = sceneSeg.worldX + fx.x;
        var sx = (fxWorldX - camera.x) * sceneScale;
        var sy = fx.y * sceneScale;
        var sw = fx.w * sceneScale;
        var sh = fx.h * sceneScale;
        var alpha = computeFxAlpha(fx);
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fx.color || (fx.type === 'pulseRed' ? '#ff2222' : '#22aaff');
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = sh * 0.8;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1.0;

    // ============ Player sprite ============
    var playerScreenX = (player.x - camera.x) * sceneScale;
    var playerScreenY = player.y * sceneScale;
    if (assets.iceWalk) {
      var spriteSheet = assets.iceWalk;
      // The atlas is either an HTMLImageElement or an offscreen canvas after
      // alpha-keying. Both expose width/height (canvas) or naturalWidth/Height
      // (image), so normalize.
      var sw = spriteSheet.naturalWidth || spriteSheet.width;
      var sh = spriteSheet.naturalHeight || spriteSheet.height;
      var frameW = sw / 8;
      var frameH = sh;
      var frame = player.walkFrame;
      var drawH = PLAYER_HEIGHT * sceneScale;
      var drawW = (frameW / frameH) * drawH;
      var dx = playerScreenX - drawW / 2;
      var dy = playerScreenY - drawH;
      if (player.facing === -1) {
        ctx.save();
        ctx.translate(dx + drawW, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(spriteSheet, frame * frameW, 0, frameW, frameH, 0, 0, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(spriteSheet, frame * frameW, 0, frameW, frameH, dx, dy, drawW, drawH);
      }
    } else {
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(playerScreenX - 24, playerScreenY - PLAYER_HEIGHT * sceneScale, 48, PLAYER_HEIGHT * sceneScale);
    }
  }

  // Compute the current alpha of an animated FX based on its type + gameTime.
  // - flicker: random-ish modulation between 0.4 and 1.0 driven by jitter
  // - pulseRed/pulseBlue: square-wave on/off based on period + duty + offset
  function computeFxAlpha(fx) {
    if (fx.type === 'flicker') {
      // Pseudo-random based on gameTime / period; smoothed to avoid pure noise
      var t = (gameTime + (fx.offset || 0)) / fx.period;
      var s = Math.sin(t) * 0.5 + Math.cos(t * 2.7) * 0.3 + Math.sin(t * 0.4) * 0.2;
      var jitter = fx.jitter || 0.3;
      var base = 0.7;
      return Math.max(0.2, Math.min(1, base + s * jitter));
    }
    if (fx.type === 'pulseRed' || fx.type === 'pulseBlue') {
      var phase = ((gameTime + (fx.offset || 0)) % fx.period) / fx.period;
      return phase < (fx.duty || 0.5) ? 1.0 : 0.05;
    }
    return 0;
  }

  // ============================================================
  // requestAnimationFrame tick
  // ============================================================
  function tick(now) {
    var dt = Math.min(50, now - lastTime);
    lastTime = now;
    if (state === 'playing') gameTime += dt;
    update(dt);
    render();
    rafId = requestAnimationFrame(tick);
  }

  // ============================================================
  // HUD updates (HP bar + counters)
  // ============================================================
  function updateHUD() {
    var fill = document.getElementById('hp-fill');
    var label = document.getElementById('hp-label');
    if (fill) {
      var pct = Math.max(0, Math.min(100, (player.hp / player.maxHP) * 100));
      fill.style.width = pct + '%';
      fill.classList.toggle('low', pct < 33);
    }
    if (label) label.textContent = Math.floor(player.hp) + ' / ' + player.maxHP;
  }

  // ============================================================
  // Title → Loadout → Play wiring (extends Phase 0 logic)
  // ============================================================
  document.getElementById('btn-start').addEventListener('click', function () {
    setState('loadout');
    if (typeof window.gtag === 'function') gtag('event', 'cxz_start_clicked');
  });

  var loadoutPlayBtn = document.getElementById('btn-loadout-play');
  document.querySelectorAll('.char-card').forEach(function (card) {
    card.addEventListener('click', function () {
      document.querySelectorAll('.char-card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      selectedChar = card.dataset.char;
      try { localStorage.setItem('cxz-character', selectedChar); } catch (e) {}
      loadoutPlayBtn.disabled = false;
    });
  });
  // Restore previously selected character
  try {
    var savedChar = localStorage.getItem('cxz-character');
    if (savedChar && CHARACTERS[savedChar]) {
      var card = document.querySelector('.char-card[data-char="' + savedChar + '"]');
      if (card) {
        card.classList.add('selected');
        selectedChar = savedChar;
        loadoutPlayBtn.disabled = false;
      }
    } else {
      var iceCard = document.querySelector('.char-card[data-char="ice"]');
      if (iceCard) { iceCard.classList.add('selected'); loadoutPlayBtn.disabled = false; }
    }
  } catch (e) {}

  document.getElementById('btn-loadout-back').addEventListener('click', function () { setState('title'); });

  loadoutPlayBtn.addEventListener('click', function () {
    if (loadoutPlayBtn.disabled) return;
    if (typeof window.gtag === 'function') gtag('event', 'cxz_play', { character: selectedChar });
    // Hide loadout, show "Loading..." briefly while we preload assets
    setState('title');
    document.getElementById('overlay-start').classList.add('hidden');
    showLoadingMessage('LOADING...');

    if (assets.bgs.length === SCENE_COUNT && assets.iceWalk) {
      // Already loaded
      hideLoadingMessage();
      startGame();
    } else {
      preloadAssets().then(function () {
        hideLoadingMessage();
        startGame();
      }).catch(function (err) {
        console.error('[Cx Zombies] Asset preload failed:', err);
        hideLoadingMessage();
        showLoadingMessage('LOAD FAILED — refresh');
      });
    }
  });

  // Tiny loading-state overlay (built dynamically, replaces nothing existing)
  var loadingEl = null;
  function showLoadingMessage(msg) {
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.className = 'overlay';
      loadingEl.style.cssText = 'background:rgba(10,10,10,0.95);';
      loadingEl.innerHTML = '<h1 style="font-size:42px;color:#39ff14;font-family:Luckiest Guy,sans-serif;letter-spacing:3px"></h1>';
      document.body.appendChild(loadingEl);
    }
    loadingEl.querySelector('h1').textContent = msg;
    loadingEl.classList.remove('hidden');
  }
  function hideLoadingMessage() {
    if (loadingEl) loadingEl.classList.add('hidden');
  }

  // ============================================================
  // Pause toggle (P / ESC / right-click / button)
  // ============================================================
  function togglePause() {
    if (state === 'playing') setState('paused');
    else if (state === 'paused') setState('playing');
  }

  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.addEventListener('keydown', function (e) {
    // Ignore if user is typing in an input field
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var k = e.key.toLowerCase();
    if (k === 'p' || k === 'escape') togglePause();
    else if (k === 'a' || k === 'arrowleft') input.left = true;
    else if (k === 'd' || k === 'arrowright') input.right = true;
    else if (k === ' ' || k === 'w' || k === 'arrowup') {
      if (!input.jumpHeld) input.jump = true;
      input.jumpHeld = true;
    }
  });
  document.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') input.left = false;
    else if (k === 'd' || k === 'arrowright') input.right = false;
    else if (k === ' ' || k === 'w' || k === 'arrowup') {
      input.jumpHeld = false;
    }
  });
  document.addEventListener('contextmenu', function (e) {
    if (state === 'playing' || state === 'paused') {
      e.preventDefault();
      togglePause();
    }
  });
  document.getElementById('overlay-pause').addEventListener('click', function (e) {
    if (e.target.id === 'overlay-pause' || e.target.tagName === 'H1' || e.target.tagName === 'P') {
      togglePause();
    }
  });
  document.getElementById('btn-pause-quit').addEventListener('click', function () { setState('title'); });

  // ============================================================
  // Mobile touch controls
  // ============================================================
  function bindTouch(btnId, onPress, onRelease) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      btn.classList.add('pressed');
      onPress();
    }, { passive: false });
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      btn.classList.remove('pressed');
      onRelease();
    }, { passive: false });
    btn.addEventListener('touchcancel', function () {
      btn.classList.remove('pressed');
      onRelease();
    });
    // Mouse fallback for testing on desktop
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); btn.classList.add('pressed'); onPress(); });
    btn.addEventListener('mouseup',   function () { btn.classList.remove('pressed'); onRelease(); });
    btn.addEventListener('mouseleave',function () { btn.classList.remove('pressed'); onRelease(); });
  }
  bindTouch('touch-left',
    function () { input.left = true; },
    function () { input.left = false; });
  bindTouch('touch-right',
    function () { input.right = true; },
    function () { input.right = false; });
  bindTouch('touch-jump',
    function () { input.jump = true; input.jumpHeld = true; },
    function () { input.jumpHeld = false; });

  // Show the touch-controls element (CSS @media (pointer: coarse) hides
  // it on non-touch devices, the JS just unhides the element itself).
  document.getElementById('touch-controls').hidden = false;

  // ============================================================
  // Game-over → restart / quit
  // ============================================================
  document.getElementById('btn-restart').addEventListener('click', function () { setState('loadout'); });
  document.getElementById('btn-gameover-quit').addEventListener('click', function () { setState('title'); });

  // ============================================================
  // Audio gear toggle
  // ============================================================
  document.getElementById('audio-toggle').addEventListener('click', function () {
    document.getElementById('audio-panel').classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    var panel = document.getElementById('audio-panel');
    if (!panel.classList.contains('open')) return;
    if (e.target.closest('.audio-controls')) return;
    panel.classList.remove('open');
  });

  // ============================================================
  // EU consent banner
  // ============================================================
  var banner = document.getElementById('consent-banner');
  if (window.__needsConsent && banner) {
    banner.classList.remove('hidden');
  }
  document.getElementById('consent-accept').addEventListener('click', function () {
    try { localStorage.setItem('greenline-consent', 'granted'); } catch (e) {}
    if (typeof window.gtag === 'function') {
      gtag('consent', 'update', { 'analytics_storage': 'granted' });
    }
    banner.classList.add('hidden');
  });
  document.getElementById('consent-deny').addEventListener('click', function () {
    try { localStorage.setItem('greenline-consent', 'denied'); } catch (e) {}
    banner.classList.add('hidden');
  });
  document.getElementById('cookies-link').addEventListener('click', function (e) {
    e.preventDefault();
    try { localStorage.removeItem('greenline-consent'); } catch (e) {}
    banner.classList.remove('hidden');
  });

  // ============================================================
  // Boot
  // ============================================================
  setState('title');
  // Hide the pause button on the title screen (it's only relevant in-game)
  document.getElementById('btn-pause').style.display = 'none';
  // Kick off asset preloading in the background so PLAY feels instant
  preloadAssets().catch(function (err) {
    console.warn('[Cx Zombies] Background preload failed (will retry on PLAY):', err);
  });

  console.log('[Cx Zombies] booted v' + VERSION);
})();
