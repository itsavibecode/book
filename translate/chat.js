/* Kick Translate - the chat relay socket and the line renderer.
   The socket is stumble-worker's /chat-ws relay (read-only; nothing is ever
   sent upstream). Reconnect rules are Stumble's chatCounter(): 12 s to get
   {"ready":true}, then up to 4 retries with a growing delay, then 'failed'.
   Keep-alive is "{}" every 25 s, which the relay echoes back.
   Parsing is pure (tools/selftest.mjs imports it under Node); only the
   render* functions touch the DOM. */
'use strict';

import { emoteUrl } from './kick.js';

/* Opens the relay at `wsUrl`. `onStatus(status)` gets 'connecting' |
   'live' | 'reconnecting' | 'failed'; `onEvent(ev)` gets parsed events (see
   parseEvent). Returns {stop}. */
export function chatFeed(wsUrl, onStatus, onEvent) {
  let ws = null, ready = false, stopped = false, pingTimer = 0, attempts = 0;

  function setStatus(s) { if (!stopped) onStatus(s); }

  function open() {
    if (stopped) return;
    try { ws = new WebSocket(wsUrl); } catch (e) { setStatus('failed'); return; }
    const sock = ws;
    ready = false;
    const to = setTimeout(function () { if (!ready && sock === ws) { try { sock.close(); } catch (e) { /* ignore */ } } }, 12000);
    sock.onmessage = function (raw) {
      if (stopped || sock !== ws) return;
      const text = String(raw.data);
      if (text === '{}') return;                                   // our keep-alive echoed back
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (m.ready) { clearTimeout(to); ready = true; attempts = 0; setStatus('live'); return; }
      if (m.push && m.push.pub) {
        const ev = parseEvent(m.push.pub);
        if (ev) onEvent(ev);
      }
    };
    sock.onclose = function () {
      clearTimeout(to);
      if (sock !== ws || stopped) return;
      if (++attempts > 4) { setStatus('failed'); return; }
      setStatus('reconnecting');
      setTimeout(open, 1500 * attempts);
    };
  }

  setStatus('connecting');
  open();
  pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('{}'); }, 25000);
  return {
    stop: function () {
      stopped = true;
      clearInterval(pingTimer);
      try { if (ws) ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }
  };
}

/* ---------- parsing ---------- */

/* One Centrifugo publication -> an event or null:
     {kind:'message', id, content, time, user, badges, reply}
     {kind:'deleted', id}            one message removed by a moderator
     {kind:'banned', userId, name}   a user banned or timed out (Kick hides their lines)
     {kind:'cleared'}                the whole chat cleared
   pub.data = { event: 'App\\Events\\ChatMessageEvent', data: '<json string>' }
   Only ChatMessageEvent was seen in captures (2026-10-20); the other three
   follow the shapes Kick used on Pusher and are parsed defensively. */
export function parseEvent(pub) {
  const d = pub && pub.data;
  if (!d) return null;
  const name = String(d.event || '');
  let m = d.data;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return null; } }
  if (!m || typeof m !== 'object') return null;
  if (/ChatMessage(Sent)?Event$/.test(name)) return parseMessage(m);
  if (/MessageDeletedEvent$/.test(name)) {
    const id = (m.message && m.message.id) || m.message_id || '';
    return id ? { kind: 'deleted', id: String(id) } : null;
  }
  if (/UserBannedEvent$/.test(name)) {
    const u = m.user || {};
    return { kind: 'banned', userId: String(u.id || ''), name: String(u.username || u.slug || '').toLowerCase() };
  }
  if (/ChatroomClearEvent$/.test(name)) return { kind: 'cleared' };
  return null;
}

function badgeTitle(b) {
  const md = b.metadata || {};
  const base = String(b.text || b.name || b.type || 'badge').replace(/_/g, ' ');
  const nice = base.charAt(0).toUpperCase() + base.slice(1);
  if (md.level != null) return nice + ' ' + md.level;
  const months = md.months != null ? md.months : b.count;
  if (months != null && /sub/i.test(base)) return nice + ', ' + months + (months === 1 ? ' month' : ' months');
  return nice;
}

export function parseMessage(m) {
  const s = m.sender || m.user || {};
  const idt = s.identity || {};
  const badges = [];
  // badges_v2 carries a ready-made image per badge; the older badges[] list
  // only names a type, rendered as a small coloured chip.
  if (Array.isArray(idt.badges_v2) && idt.badges_v2.length) {
    idt.badges_v2.slice().sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }).forEach(function (b) {
      if (b && /^https:\/\//.test(b.image_url || '')) badges.push({ img: b.image_url, title: badgeTitle(b), type: String(b.name || '') });
    });
  } else if (Array.isArray(idt.badges)) {
    idt.badges.forEach(function (b) {
      if (b && b.type) badges.push({ img: '', title: badgeTitle(b), type: String(b.type) });
    });
  }
  const md = m.metadata || {};
  let reply = null;
  if (md.original_sender && md.original_message) {
    reply = {
      name: String(md.original_sender.username || md.original_sender.slug || '?'),
      content: String(md.original_message.content || '')
    };
  }
  return {
    kind: 'message',
    id: String(m.id || ''),
    content: String(m.content || ''),
    time: Date.parse(m.created_at || '') || Date.now(),
    user: {
      id: String(s.id || ''),
      name: String(s.username || s.slug || '?'),
      slug: String(s.slug || s.username || '').toLowerCase(),
      color: /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(idt.color || '') ? idt.color : ''
    },
    badges: badges,
    reply: reply
  };
}

