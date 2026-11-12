import { afterEach, describe, expect, it } from 'vitest';
import {
  commands, createAutosave, createCompositor, createDocument, createRasterNode, mat3Rotate, store,
  type CompositorLike, type DocumentLike, type RasterNode,
} from '@/engine';
import { GlCompositor } from '@/engine/compositor/gl';
import { encodeJobs, pngWorkerActive, setPngWorkerDisabled } from '@/engine/workers/encode';
import { encodePng } from '@/engine/png';
import { resampleNodeTiles } from '@/engine/transform';
import { fillTilesRect } from '@/engine/tiles';
import { makeImageData } from '@/engine/util';
import { buildFixture } from './fixture';

const hasGl = (() => { try { createCompositor('gl').dispose(); return true; } catch { return false; } })();

function same(a: CompositorLike, b: CompositorLike): number {
  const x = a.readImageData().data, y = b.readImageData().data;
  let max = 0;
  for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i] - y[i]));
  return max;
}

afterEach(() => { GlCompositor.maxTextureOverride = null; setPngWorkerDisabled(false); });

describe('auto compositor fallback', () => {
  it.skipIf(!hasGl)('uses GL, then falls back to the CPU when the document outgrows MAX_TEXTURE_SIZE', () => {
    GlCompositor.maxTextureOverride = 600;
    const doc = buildFixture();
    const c = createCompositor('auto');
    const canvas = c.canvas;
    c.composite(doc);
    expect(c.kind).toBe('gl');
    const ref = createCompositor('cpu');
    ref.composite(doc);
    expect(same(c, ref)).toBeLessThanOrEqual(6);
    doc.history.push(commands.resizeCanvas(doc, 700, 300, 10, 10));
    c.composite(doc);
    expect(c.kind).toBe('cpu');
    expect(c.canvas).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([700, 300]);
    ref.composite(doc);
    expect(same(c, ref)).toBe(0);
  });

  it.skipIf(!hasGl)('falls back when a single layer is larger than MAX_TEXTURE_SIZE', () => {
    GlCompositor.maxTextureOverride = 512;
    const doc = createDocument({ name: 'Wide', width: 200, height: 100, background: [255, 255, 255, 255] });
    const wide = createRasterNode('Wide');
    fillTilesRect(wide.tiles, { x: -300, y: 0, w: 900, h: 50 }, [10, 200, 30, 255]);
    doc.root.children.push(wide);
    const c = createCompositor('auto');
    c.composite(doc);
    expect(c.kind).toBe('cpu');
    const ref = createCompositor('cpu');
    ref.composite(doc);
    expect(same(c, ref)).toBe(0);
  });

  it.skipIf(!hasGl)('falls back on webglcontextlost and keeps the same canvas', () => {
    const doc = buildFixture();
    const c = createCompositor('auto');
    const canvas = c.canvas;
    c.composite(doc);
    expect(c.kind).toBe('gl');
    const inner = (c as unknown as { gl: GlCompositor }).gl;
    let told = '';
    (c as unknown as { onFallback: (r: string) => void }).onFallback = (r) => { told = r; };
    (inner.canvas as EventTarget).dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(c.kind).toBe('cpu');
    expect(told).toMatch(/lost/);
    expect(c.canvas).toBe(canvas);
    c.composite(doc);
    const ref = createCompositor('cpu');
    ref.composite(doc);
    expect(same(c, ref)).toBe(0);
    // The visible canvas carries the CPU picture.
    const probe = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
    probe.drawImage(canvas, 0, 0);
    expect(probe.getImageData(5, 5, 1, 1).data[3]).toBe(ref.readImageData({ x: 5, y: 5, w: 1, h: 1 }).data[3]);
  });

  it('compositors resize themselves on a document resize', () => {
    const doc = buildFixture();
    for (const c of [createCompositor('cpu'), createCompositor('auto')]) {
      c.composite(doc);
      doc.history.push(commands.rotateDocument(doc, 90));
      c.composite(doc);
      expect([c.canvas.width, c.canvas.height]).toEqual([doc.width, doc.height]);
      expect(c.readImageData().width).toBe(doc.width);
      doc.history.undo();
      c.composite(doc);
      expect(c.readImageData().width).toBe(doc.width);
    }
  });
});

describe('PNG worker', () => {
  it('worker encoding equals main-thread encoding', async () => {
    expect(pngWorkerActive()).toBe(true);
    const w = 300, h = 200;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 7 + (i >> 9)) & 255;
    const grey = new Uint8Array(w * h).map((_, i) => i % 251);
    const out = await encodeJobs([
      { key: 'a', pixels: px.slice(), w, h, channels: 4 },
      { key: 'b', pixels: grey.slice(), w, h, channels: 1 },
    ]);
    expect(out.a).toEqual(encodePng(px, w, h, 4, 4));
    expect(out.b).toEqual(encodePng(grey, w, h, 1, 4));
    setPngWorkerDisabled(true);
    const main = await encodeJobs([{ key: 'a', pixels: px.slice(), w, h, channels: 4 }]);
    expect(main.a).toEqual(out.a);
  });
});

/** Longest gap between timer ticks while fn runs: how long the main thread was blocked at a time. */
async function longestBlock(fn: () => Promise<unknown>): Promise<number> {
  let last = performance.now(), worst = 0, on = true;
  const tick = () => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    if (on) setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
  await fn();
  on = false;
  return worst;
}

