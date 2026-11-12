// Colour range: a soft mask from sampled colours (distance in CIE Lab to the nearest sample),
// from a hue family (full inside +-15 degrees of the hue, fading to nothing at +-45, weighted by
// chroma so greys never count), or from luminance bands. Reads the composite.
import type { ColorRangeOptions, CompositorLike, DocumentLike } from '../contract';
import type { Mask } from '../types';
import { createMask } from '../selection';
import { checkMask, readSource } from './common';

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** sRGB (D65) to CIE Lab, written into out[o..o+2]. */
function toLab(r: number, g: number, b: number, out: Float64Array, o: number): void {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = labF(x), fy = labF(y), fz = labF(z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

const HUE_CENTRE: Record<string, number> = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 };

function ramp(v: number, lo: number, hi: number): number {
  return v <= lo ? 0 : v >= hi ? 1 : (v - lo) / (hi - lo);
}

export function colorRange(compositor: CompositorLike, doc: DocumentLike, opts: ColorRangeOptions): Mask {
  const W = doc.width, H = doc.height, n = W * H;
  if (opts.within) checkMask(opts.within, W, H, 'Selection');
  const out = createMask(W, H);
  const o = out.data;
  const src = readSource(compositor, doc, true);
  const range = opts.range;
  const lab = new Float64Array(3);

  if (range === 'sampled') {
    const samples = opts.samples ?? [];
    const sl = new Float64Array(samples.length * 3);
    samples.forEach((s, i) => toLab(s[0] | 0, s[1] | 0, s[2] | 0, sl, i * 3));
    const fuzz = Math.max(0, Math.min(200, Number.isFinite(opts.fuzziness) ? opts.fuzziness : 40));
    const F = fuzz / 2 + 0.5;
    let pr = -1, pg = -1, pb = -1, pv = 0;
    for (let p = 0, j = 0; p < n; p++, j += 4) {
      let v = 0;
      if (samples.length) {
        const r = src[j], g = src[j + 1], b = src[j + 2];
        if (r === pr && g === pg && b === pb) v = pv;
        else {
          toLab(r, g, b, lab, 0);
          let best = Infinity;
          for (let s = 0; s < sl.length; s += 3) {
            const dl = lab[0] - sl[s], da = lab[1] - sl[s + 1], db = lab[2] - sl[s + 2];
            const d = dl * dl + da * da + db * db;
            if (d < best) best = d;
          }
          v = Math.max(0, 1 - Math.sqrt(best) / F);
          pr = r; pg = g; pb = b; pv = v;
        }
      }
      o[p] = Math.round(v * src[j + 3]);
    }
  } else if (range === 'highlights' || range === 'midtones' || range === 'shadows') {
    for (let p = 0, j = 0; p < n; p++, j += 4) {
      const L = 0.2126 * src[j] + 0.7152 * src[j + 1] + 0.0722 * src[j + 2];
      let v: number;
      if (range === 'highlights') v = ramp(L, 145, 205);
      else if (range === 'shadows') v = 1 - ramp(L, 50, 110);
      else v = Math.min(ramp(L, 40, 100), 1 - ramp(L, 155, 215));
      o[p] = Math.round(v * src[j + 3]);
    }
  } else {
    const centre = HUE_CENTRE[range] ?? 0;
    for (let p = 0, j = 0; p < n; p++, j += 4) {
      const r = src[j], g = src[j + 1], b = src[j + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      if (c === 0) continue;
      let hue: number;
      if (mx === r) hue = ((g - b) / c) * 60;
      else if (mx === g) hue = ((b - r) / c) * 60 + 120;
      else hue = ((r - g) / c) * 60 + 240;
      let dh = Math.abs(hue - centre) % 360;
      if (dh > 180) dh = 360 - dh;
      const hv = 1 - ramp(dh, 15, 45);
      const cv = ramp(c, 20, 90);
      o[p] = Math.round(hv * cv * src[j + 3]);
    }
  }

  if (opts.invert) for (let p = 0; p < n; p++) o[p] = 255 - o[p];
  if (opts.within) {
    const w = opts.within.data;
    for (let p = 0; p < n; p++) o[p] = Math.round((o[p] * w[p]) / 255);
  }
  return out;
}
