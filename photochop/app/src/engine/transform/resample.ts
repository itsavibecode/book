// Resampling core: inverse mapping over destination pixels with premultiplied-alpha
// interpolation (no dark fringes), Catmull-Rom bicubic, and an exact path for quarter turns and
// flips. Pixel centres sit at i + 0.5 in every space.
import { TILE, type Interpolation, type Mask, type Mat3, type Point, type Rect, type TileStore } from '../types';
import { createTileStore, isTransparent } from '../tiles';
import { makeImageData, rectIntersect } from '../util';
import { mat3Apply, mat3Invert, mat3IsAffine, mat3IsAxisPermutation, mat3MapRect, mat3Multiply, mat3Translate } from './mat3';

type Buf = Uint8ClampedArray | Uint8Array;

/** Source pixels with the buffer's origin in source space. */
export interface SrcBuf { data: Buf; w: number; h: number; x: number; y: number; ch: 1 | 4 }

const cubic = (t: number): number => {
  // Catmull-Rom (a = -0.5)
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 0;
};

const WX = new Float64Array(4);
const WY = new Float64Array(4);
const ACC = new Float64Array(4);

/**
 * Samples src at buffer coordinates (bu, bv) (continuous, centres at i + 0.5) into out[oi..].
 * Outside the buffer counts as transparent / zero.
 */
export function sample(s: SrcBuf, bu: number, bv: number, interp: Interpolation, out: Buf, oi: number): void {
  const { data, w, h, ch } = s;
  if (interp === 'nearest') {
    const x = Math.floor(bu), y = Math.floor(bv);
    if (x < 0 || y < 0 || x >= w || y >= h) {
      for (let c = 0; c < ch; c++) out[oi + c] = 0;
      return;
    }
    const si = (y * w + x) * ch;
    for (let c = 0; c < ch; c++) out[oi + c] = data[si + c];
    return;
  }
  const fx = bu - 0.5, fy = bv - 0.5;
  let x0: number, y0: number, n: number;
  if (interp === 'bilinear') {
    x0 = Math.floor(fx); y0 = Math.floor(fy); n = 2;
    const tx = fx - x0, ty = fy - y0;
    WX[0] = 1 - tx; WX[1] = tx; WY[0] = 1 - ty; WY[1] = ty;
  } else {
    x0 = Math.floor(fx) - 1; y0 = Math.floor(fy) - 1; n = 4;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    for (let k = 0; k < 4; k++) { WX[k] = cubic(tx - (k - 1)); WY[k] = cubic(ty - (k - 1)); }
  }
  ACC[0] = ACC[1] = ACC[2] = ACC[3] = 0;
  for (let j = 0; j < n; j++) {
    const y = y0 + j;
    const wy = WY[j];
    if (y < 0 || y >= h || wy === 0) continue;
    for (let i = 0; i < n; i++) {
      const x = x0 + i;
      const wgt = WX[i] * wy;
      if (x < 0 || x >= w || wgt === 0) continue;
      const si = (y * w + x) * ch;
      if (ch === 1) {
        ACC[0] += wgt * data[si];
      } else {
        const a = data[si + 3];
        if (a === 0) continue;
        const wa = wgt * a;
        ACC[0] += wa * data[si]; ACC[1] += wa * data[si + 1]; ACC[2] += wa * data[si + 2]; ACC[3] += wa;
      }
    }
  }
  if (ch === 1) {
    const v = Math.round(ACC[0]);
    out[oi] = v < 0 ? 0 : v > 255 ? 255 : v;
    return;
  }
  let a = ACC[3];
  if (a <= 0.5) { out[oi] = out[oi + 1] = out[oi + 2] = out[oi + 3] = 0; return; }
  if (a > 255) a = 255;
  // Premultiplied colour clamped to [0, a], then back to straight alpha.
  for (let c = 0; c < 3; c++) {
    let p = ACC[c] / 255;
    if (p < 0) p = 0; else if (p > a) p = a;
    const v = Math.round((p * 255) / a);
    out[oi + c] = v > 255 ? 255 : v;
  }
  out[oi + 3] = Math.round(a);
}

