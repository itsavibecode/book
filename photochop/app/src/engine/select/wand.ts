// Magic wand, Grow and Similar. Tolerance is the largest per-channel difference (R, G, B and A);
// when either side is fully transparent only alpha is compared, since its RGB means nothing.
import type { CompositorLike, DocumentLike, WandOptions } from '../contract';
import type { Mask, Point } from '../types';
import { createMask } from '../selection';
import { IntStack, checkMask, readSource } from './common';

function clampTol(t: number): number {
  return Number.isFinite(t) ? Math.max(0, Math.min(255, t)) : 0;
}

/** Largest channel difference between pixel j (byte offset) and the reference colour. */
function colourDiff(d: Uint8ClampedArray, j: number, sr: number, sg: number, sb: number, sa: number): number {
  const a = d[j + 3];
  const da = a > sa ? a - sa : sa - a;
  if (sa === 0 || a === 0) return da;
  const dr = d[j] > sr ? d[j] - sr : sr - d[j];
  const dg = d[j + 1] > sg ? d[j + 1] - sg : sg - d[j + 1];
  const db = d[j + 2] > sb ? d[j + 2] - sb : sb - d[j + 2];
  let m = dr > dg ? dr : dg;
  if (db > m) m = db;
  return da > m ? da : m;
}

