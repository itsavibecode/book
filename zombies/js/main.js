/*
 * Cx Zombies — boot + game loop (v0.2.0).
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
  var SCENE_HEIGHT = 768;        // each bg image is 768 tall
  var SCENE_COUNT = 7;           // bg-00 through bg-06
  var WORLD_WIDTH = SCENE_WIDTH * SCENE_COUNT;
  var GROUND_RATIO = 0.78;       // ground line at 78% down the bg image
  var GRAVITY = 0.6;             // px/frame^2 (in scene-coord px)
  var JUMP_VELOCITY = -13;       // px/frame
  var BASE_MOVE_SPEED = 4;       // px/frame multiplied by char.speedMul
  var CAMERA_LEAD = 0.35;        // 0 = camera centered on player, 1 = far right

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
  // Ground y in scene-coord px (where the player's feet rest)
  var groundY = SCENE_HEIGHT * GROUND_RATIO;

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
  var assets = { bgs: [], iceWalk: null };

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
    return Promise.all(bgPromises).then(function (bgs) {
      assets.bgs = bgs;
      return loadImage('art/ice-poseidon-walk.png');
    }).then(function (img) {
      assets.iceWalk = img;
    });
  }

  // ============================================================
  // Game state
  // ============================================================
  var gameStarted = false;
  var lastTime = 0;
  var rafId = null;

  var state = 'title';
  var selectedChar = 'ice';

  var player = {
    x: 100,         // world x (scene-coord px)
    y: groundY,     // world y (scene-coord px, top-left of sprite)
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
    player.y = groundY;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.facing = 1;
    player.maxHP = char.maxHP;
    player.hp = char.maxHP;
    player.speedMul = char.speedMul;
    player.jumpMul = char.jumpMul;
    camera.x = 0;
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

    // Gravity
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= groundY) {
      player.y = groundY;
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

    // Draw backgrounds — only the scenes whose world range intersects the camera viewport
    var leftEdge = camera.x;
    var rightEdge = camera.x + viewportW / sceneScale;
    var firstScene = Math.max(0, Math.floor(leftEdge / SCENE_WIDTH));
    var lastScene = Math.min(SCENE_COUNT - 1, Math.floor(rightEdge / SCENE_WIDTH));
    for (var i = firstScene; i <= lastScene; i++) {
      var bg = assets.bgs[i];
      if (!bg) continue;
      var sceneWorldX = i * SCENE_WIDTH;
      var screenX = (sceneWorldX - camera.x) * sceneScale;
      ctx.drawImage(bg, screenX, 0, SCENE_WIDTH * sceneScale, SCENE_HEIGHT * sceneScale);
    }

    // Draw player sprite (Ice walk-cycle frame)
    var playerScreenX = (player.x - camera.x) * sceneScale;
    var playerScreenY = player.y * sceneScale;
    if (assets.iceWalk) {
      var spriteSheet = assets.iceWalk;
      var frameW = spriteSheet.naturalWidth / 8;
      var frameH = spriteSheet.naturalHeight;
      var frame = player.walkFrame;
      // Display the sprite at a height of ~12% of viewport (matching scene scale)
      var drawH = 96 * sceneScale;
      var drawW = (frameW / frameH) * drawH;
      // Draw centered horizontally at player.x; feet at player.y
      var dx = playerScreenX - drawW / 2;
      var dy = playerScreenY - drawH;
      // Mirror horizontally if facing left
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
      // Placeholder rect if sprite hasn't loaded
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(playerScreenX - 24, playerScreenY - 96 * sceneScale, 48, 96 * sceneScale);
    }
  }

  // ============================================================
  // requestAnimationFrame tick
  // ============================================================
  function tick(now) {
    var dt = Math.min(50, now - lastTime);
    lastTime = now;
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
