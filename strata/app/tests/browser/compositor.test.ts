import { describe, expect, it } from 'vitest';
import { commands, createCompositor, type CompositorLike, type RasterNode } from '@/engine';
import { buildFixture, FH, FW } from './fixture';

function tryGl(): CompositorLike | null {
  try {
    return createCompositor('gl');
  } catch (err) {
    console.warn(`WebGL2 unavailable, GL parity skipped: ${(err as Error).message}`);
    return null;
  }
}

const gl = tryGl();

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let maxDiff = 0, within2 = 0;
  const px = a.length / 4;
  for (let p = 0; p < px; p++) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[p * 4 + c] - b[p * 4 + c]));
    if (d <= 2) within2++;
    if (d > maxDiff) maxDiff = d;
  }
  return { maxDiff, ratio: within2 / px };
}

describe('compositor', () => {
  it('CPU composite paints every layer and honours the dirty rect', () => {
    const doc = buildFixture();
    const cpu = createCompositor('cpu');
    cpu.composite(doc);
    const full = cpu.readImageData();
    expect(full.width).toBe(FW);
    expect(full.data.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    // Change one layer, recomposite only a region, and compare with a fresh full composite.
    const base = doc.root.children[0] as RasterNode;
    base.tiles.getOrCreate(0, 0).fill(0, 0, 50 * 4);
    const dirty = { x: 0, y: 0, w: 60, h: 4 };
    cpu.composite(doc, { dirty });
    const fresh = createCompositor('cpu');
    fresh.composite(doc);
    expect(Array.from(cpu.readImageData().data)).toEqual(Array.from(fresh.readImageData().data));
  });

  it.skipIf(!gl)('GL and CPU agree within 2/255 on 99.5% of pixels and 6/255 everywhere', () => {
    const doc = buildFixture();
    const cpu = createCompositor('cpu');
    cpu.composite(doc);
    gl!.composite(doc);
    expect(gl!.kind).toBe('gl');
    const r = compare(gl!.readImageData().data, cpu.readImageData().data);
    console.info(`GL vs CPU: max diff ${r.maxDiff}, ${(r.ratio * 100).toFixed(3)}% within 2/255`);
    expect(r.ratio).toBeGreaterThanOrEqual(0.995);
    expect(r.maxDiff).toBeLessThanOrEqual(6);
    const glData = gl!.readImageData().data;
    expect(glData.filter((v, i) => i % 4 === 3 && v === 255).length).toBeGreaterThan(FW * FH * 0.5);
    // The visible canvas carries the same picture (upright, straight alpha) for the UI to draw.
    const probe = new OffscreenCanvas(FW, FH);
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(gl!.canvas, 0, 0);
    const shown = ctx.getImageData(0, 0, FW, FH).data;
    let opaqueDiff = 0;
    for (let i = 0; i < shown.length; i += 4) {
      if (glData[i + 3] !== 255) continue;
      for (let c = 0; c < 3; c++) opaqueDiff = Math.max(opaqueDiff, Math.abs(shown[i + c] - glData[i + c]));
    }
    expect(opaqueDiff).toBeLessThanOrEqual(2);
  });

  it('a text node and a shape node render content of the expected size', () => {
    const doc = buildFixture();
    const cpu = createCompositor('cpu');
    const text = doc.root.children.find((c) => c.type === 'text')!;
    const shape = doc.root.children.find((c) => c.name === 'Card')!;
    const tb = doc.nodeBounds(text.id)!, sb = doc.nodeBounds(shape.id)!;
    expect(tb.w).toBeGreaterThan(60);
    expect(tb.h).toBeGreaterThan(80);
    expect(sb).toEqual({ x: 177, y: 137, w: 116, h: 76 });
    const img = cpu.renderNode(doc, shape.id);
    const at = (x: number, y: number) => img.data[(y * FW + x) * 4 + 3];
    expect(at(235, 175)).toBe(200);
    expect(at(178, 175)).toBe(255);
    expect(at(170, 175)).toBe(0);
  });

  it.skipIf(!gl)('GL follows pixel edits, undo and prop changes', () => {
    const doc = buildFixture();
    const cpu = createCompositor('cpu');
    gl!.composite(doc);
    const base = doc.root.children[0] as RasterNode;
    doc.history.push(commands.setProps(doc, doc.root.children[1].id, { opacity: 0.3, blend: 'screen' }));
    doc.history.push(commands.setProps(doc, doc.root.children[3].id, { x: 120, y: 10 }));
    const buf = base.tiles.getOrCreate(0, 0);
    buf.fill(255, 0, 256 * 4 * 10);
    doc.emit({ kind: 'pixels', nodeId: base.id, rect: { x: 0, y: 0, w: 256, h: 10 } });
    doc.history.push(commands.removeNodes(doc, [doc.root.children[2].id]));
    gl!.composite(doc);
    cpu.composite(doc);
    let r = compare(gl!.readImageData().data, cpu.readImageData().data);
    expect(r.maxDiff).toBeLessThanOrEqual(6);
    doc.history.undo();
    doc.history.undo();
    gl!.composite(doc);
    cpu.composite(doc);
    r = compare(gl!.readImageData().data, cpu.readImageData().data);
    expect(r.maxDiff).toBeLessThanOrEqual(6);
  });

  it.skipIf(!gl)('renderNode matches between GL and CPU for a group and a text node', () => {
    const doc = buildFixture();
    const cpu = createCompositor('cpu');
    for (const n of [doc.root.children[2], doc.root.children.find((c) => c.type === 'text')!]) {
      const a = gl!.renderNode(doc, n.id), b = cpu.renderNode(doc, n.id);
      expect(a.width).toBe(FW);
      expect(a.height).toBe(FH);
      expect(compare(a.data, b.data).maxDiff).toBeLessThanOrEqual(6);
      expect(b.data.some((v) => v !== 0)).toBe(true);
    }
  });

  it('rasterise, merge down and flatten preserve the look', () => {
    const doc = buildFixture();
    const cpu = createCompositor('cpu');
    cpu.composite(doc);
    const before = cpu.readImageData().data.slice();
    const same = () => {
      cpu.composite(doc);
      return compare(cpu.readImageData().data, before).maxDiff;
    };
    const text = doc.root.children.find((c) => c.type === 'text')!;
    doc.history.push(commands.rasterizeNode(doc, text.id));
    expect(doc.getNode(text.id)).toBeUndefined();
    expect(same()).toBe(0);
    const group = doc.root.children[2];
    doc.history.push(commands.rasterizeNode(doc, group.id));
    expect(same()).toBeLessThanOrEqual(1);
    // 'Alpha ramp' onto 'Base': both raster, normal blend.
    doc.history.push(commands.mergeDown(doc, doc.root.children[1].id));
    expect(same()).toBeLessThanOrEqual(1);
    doc.history.push(commands.flatten(doc));
    expect(doc.root.children.length).toBe(1);
    expect(same()).toBe(0);
    while (doc.history.undo());
    expect(same()).toBe(0);
  });

  it('auto falls back to the CPU when WebGL2 context creation fails', () => {
    const orig = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (this: OffscreenCanvas, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') throw new Error('blocked');
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
    try {
      expect(createCompositor('auto').kind).toBe('cpu');
    } finally {
      OffscreenCanvas.prototype.getContext = orig;
    }
    expect(createCompositor('cpu').kind).toBe('cpu');
    expect(FH).toBeGreaterThan(0);
  });
});
