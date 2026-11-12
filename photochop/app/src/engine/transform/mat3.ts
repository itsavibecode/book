// Row-major 3x3 matrices mapping source space to document space:
//   x' = (m0 x + m1 y + m2) / w,  y' = (m3 x + m4 y + m5) / w,  w = m6 x + m7 y + m8
import type { Mat3, Point, Rect } from '../types';

const EPS = 1e-12;

export function mat3Identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/** a after b: result maps p -> a(b(p)). */
export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const o = new Array<number>(9) as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

export function mat3Translate(tx: number, ty: number): Mat3 {
  return [1, 0, tx, 0, 1, ty, 0, 0, 1];
}

/** Wraps m so it acts about (cx, cy) instead of the origin. */
function about(m: Mat3, cx = 0, cy = 0): Mat3 {
  if (cx === 0 && cy === 0) return m;
  return mat3Multiply(mat3Translate(cx, cy), mat3Multiply(m, mat3Translate(-cx, -cy)));
}

export function mat3Scale(sx: number, sy: number, cx?: number, cy?: number): Mat3 {
  return about([sx, 0, 0, 0, sy, 0, 0, 0, 1], cx, cy);
}

/** Clockwise on screen (y points down) for positive degrees. Exact for multiples of 90. */
export function mat3Rotate(degrees: number, cx?: number, cy?: number): Mat3 {
  const q = ((degrees % 360) + 360) % 360;
  let c: number, s: number;
  if (q === 0) { c = 1; s = 0; }
  else if (q === 90) { c = 0; s = 1; }
  else if (q === 180) { c = -1; s = 0; }
  else if (q === 270) { c = 0; s = -1; }
  else {
    const r = (degrees * Math.PI) / 180;
    c = Math.cos(r);
    s = Math.sin(r);
  }
  return about([c, -s, 0, s, c, 0, 0, 0, 1], cx, cy);
}

/** degX shears x by y (x' = x + tan(degX) y); degY shears y by x. */
export function mat3Skew(degX: number, degY: number, cx?: number, cy?: number): Mat3 {
  const tx = Math.tan((degX * Math.PI) / 180), ty = Math.tan((degY * Math.PI) / 180);
  return about([1, tx, 0, ty, 1, 0, 0, 0, 1], cx, cy);
}

export function mat3Apply(m: Mat3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  const iw = Math.abs(w) < EPS ? 0 : 1 / w;
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) * iw, y: (m[3] * p.x + m[4] * p.y + m[5]) * iw };
}

export function mat3IsAffine(m: Mat3): boolean {
  return m[6] === 0 && m[7] === 0 && m[8] === 1;
}

export function mat3Invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < EPS) return null;
  const k = 1 / det;
  const out: Mat3 = [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
  if (mat3IsAffine(m)) { out[6] = 0; out[7] = 0; out[8] = 1; }
  return out;
}

/** Projective map from the unit square's corners (0,0),(1,0),(1,1),(0,1) to q0..q3. */
function squareToQuad(q: [Point, Point, Point, Point]): Mat3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  }
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

/** Projective matrix taking the rect's corners to the four destination points (clockwise from top-left). */
export function mat3FromQuad(rect: Rect, to: [Point, Point, Point, Point]): Mat3 {
  const toUnit: Mat3 = [1 / rect.w, 0, -rect.x / rect.w, 0, 1 / rect.h, -rect.y / rect.h, 0, 0, 1];
  const m = mat3Multiply(squareToQuad(to), toUnit);
  // Normalise so m[8] is 1 when possible (keeps affine results recognisably affine).
  if (Math.abs(m[8]) > EPS && m[8] !== 1) for (let k = 0; k < 9; k++) m[k] /= m[8];
  if (Math.abs(m[6]) < 1e-15 && Math.abs(m[7]) < 1e-15) { m[6] = 0; m[7] = 0; m[8] = 1; }
  return m;
}

/** Axis-aligned bounds of a rect mapped through m (null when it crosses the horizon). */
export function mat3MapRect(m: Mat3, r: Rect): Rect | null {
  const pts = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const w = m[6] * p.x + m[7] * p.y + m[8];
    if (w <= EPS) return null;
    const q = mat3Apply(m, p);
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** True when the linear part only permutes and/or flips axes (quarter turns and flips). */
export function mat3IsAxisPermutation(m: Mat3): boolean {
  if (!mat3IsAffine(m)) return false;
  const near = (v: number, t: number) => Math.abs(v - t) < 1e-9;
  const unit = (v: number) => near(v, 1) || near(v, -1);
  return (unit(m[0]) && unit(m[4]) && near(m[1], 0) && near(m[3], 0))
    || (unit(m[1]) && unit(m[3]) && near(m[0], 0) && near(m[4], 0));
}