/** Exact quarter turns / flips: snap the translation so pixel centres land on pixel centres. */
export function snapPermutation(m: Mat3): Mat3 {
  const p = mat3Apply(m, { x: 0.5, y: 0.5 });
  const dx = Math.round(p.x - 0.5) - (p.x - 0.5), dy = Math.round(p.y - 0.5) - (p.y - 0.5);
  const out = m.slice() as Mat3;
  out[2] += dx; out[5] += dy;
  for (const k of [0, 1, 3, 4]) out[k] = Math.round(out[k]);
  return out;
}

/** Prepares (matrix, interpolation) for resampling: exact path for permutations. */
export function plan(m: Mat3, interp: Interpolation): { m: Mat3; inv: Mat3; interp: Interpolation } | null {
  if (mat3IsAxisPermutation(m)) {
    const s = snapPermutation(m);
    const inv = mat3Invert(s);
    return inv ? { m: s, inv, interp: 'nearest' } : null;
  }
  const inv = mat3Invert(m);
  return inv ? { m, inv, interp } : null;
}

/**
 * Fills dst (dw x dh, channels = src.ch, origin (dx, dy) in destination space) by inverse
 * mapping through inv (destination -> source space). Returns true when anything non-zero was written.
 */
export function resampleRegion(src: SrcBuf, inv: Mat3, interp: Interpolation, dst: Buf, dw: number, dh: number, dx: number, dy: number): boolean {
  const ch = src.ch;
  const affine = mat3IsAffine(inv);
  let any = false;
  for (let y = 0; y < dh; y++) {
    const Y = dy + y + 0.5;
    let oi = y * dw * ch;
    for (let x = 0; x < dw; x++, oi += ch) {
      const X = dx + x + 0.5;
      let u = inv[0] * X + inv[1] * Y + inv[2];
      let v = inv[3] * X + inv[4] * Y + inv[5];
      if (!affine) {
        const w = inv[6] * X + inv[7] * Y + inv[8];
        if (w <= 1e-12) { for (let c = 0; c < ch; c++) dst[oi + c] = 0; continue; }
        u /= w; v /= w;
      }
      sample(src, u - src.x, v - src.y, interp, dst, oi);
      if (dst[oi + ch - 1] !== 0) any = true;
    }
  }
  return any;
}

/** Source-space rect needed to fill a destination rect (with interpolation margin), or null for 'everything'. */
function sourceRectFor(inv: Mat3, r: Rect): Rect | null {
  const b = mat3MapRect(inv, r);
  if (!b) return null;
  const x0 = Math.floor(b.x) - 3, y0 = Math.floor(b.y) - 3;
  return { x: x0, y: y0, w: Math.ceil(b.x + b.w) + 3 - x0, h: Math.ceil(b.y + b.h) + 3 - y0 };
}

/**
 * Resamples an image placed at srcOrigin (source space) through m (source -> destination).
 * Returns the destination pixels with their destination-space origin. `clip` limits the output.
 */
export function resampleProjective(src: ImageData, srcOrigin: Point, m: Mat3, interpolation: Interpolation, clip?: Rect): { image: ImageData; x: number; y: number } {
  const p = plan(m, interpolation);
  const s: SrcBuf = { data: src.data, w: src.width, h: src.height, x: srcOrigin.x, y: srcOrigin.y, ch: 4 };
  let bounds = p ? mat3MapRect(p.m, { x: srcOrigin.x, y: srcOrigin.y, w: src.width, h: src.height }) : null;
  if (!bounds && clip) bounds = clip;
  if (!p || !bounds) return { image: makeImageData(0, 0), x: 0, y: 0 };
  let r: Rect | null = outer(bounds, p.interp === 'nearest' ? 0 : 1);
  if (clip) r = rectIntersect(r, clip);
  if (!r) return { image: makeImageData(0, 0), x: 0, y: 0 };
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  resampleRegion(s, p.inv, p.interp, out, r.w, r.h, r.x, r.y);
  return { image: makeImageData(r.w, r.h, out), x: r.x, y: r.y };
}

function outer(b: Rect, pad: number): Rect {
  const x0 = Math.floor(b.x + 1e-7) - pad, y0 = Math.floor(b.y + 1e-7) - pad;
  return { x: x0, y: y0, w: Math.ceil(b.x + b.w - 1e-7) + pad - x0, h: Math.ceil(b.y + b.h - 1e-7) + pad - y0 };
}

