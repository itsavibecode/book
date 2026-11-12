import { describe, expect, it } from 'vitest';
import {
  colorRange, createMask, createMagneticLasso, createQuickSelect, growSelection, magicWand, maskBounds, rectMask,
  refineMask, similarSelection,
} from '@/engine';
import { RED, count, painted, twoIslands } from './select-fixture';

const wandOpts = { tolerance: 32, contiguous: true, antialias: false, sampleAllLayers: true };

describe('magic wand', () => {
  it('contiguous selects one island, global selects both', () => {
    const { doc, comp } = twoIslands();
    const c = magicWand(comp, doc, { x: 15, y: 15 }, wandOpts);
    expect(maskBounds(c)).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(count(c.data)).toBe(400);
    const g = magicWand(comp, doc, { x: 15, y: 15 }, { ...wandOpts, contiguous: false });
    expect(count(g.data)).toBe(800);
    expect(maskBounds(g)).toEqual({ x: 10, y: 10, w: 70, h: 30 });
  });

  it('tolerance is the largest channel difference, inclusive', () => {
    // Columns step by 10 in green only: 0, 10, 20, ...
    const { doc, comp } = painted(30, 4, (x) => [100, Math.min(255, Math.floor(x / 3) * 10), 50, 255]);
    const m = magicWand(comp, doc, { x: 0, y: 0 }, { ...wandOpts, tolerance: 20 });
    expect(maskBounds(m)).toEqual({ x: 0, y: 0, w: 9, h: 4 });
    const m2 = magicWand(comp, doc, { x: 0, y: 0 }, { ...wandOpts, tolerance: 19 });
    expect(maskBounds(m2)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    const aa = magicWand(comp, doc, { x: 0, y: 0 }, { ...wandOpts, tolerance: 19, antialias: true });
    expect(aa.data[6]).toBeGreaterThan(0);
    expect(aa.data[6]).toBeLessThan(255);
    expect(aa.data[7]).toBe(0);
  });

  it('a click outside the document, or on one layer, behaves', () => {
    const { doc, comp, node } = twoIslands();
    expect(count(magicWand(comp, doc, { x: -1, y: 5 }, wandOpts).data)).toBe(0);
    expect(count(magicWand(comp, doc, { x: 100, y: 5 }, wandOpts).data)).toBe(0);
    const one = magicWand(comp, doc, { x: 65, y: 25 }, { ...wandOpts, sampleAllLayers: false, nodeId: node.id });
    expect(maskBounds(one)).toEqual({ x: 60, y: 20, w: 20, h: 20 });
    const tiny = painted(1, 1, () => RED);
    expect(Array.from(magicWand(tiny.comp, tiny.doc, { x: 0.5, y: 0.5 }, wandOpts).data)).toEqual([255]);
  });
});

describe('grow and similar', () => {
  it('grow reaches a whole flat region and stops at its edge', () => {
    const { doc, comp } = twoIslands();
    const seed = rectMask(100, 60, { x: 14, y: 14, w: 3, h: 3 });
    const g = growSelection(comp, doc, seed, 16);
    expect(maskBounds(g)).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(count(g.data)).toBe(400);
  });

  it('similar picks both islands, matching a set of colours not their average', () => {
    const { doc, comp } = twoIslands();
    const s = similarSelection(comp, doc, rectMask(100, 60, { x: 14, y: 14, w: 3, h: 3 }), 16);
    expect(count(s.data)).toBe(800);
    // A selection spanning red and white: the average (pink) is absent, both colours are matched.
    const both = similarSelection(comp, doc, rectMask(100, 60, { x: 28, y: 14, w: 4, h: 2 }), 8);
    expect(count(both.data)).toBe(6000);
  });

  it('rejects a mask of the wrong size', () => {
    const { doc, comp } = twoIslands();
    expect(() => growSelection(comp, doc, createMask(10, 10), 10)).toThrow(/10 x 10/);
    expect(() => refineMask(comp, doc, createMask(10, 10), { radius: 0, smooth: 0, feather: 0, contrast: 0, shiftEdge: 0 })).toThrow();
  });
});

describe('refine', () => {
  it('all zeros is the identity', () => {
    const { doc, comp } = twoIslands();
    const m = rectMask(100, 60, { x: 12, y: 8, w: 30, h: 20 });
    const r = refineMask(comp, doc, m, { radius: 0, smooth: 0, feather: 0, contrast: 0, shiftEdge: 0 });
    expect(Array.from(r.data)).toEqual(Array.from(m.data));
  });

  it('radius snaps a loose mask to the colour edge', () => {
    const { doc, comp } = twoIslands();
    const loose = rectMask(100, 60, { x: 8, y: 8, w: 24, h: 24 });
    const r = refineMask(comp, doc, loose, { radius: 4, smooth: 0, feather: 0, contrast: 0, shiftEdge: 0 });
    expect(r.data[20 * 100 + 9]).toBe(0);
    expect(r.data[20 * 100 + 11]).toBe(255);
    expect(r.data[20 * 100 + 20]).toBe(255);
    const shifted = refineMask(comp, doc, r, { radius: 0, smooth: 0, feather: 0, contrast: 0, shiftEdge: 50 });
    expect(count(shifted.data, 128)).toBeGreaterThan(count(r.data, 128));
  });
});

describe('colour range', () => {
  it('sampled selects the sampled colour softly and honours invert and within', () => {
    const { doc, comp } = twoIslands();
    const m = colorRange(comp, doc, { range: 'sampled', samples: [RED], fuzziness: 40, invert: false, within: null });
    expect(count(m.data, 255)).toBe(800);
    expect(m.data[0]).toBe(0);
    const inv = colorRange(comp, doc, { range: 'sampled', samples: [RED], fuzziness: 40, invert: true, within: null });
    expect(inv.data[0]).toBe(255);
    const within = colorRange(comp, doc, {
      range: 'sampled', samples: [RED], fuzziness: 40, invert: false, within: rectMask(100, 60, { x: 0, y: 0, w: 50, h: 60 }),
    });
    expect(count(within.data, 255)).toBe(400);
    const reds = colorRange(comp, doc, { range: 'reds', samples: [], fuzziness: 0, invert: false, within: null });
    expect(count(reds.data, 200)).toBe(800);
    const hi = colorRange(comp, doc, { range: 'highlights', samples: [], fuzziness: 0, invert: false, within: null });
    expect(hi.data[0]).toBe(255);
    expect(hi.data[15 * 100 + 15]).toBe(0);
  });
});

describe('quick select', () => {
  it('fills a flat disc from one dab near its centre and does not leak across a hard edge', () => {
    const { doc, comp } = painted(200, 200, (x, y) => ((x - 100) ** 2 + (y - 100) ** 2 <= 50 * 50 ? RED : [40, 60, 200, 255]));
    const q = createQuickSelect(comp, doc, { sampleAllLayers: true, tolerance: 32 });
    q.stroke({ x: 104, y: 97 }, 20);
    let inside = 0, outside = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const d = (x - 100) ** 2 + (y - 100) ** 2;
        const v = q.mask.data[y * 200 + x];
        if (d <= 50 * 50 && v === 255) inside++;
        if (d > 50 * 50 && v) outside++;
      }
    }
    let disc = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if ((x - 100) ** 2 + (y - 100) ** 2 <= 2500) disc++;
    expect(inside).toBe(disc);
    expect(outside).toBe(0);
    const same = q.mask;
    q.stroke({ x: -10, y: 5 }, 20);
    expect(q.mask).toBe(same);
  });

  it('stays inside the dab area on a soft gradient', () => {
    const { doc, comp } = painted(300, 40, (x) => [x * 0.8, x * 0.8, x * 0.8, 255]);
    const q = createQuickSelect(comp, doc, { sampleAllLayers: true, tolerance: 20 });
    q.stroke({ x: 30, y: 20 }, 8);
    const b = maskBounds(q.mask)!;
    expect(b.x + b.w).toBeLessThan(70);
  });
});

