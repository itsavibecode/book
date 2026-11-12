import { describe, expect, it } from 'vitest';
import {
  commands, createCompositor, createDocument, createGroupNode, ellipseMask, createRasterNode, createShapeNode, createTextNode,
  mat3Rotate, mat3Scale, measureText, rasterizeShape, type CompositorLike, type DocumentLike, type RasterNode,
  type ShapeNode, type TextNode,
} from '@/engine';
import { makeImageData } from '@/engine/util';

function tryGl(): CompositorLike | null {
  try { return createCompositor('gl'); } catch { return null; }
}
const gl = tryGl();

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, tol: number) {
  let max = 0, ok = 0;
  const px = a.length / 4;
  for (let p = 0; p < px; p++) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[p * 4 + c] - b[p * 4 + c]));
    if (d <= tol) ok++;
    max = Math.max(max, d);
  }
  return { max, ratio: ok / px };
}

function raster(name: string, x: number, y: number, w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): RasterNode {
  const n = createRasterNode(name);
  const d = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d.set(f(i, j), (j * w + i) * 4);
  n.tiles.write(makeImageData(w, h, d), x, y);
  n.tiles.prune();
  return n;
}

/** Background, a smooth middle layer (the one transformed) and a translucent layer on top. */
function scene(): { doc: DocumentLike; mid: RasterNode } {
  const doc = createDocument({ name: 'Preview', width: 240, height: 180, background: [240, 240, 235, 255] });
  const mid = raster('Mid', 60, 40, 120, 90, (x, y) => [80 + x, 40 + y, 200 - x, 255]);
  const top = raster('Top', 0, 120, 240, 60, (x) => [20, 120, (x * 255) / 240, 120]);
  doc.root.children.push(mid, top);
  return { doc, mid };
}

describe('text and shape matrix', () => {
  it('bounds are the axis-aligned bounds of the transformed box', () => {
    const t = createTextNode('T', { text: 'Wide text', size: 30 });
    const plain = measureText(t);
    const rot = measureText({ ...t, matrix: [0, 1, -1, 0] });
    expect(Math.abs(rot.w - plain.h)).toBeLessThanOrEqual(2);
    expect(Math.abs(rot.h - plain.w)).toBeLessThanOrEqual(2);
    const s = createShapeNode('S', { w: 100, h: 50, fill: [0, 0, 0, 255] });
    const doc = createDocument({ name: 'B', width: 400, height: 400, background: null });
    doc.root.children.push(s, t);
    expect(doc.nodeBounds(s.id)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    doc.history.push(commands.transformNodes(doc, [s.id], mat3Rotate(45, 50, 25), 'bilinear'));
    const b = doc.nodeBounds(s.id)!;
    const span = (150 / Math.SQRT2);
    expect(Math.abs(b.w - span)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.h - span)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.x + b.w / 2 - 50)).toBeLessThanOrEqual(1);
  });

  it('a shape scaled through its matrix draws like a bigger shape (vector, not resampled)', () => {
    const big = createShapeNode('Big', { w: 80, h: 40, fill: [200, 0, 0, 255] });
    const small = createShapeNode('Small', { w: 40, h: 20, fill: [200, 0, 0, 255], matrix: [2, 0, 0, 2] });
    const a = rasterizeShape(big)!, b = rasterizeShape(small)!;
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    expect(compare(a.data, b.data, 0).max).toBe(0);
  });

  it('text stays a text layer after scale and rotate and renders rotated', () => {
    const doc = createDocument({ name: 'T', width: 300, height: 300, background: null });
    const t = createTextNode('T', { text: 'Rotate me', size: 32, x: 100, y: 100 });
    doc.root.children.push(t);
    const cpu = createCompositor('cpu');
    doc.history.push(commands.transformNodes(doc, [t.id], mat3Rotate(90, 100, 100), 'bilinear'));
    doc.history.push(commands.transformNodes(doc, [t.id], mat3Scale(1.5, 1.5, 100, 100), 'bilinear'));
    const n = doc.getNode(t.id) as TextNode;
    expect(n.type).toBe('text');
    expect(n.matrix.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 1.5, -1.5, 0]);
    doc.history.push(commands.setProps(doc, t.id, { text: 'Still text' }));
    cpu.composite(doc);
    const b = doc.nodeBounds(t.id)!;
    expect(b.h).toBeGreaterThan(b.w);
    expect(b.x + b.w).toBeLessThanOrEqual(102);
    const img = cpu.readImageData(b);
    expect(img.data.some((v, i) => i % 4 === 3 && v > 200)).toBe(true);
  });
});

