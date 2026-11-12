// Shared helpers for the selection builders: pixel sources, size checks, luminance, gradients,
// Gaussian blur and bounding boxes. Everything works on flat typed arrays in document space.
import type { CompositorLike, DocumentLike } from '../contract';
import type { Mask, NodeId, Rect } from '../types';

/** Throws a readable error when a mask does not match the expected size. */
export function checkMask(m: Mask, w: number, h: number, what = 'Mask'): void {
  if (m.w !== w || m.h !== h || m.data.length !== w * h) {
    throw new Error(`${what} is ${m.w} x ${m.h} but the document is ${w} x ${h}`);
  }
}

export function emptyLike(m: Mask): Mask {
  return { w: m.w, h: m.h, data: new Uint8Array(m.w * m.h) };
}

export function copyOf(m: Mask): Mask {
  return { w: m.w, h: m.h, data: m.data.slice() };
}

/**
 * Document-sized straight-alpha RGBA of what the selection tools sample: the composite, or one
 * node's own content. The composite is read from the compositor as it stands (the UI keeps it
 * current); when its size does not match the document it is recomposited first.
 */
export function readSource(compositor: CompositorLike, doc: DocumentLike, sampleAll: boolean, nodeId?: NodeId): Uint8ClampedArray {
  const W = doc.width, H = doc.height;
  const id = sampleAll ? undefined : (nodeId ?? doc.activeId ?? undefined);
  const node = id ? doc.getNode(id) : undefined;
  if (id && !node) throw new Error('That layer no longer exists');
  if (node && node.type === 'raster') {
    return node.tiles.read({ x: -Math.round(node.x), y: -Math.round(node.y), w: W, h: H }).data;
  }
  if (node) return compositor.renderNode(doc, node.id).data;
  let img = compositor.readImageData();
  if (img.width !== W || img.height !== H) {
    compositor.composite(doc);
    img = compositor.readImageData();
  }
  return img.data;
}

/** Rec. 709 luma (0..255) and alpha as separate channels. */
export function lumaAlpha(rgba: Uint8ClampedArray, n: number): { lum: Uint8Array; alpha: Uint8Array } {
  const lum = new Uint8Array(n), alpha = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    lum[i] = (54 * rgba[j] + 183 * rgba[j + 1] + 19 * rgba[j + 2]) >> 8;
    alpha[i] = rgba[j + 3];
  }
  return { lum, alpha };
}

/**
 * Sobel gradient magnitude (|gx| + |gy|, 0..2040) of the larger of the luma and alpha edges, so an
 * object over transparency has an edge whatever its colour. Image borders are clamped.
 */
export function sobel(rgba: Uint8ClampedArray, w: number, h: number): Uint16Array {
  const n = w * h;
  const { lum, alpha } = lumaAlpha(rgba, n);
  const out = new Uint16Array(n);
  for (let y = 0; y < h; y++) {
    const ym = (y > 0 ? y - 1 : 0) * w, y0 = y * w, yp = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : x;
      let gx = lum[ym + xp] + 2 * lum[y0 + xp] + lum[yp + xp] - lum[ym + xm] - 2 * lum[y0 + xm] - lum[yp + xm];
      let gy = lum[yp + xm] + 2 * lum[yp + x] + lum[yp + xp] - lum[ym + xm] - 2 * lum[ym + x] - lum[ym + xp];
      let g = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
      gx = alpha[ym + xp] + 2 * alpha[y0 + xp] + alpha[yp + xp] - alpha[ym + xm] - 2 * alpha[y0 + xm] - alpha[yp + xm];
      gy = alpha[yp + xm] + 2 * alpha[yp + x] + alpha[yp + xp] - alpha[ym + xm] - 2 * alpha[ym + x] - alpha[ym + xp];
      const ga = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
      if (ga > g) g = ga;
      out[y0 + x] = g;
    }
  }
  return out;
}

/** Bounds of non-zero bytes, grown by pad and clipped to the mask. null when the mask is empty. */
export function grownBounds(m: Mask, pad: number): Rect | null {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  const d = m.data;
  for (let y = 0; y < m.h; y++) {
    const row = y * m.w;
    let first = -1;
    for (let x = 0; x < m.w; x++) if (d[row + x]) { first = x; break; }
    if (first < 0) continue;
    let last = first;
    for (let x = m.w - 1; x > first; x--) if (d[row + x]) { last = x; break; }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return null;
  const p = Math.max(0, Math.ceil(pad));
  const ax = Math.max(0, x0 - p), ay = Math.max(0, y0 - p);
  const bx = Math.min(m.w, x1 + 1 + p), by = Math.min(m.h, y1 + 1 + p);
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

/** Copies a rect of a mask into a Float32 buffer. */
export function cropFloat(m: Mask, r: Rect): Float32Array {
  const out = new Float32Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    const s = (y + r.y) * m.w + r.x, o = y * r.w;
    for (let x = 0; x < r.w; x++) out[o + x] = m.data[s + x];
  }
  return out;
}

/** Box radii for n passes approximating a Gaussian of the given sigma. */
function boxRadii(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = (r + 1) * src[o];
    for (let j = 1; j <= r; j++) sum += src[o + (j < last ? j : last)];
    for (let x = 0; x < w; x++) {
      dst[o + x] = sum * inv;
      const add = x + r + 1, sub = x - r;
      sum += src[o + (add < last ? add : last)] - src[o + (sub > 0 ? sub : 0)];
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, sums: Float64Array): void {
  const inv = 1 / (2 * r + 1);
  const last = h - 1;
  for (let x = 0; x < w; x++) sums[x] = (r + 1) * src[x];
  for (let j = 1; j <= r; j++) {
    const o = (j < last ? j : last) * w;
    for (let x = 0; x < w; x++) sums[x] += src[o + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const add = y + r + 1, sub = y - r;
    const ao = (add < last ? add : last) * w, so = (sub > 0 ? sub : 0) * w;
    for (let x = 0; x < w; x++) {
      dst[o + x] = sums[x] * inv;
      sums[x] += src[ao + x] - src[so + x];
    }
  }
}

/** In-place Gaussian blur (three box passes per axis, edges clamped so a full buffer stays full). */
export function gaussianBlur(buf: Float32Array, w: number, h: number, sigma: number): void {
  if (!(sigma > 0.2) || w === 0 || h === 0) return;
  const tmp = new Float32Array(buf.length);
  const sums = new Float64Array(w);
  for (const r of boxRadii(sigma, 3)) {
    if (r <= 0) continue;
    boxH(buf, tmp, w, h, r);
    boxV(tmp, buf, w, h, r, sums);
  }
}

/** Writes a Float32 region back into a mask (rounded, clamped 0..255). */
export function writeFloat(dst: Mask, r: Rect, buf: Float32Array): void {
  for (let y = 0; y < r.h; y++) {
    const s = y * r.w, o = (y + r.y) * dst.w + r.x;
    for (let x = 0; x < r.w; x++) {
      const v = buf[s + x];
      dst.data[o + x] = v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
    }
  }
}

/** Growable Int32 stack for flood fills (no pixel cap, no per-push allocation). */
export class IntStack {
  data = new Int32Array(4096);
  length = 0;
  push(v: number): void {
    if (this.length === this.data.length) {
      const next = new Int32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = v;
  }
  pop(): number {
    return this.data[--this.length];
  }
}
