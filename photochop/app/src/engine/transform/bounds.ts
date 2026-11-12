// Tight bounds of a raster's visible pixels (alpha > 0), scanned tile by tile. Tiles are visited
// from the outside of the tile grid inwards, and a tile already inside the bounds found so far is
// skipped, so a full layer only scans its outer ring. Inside a tile each side is found with an
// early-exit scan on 32-bit words (alpha is the high byte on little-endian hosts).
import { TILE, type Rect, type TileStore } from '../types';

const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const ALPHA = LE ? 0xff000000 : 0x000000ff;

function words(buf: Uint8ClampedArray): Uint32Array {
  if (buf.byteOffset % 4 !== 0) return new Uint32Array(buf.slice().buffer, 0, TILE * TILE);
  return new Uint32Array(buf.buffer, buf.byteOffset, TILE * TILE);
}

function rowHas(w: Uint32Array, y: number): boolean {
  for (let i = y * TILE, e = i + TILE; i < e; i++) if (w[i] & ALPHA) return true;
  return false;
}

function colHas(w: Uint32Array, x: number, y0: number, y1: number): boolean {
  for (let i = y0 * TILE + x, e = y1 * TILE + x; i <= e; i += TILE) if (w[i] & ALPHA) return true;
  return false;
}

/** Tight rect inside one tile, in tile pixels; null when the tile is fully transparent. */
export function tileTightRect(buf: Uint8ClampedArray): Rect | null {
  const w = words(buf);
  let y0 = 0;
  while (y0 < TILE && !rowHas(w, y0)) y0++;
  if (y0 === TILE) return null;
  let y1 = TILE - 1;
  while (y1 > y0 && !rowHas(w, y1)) y1--;
  let x0 = 0;
  while (x0 < TILE - 1 && !colHas(w, x0, y0, y1)) x0++;
  let x1 = TILE - 1;
  while (x1 > x0 && !colHas(w, x1, y0, y1)) x1--;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Tight bounds of a tile store's pixels with alpha > 0, in the store's own (node) space. */
export function tightTileBounds(store: TileStore): Rect | null {
  const tiles: Array<{ tx: number; ty: number; buf: Uint8ClampedArray; d: number }> = [];
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  store.forEach((buf, tx, ty) => {
    tiles.push({ tx, ty, buf, d: 0 });
    if (tx < gx0) gx0 = tx;
    if (tx > gx1) gx1 = tx;
    if (ty < gy0) gy0 = ty;
    if (ty > gy1) gy1 = ty;
  });
  if (tiles.length === 0) return null;
  for (const t of tiles) t.d = Math.min(t.tx - gx0, gx1 - t.tx, t.ty - gy0, gy1 - t.ty);
  tiles.sort((a, b) => a.d - b.d);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    const ox = t.tx * TILE, oy = t.ty * TILE;
    // Nothing in this tile can grow the bounds found so far.
    if (ox >= x0 && oy >= y0 && ox + TILE <= x1 && oy + TILE <= y1) continue;
    const r = tileTightRect(t.buf);
    if (!r) continue;
    x0 = Math.min(x0, ox + r.x);
    y0 = Math.min(y0, oy + r.y);
    x1 = Math.max(x1, ox + r.x + r.w);
    y1 = Math.max(y1, oy + r.y + r.h);
  }
  return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
