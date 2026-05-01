/*
 * Cx Zombies — boot script (v0.1.0).
 *
 * This is the Phase 0 scaffold. It does NOT implement gameplay yet.
 * What it DOES do:
 *   - Resize canvas to viewport on load + resize
 *   - Read meta version, write it into bottom-left version pill
 *     and into the audio-panel version label so they stay in sync
 *   - Wire up the pause button + ESC / P / right-click to toggle
 *   - Wire up the settings gear → audio panel toggle
 *   - Wire up Start → Loadout → Play → game-running state machine
 *   - Wire up consent banner (EU only) for GA4 opt-in
 *   - Wire up Cookies link (clears consent + re-shows banner)
 *
 * Phase 1 will add the actual canvas rendering (player walk, scroll,
 * background image rotation through bg-00 → bg-06).
 */

(function () {
  'use strict';

  // ============================================================
  // Version — read from <meta name="version">
  // ============================================================
  var versionMeta = document.querySelector('meta[name="version"]');
  var VERSION = versionMeta ? versionMeta.getAttribute('content') : '0.0.0';
  var versionLabel = 'Cx Zombies v' + VERSION;

  var versionPanel = document.getElementById('audio-panel-version');
  if (versionPanel) versionPanel.textContent = versionLabel;

  // ============================================================
  // Canvas — fit to viewport
  // ============================================================
  var canvas = document.getElementById('game');
  var ctx = canvas ? canvas.getContext('2d') : null;

  function resize() {
    if (!canvas) return;
    canvas.width = Math.floor(window.innerWidth);
    canvas.height = Math.floor(window.innerHeight);
    drawSplash();
  }

  // Placeholder splash — Phase 1 will replace this with the actual game loop.
  function drawSplash() {
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Subtle vignette for depth
    var grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.5);
    grad.addColorStop(0, 'rgba(57, 255, 20, 0.04)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  window.addEventListener('resize', resize);
  resize();

  // ============================================================
  // State machine
  //   states: 'title' | 'loadout' | 'playing' | 'paused' | 'gameover'
  // ============================================================
  var state = 'title';
  var selectedChar = 'ice'; // Ice is default

  function setState(next) {
    state = next;
    var overlays = {
      title: 'overlay-start',
      loadout: 'overlay-loadout',
      paused: 'overlay-pause',
      gameover: 'overlay-gameover'
    };
    // Hide all overlays
    document.querySelectorAll('.overlay').forEach(function (el) {
      el.classList.add('hidden');
    });
    // Show the one for the new state (if any)
    if (overlays[next]) {
      var el = document.getElementById(overlays[next]);
      if (el) el.classList.remove('hidden');
    }
    // Toggle pause button visual
    var pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.classList.toggle('paused', next === 'paused');
  }

  // ============================================================
  // Title screen → Loadout
  // ============================================================
  document.getElementById('btn-start').addEventListener('click', function () {
    setState('loadout');
    if (typeof window.gtag === 'function') gtag('event', 'cxz_start_clicked');
  });

  // ============================================================
  // Loadout → Play
  // ============================================================
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
    if (savedChar) {
      var card = document.querySelector('.char-card[data-char="' + savedChar + '"]');
      if (card) {
        card.classList.add('selected');
        selectedChar = savedChar;
        loadoutPlayBtn.disabled = false;
      }
    } else {
      // Default to Ice
      var iceCard = document.querySelector('.char-card[data-char="ice"]');
      if (iceCard) {
        iceCard.classList.add('selected');
        loadoutPlayBtn.disabled = false;
      }
    }
  } catch (e) {}

  document.getElementById('btn-loadout-back').addEventListener('click', function () { setState('title'); });
  loadoutPlayBtn.addEventListener('click', function () {
    if (loadoutPlayBtn.disabled) return;
    if (typeof window.gtag === 'function') {
      gtag('event', 'cxz_play', { character: selectedChar });
    }
    setState('playing');
    // Phase 1 entry point — start the game loop here.
    // For v0.1.0 this is a no-op; we just clear the overlay.
  });

  // ============================================================
  // Pause toggle (P / ESC / right-click / button)
  // ============================================================
  function togglePause() {
    if (state === 'playing') setState('paused');
    else if (state === 'paused') setState('playing');
  }

  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      togglePause();
    }
  });
  document.addEventListener('contextmenu', function (e) {
    if (state === 'playing' || state === 'paused') {
      e.preventDefault();
      togglePause();
    }
  });
  // Tap "PAUSED" overlay text to resume
  document.getElementById('overlay-pause').addEventListener('click', function (e) {
    if (e.target.id === 'overlay-pause' || e.target.tagName === 'H1' || e.target.tagName === 'P') {
      togglePause();
    }
  });
  document.getElementById('btn-pause-quit').addEventListener('click', function () { setState('title'); });

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
  // Close panel when clicking outside (but not on the gear or the panel itself)
  document.addEventListener('click', function (e) {
    var panel = document.getElementById('audio-panel');
    if (!panel.classList.contains('open')) return;
    if (e.target.closest('.audio-controls')) return;
    panel.classList.remove('open');
  });

  // ============================================================
  // EU consent banner — show only if window.__needsConsent is set
  //   (set by inline script in <head>)
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
  // Boot: start at title
  // ============================================================
  setState('title');

  console.log('[Cx Zombies] booted v' + VERSION);
})();
