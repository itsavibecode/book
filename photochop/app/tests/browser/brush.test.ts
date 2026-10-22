import { describe, expect, it } from 'vitest';
import {
  beginRasterEdit, commands, createBrushStroke, createDocument, createRasterNode, floodFill, rectMask,
  selectionFromMask, type BrushParams, type RasterNode,
} from '@/engine';

const base: BrushParams = {
  size: 10, hardness: 1, opacity: 1, flow: 1, spacing: 0.1, color: [255, 0, 0, 255],
  pressureSize: false, pressureOpacity: false, mode: 'paint',
};

function setup(bg: [number, number, number, number] | null = null) {
  const doc = createDocument({ name: 'B', width: 300, height: 200, background: bg });
  let node = doc.root.children[0] as RasterNode | undefined;
  if (!node) {
    node = createRasterNode('Paint');
    doc.history.push(commands.addNode(doc, node, null, 0));
  }
  const px = (x: number, y: number) => Array.from(node!.tiles.read({ x, y, w: 1, h: 1 }).data);
  return { doc, node, px };
}

function stroke(doc: ReturnType<typeof setup>['doc'], node: RasterNode, params: Partial<BrushParams>, pts: Array<[number, number]>) {
  const s = beginRasterEdit(doc, node.id);
  const b = createBrushStroke(s, { ...base, ...params }, doc.selection);
  b.begin({ x: pts[0][0], y: pts[0][1], pressure: 0.5 });
  for (const [x, y] of pts.slice(1)) b.move({ x, y, pressure: 0.5 });
  const rect = b.end();
  doc.history.record(s.commit('Brush'));
  return rect;
}

describe('brush', () => {
  it('a straight hard stroke paints the expected pixels', () => {
    const { doc, node, px } = setup();
    const rect = stroke(doc, node, {}, [[20, 50.3], [280, 50.3]]);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeLessThanOrEqual(15);
    expect(rect!.x + rect!.w).toBeGreaterThanOrEqual(285);
    for (const x of [20, 100, 255, 256, 257, 280]) {
      expect(px(x, 50)).toEqual([255, 0, 0, 255]);
      expect(px(x, 46)).toEqual([255, 0, 0, 255]);
      expect(px(x, 53)).toEqual([255, 0, 0, 255]);
      expect(px(x, 40)[3]).toBe(0);
      expect(px(x, 60)[3]).toBe(0);
    }
    // Antialiased rim: the edge row is partially covered.
    const edge = px(150, 55)[3];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    doc.history.undo();
    expect(node.tiles.size).toBe(0);
  });

  it('the opacity cap holds when a stroke crosses itself', () => {
    const { doc, node, px } = setup();
    stroke(doc, node, { opacity: 0.5, size: 16 }, [[50, 50], [150, 50], [150, 150], [100, 100], [100, 20]]);
    expect(px(100, 50)[3]).toBe(128);
    expect(px(150, 100)[3]).toBe(128);
    expect(px(60, 50)[3]).toBe(128);
  });

  it('flow builds up towards the opacity within one stroke', () => {
    const { doc, node, px } = setup();
    stroke(doc, node, { flow: 0.1, size: 20 }, [[50, 50], [52, 50]]);
    const a = px(51, 50)[3];
    expect(a).toBeGreaterThan(25);
    expect(a).toBeLessThan(255);
  });

  it('the eraser removes alpha and keeps colour', () => {
    const { doc, node, px } = setup([0, 128, 255, 255]);
    stroke(doc, node, { mode: 'erase', opacity: 1 }, [[20, 20], [100, 20]]);
    expect(px(60, 20)[3]).toBe(0);
    expect(px(60, 40)).toEqual([0, 128, 255, 255]);
    stroke(doc, node, { mode: 'erase', opacity: 0.5 }, [[20, 80], [100, 80]]);
    expect(px(60, 80)).toEqual([0, 128, 255, 128]);
  });

  it('the selection restricts painting', () => {
    const { doc, node, px } = setup();
    doc.selection = selectionFromMask(rectMask(300, 200, { x: 0, y: 0, w: 100, h: 200 }));
    stroke(doc, node, {}, [[50, 50], [200, 50]]);
    expect(px(90, 50)[3]).toBe(255);
    expect(px(150, 50)[3]).toBe(0);
  });

  it('flood fill stays inside the contiguous region', () => {
    const { doc, node, px } = setup([255, 255, 255, 255]);
    stroke(doc, node, { color: [0, 0, 0, 255], size: 4 }, [[150, 0], [150, 199]]);
    const s = beginRasterEdit(doc, node.id);
    const rect = floodFill(s, doc, { x: 10, y: 10 }, [0, 200, 0, 255], 10, true);
    doc.history.record(s.commit('Fill'));
    expect(rect!.x).toBe(0);
    expect(rect!.x + rect!.w).toBeLessThanOrEqual(150);
    expect(px(10, 10)).toEqual([0, 200, 0, 255]);
    expect(px(250, 10)).toEqual([255, 255, 255, 255]);
  });
});
