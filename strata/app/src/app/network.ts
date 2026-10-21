// Network log: every resource the page loads after boot (PerformanceObserver) plus every
// fetch() call (wrapped), so the "On device" badge can prove the privacy promise. Requests to
// data: and blob: URLs never touch the network and are ignored.
import { networkLog, type NetEntry } from './state';

let bootTime = 0;
/** URLs logged by the fetch wrapper, waiting for their resource-timing entry to fill in bytes. */
const pendingFetch = new Map<string, NetEntry>();

function entryFor(url: string, type: string, method: string, bytes: number, time: number): NetEntry | null {
  let u: URL;
  try { u = new URL(url, location.href); } catch { return null; }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return null;
  return {
    url: u.href, origin: u.origin, path: u.pathname + u.search, type, method, bytes, time,
    crossOrigin: u.origin !== location.origin,
  };
}

function push(e: NetEntry): void {
  networkLog.value = [...networkLog.value, e].slice(-500);
}

export function initNetworkLog(): void {
  bootTime = performance.now();
  try {
    const po = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const r = raw as PerformanceResourceTiming;
        if (r.startTime < bootTime) continue;
        const pending = pendingFetch.get(r.name);
        if (pending && (r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest')) {
          pending.bytes = r.transferSize || r.encodedBodySize || 0;
          pendingFetch.delete(r.name);
          networkLog.value = networkLog.value.slice();
          continue;
        }
        const e = entryFor(r.name, r.initiatorType || 'other', 'GET', r.transferSize || r.encodedBodySize || 0, Date.now());
        if (e) push(e);
      }
    });
    po.observe({ type: 'resource', buffered: false });
  } catch { /* very old browser: fetch wrapper still works */ }

  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const e = entryFor(url, 'fetch', method, 0, Date.now());
    if (e) { pendingFetch.set(e.url, e); push(e); }
    return orig(input, init);
  };
}

export function clearNetworkLog(): void {
  networkLog.value = [];
  pendingFetch.clear();
}
