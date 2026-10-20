/* Kick Translate - the chat relay socket and the line renderer.
   The socket is stumble-worker's /chat-ws relay (read-only; nothing is ever
   sent upstream). Reconnect rules are Stumble's chatCounter(): 12 s to get
   {"ready":true}, then up to 4 retries with a growing delay, then 'failed'.
   Keep-alive is "{}" every 25 s, which the relay echoes back. */
'use strict';

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

/* One Centrifugo publication -> {kind:'message', ...} or null.
   pub.data = { event: 'App\\Events\\ChatMessageEvent', data: '<json string>' } */
export function parseEvent(pub) {
  const d = pub && pub.data;
  if (!d) return null;
  const name = String(d.event || '');
  let m = d.data;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return null; } }
  if (!m || typeof m !== 'object') return null;
  if (/ChatMessage(Sent)?Event$/.test(name)) return parseMessage(m);
  return null;
}

export function parseMessage(m) {
  const s = m.sender || m.user || {};
  const idt = s.identity || {};
  return {
    kind: 'message',
    id: String(m.id || ''),
    content: String(m.content || ''),
    time: Date.parse(m.created_at || '') || Date.now(),
    user: {
      id: String(s.id || ''),
      name: String(s.username || s.slug || '?'),
      slug: String(s.slug || '').toLowerCase(),
      color: /^#[0-9a-f]{3,8}$/i.test(idt.color || '') ? idt.color : ''
    }
  };
}

/* ---------- renderer ---------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function clock(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* v0.1.0: name in its colour, the text exactly as Kick sent it. */
export function renderRow(msg) {
  const r = el('div', 'row');
  r.dataset.id = msg.id;
  const o = el('div', 'orig');
  const nm = el('span', 'nm', msg.user.name);
  if (msg.user.color) nm.style.color = msg.user.color;
  o.appendChild(nm);
  o.appendChild(document.createTextNode(msg.content));
  r.appendChild(o);
  const ts = el('span', 'ts', clock(msg.time));
  ts.title = new Date(msg.time).toLocaleString();
  r.appendChild(ts);
  return r;
}