describe('magnetic lasso', () => {
  it('follows a straight vertical edge within 1 px between two points placed 3 px off it', () => {
    // Dark left of x = 60, bright from x = 60.
    const { doc, comp } = painted(160, 200, (x, y) => (x < 60 ? [30, 30, 30, 255] : [230, 230, 230, 255 + 0 * y]));
    const lasso = createMagneticLasso(comp, doc, { width: 10, contrast: 10, frequency: 0 });
    lasso.start({ x: 63, y: 20 });
    const path = lasso.trace({ x: 57, y: 180 });
    expect(path.length).toBeGreaterThan(150);
    for (const p of path) {
      expect(Math.abs(p.x - 60)).toBeLessThanOrEqual(1);
    }
    lasso.anchor({ x: 57, y: 180 });
    expect(lasso.points.length).toBe(path.length);
    lasso.undoAnchor();
    expect(lasso.points.length).toBe(1);
    lasso.undoAnchor();
    expect(lasso.points.length).toBe(0);
  });

  it('places automatic anchors by frequency and closes back to the start', () => {
    const { doc, comp } = painted(160, 200, (x) => (x < 60 ? [30, 30, 30, 255] : [230, 230, 230, 255]));
    const lasso = createMagneticLasso(comp, doc, { width: 10, contrast: 10, frequency: 100 });
    lasso.start({ x: 60, y: 10 });
    const live = lasso.trace({ x: 60, y: 190 });
    expect(lasso.points.length).toBeGreaterThan(100);
    expect(live.length).toBeLessThanOrEqual(11);
    lasso.anchor({ x: 120, y: 190 });
    const poly = lasso.close();
    expect(poly.length).toBeGreaterThan(lasso.points.length);
    expect(poly[0]).toEqual(lasso.points[0]);
  });
});
