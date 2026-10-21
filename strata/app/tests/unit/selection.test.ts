import { describe, expect, it } from 'vitest';
import { combineMasks, createMask, ellipseMask, invertMask, maskBounds, maskOutline, rectMask, selectionFromMask } from '@/engine';

describe('masks', () => {
  it('rectMask is integer clamped to the document', () => {
    const m = rectMask(20, 10, { x: -5, y: 2.4, w: 10, h: 5 });
    expect(maskBounds(m)).toEqual({ x: 0, y: 2, w: 5, h: 5 });
    expect(m.data[2 * 20 + 4]).toBe(255);
    expect(m.data[2 * 20 + 5]).toBe(0);
  });

  it('ellipseMask fills the centre, antialiases the edge and stays inside its rect', () => {
    const m = ellipseMask(100, 100, { x: 10, y: 20, w: 60, h: 40 });
    expect(maskBounds(m)).toEqual({ x: 10, y: 20, w: 60, h: 40 });
    expect(m.data[40 * 100 + 40]).toBe(255);
    const edge = Array.from(m.data).filter((v) => v > 0 && v < 255).length;
    expect(edge).toBeGreaterThan(20);
    expect(m.data[20 * 100 + 10]).toBe(0);
  });

  it('combines with add, subtract, intersect and replace', () => {
    const a = rectMask(10, 10, { x: 0, y: 0, w: 6, h: 10 });
    const b = rectMask(10, 10, { x: 4, y: 0, w: 6, h: 10 });
    expect(maskBounds(combineMasks(a, b, 'add'))).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(maskBounds(combineMasks(a, b, 'subtract'))).toEqual({ x: 0, y: 0, w: 4, h: 10 });
    expect(maskBounds(combineMasks(a, b, 'intersect'))).toEqual({ x: 4, y: 0, w: 2, h: 10 });
    expect(maskBounds(combineMasks(a, b, 'replace'))).toEqual({ x: 4, y: 0, w: 6, h: 10 });
    expect(maskBounds(combineMasks(null, b, 'subtract'))).toBeNull();
    expect(maskBounds(combineMasks(null, b, 'add'))).toEqual({ x: 4, y: 0, w: 6, h: 10 });
  });

  it('invert and selectionFromMask', () => {
    const m = createMask(4, 4);
    expect(selectionFromMask(m)).toBeNull();
    const inv = invertMask(m);
    expect(selectionFromMask(inv)?.bounds).toEqual({ x: 0, y: 0, w: 4, h: 4 });
  });

  it('maskOutline merges the 8 unit edges of a 2x2 square into 4 runs', () => {
    const m = rectMask(6, 6, { x: 2, y: 2, w: 2, h: 2 });
    const seg = maskOutline(m);
    expect(seg.length / 4).toBe(4);
    let total = 0;
    for (let i = 0; i < seg.length; i += 4) total += Math.abs(seg[i + 2] - seg[i]) + Math.abs(seg[i + 3] - seg[i + 1]);
    expect(total).toBe(8);
    const sorted = [];
    for (let i = 0; i < seg.length; i += 4) sorted.push(Array.from(seg.subarray(i, i + 4)).join(','));
    expect(sorted.sort()).toEqual(['2,2,2,4', '2,2,4,2', '2,4,4,4', '4,2,4,4']);
  });

  it('maskOutline traces the document edge for a full selection', () => {
    const seg = maskOutline(createMask(3, 2, 255));
    expect(seg.length / 4).toBe(4);
  });
});
