// Stamp-based brush and eraser.
//
// Dabs accumulate into a per-tile coverage buffer (union: c = 1 - (1 - c)(1 - dab)). After each
// move() the touched tile regions are rebuilt from the tile's before-state plus the stroke at
// alpha = coverage * opacity, so a stroke that crosses itself never exceeds its opacity.
// Dab coverage is evaluated analytically per pixel (sub-pixel centre, 1 px antialiased rim), which
// is as cheap as a cached stamp and keeps thin strokes smooth.
import type { BrushParams, BrushStrokeLike, RasterEditSession, StrokePoint } from './contract';
import { TILE, type Rect, type Selection } from './types';
import { Session } from './session';
import { clamp01, rectUnion } from './util';

const TT = TILE * TILE;

interface DirtyTile { tx: number; ty: number; x0: number; y0: number; x1: number; y1: number }

class BrushStroke implements BrushStrokeLike {
  private cov = new Map<string, Float32Array>();
  private before = new Map<string, Uint8ClampedArray | undefined>();
  private dirty = new Map<string, DirtyTile>();
  private total: Rect | null = null;
  private moveRect: Rect | null = null;
  private last: StrokePoint | null = null;
  private leftover = 0;
  private readonly nx: number;
  private readonly ny: number;
  private readonly p: BrushParams;
  private readonly W: number;

  constructor(private readonly session: RasterEditSession, params: BrushParams, private readonly sel: Selection | null) {
    this.p = {
      ...params,
      size: Math.max(0.5, Math.min(1000, params.size)),
      hardness: clamp01(params.hardness),
      opacity: clamp01(params.opacity),
      flow: clamp01(params.flow),
      spacing: Math.max(0.01, Math.min(2, params.spacing || 0.1)),
    };
    this.nx = Math.round(session.node.x);
    this.ny = Math.round(session.node.y);
    this.W = sel ? sel.mask.w : 0;
  }

  begin(pt: StrokePoint): void {
    this.last = pt;
    this.leftover = 0;
    this.dab(pt.x, pt.y, pt.pressure);
    this.apply();
  }

  move(pt: StrokePoint): void {
    if (!this.last) {
      this.begin(pt);
      return;
    }
    const a = this.last;
    const dx = pt.x - a.x, dy = pt.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const step = Math.max(0.5, this.p.spacing * this.p.size);
    let d = step - this.leftover;
    while (d <= len) {
      const t = d / len;
      this.dab(a.x + dx * t, a.y + dy * t, a.pressure + (pt.pressure - a.pressure) * t);
      d += step;
    }
    this.leftover = len - (d - step);
    this.last = pt;
    this.apply();
  }

  end(): Rect | null {
    this.apply();
    this.last = null;
    return this.total;
  }

  private beforeTile(tx: number, ty: number, k: string): Uint8ClampedArray | undefined {
    if (this.session instanceof Session) {
      this.session.markTile(tx, ty);
      return this.session.beforeOf(tx, ty) ?? undefined;
    }
    if (!this.before.has(k)) {
      const cur = this.session.tiles.get(tx, ty);
      this.before.set(k, cur ? cur.slice() : undefined);
      this.session.markTile(tx, ty);
    }
    return this.before.get(k);
  }

