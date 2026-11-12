// Magnetic lasso (live-wire). The cost of stepping onto a pixel falls with its Sobel gradient;
// edges weaker than the contrast threshold cost the full price. trace() runs Dijkstra (binary
// heap, 8-connected) from the last anchor to the cursor inside the bounding box of the two points
// grown by `width`. Anchors and the cursor snap to the strongest edge within `width` pixels.
// Path points are pixel centres (x + 0.5, y + 0.5) in document space.
import type { CompositorLike, DocumentLike, MagneticLassoLike } from '../contract';
import type { Point } from '../types';
import { readSource, sobel } from './common';

const SQRT2 = Math.SQRT2;

/** Binary min-heap of (key, value) with lazy deletion; grows as needed. */
class Heap {
  keys = new Float64Array(1024);
  vals = new Int32Array(1024);
  size = 0;
  push(k: number, v: number): void {
    if (this.size === this.keys.length) {
      const nk = new Float64Array(this.size * 2), nv = new Int32Array(this.size * 2);
      nk.set(this.keys); nv.set(this.vals);
      this.keys = nk; this.vals = nv;
    }
    const keys = this.keys, vals = this.vals;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p]; vals[i] = vals[p];
      i = p;
    }
    keys[i] = k; vals[i] = v;
  }
  /** Pops the minimum; its key is left in `top`. */
  top = 0;
  pop(): number {
    const keys = this.keys, vals = this.vals;
    const v = vals[0];
    this.top = keys[0];
    const n = --this.size;
    if (n > 0) {
      const k = keys[n], lv = vals[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        keys[i] = keys[c]; vals[i] = vals[c];
        i = c;
      }
      keys[i] = k; vals[i] = lv;
    }
    return v;
  }
}

class MagneticLasso implements MagneticLassoLike {
  private readonly W: number;
  private readonly H: number;
  private readonly grad: Uint16Array;
  private readonly cost: Float32Array;
  private readonly width: number;
  private readonly minEdge: number;
  private readonly spacing: number;
  private pts: Point[] = [];
  private anchors: number[] = [];
  private dist = new Float64Array(0);
  private prev = new Int32Array(0);
  private heap = new Heap();

  constructor(compositor: CompositorLike, doc: DocumentLike, opts: { width: number; contrast: number; frequency: number }) {
    this.W = doc.width;
    this.H = doc.height;
    this.grad = sobel(readSource(compositor, doc, true), this.W, this.H);
    this.width = Math.max(1, Math.min(256, Math.round(Number.isFinite(opts.width) ? opts.width : 10)));
    const contrast = Math.max(1, Math.min(100, Number.isFinite(opts.contrast) ? opts.contrast : 10));
    this.minEdge = (contrast / 100) * 1020;
    const freq = Math.max(0, Math.min(100, Number.isFinite(opts.frequency) ? opts.frequency : 57));
    this.spacing = freq <= 0 ? 0 : Math.round(10 + (100 - freq) * 2);
    // Cost lookup by gradient: strong edges are nearly free, anything under the threshold costs 1.
    this.cost = new Float32Array(2041);
    for (let g = 0; g <= 2040; g++) {
      this.cost[g] = g < this.minEdge ? 1 : 0.02 + 0.6 * (1 - Math.min(1, g / 1020));
    }
  }

  get points(): readonly Point[] {
    return this.pts;
  }

  start(p: Point): void {
    this.pts = [this.snap(p)];
    this.anchors = [0];
  }

  trace(p: Point): Point[] {
    if (this.pts.length === 0) return [];
    const target = this.snap(p);
    let path = this.shortest(this.pts[this.pts.length - 1], target);
    if (this.spacing > 0) {
      for (let guard = 0; guard < 64 && path.length - 1 > this.spacing; guard++) {
        this.commit(path.slice(0, this.spacing + 1));
        path = this.shortest(this.pts[this.pts.length - 1], target);
      }
    }
    return path;
  }

  anchor(p: Point): void {
    if (this.pts.length === 0) {
      this.start(p);
      return;
    }
    this.commit(this.shortest(this.pts[this.pts.length - 1], this.snap(p)));
  }

  undoAnchor(): void {
    if (this.anchors.length <= 1) {
      this.pts = [];
      this.anchors = [];
      return;
    }
    this.anchors.pop();
    this.pts.length = this.anchors[this.anchors.length - 1] + 1;
  }

