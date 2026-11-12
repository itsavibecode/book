// Select > Modify: feather, expand, contract, smooth, border. Each returns a new mask and works
// only inside the selection's bounds grown by what the operation can reach.
//
// Expand and contract use an exact Euclidean distance transform (a round structuring element at
// any radius, O(N)). For a hard mask the result is exact with a one-pixel antialiased edge. Soft
// coverage is kept: beyond the new edge each pixel takes the original value found `px` closer to
// the selection along the line to its nearest selected pixel, so a feathered edge moves outward
// (or inward) with its profile intact instead of being thresholded.
import type { Mask, Rect } from '../types';
import { checkMask, copyOf, cropFloat, emptyLike, gaussianBlur, grownBounds, writeFloat } from './common';
import { EDT_INF, distanceField } from './edt';

const MAX_RADIUS = 250;

function radius(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(MAX_RADIUS, v)) : 0;
}

/** Grey dilation (invert = false) or erosion (invert = true) by a disc of radius r inside region. */
function morph(m: Mask, region: Rect, r: number, invert: boolean): Mask {
  const out = copyOf(m);
  const { x: rx, y: ry, w: rw, h: rh } = region;
  const n = rw * rh;
  const vals = new Uint8Array(n);
  let max = 0;
  for (let y = 0; y < rh; y++) {
    const s = (y + ry) * m.w + rx;
    for (let x = 0; x < rw; x++) {
      const v = invert ? 255 - m.data[s + x] : m.data[s + x];
      vals[y * rw + x] = v;
      if (v > max) max = v;
    }
  }
  if (max === 0) return out;
  const cut = max >= 128 ? 128 : max;
  const set = new Uint8Array(n);
  for (let i = 0; i < n; i++) set[i] = vals[i] >= cut ? 1 : 0;
  const { d2, feat } = distanceField(set, rw, rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      let v = vals[i];
      if (set[i]) {
        v = 255;
      } else if (d2[i] < EDT_INF) {
        const d = Math.sqrt(d2[i]);
        const edge = r + 1 - d;
        if (edge >= 1) v = 255;
        else {
          if (edge > 0) {
            const e = Math.round(edge * 255);
            if (e > v) v = e;
          }
          // Carry the soft profile: the original value r pixels closer to the nearest selected pixel.
          const f = feat[i];
          const fy = (f / rw) | 0, fx = f - fy * rw;
          const t = r / d;
          const qx = Math.round(x + (fx - x) * t), qy = Math.round(y + (fy - y) * t);
          const q = vals[qy * rw + qx];
          if (q < cut && q > v) v = q;
        }
      }
      out.data[(y + ry) * m.w + x + rx] = invert ? 255 - v : v;
    }
  }
  return out;
}

export function expandMask(m: Mask, px: number): Mask {
  checkMask(m, m.w, m.h);
  const r = radius(px);
  if (r <= 0) return copyOf(m);
  const region = grownBounds(m, r + 2);
  return region ? morph(m, region, r, false) : copyOf(m);
}

/** Image edges do not count as unselected, so a full selection stays full. */
export function contractMask(m: Mask, px: number): Mask {
  checkMask(m, m.w, m.h);
  const r = radius(px);
  if (r <= 0) return copyOf(m);
  const region = grownBounds(m, 2);
  return region ? morph(m, region, r, true) : copyOf(m);
}

/** Gaussian feather. sigma = radius / 2, so the soft edge spans about 2 x radius. */
export function featherMask(m: Mask, radiusPx: number): Mask {
  checkMask(m, m.w, m.h);
  const r = radius(radiusPx);
  const out = copyOf(m);
  if (r <= 0) return out;
  const sigma = r / 2;
  const region = grownBounds(m, sigma * 3 + 2);
  if (!region) return out;
  const buf = cropFloat(m, region);
  gaussianBlur(buf, region.w, region.h, sigma);
  writeFloat(out, region, buf);
  return out;
}

/**
 * Rounded majority filter: a Gaussian (sigma = radius / 2) followed by a steep ramp around 50
 * percent, which rounds corners and removes specks and notches smaller than the radius. The result
 * has an antialiased edge about one pixel wide (feathered edges are hardened, as a majority must).
 */
export function smoothMask(m: Mask, radiusPx: number): Mask {
  checkMask(m, m.w, m.h);
  const r = radius(radiusPx);
  const out = copyOf(m);
  if (r <= 0) return out;
  const sigma = Math.max(0.5, r / 2);
  const region = grownBounds(m, r + 2);
  if (!region) return out;
  const buf = cropFloat(m, region);
  gaussianBlur(buf, region.w, region.h, sigma);
  const gain = Math.max(1, sigma * 2.5);
  for (let i = 0; i < buf.length; i++) buf[i] = 127.5 + (buf[i] - 127.5) * gain;
  writeFloat(out, region, buf);
  return out;
}

/** A band straddling the selection edge, width px in total (half outside, half inside). */
export function borderMask(m: Mask, width: number): Mask {
  checkMask(m, m.w, m.h);
  const w = radius(width);
  if (w <= 0) return emptyLike(m);
  const outer = expandMask(m, w / 2);
  const inner = contractMask(m, w / 2);
  const out = emptyLike(m);
  const a = outer.data, b = inner.data, o = out.data;
  for (let i = 0; i < o.length; i++) {
    const v = 255 - b[i];
    o[i] = a[i] < v ? a[i] : v;
  }
  return out;
}