/* Splits message text into tokens for the renderer:
   {t:'text', v} | {t:'emote', id, name} | {t:'link', v} | {t:'mention', v} */
const TOKEN_RE = /\[emote:(\d+):([^\]]*)\]|(https?:\/\/[^\s<>"]+)|(@[A-Za-z0-9_]{2,30})/g;
export function tokenize(text) {
  const out = [];
  let last = 0, m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: 'emote', id: m[1], name: m[2] || 'emote' });
    else if (m[3]) out.push({ t: 'link', v: m[3] });
    else out.push({ t: 'mention', v: m[4] });
    last = TOKEN_RE.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/* Quoted text for "Replying to": emotes shown by name, nothing clickable. */
export function plainText(text) {
  return tokenize(text).map(function (k) { return k.t === 'emote' ? ':' + k.name + ':' : k.v; }).join('');
}

/* ---------- name colour with a contrast floor ---------- */

function lum(rgb) {
  const c = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const colorCache = new Map();
/* Kick lets people pick near-black names; on our #050506 ground those
   vanish. Lift any colour toward white until it reaches 4.5:1. */
export function readableColor(hex) {
  if (!hex) return '';
  if (colorCache.has(hex)) return colorCache.get(hex);
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
  let rgb = [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  const bg = lum([5, 5, 6]);
  for (let i = 0; i < 20 && (lum(rgb) + 0.05) / (bg + 0.05) < 4.5; i++) {
    rgb = rgb.map(function (v) { return Math.round(v + (255 - v) * 0.15); });
  }
  const out = 'rgb(' + rgb.join(',') + ')';
  colorCache.set(hex, out);
  return out;
}

/* ---------- renderer ---------- */

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function clock(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* Appends message text to `box`: emotes as 24 px images, links clickable,
   mentions bold. Emoji are user content and stay text. */
export function renderContent(text, box) {
  tokenize(text).forEach(function (k) {
    if (k.t === 'text') box.appendChild(document.createTextNode(k.v));
    else if (k.t === 'emote') {
      const img = el('img', 'em');
      img.src = emoteUrl(k.id);
      img.alt = ':' + k.name + ':';
      img.title = k.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 24; img.height = 24;
      img.onerror = function () { img.replaceWith(document.createTextNode(':' + k.name + ':')); };
      box.appendChild(img);
    } else if (k.t === 'link') {
      const a = el('a', 'lk', k.v);
      a.href = k.v;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      box.appendChild(a);
    } else box.appendChild(el('b', 'mn', k.v));
  });
}

export function renderRow(msg) {
  const r = el('div', 'row');
  r.dataset.id = msg.id;
  r.dataset.uid = msg.user.id;
  r.dataset.un = msg.user.slug;
  if (msg.reply) {
    const rp = el('div', 'reply');
    rp.appendChild(document.createTextNode('Replying to '));
    rp.appendChild(el('b', null, '@' + msg.reply.name));
    rp.appendChild(document.createTextNode(': ' + plainText(msg.reply.content)));
    rp.title = 'This line answers an earlier one';
    r.appendChild(rp);
  }
  const o = el('div', 'orig');
  msg.badges.forEach(function (b) {
    if (b.img) {
      const i = el('img', 'bd');
      i.src = b.img; i.alt = b.title; i.title = b.title;
      i.width = 18; i.height = 18; i.decoding = 'async';
      i.onerror = function () { i.remove(); };
      o.appendChild(i);
    } else {
      const sp = el('span', 'bd t-' + b.type.replace(/[^a-z_]/gi, ''));
      sp.title = b.title;
      o.appendChild(sp);
    }
  });
  const nm = el('span', 'nm', msg.user.name);
  if (msg.user.color) nm.style.color = readableColor(msg.user.color);
  o.appendChild(nm);
  const tx = el('span', 'tx');
  renderContent(msg.content, tx);
  o.appendChild(tx);
  r.appendChild(o);
  const ts = el('span', 'ts', clock(msg.time));
  ts.title = new Date(msg.time).toLocaleString();
  r.appendChild(ts);
  return r;
}

export function renderSystem(text) {
  const r = el('div', 'row sys');
  r.appendChild(el('div', 'orig', text));
  return r;
}
