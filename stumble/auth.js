/* Stumble - Sign in with Kick (OAuth 2.1 authorization code + PKCE S256).
   The page only ever holds the public client id. The code is exchanged by
   stumble-worker, which keeps the client secret and hands back our own
   HMAC-signed session token (no cookies). */
'use strict';

const AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
const SS_VERIFIER = 'stumble.pkce.verifier';
const SS_STATE = 'stumble.pkce.state';
const SS_RETURN = 'stumble.pkce.hash';

/* Local dev talks to `wrangler dev`; everything else to the deployed Worker. */
export function workerBase(hostname) {
  const h = hostname || (typeof location !== 'undefined' ? location.hostname : '');
  if (h === '127.0.0.1' || h === 'localhost' || h === '[::1]') return 'http://127.0.0.1:8787';
  return 'https://stumble-worker.sevendwarfs.workers.dev';
}

export function isLocalHost(hostname) {
  const h = hostname || location.hostname;
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

/* The registered redirect URL: this page's folder, no file name, no query. */
export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteCount) {
  const a = new Uint8Array(byteCount);
  crypto.getRandomValues(a);
  return b64url(a);
}

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/* Step 1: remember verifier + state for this tab, then go to Kick. */
export async function beginLogin(clientId) {
  const verifier = randomString(48); // 64 chars, inside the 43-128 range
  const state = randomString(16);
  const challenge = await challengeFor(verifier);
  sessionStorage.setItem(SS_VERIFIER, verifier);
  sessionStorage.setItem(SS_STATE, state);
  sessionStorage.setItem(SS_RETURN, location.hash || '');
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: 'user:read',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: state
  });
  location.assign(AUTHORIZE_URL + '?' + q.toString());
}

/* Step 2: on load, pick up ?code=&state= (or ?error=). Strips the query from
   the address either way. Returns null when this load is not a redirect. */
export function takeRedirect() {
  const p = new URLSearchParams(location.search);
  const code = p.get('code');
  const err = p.get('error');
  if (!code && !err) return null;
  const stateBack = p.get('state');
  const verifier = sessionStorage.getItem(SS_VERIFIER);
  const stateSent = sessionStorage.getItem(SS_STATE);
  const hash = sessionStorage.getItem(SS_RETURN) || '';
  sessionStorage.removeItem(SS_VERIFIER);
  sessionStorage.removeItem(SS_STATE);
  sessionStorage.removeItem(SS_RETURN);
  // keep any other query params (e.g. ?ga=off) but drop the OAuth ones
  ['code', 'state', 'error', 'error_description'].forEach(function (k) { p.delete(k); });
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + hash);
  if (err) return { error: p.get('error_description') || err };
  if (!verifier || !stateSent || stateBack !== stateSent) return { error: 'Sign-in check failed (state mismatch). Try again.' };
  return { code: code, verifier: verifier };
}

async function post(base, path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) throw new Error(data.error || ('Sign-in failed (' + res.status + ')'));
  return data;
}

/* Step 3: the Worker swaps the code for tokens and returns {session, user}. */
export function exchange(base, code, verifier) {
  return post(base, '/auth/exchange', { code: code, code_verifier: verifier, redirect_uri: redirectUri() });
}

/* Dev only: works when the local Worker runs with DEV_FAKE_LOGIN=1. */
export function devLogin(base, name) {
  return post(base, '/auth/dev', { name: name });
}
