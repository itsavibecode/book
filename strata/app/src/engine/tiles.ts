// Sparse 256 px RGBA8 tile storage for raster nodes.
import { TILE, type Rect, type TileStore } from './types';
import { makeImageData } from './util';

export const TILE_BYTES = TILE * TILE * 4;

interface Entry { tx: number; ty: number; buf: Uint8ClampedArray }

const key = (tx: number, ty: number) => `${tx},${ty}`;

export function isTransparent(buf: Uint8ClampedArray): boolean {
  for (let i = 3; i < buf.length; i += 4) if (buf[i] !== 0) return false;
  return true;
}

export class Tiles implements TileStore {
  private map = new Map<string, Entry>();

  get(tx: number, ty: number): Uint8ClampedArray | undefined {
    return this.map.get(key(tx, ty))?.buf;
  }

  getOrCreate(tx: number, ty: number): Uint8ClampedArray {
    const k = key(tx, ty);
    let e = this.map.get(k);
    if (!e) {
      e = { tx, ty, buf: new Uint8ClampedArray(TILE_BYTES) };
      this.map.set(k, e);
    }
    return e.buf;
  }

  set(tx: number, ty: number, buf: Uint8ClampedArray | undefined): void {
    const k = key(tx, ty);
    if (!buf) {
      this.map.delete(k);
      return;
    }
    if (buf.length !== TILE_BYTES) throw new Error('Tile buffer has the wrong size');
    const e = this.map.get(k);
    if (e) e.buf = buf;
    else this.map.set(k, { tx, ty, buf });
  }

  has(tx: number, ty: number): boolean {
    return this.map.has(key(tx, ty));
  }

  forEach(fn: (buf: Uint8ClampedArray, tx: number, ty: number) => void): void {
    for (const e of this.map.values()) fn(e.buf, e.tx, e.ty);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  get size(): number {
    return this.map.size;
  }

  bounds(): Rect | null {
    if (this.map.size === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of this.map.values()) {
      if (e.tx < x0) x0 = e.tx;
      if (e.ty < y0) y0 = e.ty;
      if (e.tx > x1) x1 = e.tx;
      if (e.ty > y1) y1 = e.ty;
    }
    return { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE };
  }

  read(rect: Rect): ImageData {
    const x0 = Math.floor(rect.x);
    const y0 = Math.floor(rect.y);
    const w = Math.max(0, Math.round(rect.w));
    const h = Math.max(0, Math.round(rect.h));
    const out = new Uint8ClampedArray(w * h * 4);
    if (w > 0 && h > 0 && this.map.size > 0) {
      const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x0 + w - 1) / TILE);
      const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor((y0 + h - 1) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const buf = this.get(tx, ty);
          if (!buf) continue;
          const ox = tx * TILE, oy = ty * TILE;
          const ix0 = Math.max(x0, ox), ix1 = Math.min(x0 + w, ox + TILE);
          const iy0 = Math.max(y0, oy), iy1 = Math.min(y0 + h, oy + TILE);
          const len = (ix1 - ix0) * 4;
          for (let y = iy0; y < iy1; y++) {
            const s = ((y - oy) * TILE + (ix0 - ox)) * 4;
            out.set(buf.subarray(s, s + len), ((y - y0) * w + (ix0 - x0)) * 4);
          }
        }
      }
    }
    return makeImageData(w, h, out);
  }

  write(img: ImageData, x: number, y: number): void {
    const x0 = Math.round(x), y0 = Math.round(y);
    const w = img.width, h = img.height;
    if (w <= 0 || h <= 0) return;
    const src = img.data;
    const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x0 + w - 1) / TILE);
    const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor((y0 + h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ox = tx * TILE, oy = ty * TILE;
        const ix0 = Math.max(x0, ox), ix1 = Math.min(x0 + w, ox + TILE);
        const iy0 = Math.max(y0, oy), iy1 = Math.min(y0 + h, oy + TILE);
        const len = (ix1 - ix0) * 4;
        const buf = this.getOrCreate(tx, ty);
        for (let yy = iy0; yy < iy1; yy++) {
          const s = ((yy - y0) * w + (ix0 - x0)) * 4;
          buf.set(src.subarray(s, s + len), ((yy - oy) * TILE + (ix0 - ox)) * 4);
        }
      }
    }
  }

  clone(): TileStore {
    const t = new Tiles();
    for (const [k, e] of this.map) t.map.set(k, { tx: e.tx, ty: e.ty, buf: e.buf.slice() });
    return t;
  }

  prune(): number {
    let n = 0;
    for (const [k, e] of this.map) {
      if (isTransparent(e.buf)) {
        this.map.delete(k);
        n++;
      }
    }
    return n;
  }
}

export function createTileStore(): TileStore {
  return new Tiles();
}

/** Fills a node-space rect with one colour, replacing pixels. */
export function fillTilesRect(tiles: TileStore, rect: Rect, rgba: readonly number[]): void {
  const x0 = Math.floor(rect.x), y0 = Math.floor(rect.y);
  const x1 = x0 + Math.round(rect.w), y1 = y0 + Math.round(rect.h);
  if (x1 <= x0 || y1 <= y0) return;
  const [r, g, b, a] = rgba;
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 1) / TILE); ty++) {
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 1) / TILE); tx++) {
      const buf = tiles.getOrCreate(tx, ty);
      const ox = tx * TILE, oy = ty * TILE;
      const ix0 = Math.max(x0, ox) - ox, ix1 = Math.min(x1, ox + TILE) - ox;
      const iy0 = Math.max(y0, oy) - oy, iy1 = Math.min(y1, oy + TILE) - oy;
      for (let y = iy0; y < iy1; y++) {
        let i = (y * TILE + ix0) * 4;
        for (let xx = ix0; xx < ix1; xx++, i += 4) {
          buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
        }
      }
    }
  }
}