  close(): Point[] {
    if (this.pts.length === 0) return [];
    const back = this.shortest(this.pts[this.pts.length - 1], this.pts[0]);
    return [...this.pts, ...back.slice(1, -1)];
  }

  private commit(path: Point[]): void {
    for (let i = 1; i < path.length; i++) this.pts.push(path[i]);
    this.anchors.push(this.pts.length - 1);
  }

  /** Pixel centre of the strongest edge within `width` of p (p's own pixel when no edge passes the threshold). */
  private snap(p: Point): Point {
    const W = this.W, H = this.H;
    const px = Math.max(0, Math.min(W - 1, Math.floor(Number.isFinite(p.x) ? p.x : 0)));
    const py = Math.max(0, Math.min(H - 1, Math.floor(Number.isFinite(p.y) ? p.y : 0)));
    const r = this.width, r2 = r * r;
    let best = -1, bx = px, by = py, bd = Infinity;
    for (let y = Math.max(0, py - r); y <= Math.min(H - 1, py + r); y++) {
      const dy = y - py;
      for (let x = Math.max(0, px - r); x <= Math.min(W - 1, px + r); x++) {
        const dx = x - px, d = dx * dx + dy * dy;
        if (d > r2) continue;
        const g = this.grad[y * W + x];
        if (g > best || (g === best && d < bd)) { best = g; bx = x; by = y; bd = d; }
      }
    }
    if (best < this.minEdge) { bx = px; by = py; }
    return { x: bx + 0.5, y: by + 0.5 };
  }

  /** Least-cost 8-connected path between two pixel centres, both ends included. */
  private shortest(a: Point, b: Point): Point[] {
    const W = this.W;
    const ax = Math.floor(a.x), ay = Math.floor(a.y), bx = Math.floor(b.x), by = Math.floor(b.y);
    if (ax === bx && ay === by) return [{ x: ax + 0.5, y: ay + 0.5 }];
    const pad = this.width;
    const x0 = Math.max(0, Math.min(ax, bx) - pad), x1 = Math.min(W - 1, Math.max(ax, bx) + pad);
    const y0 = Math.max(0, Math.min(ay, by) - pad), y1 = Math.min(this.H - 1, Math.max(ay, by) + pad);
    const ww = x1 - x0 + 1, wh = y1 - y0 + 1, n = ww * wh;
    if (this.dist.length < n) {
      this.dist = new Float64Array(n);
      this.prev = new Int32Array(n);
    }
    const dist = this.dist, prev = this.prev, cost = this.cost, grad = this.grad;
    dist.fill(Infinity, 0, n);
    const heap = this.heap;
    heap.size = 0;
    const s = (ay - y0) * ww + (ax - x0), t = (by - y0) * ww + (bx - x0);
    dist[s] = 0;
    prev[s] = -1;
    heap.push(0, s);
    while (heap.size) {
      const u = heap.pop();
      const du = heap.top;
      if (du > dist[u]) continue;
      if (u === t) break;
      const uy = (u / ww) | 0, ux = u - uy * ww;
      const cu = cost[grad[(uy + y0) * W + ux + x0]];
      for (let oy = -1; oy <= 1; oy++) {
        const vy = uy + oy;
        if (vy < 0 || vy >= wh) continue;
        const row = (vy + y0) * W + x0;
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const vx = ux + ox;
          if (vx < 0 || vx >= ww) continue;
          const v = vy * ww + vx;
          const step = (cu + cost[grad[row + vx]]) * (ox !== 0 && oy !== 0 ? SQRT2 / 2 : 0.5);
          const nd = du + step;
          if (nd < dist[v]) {
            dist[v] = nd;
            prev[v] = u;
            heap.push(nd, v);
          }
        }
      }
    }
    if (dist[t] === Infinity) return [{ x: ax + 0.5, y: ay + 0.5 }, { x: bx + 0.5, y: by + 0.5 }];
    const out: Point[] = [];
    for (let v = t, guard = 0; v >= 0 && guard <= n; v = v === s ? -1 : prev[v], guard++) {
      const vy = (v / ww) | 0;
      out.push({ x: v - vy * ww + x0 + 0.5, y: vy + y0 + 0.5 });
    }
    out.reverse();
    return out;
  }
}

export function createMagneticLasso(
  compositor: CompositorLike, doc: DocumentLike, opts: { width: number; contrast: number; frequency: number },
): MagneticLassoLike {
  return new MagneticLasso(compositor, doc, opts);
}