  private dab(cx: number, cy: number, pressure: number): void {
    const p = this.p;
    const pr = clamp01(pressure);
    const size = Math.max(0.5, p.size * (p.pressureSize ? pr : 1));
    const alpha = p.flow * (p.pressureOpacity ? pr : 1);
    if (alpha <= 0) return;
    const r = size / 2;
    const inner = r * p.hardness;
    const soft = p.hardness < 1;
    const span = r - inner > 1e-6 ? r - inner : 1e-6;
    const lim = (r + 0.5) * (r + 0.5);
    const px = cx - this.nx, py = cy - this.ny;
    const bx0 = Math.floor(px - r - 1), by0 = Math.floor(py - r - 1);
    const bx1 = Math.ceil(px + r + 1), by1 = Math.ceil(py + r + 1);
    for (let ty = Math.floor(by0 / TILE); ty <= Math.floor((by1 - 1) / TILE); ty++) {
      for (let tx = Math.floor(bx0 / TILE); tx <= Math.floor((bx1 - 1) / TILE); tx++) {
        const ox = tx * TILE, oy = ty * TILE;
        const x0 = Math.max(bx0, ox) - ox, x1 = Math.min(bx1, ox + TILE) - ox;
        const y0 = Math.max(by0, oy) - oy, y1 = Math.min(by1, oy + TILE) - oy;
        const k = `${tx},${ty}`;
        let cv = this.cov.get(k);
        if (!cv) {
          cv = new Float32Array(TT);
          this.cov.set(k, cv);
        }
        let touched = false;
        for (let y = y0; y < y1; y++) {
          const dy = oy + y + 0.5 - py;
          const dy2 = dy * dy;
          if (dy2 >= lim) continue;
          let i = y * TILE + x0;
          for (let x = x0; x < x1; x++, i++) {
            const dx = ox + x + 0.5 - px;
            const d2 = dx * dx + dy2;
            if (d2 >= lim) continue;
            const dist = Math.sqrt(d2);
            let c = r - dist + 0.5;
            if (c > 1) c = 1;
            if (soft && dist > inner) {
              const f = (r - dist) / span;
              if (f < c) c = f;
            }
            if (c <= 0) continue;
            const v = c * alpha;
            cv[i] = 1 - (1 - cv[i]) * (1 - v);
            touched = true;
          }
        }
        if (!touched) continue;
        const dt = this.dirty.get(k);
        if (dt) {
          if (x0 < dt.x0) dt.x0 = x0;
          if (y0 < dt.y0) dt.y0 = y0;
          if (x1 > dt.x1) dt.x1 = x1;
          if (y1 > dt.y1) dt.y1 = y1;
        } else {
          this.dirty.set(k, { tx, ty, x0, y0, x1, y1 });
        }
        this.moveRect = rectUnion(this.moveRect, { x: ox + x0 + this.nx, y: oy + y0 + this.ny, w: x1 - x0, h: y1 - y0 });
      }
    }
  }

  /** Rebuilds the dirty regions of each touched tile from its before-state and the coverage. */
  private apply(): void {
    if (this.dirty.size === 0) return;
    const p = this.p;
    const erase = p.mode === 'erase';
    const op = p.opacity;
    const cr = p.color[0], cg = p.color[1], cb = p.color[2];
    const ca = p.color[3] / 255;
    const sel = this.sel;
    const sd = sel ? sel.mask.data : null;
    const sw = this.W, sh = sel ? sel.mask.h : 0;
    for (const [k, t] of this.dirty) {
      const before = this.beforeTile(t.tx, t.ty, k);
      const live = this.session.markTile(t.tx, t.ty);
      const cv = this.cov.get(k) as Float32Array;
      const ox = t.tx * TILE + this.nx, oy = t.ty * TILE + this.ny;
      for (let y = t.y0; y < t.y1; y++) {
        const docY = oy + y;
        const rowOut = sd !== null && (docY < 0 || docY >= sh);
        let i = y * TILE + t.x0;
        for (let x = t.x0; x < t.x1; x++, i++) {
          let c = cv[i];
          if (c <= 0) continue;
          if (sd !== null) {
            const docX = ox + x;
            if (rowOut || docX < 0 || docX >= sw) continue;
            const m = sd[docY * sw + docX];
            if (m === 0) continue;
            c *= m / 255;
          }
          const a = c * op * (erase ? 1 : ca);
          const j = i * 4;
          const br = before ? before[j] : 0, bg = before ? before[j + 1] : 0;
          const bb = before ? before[j + 2] : 0, ba = before ? before[j + 3] / 255 : 0;
          if (erase) {
            live[j] = br; live[j + 1] = bg; live[j + 2] = bb;
            live[j + 3] = ba * (1 - a) * 255;
          } else {
            const k2 = ba * (1 - a);
            const ao = a + k2;
            if (ao <= 0) continue;
            live[j] = (cr * a + br * k2) / ao;
            live[j + 1] = (cg * a + bg * k2) / ao;
            live[j + 2] = (cb * a + bb * k2) / ao;
            live[j + 3] = ao * 255;
          }
        }
      }
    }
    this.dirty.clear();
    const r = this.moveRect;
    this.moveRect = null;
    if (r) {
      this.total = rectUnion(this.total, r);
      this.session.flush(r);
    }
  }
}

export function createBrushStroke(session: RasterEditSession, params: BrushParams, selection: Selection | null): BrushStrokeLike {
  return new BrushStroke(session, params, selection);
}
