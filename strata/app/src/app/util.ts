// Small framework-free helpers shared by the shell, the panels and the tools.

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** True when keyboard input should go to a text field rather than to shortcuts. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLSelectElement) return false;
  if (t instanceof HTMLInputElement) {
    const nonText = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'];
    return !nonText.includes(t.type);
  }
  return false;
}

/** 'just now', '12 s ago', '2 min ago', '3 h ago', '4 days ago'. */
export function relTime(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function formatBytes(n: number): string {
  if (!isFinite(n) || n < 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Parses what people type into numeric fields: '24', '24px', '50%', '+10', '-5', '*2', '/2'.
 * A leading + - * / is relative to the current value. In a field whose unit is not '%',
 * '50%' means half of the current value. Returns null when the text is not a number.
 */
export function parseNumberInput(text: string, current: number, unit: string): number | null {
  let t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  const op = /^[+\-*/]/.test(t) && t.length > 1 ? t[0] : '';
  if (op) t = t.slice(1);
  let pct = false;
  if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
  else if (t.endsWith('px')) t = t.slice(0, -2);
  else if (t.endsWith('pt')) t = t.slice(0, -2);
  const n = Number(t);
  if (t === '' || !isFinite(n)) return null;
  let v = pct && unit !== '%' ? (current * n) / 100 : n;
  if (op === '+') v = current + v;
  else if (op === '-') v = current - v;
  else if (op === '*') v = current * n;
  else if (op === '/') v = n === 0 ? current : current / n;
  return v;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => { if (t) clearTimeout(t); t = undefined; };
  return d;
}

/** Runs fn at most once per animation frame. */
export function rafThrottle(fn: () => void): () => void {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

export function safeLocalGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function safeLocalSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode or blocked storage */ }
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
