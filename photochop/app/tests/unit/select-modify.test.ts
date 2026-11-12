import { describe, expect, it } from 'vitest';
import {
  borderMask, contractMask, createMask, expandMask, featherMask, maskBounds, polygonMask, rectMask, smoothMask,
  transformMask, type Mask, type Mat3,
} from '@/engine';
import { distanceField } from '@/engine/select/edt';

function total(m: Mask): number {
  let s = 0;
  for (let i = 0; i < m.data.length; i++) s += m.data[i];
  return s;
}

function count(m: Mask, min = 128): number {
  let n = 0;
  for (let i = 0; i < m.data.length; i++) if (m.data[i] >= min) n++;
  return n;
}

describe('polygonMask', () => {
  it('covers a known right triangle with the right area', () => {
    const m = polygonMask(20, 20, [{ x: 2, y: 2 }, { x: 12, y: 2 }, { x: 2, y: 12 }], true);
    expect(Math.abs(total(m) / 255 - 50)).toBeLessThan(0.1);
    // Off the sampling lattice coverage is quantised to 1/16 per pixel: area 52.02 within 2 percent.
    const off = polygonMask(20, 20, [{ x: 2.1, y: 2.2 }, { x: 12.3, y: 2.2 }, { x: 2.1, y: 12.4 }], true);
    expect(Math.abs(total(off) / 255 - 52.02)).toBeLessThan(1.05);
    expect(m.data[3 * 20 + 3]).toBe(255);
    expect(m.data[11 * 20 + 11]).toBe(0);
    // A pixel cut by the hypotenuse is half covered.
    const diag = m.data[7 * 20 + 6];
    expect(diag).toBeGreaterThan(80);
    expect(diag).toBeLessThan(180);
  });

  it('is exact for axis-aligned rectangles, with and without antialias', () => {
    const r = { x: 5, y: 3, w: 17, h: 9 };
    const pts = [{ x: 5, y: 3 }, { x: 22, y: 3 }, { x: 22, y: 12 }, { x: 5, y: 12 }];
    expect(Array.from(polygonMask(30, 20, pts, true).data)).toEqual(Array.from(rectMask(30, 20, r).data));
    expect(Array.from(polygonMask(30, 20, pts, false).data)).toEqual(Array.from(rectMask(30, 20, r).data));
    // Counter-clockwise gives the same mask (non-zero winding).
    expect(Array.from(polygonMask(30, 20, [...pts].reverse(), true).data)).toEqual(Array.from(rectMask(30, 20, r).data));
  });

  it('uses the non-zero rule for overlapping loops and clips to the document', () => {
    // Two loops of the same square in the same direction: still covered once, not cancelled.
    const sq = [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }];
    const m = polygonMask(10, 10, [...sq, ...sq], false);
    expect(m.data[5 * 10 + 5]).toBe(255);
    const off = polygonMask(10, 10, [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }], true);
    expect(count(off, 255)).toBe(100);
  });

  it('handles degenerate input', () => {
    expect(total(polygonMask(10, 10, [], true))).toBe(0);
    expect(total(polygonMask(10, 10, [{ x: 1, y: 1 }, { x: 5, y: 5 }], true))).toBe(0);
    expect(total(polygonMask(10, 10, [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 9, y: 1 }], true))).toBe(0);
    expect(polygonMask(1, 1, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], true).data[0]).toBe(255);
  });
});

describe('distance field', () => {
  it('is exact Euclidean', () => {
    const set = new Uint8Array(25);
    set[0] = 1;
    const { d2, feat } = distanceField(set, 5, 5);
    expect(d2[4 * 5 + 3]).toBe(25);
    expect(feat[24]).toBe(0);
  });
});

describe('feather', () => {
  it('preserves total coverage within 1 percent and never exceeds 255', () => {
    const m = rectMask(200, 200, { x: 60, y: 50, w: 70, h: 90 });
    for (const r of [1, 5, 20, 60]) {
      const f = featherMask(m, r);
      expect(Math.abs(total(f) - total(m)) / total(m)).toBeLessThan(0.01);
      expect(Math.max(...f.data)).toBeLessThanOrEqual(255);
      expect(f.data[0 * 200 + 0]).toBe(r >= 60 ? f.data[0] : 0);
    }
  });

  it('does not shrink a fully selected document and is the identity at 0', () => {
    const full = createMask(50, 40, 255);
    expect(Array.from(featherMask(full, 25).data).every((v) => v === 255)).toBe(true);
    const m = rectMask(30, 30, { x: 5, y: 5, w: 10, h: 10 });
    expect(Array.from(featherMask(m, 0).data)).toEqual(Array.from(m.data));
    expect(featherMask(createMask(1, 1, 255), 250).data[0]).toBe(255);
  });
});

