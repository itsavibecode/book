import type { RGBA } from './types';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function colorToCss(c: RGBA): string {
  const [r, g, b, a] = c;
  if (a >= 255) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const alpha = Math.round((Math.max(0, a) / 255) * 1000) / 1000;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function channel(s: string, max: number): number | null {
  const t = s.trim();
  if (t.endsWith('%')) {
    const p = parseFloat(t);
    return Number.isFinite(p) ? Math.round(Math.max(0, Math.min(100, p)) / 100 * max) : null;
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

export function cssToColor(css: string): RGBA | null {
  const s = css.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const v = [...h].map((ch) => parseInt(ch + ch, 16));
      return [v[0], v[1], v[2], h.length === 4 ? v[3] : 255];
    }
    if (h.length === 6 || h.length === 8) {
      const v = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
      return [v[0], v[1], v[2], v[3]];
    }
    return null;
  }
  const m = /^rgba?\((.*)\)$/.exec(s);
  if (!m) return null;
  // Accept both 'r, g, b, a' and the modern 'r g b / a' syntax.
  const parts = m[1].includes(',') ? m[1].split(',') : m[1].replace('/', ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const rgb = parts.slice(0, 3).map((p) => channel(p, 255));
  if (rgb.some((v) => v === null)) return null;
  let a = 255;
  if (parts.length === 4) {
    const t = parts[3].trim();
    const v = t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
    if (!Number.isFinite(v)) return null;
    a = Math.round(Math.max(0, Math.min(1, v)) * 255);
  }
  const c = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v as number))));
  return [c[0], c[1], c[2], a];
}