export function magicWand(compositor: CompositorLike, doc: DocumentLike, at: Point, opts: WandOptions): Mask {
  const W = doc.width, H = doc.height;
  const out = createMask(W, H);
  const ax = Math.floor(at.x), ay = Math.floor(at.y);
  if (!(ax >= 0 && ay >= 0 && ax < W && ay < H)) return out;
  const src = readSource(compositor, doc, opts.sampleAllLayers, opts.nodeId);
  const tol = clampTol(opts.tolerance);
  const si = (ay * W + ax) * 4;
  const sr = src[si], sg = src[si + 1], sb = src[si + 2], sa = src[si + 3];
  const o = out.data;
  let minY = ay, maxY = ay;
  if (opts.contiguous) {
    const stack = new IntStack();
    stack.push(ay * W + ax);
    while (stack.length) {
      const p = stack.pop();
      if (o[p]) continue;
      const y = (p / W) | 0, row = y * W;
      let xl = p - row, xr = xl;
      while (xl > 0 && !o[row + xl - 1] && colourDiff(src, (row + xl - 1) * 4, sr, sg, sb, sa) <= tol) xl--;
      while (xr < W - 1 && !o[row + xr + 1] && colourDiff(src, (row + xr + 1) * 4, sr, sg, sb, sa) <= tol) xr++;
      o.fill(255, row + xl, row + xr + 1);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let ny = y - 1; ny <= y + 1; ny += 2) {
        if (ny < 0 || ny >= H) continue;
        const nrow = ny * W;
        let inRun = false;
        for (let x = xl; x <= xr; x++) {
          const q = nrow + x;
          const ok = !o[q] && colourDiff(src, q * 4, sr, sg, sb, sa) <= tol;
          if (ok && !inRun) { stack.push(q); inRun = true; } else if (!ok) inRun = false;
        }
      }
    }
  } else {
    minY = H; maxY = -1;
    for (let p = 0, j = 0; p < W * H; p++, j += 4) {
      if (colourDiff(src, j, sr, sg, sb, sa) <= tol) {
        o[p] = 255;
        const y = (p / W) | 0;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (opts.antialias && maxY >= 0) {
    // Soften the outer ring by one pixel: how far beyond the tolerance the pixel is, over a ramp.
    const ramp = Math.max(8, tol);
    for (let y = Math.max(0, minY - 1); y <= Math.min(H - 1, maxY + 1); y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const p = row + x;
        if (o[p]) continue;
        const near = (x > 0 && o[p - 1] === 255) || (x < W - 1 && o[p + 1] === 255)
          || (y > 0 && o[p - W] === 255) || (y < H - 1 && o[p + W] === 255);
        if (!near) continue;
        const f = 1 - (colourDiff(src, p * 4, sr, sg, sb, sa) - tol) / ramp;
        if (f > 0) o[p] = Math.min(254, Math.round(f * 255));
      }
    }
  }
  return out;
}

// ----- Grow and Similar: a set of the selected colours, 6 bits per channel -----

const BITS = 6, SIDE = 1 << BITS, SHIFT = 8 - BITS;

interface ColourSet { table: Uint8Array; transparent: boolean }

function dilateAxis(src: Uint8Array, dst: Uint8Array, r: number, stride: number, outer: number, inner: number): void {
  // Lines run along `stride`; (outer, inner) enumerate line starts.
  for (let a = 0; a < SIDE; a++) {
    for (let b = 0; b < SIDE; b++) {
      const base = a * outer + b * inner;
      let cnt = 0;
      for (let i = 0; i <= r && i < SIDE; i++) cnt += src[base + i * stride];
      for (let i = 0; i < SIDE; i++) {
        dst[base + i * stride] = cnt > 0 ? 1 : 0;
        const add = i + r + 1, sub = i - r;
        if (add < SIDE) cnt += src[base + add * stride];
        if (sub >= 0) cnt -= src[base + sub * stride];
      }
    }
  }
}

function buildSet(src: Uint8ClampedArray, m: Mask, tolerance: number): ColourSet | null {
  const n = m.w * m.h;
  const table = new Uint8Array(SIDE * SIDE * SIDE);
  let transparent = false, any = false;
  let cut = 128;
  for (let p = 0; p < n; p++) if (m.data[p] >= 128) { any = true; break; }
  if (!any) cut = 1;
  any = false;
  for (let p = 0, j = 0; p < n; p++, j += 4) {
    if (m.data[p] < cut) continue;
    any = true;
    if (src[j + 3] === 0) { transparent = true; continue; }
    table[((src[j] >> SHIFT) << (2 * BITS)) | ((src[j + 1] >> SHIFT) << BITS) | (src[j + 2] >> SHIFT)] = 1;
  }
  if (!any) return null;
  const r = Math.floor(clampTol(tolerance) / (1 << SHIFT));
  if (r > 0) {
    const tmp = new Uint8Array(table.length);
    dilateAxis(table, tmp, r, 1, SIDE * SIDE, SIDE);              // blue
    dilateAxis(tmp, table, r, SIDE, SIDE * SIDE, 1);              // green
    dilateAxis(table, tmp, r, SIDE * SIDE, SIDE, 1);              // red
    table.set(tmp);
  }
  return { table, transparent };
}

function inSet(s: ColourSet, src: Uint8ClampedArray, j: number): boolean {
  if (src[j + 3] === 0) return s.transparent;
  return s.table[((src[j] >> SHIFT) << (2 * BITS)) | ((src[j + 1] >> SHIFT) << BITS) | (src[j + 2] >> SHIFT)] === 1;
}

/** Adds every pixel connected to the selection whose colour is in the set of selected colours (within tolerance), until nothing more is added. */
export function growSelection(compositor: CompositorLike, doc: DocumentLike, m: Mask, tolerance: number): Mask {
  const W = doc.width, H = doc.height;
  checkMask(m, W, H, 'Selection');
  const out = { w: W, h: H, data: m.data.slice() };
  const src = readSource(compositor, doc, true);
  const set = buildSet(src, m, tolerance);
  if (!set) return out;
  const o = out.data;
  const seen = new Uint8Array(W * H);
  const stack = new IntStack();
  for (let p = 0; p < W * H; p++) if (o[p]) { seen[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop();
    const y = (p / W) | 0, x = p - y * W;
    for (let k = 0; k < 4; k++) {
      let q: number;
      if (k === 0) { if (x === 0) continue; q = p - 1; }
      else if (k === 1) { if (x === W - 1) continue; q = p + 1; }
      else if (k === 2) { if (y === 0) continue; q = p - W; }
      else { if (y === H - 1) continue; q = p + W; }
      if (seen[q]) continue;
      seen[q] = 1;
      if (!inSet(set, src, q * 4)) continue;
      o[q] = 255;
      stack.push(q);
    }
  }
  return out;
}

/** Adds every pixel in the document whose colour is in the set of selected colours (within tolerance). */
export function similarSelection(compositor: CompositorLike, doc: DocumentLike, m: Mask, tolerance: number): Mask {
  const W = doc.width, H = doc.height;
  checkMask(m, W, H, 'Selection');
  const out = { w: W, h: H, data: m.data.slice() };
  const src = readSource(compositor, doc, true);
  const set = buildSet(src, m, tolerance);
  if (!set) return out;
  for (let p = 0, j = 0; p < W * H; p++, j += 4) if (inSet(set, src, j)) out.data[p] = 255;
  return out;
}