describe('transform preview', () => {
  const backends: Array<[string, () => CompositorLike | null]> = [['cpu', () => createCompositor('cpu')], ['gl', () => gl]];
  for (const [name, make] of backends) {
    it.skipIf(name === 'gl' && !gl)(`${name}: a rotation preview matches the committed bilinear result`, () => {
      const c = make()!;
      const { doc, mid } = scene();
      const m = mat3Rotate(20, 120, 85);
      c.setPreview({ nodeId: mid.id, matrix: m, interpolation: 'bilinear' });
      c.composite(doc);
      const preview = c.readImageData().data.slice();
      c.setPreview(null);
      const ref = createCompositor('cpu');
      doc.history.push(commands.transformNodes(doc, [mid.id], m, 'bilinear'));
      ref.composite(doc);
      const r = compare(preview, ref.readImageData().data, 6);
      console.info(`${name} preview vs commit: ${(r.ratio * 100).toFixed(2)}% within 6/255, max ${r.max}`);
      expect(r.ratio).toBeGreaterThanOrEqual(0.99);
      // Clearing the preview restores the normal composite.
      doc.history.undo();
      c.composite(doc);
      const fresh = createCompositor('cpu');
      fresh.composite(doc);
      expect(compare(c.readImageData().data, fresh.readImageData().data, 6).ratio).toBe(1);
    });

    it.skipIf(name === 'gl' && !gl)(`${name}: a layer inside a masked, blended group previews like the committed result`, () => {
      const c = make()!;
      const { doc, mid } = scene();
      const g = createGroupNode('Masked group');
      g.opacity = 0.7;
      g.blend = 'multiply';
      g.mask = ellipseMask(240, 180, { x: 30, y: 20, w: 170, h: 130 });
      const inner = raster('Inner', 20, 30, 80, 60, (x, y) => [250, 200 - y, 40 + x, 200]);
      doc.root.children.splice(1, 1);
      g.children.push(inner, mid);
      doc.root.children.splice(1, 0, g);
      const m = mat3Rotate(-25, 120, 85);
      c.setPreview({ nodeId: mid.id, matrix: m, interpolation: 'bilinear' });
      c.composite(doc);
      const preview = c.readImageData().data.slice();
      c.setPreview(null);
      const ref = createCompositor('cpu');
      doc.history.push(commands.transformNodes(doc, [mid.id], m, 'bilinear'));
      ref.composite(doc);
      const r = compare(preview, ref.readImageData().data, 6);
      console.info(`${name} masked-group preview vs commit: ${(r.ratio * 100).toFixed(2)}% within 6/255, max ${r.max}`);
      expect(r.ratio).toBeGreaterThanOrEqual(0.99);
    });

    it.skipIf(name === 'gl' && !gl)(`${name}: previews groups, 'root', projective and warp without touching the document`, () => {
      const c = make()!;
      const { doc, mid } = scene();
      const g = createGroupNode('G');
      doc.root.children.splice(1, 1);
      g.children.push(mid);
      doc.root.children.splice(1, 0, g);
      const v = doc.version;
      const frames: Uint8ClampedArray[] = [];
      for (const p of [
        { nodeId: g.id, matrix: mat3Scale(0.5, 0.5, 120, 90) },
        { nodeId: doc.root.id, matrix: mat3Rotate(180, 120, 90) },
        { nodeId: mid.id, matrix: [1, 0, 0, 0, 1, 0, 0.002, 0, 1] as [number, number, number, number, number, number, number, number, number] },
        { nodeId: mid.id, warp: { points: Array.from({ length: 16 }, (_, k) => ({ x: 0 + ((k % 4) * 256) / 3 + (k === 5 ? 30 : 0), y: Math.floor(k / 4) * 256 / 3 })) } },
      ]) {
        c.setPreview(p);
        c.composite(doc);
        frames.push(c.readImageData().data.slice());
      }
      c.setPreview(null);
      c.composite(doc);
      const plain = c.readImageData().data;
      expect(doc.version).toBe(v);
      for (const f of frames) expect(compare(f, plain, 2).ratio).toBeLessThan(0.99);
      // Root rotated 180 puts the top-left pixel at the bottom-right.
      const W = 240, H = 180;
      for (let ch = 0; ch < 4; ch++) expect(Math.abs(frames[1][((H - 1) * W + W - 1) * 4 + ch] - plain[ch])).toBeLessThanOrEqual(6);
    });
  }
});

export const _s: ShapeNode | null = null;
