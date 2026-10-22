import { describe, expect, it } from 'vitest';
import { createTileStore, TILE } from '@/engine';
import { makeImageData } from '@/engine/util';

function patternImage(w: number, h: number, seed = 1): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i++) d[i] = (i * 31 + seed * 7) % 251;
  return makeImageData(w, h, d);
}

describe('TileStore', () => {
  it('round-trips a write that spans four tiles', () => {
    const t = createTileStore();
    const img = patternImage(40, 30);
    t.write(img, TILE - 20, TILE - 15);
    expect(t.size).toBe(4);
    const back = t.read({ x: TILE - 20, y: TILE - 15, w: 40, h: 30 });
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  it('handles negative coordinates', () => {
    const t = createTileStore();
    const img = patternImage(10, 10, 3);
    t.write(img, -5, -7);
    expect(t.keys().sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0'].sort());
    const back = t.read({ x: -5, y: -7, w: 10, h: 10 });
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
    expect(t.bounds()).toEqual({ x: -TILE, y: -TILE, w: 2 * TILE, h: 2 * TILE });
  });

  it('reads missing tiles as transparent and partial reads at an offset', () => {
    const t = createTileStore();
    const img = patternImage(4, 4);
    t.write(img, 2, 2);
    const back = t.read({ x: 0, y: 0, w: 8, h: 8 });
    expect(back.data[0 + 3]).toBe(0);
    const i = (2 * 8 + 2) * 4;
    expect(Array.from(back.data.subarray(i, i + 4))).toEqual(Array.from(img.data.subarray(0, 4)));
    const far = t.read({ x: 5000, y: 5000, w: 3, h: 3 });
    expect(far.data.every((v) => v === 0)).toBe(true);
  });

  it('clone is independent', () => {
    const t = createTileStore();
    t.write(patternImage(5, 5), 0, 0);
    const c = t.clone();
    t.getOrCreate(0, 0)[0] = 1;
    c.getOrCreate(0, 0)[0] = 2;
    expect(t.get(0, 0)![0]).toBe(1);
    expect(c.get(0, 0)![0]).toBe(2);
    c.set(0, 0, undefined);
    expect(t.has(0, 0)).toBe(true);
  });

  it('prune drops only fully transparent tiles', () => {
    const t = createTileStore();
    t.getOrCreate(0, 0);
    t.getOrCreate(1, 0)[3] = 1;
    t.getOrCreate(-2, 3);
    expect(t.prune()).toBe(2);
    expect(t.keys()).toEqual(['1,0']);
  });

  it('bounds unions allocated tiles and is null when empty', () => {
    const t = createTileStore();
    expect(t.bounds()).toBeNull();
    t.getOrCreate(2, 1);
    t.getOrCreate(-1, 3);
    expect(t.bounds()).toEqual({ x: -TILE, y: TILE, w: 4 * TILE, h: 3 * TILE });
  });
});
