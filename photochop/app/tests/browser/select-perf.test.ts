// Performance budgets from the 0.2.0 spec (section B): quick select under 8 ms per call on a
// 12 MP document with a 60 px brush; magnetic lasso trace under 12 ms for points 300 px apart.
import { describe, expect, it } from 'vitest';
import { createMagneticLasso, createQuickSelect, featherMask, expandMask, rectMask } from '@/engine';
import { painted } from './select-fixture';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe('selection performance', () => {
  it('quick select stays under 8 ms per stroke call on 12 MP with a 60 px brush', () => {
    // 4000 x 3000: a large flat region with a soft texture and a disc, the common case for the tool.
    const { doc, comp } = painted(4000, 3000, (x, y) => {
      const d = (x - 2000) ** 2 + (y - 1500) ** 2;
      if (d < 600 * 600) return [200, 60 + ((x * 7 + y * 3) % 9), 40, 255];
      return [40 + ((x + y) % 7), 90, 160, 255];
    });
    const t0 = performance.now();
    const q = createQuickSelect(comp, doc, { sampleAllLayers: true, tolerance: 32 });
    const create = performance.now() - t0;
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const s = performance.now();
      q.stroke({ x: 1700 + i * 10, y: 1500 + Math.sin(i / 5) * 40 }, 30);
      times.push(performance.now() - s);
    }
    const med = median(times), worst = Math.max(...times);
    console.info(`quick select: create ${create.toFixed(0)} ms, stroke median ${med.toFixed(2)} ms, worst ${worst.toFixed(2)} ms`);
    expect(med).toBeLessThan(8);
  }, 120000);

  it('magnetic lasso trace stays under 12 ms for points 300 px apart', () => {
    const { doc, comp } = painted(1200, 1200, (x, y) => {
      if (Math.abs(x - y) < 1) return [240, 240, 240, 255];
      return [((x * 13) ^ (y * 7)) % 40 + 60, 80, 90, 255];
    });
    const lasso = createMagneticLasso(comp, doc, { width: 10, contrast: 10, frequency: 0 });
    lasso.start({ x: 300, y: 300 });
    const along: number[] = [], across: number[] = [];
    for (let i = 0; i < 15; i++) {
      let s = performance.now();
      lasso.trace({ x: 512 + i * 0.5, y: 512 });
      along.push(performance.now() - s);
      s = performance.now();
      lasso.trace({ x: 600, y: 300 + i * 0.5 });
      across.push(performance.now() - s);
    }
    // Worst case: a flat area with no edge at all, points 300 px apart on the diagonal (the whole window is searched).
    const flat = painted(800, 800, () => [128, 128, 128, 255]);
    const fl = createMagneticLasso(flat.comp, flat.doc, { width: 10, contrast: 10, frequency: 0 });
    fl.start({ x: 100, y: 100 });
    const worst: number[] = [];
    for (let i = 0; i < 15; i++) {
      const s = performance.now();
      fl.trace({ x: 312 + i * 0.5, y: 312 });
      worst.push(performance.now() - s);
    }
    console.info(`magnetic trace 300 px: along an edge median ${median(along).toFixed(2)} ms, horizontal over texture ${median(across).toFixed(2)} ms, flat diagonal worst case ${median(worst).toFixed(2)} ms`);
    expect(median(along)).toBeLessThan(12);
    expect(median(across)).toBeLessThan(12);
    expect(median(worst)).toBeLessThan(12);
  }, 120000);

  it('feather and expand on 12 MP finish in reasonable time', () => {
    const m = rectMask(4000, 3000, { x: 500, y: 400, w: 3000, h: 2200 });
    let s = performance.now();
    featherMask(m, 20);
    const f = performance.now() - s;
    s = performance.now();
    expandMask(m, 40);
    const e = performance.now() - s;
    console.info(`12 MP feather 20 px ${f.toFixed(0)} ms, expand 40 px ${e.toFixed(0)} ms`);
    expect(f).toBeLessThan(5000);
    expect(e).toBeLessThan(5000);
  }, 120000);
});