/**
 * Tile-aware resample of a whole TileStore through m (store space -> store space). Each
 * destination tile reads only the source region it needs, so no layer-sized intermediate exists.
 * `clip` (destination space) limits the output, e.g. to a canvas.
 */
export function resampleTiles(src: TileStore, m: Mat3, interpolation: Interpolation, clip?: Rect): TileStore {
  const out = createTileStore();
  const sb = src.bounds();
  const p = plan(m, interpolation);
  if (!sb || !p) return out;
  let db: Rect | null = mat3MapRect(p.m, sb);
  if (!db) db = clip ?? null;
  if (!db) return out;
  let r: Rect | null = outer(db, p.interp === 'nearest' ? 0 : 1);
  if (clip) r = rectIntersect(r, clip);
  if (!r) return out;
  const tx0 = Math.floor(r.x / TILE), tx1 = Math.floor((r.x + r.w - 1) / TILE);
  const ty0 = Math.floor(r.y / TILE), ty1 = Math.floor((r.y + r.h - 1) / TILE);
  let scratch = new Uint8ClampedArray(TILE * TILE * 4);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tr = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      const need = sourceRectFor(p.inv, tr) ?? sb;
      const sr = rectIntersect(need, sb);
      if (!sr) continue;
      const img = src.read(sr);
      const s: SrcBuf = { data: img.data, w: sr.w, h: sr.h, x: sr.x, y: sr.y, ch: 4 };
      // Restrict to the part of the tile inside r (clip).
      const ir = rectIntersect(tr, r);
      if (!ir) continue;
      if (ir.w === TILE && ir.h === TILE) {
        if (!resampleRegion(s, p.inv, p.interp, scratch, TILE, TILE, tr.x, tr.y)) continue;
        out.set(tx, ty, scratch);
        scratch = new Uint8ClampedArray(TILE * TILE * 4);
      } else {
        const part = new Uint8ClampedArray(ir.w * ir.h * 4);
        if (!resampleRegion(s, p.inv, p.interp, part, ir.w, ir.h, ir.x, ir.y)) continue;
        out.write(makeImageData(ir.w, ir.h, part), ir.x, ir.y);
      }
    }
  }
  out.forEach((buf, tx, ty) => { if (isTransparent(buf)) out.set(tx, ty, undefined); });
  return out;
}

/** Same as resampleTiles but m maps document space and the store sits at node offset (nx, ny). */
export function resampleNodeTiles(src: TileStore, nx: number, ny: number, m: Mat3, interpolation: Interpolation, clip?: Rect): TileStore {
  const local = mat3Multiply(mat3Translate(-nx, -ny), mat3Multiply(m, mat3Translate(nx, ny)));
  const c = clip ? { x: clip.x - nx, y: clip.y - ny, w: clip.w, h: clip.h } : undefined;
  return resampleTiles(src, local, interpolation, c);
}

/** A document-sized mask mapped through m onto a new outW x outH mask (outside counts as 0). */
export function resampleMask(mask: Mask, m: Mat3, outW: number, outH: number, interpolation: Interpolation): Mask {
  const data = new Uint8Array(outW * outH);
  const p = plan(m, interpolation);
  if (!p) return { w: outW, h: outH, data };
  const s: SrcBuf = { data: mask.data, w: mask.w, h: mask.h, x: 0, y: 0, ch: 1 };
  const b = mat3MapRect(p.m, { x: 0, y: 0, w: mask.w, h: mask.h });
  const r = rectIntersect(b ? outer(b, 1) : { x: 0, y: 0, w: outW, h: outH }, { x: 0, y: 0, w: outW, h: outH });
  if (!r) return { w: outW, h: outH, data };
  const part = new Uint8Array(r.w * r.h);
  resampleRegion(s, p.inv, p.interp, part, r.w, r.h, r.x, r.y);
  for (let y = 0; y < r.h; y++) data.set(part.subarray(y * r.w, (y + 1) * r.w), (y + r.y) * outW + r.x);
  return { w: outW, h: outH, data };
}
