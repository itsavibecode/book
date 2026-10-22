// Head tags from the one constants file, plus the service worker registration.
import { APP_BASE, APP_NAME, APP_VERSION } from './constants';

export function applyHead(): void {
  document.title = `${APP_NAME} v${APP_VERSION}`;
  let meta = document.querySelector('meta[name="app-version"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'app-version');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', APP_VERSION);
}

/** Registers the app-shell service worker after load, only on https or localhost. */
export function registerServiceWorker(): void {
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure || !('serviceWorker' in navigator)) return;
  // The Playwright smoke run passes ?test=1; skip the worker there so reloads hit fresh files.
  if (new URLSearchParams(location.search).has('test')) return;
  const go = () => {
    try {
      navigator.serviceWorker.register(`${APP_BASE}sw.js`, { scope: APP_BASE }).catch(() => { /* offline support is optional */ });
    } catch { /* ignore */ }
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
