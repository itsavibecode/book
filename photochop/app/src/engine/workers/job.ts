// One PNG encode job, shared by the main thread and the worker. Raster layers travel as copies
// of their 256 px tiles (cheaper to snapshot than one layer-sized buffer: no big zero-filled
// allocation on the main thread); the image is assembled where it is encoded.
import { encodePng } from '../png';

const TILE = 256;

export interface PngTile { tx: number; ty: number; buf: Uint8ClampedArray }

export interface PngJob {
  key: string;
  w: number;
  h: number;
  channels: 1 | 4;
  /** Ready pixels (masks) ... */
  pixels?: Uint8Array;
  /** ... or tiles whose node-space origin is tile * 256, assembled into the rect at (ox, oy). */
  tiles?: PngTile[];
  ox?: number;
  oy?: number;
}

export function jobPixels(j: PngJob): Uint8Array {
  if (j.pixels) return j.pixels;
  const out = new Uint8Array(j.w * j.h * 4);
  const ox = j.ox ?? 0, oy = j.oy ?? 0;
  for (const t of j.tiles ?? []) {
    const x0 = Math.max(t.tx * TILE, ox), x1 = Math.min(t.tx * TILE + TILE, ox + j.w);
    const y0 = Math.max(t.ty * TILE, oy), y1 = Math.min(t.ty * TILE + TILE, oy + j.h);
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0; y < y1; y++) {
      const s = ((y - t.ty * TILE) * TILE + (x0 - t.tx * TILE)) * 4;
      out.set(t.buf.subarray(s, s + (x1 - x0) * 4), ((y - oy) * j.w + (x0 - ox)) * 4);
    }
  }
  return out;
}

export function encodeJob(j: PngJob): Uint8Array {
  return encodePng(jobPixels(j), j.w, j.h, j.channels, 4);
}

/** Buffers that can be transferred to the worker (each owned by exactly one job). */
export function transferables(jobs: PngJob[]): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const seen = new Set<ArrayBufferLike>();
  const add = (v: ArrayBufferView) => {
    const b = v.buffer;
    if (b instanceof ArrayBuffer && v.byteOffset === 0 && v.byteLength === b.byteLength && !seen.has(b)) {
      seen.add(b);
      out.push(b);
    }
  };
  for (const j of jobs) {
    if (j.pixels) add(j.pixels);
    for (const t of j.tiles ?? []) add(t.buf);
  }
  return out;
}
