// Refine edge (Select and Mask globals), applied in Photoshop's order: edge detection (radius),
// smooth, feather, contrast, shift edge. Every stage is the identity at 0.
//
// Edge detection: inside a band of `radius` pixels either side of the 50 percent edge, coverage is
// recomputed from colour. Each band pixel takes the colours of its nearest sure-selected and
// sure-unselected pixels (just outside the band, averaged over 3 x 3), and its alpha is where its
// own colour projects on the line between those two. Colours too close to tell apart keep the
// original coverage.
import type { CompositorLike, DocumentLike, RefineOptions } from '../contract';
import type { Mask, Rect } from '../types';
import { checkMask, copyOf, cropFloat, gaussianBlur, grownBounds, readSource, writeFloat } from './common';
import { distanceField } from './edt';
import { contractMask, expandMask, featherMask } from './modify';

function num(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0;
}

/** Mean colour of the `sure` pixels in the 3 x 3 around region index f, into rgb. */
function meanAround(src: Uint8ClampedArray, sure: Uint8Array, f: number, r: Rect, W: number, rgb: Float64Array): void {
  const fy = (f / r.w) | 0, fx = f - fy * r.w;
  let n = 0, cr = 0, cg = 0, cb = 0;
  for (let y = Math.max(0, fy - 1); y <= Math.min(r.h - 1, fy + 1); y++) {
    for (let x = Math.max(0, fx - 1); x <= Math.min(r.w - 1, fx + 1); x++) {
      if (!sure[y * r.w + x]) continue;
      const j = ((y + r.y) * W + x + r.x) * 4;
      cr += src[j]; cg += src[j + 1]; cb += src[j + 2]; n++;
    }
  }
  rgb[0] = cr / n; rgb[1] = cg / n; rgb[2] = cb / n;
}

function edgeDetect(src: Uint8ClampedArray, m: Mask, radius: number): Mask {
  const out = copyOf(m);
  const r = grownBounds(m, radius + 3);
  if (!r) return out;
  const n = r.w * r.h, W = m.w;
  const sel = new Uint8Array(n), uns = new Uint8Array(n);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const v = m.data[(y + r.y) * W + x + r.x] >= 128 ? 1 : 0;
      sel[y * r.w + x] = v;
      uns[y * r.w + x] = 1 - v;
    }
  }
  const toSel = distanceField(sel, r.w, r.h).d2;
  const toUns = distanceField(uns, r.w, r.h).d2;
  const r2 = radius * radius;
  const sureF = new Uint8Array(n), sureB = new Uint8Array(n), band = new Uint8Array(n);
  let anyF = false, anyB = false, anyBand = false;
  for (let i = 0; i < n; i++) {
    if (sel[i]) {
      if (toUns[i] > r2) { sureF[i] = 1; anyF = true; } else { band[i] = 1; anyBand = true; }
    } else if (toSel[i] > r2) { sureB[i] = 1; anyB = true; } else { band[i] = 1; anyBand = true; }
  }
  if (!anyBand || !anyF || !anyB) return out;
  const fF = distanceField(sureF, r.w, r.h).feat;
  const fB = distanceField(sureB, r.w, r.h).feat;
  const F = new Float64Array(3), B = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    if (!band[i] || fF[i] < 0 || fB[i] < 0) continue;
    meanAround(src, sureF, fF[i], r, W, F);
    meanAround(src, sureB, fB[i], r, W, B);
    const er = F[0] - B[0], eg = F[1] - B[1], eb = F[2] - B[2];
    const len2 = er * er + eg * eg + eb * eb;
    if (len2 < 400) continue;
    const y = (i / r.w) | 0, x = i - y * r.w;
    const j = ((y + r.y) * W + x + r.x) * 4;
    const a = ((src[j] - B[0]) * er + (src[j + 1] - B[1]) * eg + (src[j + 2] - B[2]) * eb) / len2;
    out.data[(y + r.y) * W + x + r.x] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
  }
  return out;
}

/** Light smoothing for refine: blur, then restore edge steepness so the contour rounds without spreading. */
function refineSmooth(m: Mask, amount: number): Mask {
  const out = copyOf(m);
  const sigma = (amount / 100) * 3;
  const r = grownBounds(m, sigma * 3 + 2);
  if (!r || sigma <= 0.2) return out;
  const buf = cropFloat(m, r);
  gaussianBlur(buf, r.w, r.h, sigma);
  const gain = 1 + amount / 50;
  for (let i = 0; i < buf.length; i++) buf[i] = 127.5 + (buf[i] - 127.5) * gain;
  writeFloat(out, r, buf);
  return out;
}

export function refineMask(compositor: CompositorLike, doc: DocumentLike, m: Mask, opts: RefineOptions): Mask {
  checkMask(m, doc.width, doc.height, 'Selection');
  const radius = num(opts.radius, 0, 250);
  const smooth = num(opts.smooth, 0, 100);
  const feather = num(opts.feather, 0, 250);
  const contrast = num(opts.contrast, 0, 100);
  const shift = num(opts.shiftEdge, -100, 100);
  let out = copyOf(m);
  if (radius > 0) out = edgeDetect(readSource(compositor, doc, true), out, radius);
  if (smooth > 0) out = refineSmooth(out, smooth);
  if (feather > 0) out = featherMask(out, feather);
  if (contrast > 0) {
    const d = out.data;
    if (contrast >= 100) {
      for (let i = 0; i < d.length; i++) d[i] = d[i] >= 128 ? 255 : 0;
    } else {
      const gain = 1 / (1 - contrast / 100);
      for (let i = 0; i < d.length; i++) {
        const v = 127.5 + (d[i] - 127.5) * gain;
        d[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
      }
    }
  }
  if (shift !== 0) {
    // Shift edge moves the edge by a share of the soft zone (at least 4 px at 100 percent).
    const px = (Math.abs(shift) / 100) * Math.max(4, feather, radius);
    out = shift > 0 ? expandMask(out, px) : contractMask(out, px);
  }
  return out;
}
