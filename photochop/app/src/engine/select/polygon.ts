// Polygon to mask: scanline fill with the non-zero winding rule. With antialias each pixel is
// sampled on a 4 x 4 grid of sub-pixel centres, so axis-aligned rectangles on pixel (or quarter
// pixel) boundaries come out exact; without it, one sample at each pixel centre.
import type { Mask, Point } from '../types';
import { createMask } from '../selection';

export function polygonMask(w: number, h: number, points: Point[], antialias: boolean): Mask {
  const m = createMask(w, h);
  const W = m.w, H = m.h;
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 3 || W === 0 || H === 0) return m;
  const SS = antialias ? 4 : 1;

  // Edge table (horizontal edges never cross a scanline and are dropped).
  const yTop = new Float64Array(n), yBot = new Float64Array(n), xTop = new Float64Array(n), slope = new Float64Array(n);
  const dir = new Int8Array(n);
  let count = 0;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a.y === b.y) continue;
    const down = a.y < b.y;
    const t = down ? a : b, u = down ? b : a;
    yTop[count] = t.y; yBot[count] = u.y; xTop[count] = t.x;
    slope[count] = (u.x - t.x) / (u.y - t.y);
    dir[count] = down ? 1 : -1;
    if (t.y < minY) minY = t.y;
    if (u.y > maxY) maxY = u.y;
    count++;
  }
  if (count === 0) return m;
  const order = Array.from({ length: count }, (_, i) => i).sort((p, q) => yTop[p] - yTop[q]);
  const sorted = Int32Array.from(order);

  const cols = W * SS;
  const diff = new Int32Array(cols + 1);
  const active = new Int32Array(count);
  const xs = new Float64Array(count);
  const ds = new Int8Array(count);
  let activeCount = 0, next = 0;
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H, Math.ceil(maxY));
  const full = SS * SS;

  for (let y = y0; y < y1; y++) {
    let kMin = cols, kMax = 0;
    for (let s = 0; s < SS; s++) {
      const sy = y + (s + 0.5) / SS;
      // Rook-style offsets: each sub-row's samples shift by 1/16 px, so 45 degree edges see 16
      // distinct sample positions instead of 4 (pixel-aligned edges stay exact).
      const off = SS > 1 ? (s - (SS - 1) / 2) / (SS * SS) : 0;
      while (next < count && yTop[sorted[next]] <= sy) active[activeCount++] = sorted[next++];
      // Drop finished edges and collect crossings.
      let nx = 0, keep = 0;
      for (let a = 0; a < activeCount; a++) {
        const e = active[a];
        if (yBot[e] <= sy) continue;
        active[keep++] = e;
        const x = xTop[e] + (sy - yTop[e]) * slope[e];
        // Insertion sort by x.
        let j = nx++;
        while (j > 0 && xs[j - 1] > x) { xs[j] = xs[j - 1]; ds[j] = ds[j - 1]; j--; }
        xs[j] = x; ds[j] = dir[e];
      }
      activeCount = keep;
      let wind = 0, start = 0;
      for (let i = 0; i < nx; i++) {
        const before = wind;
        wind += ds[i];
        if (before === 0 && wind !== 0) start = xs[i];
        else if (before !== 0 && wind === 0) {
          let ka = Math.ceil((start - off) * SS - 0.5), kb = Math.ceil((xs[i] - off) * SS - 0.5);
          if (ka < 0) ka = 0;
          if (kb > cols) kb = cols;
          if (kb > ka) {
            diff[ka]++; diff[kb]--;
            if (ka < kMin) kMin = ka;
            if (kb > kMax) kMax = kb;
          }
        }
      }
    }
    if (kMax <= kMin) continue;
    const row = y * W;
    const px0 = Math.floor(kMin / SS), px1 = Math.ceil(kMax / SS);
    let run = 0;
    for (let k = px0 * SS; k < kMin; k++) run += diff[k];
    for (let x = px0; x < px1; x++) {
      let c = 0;
      const kb = x * SS;
      for (let t = 0; t < SS; t++) {
        run += diff[kb + t];
        c += run;
      }
      if (c) m.data[row + x] = c >= full ? 255 : Math.round((c * 255) / full);
    }
    diff.fill(0, px0 * SS, Math.min(cols + 1, px1 * SS + 1));
  }
  return m;
}