describe('expand, contract, smooth, border', () => {
  it('expand then contract returns a 40 px square to within 1 px', () => {
    const sq = rectMask(120, 120, { x: 40, y: 40, w: 40, h: 40 });
    const e = expandMask(sq, 8);
    expect(maskBounds(e)).toEqual({ x: 32, y: 32, w: 56, h: 56 });
    // Corners are rounded by the round element.
    expect(e.data[32 * 120 + 32]).toBe(0);
    expect(e.data[60 * 120 + 32]).toBe(255);
    const back = contractMask(e, 8);
    const b = maskBounds(back)!;
    expect(Math.abs(b.x - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.w - 40)).toBeLessThanOrEqual(1);
    let diff = 0;
    for (let i = 0; i < sq.data.length; i++) if (Math.abs(sq.data[i] - back.data[i]) > 127) diff++;
    expect(diff).toBeLessThanOrEqual(8);
  });

  it('contract treats image edges as selected and keeps soft edges soft', () => {
    const full = createMask(30, 20, 255);
    expect(count(contractMask(full, 5), 255)).toBe(600);
    const half = rectMask(30, 20, { x: 0, y: 0, w: 15, h: 20 });
    const c = contractMask(half, 5);
    expect(maskBounds(c)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
    const soft = featherMask(rectMask(100, 100, { x: 30, y: 30, w: 40, h: 40 }), 10);
    const grown = expandMask(soft, 5);
    let partial = 0;
    for (const v of grown.data) if (v > 10 && v < 245) partial++;
    expect(partial).toBeGreaterThan(200);
  });

  it('border straddles the edge with the given width', () => {
    const sq = rectMask(100, 100, { x: 30, y: 30, w: 40, h: 40 });
    const b = borderMask(sq, 10);
    const row = 50 * 100;
    let n = 0;
    for (let x = 0; x < 100; x++) if (b.data[row + x] >= 128) n++;
    expect(n).toBe(20);
    expect(b.data[row + 26]).toBe(255);
    expect(b.data[row + 33]).toBe(255);
    expect(b.data[row + 50]).toBe(0);
    expect(b.data[row + 20]).toBe(0);
  });

  it('smooth removes a one pixel notch and keeps a full selection full', () => {
    const m = rectMask(60, 60, { x: 10, y: 10, w: 40, h: 40 });
    m.data[30 * 60 + 10] = 0;
    m.data[5 * 60 + 5] = 255;
    const s = smoothMask(m, 3);
    expect(s.data[30 * 60 + 10]).toBeGreaterThan(127);
    expect(s.data[5 * 60 + 5]).toBeLessThan(128);
    expect(Array.from(smoothMask(createMask(20, 20, 255), 4).data).every((v) => v === 255)).toBe(true);
  });

  it('handles empty masks and 1 px documents', () => {
    const e = createMask(10, 10);
    for (const f of [expandMask, contractMask, featherMask, smoothMask, borderMask]) expect(total(f(e, 4))).toBe(0);
    const one = createMask(1, 1, 255);
    expect(expandMask(one, 3).data[0]).toBe(255);
    expect(contractMask(one, 3).data[0]).toBe(255);
  });
});

describe('transformMask', () => {
  const T = (tx: number, ty: number): Mat3 => [1, 0, tx, 0, 1, ty, 0, 0, 1];

  it('a translation equals a shifted mask', () => {
    const m = rectMask(50, 40, { x: 5, y: 6, w: 12, h: 9 });
    for (const interp of ['nearest', 'bilinear', 'bicubic'] as const) {
      const t = transformMask(m, T(7, 3), interp);
      expect(Array.from(t.data)).toEqual(Array.from(rectMask(50, 40, { x: 12, y: 9, w: 12, h: 9 }).data));
    }
  });

  it('supports projective matrices and refuses singular or broken ones', () => {
    const m = rectMask(40, 40, { x: 10, y: 10, w: 20, h: 20 });
    const p: Mat3 = [1, 0, 0, 0, 1, 0, 0.002, 0, 1];
    const t = transformMask(m, p, 'bilinear');
    const b = maskBounds(t)!;
    expect(b.x).toBeLessThan(11);
    expect(b.x + b.w).toBeLessThan(30);
    expect(total(transformMask(m, [0, 0, 0, 0, 0, 0, 0, 0, 1], 'bilinear'))).toBe(0);
    expect(() => transformMask(m, [1, 0, NaN, 0, 1, 0, 0, 0, 1], 'nearest')).toThrow();
    const half: Mat3 = [0.5, 0, 0, 0, 0.5, 0, 0, 0, 1];
    expect(maskBounds(transformMask(m, half, 'bilinear'))).toEqual({ x: 5, y: 5, w: 10, h: 10 });
  });
});