function bigDoc(w: number, h: number): DocumentLike {
  const doc = createDocument({ name: 'Big', width: w, height: h, background: [30, 60, 90, 255] });
  const n = createRasterNode('Paint');
  const d = new Uint8ClampedArray(1024 * 1024 * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = i & 255; d[i + 1] = (i >> 8) & 255; d[i + 2] = 77; d[i + 3] = 255; }
  n.tiles.write(makeImageData(1024, 1024, d), 500, 500);
  doc.root.children.push(n);
  return doc;
}

describe('timings (logged for the hand-over note)', () => {
  // Runs first in this block: the later timing tests leave a lot of garbage for the collector.
  it('first autosave of a 24 MP document keeps main-thread blocks short', async () => {
    const doc = bigDoc(6000, 4000);
    // Let the collector deal with the setup garbage first, so the probe measures the autosave itself.
    await new Promise((r) => setTimeout(r, 500));
    const auto = createAutosave();
    auto.attach(doc);
    const t0 = performance.now();
    const block = await longestBlock(() => auto.flush());
    console.info(`autosave 24 MP: ${(performance.now() - t0).toFixed(0)} ms total, longest main-thread block ${block.toFixed(1)} ms (worker ${pngWorkerActive()})`);
    expect(auto.state).toBe('saved');
    const back = await store.loadDocument(doc.id);
    const a = (doc.root.children[0] as RasterNode).tiles, b = (back!.root.children[0] as RasterNode).tiles;
    expect(Array.from(b.read({ x: 5990, y: 3990, w: 10, h: 10 }).data)).toEqual(Array.from(a.read({ x: 5990, y: 3990, w: 10, h: 10 }).data));
    auto.detach();
    await store.deleteDocument(doc.id);
    // Target is 50 ms (about 30 ms measured on an idle machine); the margin absorbs CPU contention.
    expect(block).toBeLessThan(80);
  }, 120_000);

  it('contentBounds of a full 24 MP layer: cold under 60 ms, cached afterwards', () => {
    const doc = createDocument({ name: 'Full', width: 6000, height: 4000, background: [9, 9, 9, 255] });
    const sparse = createRasterNode('Dot');
    fillTilesRect(sparse.tiles, { x: 3001, y: 2002, w: 3, h: 2 }, [255, 0, 0, 255]);
    doc.root.children.push(sparse);
    const bg = doc.root.children[0];
    let t0 = performance.now();
    const b = doc.contentBounds(bg.id);
    const cold = performance.now() - t0;
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) doc.contentBounds(bg.id);
    const warm = (performance.now() - t0) / 1000;
    t0 = performance.now();
    const d = doc.contentBounds(sparse.id);
    const dot = performance.now() - t0;
    console.info(`contentBounds 24 MP full layer: cold ${cold.toFixed(1)} ms, cached ${(warm * 1000).toFixed(1)} us; single-dot tile ${dot.toFixed(2)} ms`);
    expect(b).toEqual({ x: 0, y: 0, w: 6000, h: 4000 });
    expect(d).toEqual({ x: 3001, y: 2002, w: 3, h: 2 });
    expect(cold).toBeLessThan(60);
  });

  it('resamples a 12 MP layer with each interpolation', () => {
    const n = createRasterNode('L');
    fillTilesRect(n.tiles, { x: 0, y: 0, w: 4000, h: 3000 }, [120, 60, 30, 255]);
    for (const interp of ['nearest', 'bilinear', 'bicubic'] as const) {
      const t0 = performance.now();
      const out = resampleNodeTiles(n.tiles, 0, 0, mat3Rotate(10, 2000, 1500), interp);
      const ms = performance.now() - t0;
      console.info(`resample 12 MP rotate 10 deg ${interp}: ${ms.toFixed(0)} ms (${out.size} tiles)`);
      expect(out.size).toBeGreaterThan(100);
    }
    const t0 = performance.now();
    resampleNodeTiles(n.tiles, 0, 0, mat3Rotate(90, 2000, 1500), 'bicubic');
    console.info(`resample 12 MP quarter turn (exact path): ${(performance.now() - t0).toFixed(0)} ms`);
  }, 120_000);

  it('preview frame cost on a 12 MP document', () => {
    const doc = bigDoc(4000, 3000);
    const node = doc.root.children[1] as RasterNode;
    for (const c of [createCompositor('cpu'), ...(hasGl ? [createCompositor('gl')] : [])]) {
      c.composite(doc);
      c.setPreview({ nodeId: node.id, matrix: mat3Rotate(5, 1000, 1000) });
      let t0 = performance.now();
      c.composite(doc);
      const first = performance.now() - t0;
      t0 = performance.now();
      for (let i = 1; i <= 5; i++) {
        c.setPreview({ nodeId: node.id, matrix: mat3Rotate(5 + i, 1000, 1000) });
        c.composite(doc);
      }
      console.info(`${c.kind} preview 12 MP: first frame ${first.toFixed(0)} ms, later frames ${((performance.now() - t0) / 5).toFixed(1)} ms`);
      c.setPreview(null);
      c.dispose();
    }
  }, 120_000);
});
