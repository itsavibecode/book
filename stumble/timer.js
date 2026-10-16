/* Stumble - the per-roll countdown and the ring drawn around ROLL.
   One timer, restarted on every roll at the default length. Manual pause,
   +/-30 s, "set for this one", lock, and a set of auto-pause reasons
   (typing, tab hidden, mute grace, hovering the action row). The clock is
   injectable so the self-test can drive it without waiting. */
'use strict';

export const MIN_REMAINING_MS = 5000;
export const WARN_MS = 5000;

export function createTimer(opts) {
  opts = opts || {};
  const now = opts.now || function () { return Date.now(); };
  const onExpire = opts.onExpire || function () {};
  const onChange = opts.onChange || function () {};

  let lengthMs = 0;        // this roll's length (grows with +30, shrinks with -30)
  let remainingMs = 0;     // banked remaining while not running
  let runningSince = null; // clock time when the current run segment started (null = not running)
  let active = false;      // a countdown exists for the stream on screen
  let manualPause = false;
  let locked = false;
  let changed = false;     // the user touched this roll's time
  let defaultMs = 0;
  const reasons = {};      // auto-pause reasons currently true

  function autoPaused() {
    for (const k in reasons) if (reasons[k]) return true;
    return false;
  }
  function running() { return active && !manualPause && !locked && !autoPaused(); }
  function bank() {
    if (runningSince !== null) {
      remainingMs = Math.max(0, remainingMs - (now() - runningSince));
      runningSince = null;
    }
  }
  function sync() {
    // Call after any state change: start or stop the running segment.
    if (running()) { if (runningSince === null) runningSince = now(); }
    else bank();
    onChange(api.state());
  }
  function remaining() {
    if (runningSince === null) return remainingMs;
    return Math.max(0, remainingMs - (now() - runningSince));
  }

  const api = {
    /* New roll: fresh countdown at the default length (0 = timer Off). */
    start: function (defSec) {
      defaultMs = Math.max(0, Math.round((defSec || 0) * 1000));
      lengthMs = defaultMs;
      remainingMs = defaultMs;
      runningSince = null;
      active = defaultMs > 0;
      manualPause = false;
      locked = false;
      changed = false;
      sync();
    },
    /* Stop entirely (deep link shown, empty pool). */
    idle: function () {
      active = false; runningSince = null; remainingMs = 0; lengthMs = 0;
      manualPause = false; locked = false; changed = false;
      onChange(api.state());
    },
    togglePause: function () {
      if (!active) return;
      if (locked) { locked = false; manualPause = false; }
      else manualPause = !manualPause;
      sync();
    },
    add: function (sec) {
      if (!active) return;
      bank();
      remainingMs = Math.max(MIN_REMAINING_MS, remainingMs + sec * 1000);
      lengthMs = Math.max(lengthMs + sec * 1000, remainingMs);
      if (lengthMs < MIN_REMAINING_MS) lengthMs = MIN_REMAINING_MS;
      changed = true;
      sync();
    },
    /* "Set for this one": remaining time for the stream on screen only. */
    setRemaining: function (sec) {
      const ms = Math.max(MIN_REMAINING_MS, Math.round(sec * 1000));
      bank();
      active = true;
      remainingMs = ms;
      lengthMs = ms;
      changed = true;
      sync();
    },
    toggleLock: function () {
      if (!active) return false;
      locked = !locked;
      if (!locked) manualPause = false;
      sync();
      return locked;
    },
    setReason: function (name, on) {
      if (!!reasons[name] === !!on) return;
      reasons[name] = !!on;
      sync();
    },
    /* Called every ~200 ms by the page. Fires onExpire once at zero. */
    tick: function () {
      if (running() && remaining() <= 0) {
        bank();
        active = false;
        onChange(api.state());
        onExpire();
        return;
      }
      onChange(api.state());
    },
    /* Length the "Make this the default" button copies. */
    currentLengthSec: function () { return Math.round(lengthMs / 1000); },
    state: function () {
      const rem = remaining();
      let why = '';
      if (active && !locked && !manualPause) {
        if (reasons.typing) why = 'typing';
        else if (reasons.chat) why = 'typing in chat';
        else if (reasons.hidden) why = 'tab hidden';
        else if (reasons.mute) why = 'sound changed';
        else if (reasons.hover) why = 'pointer on the buttons';
        else if (reasons.modal) why = 'dialog open';
      }
      return {
        active: active,
        running: running(),
        locked: locked,
        manualPause: manualPause,
        autoReason: why,
        remainingMs: rem,
        lengthMs: lengthMs,
        fraction: active && lengthMs > 0 ? Math.max(0, Math.min(1, rem / lengthMs)) : (locked ? 1 : 0),
        warning: active && !locked && rem <= WARN_MS,
        changed: changed,
        differsFromDefault: changed && Math.round(lengthMs / 1000) !== Math.round(defaultMs / 1000)
      };
    }
  };
  return api;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ---------- the ring ---------- */

/* A stadium path that starts at the top centre and runs clockwise, so the
   same ring fits a round ROLL (desktop) and a full-width pill (phone).
   pathLength=100 makes the dash maths independent of the real size. */
export function ringPath(w, h, inset) {
  const x = inset, y = inset;
  const W = Math.max(2, w - inset * 2);
  const H = Math.max(2, h - inset * 2);
  const r = Math.min(W, H) / 2;
  const cx = x + W / 2;
  const f = function (n) { return Math.round(n * 100) / 100; };
  return 'M' + f(cx) + ' ' + f(y) +
    ' H' + f(x + W - r) +
    ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(x + W - r) + ' ' + f(y + H) +
    ' H' + f(x + r) +
    ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(x + r) + ' ' + f(y) +
    ' Z';
}

/* Dash pattern for the remaining fraction. Drains clockwise: the visible
   part is the tail of the path, so the gap grows from the top going round.
   Paused = the remaining part drawn dashed. Locked = solid full ring. */
export function ringDash(st) {
  if (st.locked) return { array: '100 0', offset: 0 };
  const rem = Math.max(0, Math.min(100, st.fraction * 100));
  if (!st.active || rem <= 0) return { array: '0 100', offset: 0 };
  const paused = !st.running;
  if (!paused) return { array: rem.toFixed(2) + ' 100', offset: -(100 - rem) };
  // dashed: segments of 1.6 on / 1.4 off across the remaining part
  const parts = [];
  let used = 0;
  while (used + 3 <= rem) { parts.push(1.6, 1.4); used += 3; }
  if (rem - used > 0) parts.push((rem - used).toFixed(2), 0);
  parts.push(0, 100);
  return { array: parts.join(' '), offset: -(100 - rem) };
}

/* Apply a timer state to the ring's <path> element. */
export function renderRing(path, st) {
  if (!path) return;
  const d = ringDash(st);
  path.setAttribute('stroke-dasharray', d.array);
  path.setAttribute('stroke-dashoffset', String(d.offset));
  const cls = ['ring-arc'];
  if (st.locked) cls.push('is-locked');
  else if (st.warning) cls.push('is-warn');
  if (st.active && !st.running && !st.locked) cls.push('is-paused');
  path.setAttribute('class', cls.join(' '));
}
