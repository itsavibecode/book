// Transform selection: inverse mapping of every destination pixel centre through the inverted
// matrix (affine or projective), sampled with nearest, bilinear or Catmull-Rom bicubic. Outside the
// source mask counts as unselected. Kept independent of src/engine/transform on purpose.
import type { Interpolation, Mask, Mat3 } from '../types';
import { checkMask, emptyLike, grownBounds } from './common';

/** Inverse of a row-major 3x3 matrix, null when singular. */
export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

function cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

export function transformMask(m: Mask, mat: Mat3, interpolation: Interpolation): Mask {
  checkMask(m, m.w, m.h);
  const out = emptyLike(m);
  const W = m.w, H = m.h;
  if (!Array.isArray(mat) || mat.length !== 9 || mat.some((v) => !Number.isFinite(v))) throw new Error('Transform matrix must be 9 finite numbers');
  const inv = invert3(mat);
  const src = grownBounds(m, 2);
  if (!inv || !src) return out;
  // Destination bounds: forward-map the source corners (whole mask when a corner goes to infinity).
  let dx0 = 0, dy0 = 0, dx1 = W, dy1 = H;
  const cs = [[src.x, src.y], [src.x + src.w, src.y], [src.x, src.y + src.h], [src.x + src.w, src.y + src.h]];
  let ok = true, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of cs) {
    const w = mat[6] * x + mat[7] * y + mat[8];
    if (!(w > 1e-9)) { ok = false; break; }
    const X = (mat[0] * x + mat[1] * y + mat[2]) / w, Y = (mat[3] * x + mat[4] * y + mat[5]) / w;
    if (X < minX) minX = X;
    if (X > maxX) maxX = X;
    if (Y < minY) minY = Y;
    if (Y > maxY) maxY = Y;
  }
  if (ok) {
    dx0 = Math.max(0, Math.floor(minX) - 2); dy0 = Math.max(0, Math.floor(minY) - 2);
    dx1 = Math.min(W, Math.ceil(maxX) + 2); dy1 = Math.min(H, Math.ceil(maxY) + 2);
  }
  const d = m.data, o = out.data;
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < W && y < H ? d[y * W + x] : 0);
  const [a, b, c, e, f, g, h, i, j] = inv;
  for (let y = dy0; y < dy1; y++) {
    const Y = y + 0.5;
    for (let x = dx0; x < dx1; x++) {
      const X = x + 0.5;
      const w = h * X + i * Y + j;
      if (!(w > 1e-12)) continue;
      const sx = (a * X + b * Y + c) / w, sy = (e * X + f * Y + g) / w;
      let v: number;
      if (interpolation === 'nearest') {
        v = at(Math.floor(sx), Math.floor(sy));
      } else {
        const u = sx - 0.5, t = sy - 0.5;
        const x0 = Math.floor(u), y0 = Math.floor(t);
        if (x0 < -2 || y0 < -2 || x0 > W + 1 || y0 > H + 1) continue;
        const fx = u - x0, fy = t - y0;
        if (interpolation === 'bicubic') {
          const r0 = cubic(fx, at(x0 - 1, y0 - 1), at(x0, y0 - 1), at(x0 + 1, y0 - 1), at(x0 + 2, y0 - 1));
          const r1 = cubic(fx, at(x0 - 1, y0), at(x0, y0), at(x0 + 1, y0), at(x0 + 2, y0));
          const r2 = cubic(fx, at(x0 - 1, y0 + 1), at(x0, y0 + 1), at(x0 + 1, y0 + 1), at(x0 + 2, y0 + 1));
          const r3 = cubic(fx, at(x0 - 1, y0 + 2), at(x0, y0 + 2), at(x0 + 1, y0 + 2), at(x0 + 2, y0 + 2));
          v = cubic(fy, r0, r1, r2, r3);
        } else {
          const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
          const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
          v = top + (bot - top) * fy;
        }
      }
      o[y * W + x] = v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
    }
  }
  return out;
}
