// Bicubic Bezier patch warp: the 4 x 4 control grid is evaluated on a fine lattice, split into
// triangles, and every triangle is rasterised by mapping destination pixel centres back to the
// source through barycentric coordinates (forward-mapped mesh, inverse-sampled pixels).
import type { Interpolation, Point, Rect, WarpGrid, WarpPreset } from '../types';
import { rectIntersect } from '../util';
import { sample, type SrcBuf } from './resample';

function bern(t: number, out: Float64Array): void {
  const s = 1 - t;
  out[0] = s * s * s; out[1] = 3 * s * s * t; out[2] = 3 * s * t * t; out[3] = t * t * t;
}

const BU = new Float64Array(4);
const BV = new Float64Array(4);

/** Point on the patch at (u, v) in 0..1. Points are row-major: index = row * 4 + col, row follows v. */
export function evalPatch(grid: WarpGrid, u: number, v: number): Point {
  bern(u, BU);
  bern(v, BV);
  let x = 0, y = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const w = BV[r] * BU[c];
      const p = grid.points[r * 4 + c];
      x += w * p.x; y += w * p.y;
    }
  }
  return { x, y };
}

/** Undistorted grid spanning bounds. */
export function identityGrid(b: Rect): WarpGrid {
  const points: Point[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) points.push({ x: b.x + (b.w * c) / 3, y: b.y + (b.h * r) / 3 });
  return { points };
}

/** Lattice resolution that keeps the piecewise-linear error well under 2 px. */
function latticeSize(grid: WarpGrid, src: Rect): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of grid.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const span = Math.max(x1 - x0, y1 - y0, src.w, src.h);
  return Math.max(4, Math.min(256, Math.ceil(span / 8)));
}

export interface WarpMesh {
  /** Lattice size: (n + 1) * (n + 1) vertices. */
  n: number;
  /** Destination positions, x/y interleaved. */
  pos: Float64Array;
  /** Source positions (source space), x/y interleaved. */
  src: Float64Array;
}

export function warpMesh(grid: WarpGrid, srcRect: Rect, n = latticeSize(grid, srcRect)): WarpMesh {
  const cnt = (n + 1) * (n + 1);
  const pos = new Float64Array(cnt * 2), src = new Float64Array(cnt * 2);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n, v = j / n, k = (j * (n + 1) + i) * 2;
      const p = evalPatch(grid, u, v);
      pos[k] = p.x; pos[k + 1] = p.y;
      src[k] = srcRect.x + u * srcRect.w; src[k + 1] = srcRect.y + v * srcRect.h;
    }
  }
  return { n, pos, src };
}

/** Calls fn for each triangle as vertex indices (lattice order). */
export function forEachTriangle(n: number, fn: (a: number, b: number, c: number) => void): void {
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      fn(a, b, d);
      fn(a, d, c);
    }
  }
}

export function meshBounds(mesh: WarpMesh): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < mesh.pos.length; k += 2) {
    x0 = Math.min(x0, mesh.pos[k]); y0 = Math.min(y0, mesh.pos[k + 1]);
    x1 = Math.max(x1, mesh.pos[k]); y1 = Math.max(y1, mesh.pos[k + 1]);
  }
  const fx = Math.floor(x0) - 1, fy = Math.floor(y0) - 1;
  return { x: fx, y: fy, w: Math.ceil(x1) + 1 - fx, h: Math.ceil(y1) + 1 - fy };
}

/**
 * Warps src (source space, srcRect is what the patch's 0..1 parameters span) through grid.
 * Returns destination pixels (src.ch channels) and their destination-space rect.
 */
export function warpBuffer(src: SrcBuf, srcRect: Rect, grid: WarpGrid, interp: Interpolation, clip?: Rect): { data: Uint8ClampedArray; rect: Rect } | null {
  const mesh = warpMesh(grid, srcRect);
  let r: Rect | null = meshBounds(mesh);
  if (clip) r = rectIntersect(r, clip);
  if (!r) return null;
  const ch = src.ch;
  const out = new Uint8ClampedArray(r.w * r.h * ch);
  const { pos, src: sp } = mesh;
  const R = r;
  forEachTriangle(mesh.n, (a, b, c) => {
    const ax = pos[a * 2], ay = pos[a * 2 + 1], bx = pos[b * 2], by = pos[b * 2 + 1], cx = pos[c * 2], cy = pos[c * 2 + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) return;
    const x0 = Math.max(R.x, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(R.x + R.w, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(R.y, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(R.y + R.h, Math.ceil(Math.max(ay, by, cy)));
    const sax = sp[a * 2], say = sp[a * 2 + 1], sbx = sp[b * 2], sby = sp[b * 2 + 1], scx = sp[c * 2], scy = sp[c * 2 + 1];
    const eps = -1e-6;
    for (let y = y0; y < y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x < x1; x++) {
        const px = x + 0.5;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
        if (l1 < eps) continue;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
        if (l2 < eps) continue;
        const l3 = 1 - l1 - l2;
        if (l3 < eps) continue;
        const u = l1 * sax + l2 * sbx + l3 * scx, v = l1 * say + l2 * sby + l3 * scy;
        sample(src, u - src.x, v - src.y, interp, out, ((y - R.y) * R.w + (x - R.x)) * ch);
      }
    }
  });
  return { data: out, rect: r };
}

/** Control grid for a preset over bounds; bend -100..100. */
export function warpGridFor(bounds: Rect, preset: WarpPreset, bend: number): WarpGrid {
  const g = identityGrid(bounds);
  const b = Math.max(-100, Math.min(100, bend)) / 100;
  if (preset === 'none' || b === 0) return g;
  const { w, h } = bounds;
  const mid = (c: number) => (c === 1 || c === 2 ? 1 : 0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const p = g.points[r * 4 + c];
      const v = r / 3;
      switch (preset) {
        case 'arc': p.y -= b * h * 0.5 * mid(c); break;
        case 'arch': p.y -= b * h * 0.5 * mid(c) * (1 - v); break;
        case 'bulge': p.y -= b * h * 0.4 * mid(c) * (1 - 2 * v); break;
        case 'flag': p.y += b * h * 0.3 * (c === 1 ? -1 : c === 2 ? 1 : 0); break;
        case 'wave': p.y += b * h * 0.3 * (c === 1 ? -1 : c === 2 ? 1 : 0) * (r < 2 ? 1 : -1); break;
        case 'fisheye':
          if (mid(c) && (r === 1 || r === 2)) {
            p.x += b * w * 0.25 * (c === 1 ? -1 : 1);
            p.y += b * h * 0.25 * (r === 1 ? -1 : 1);
          }
          break;
        case 'squeeze':
          if (r === 1 || r === 2) p.x += b * w * 0.25 * (c === 0 ? 1 : c === 3 ? -1 : 0);
          break;
      }
    }
  }
  return g;
}
