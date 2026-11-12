import { describe, expect, it } from 'vitest';
import {
  beginMaskEdit, commands, copyPixels, createMask, createMaskStroke, fillMask, maskBounds, rectMask, selectionFromMask,
  type BrushParams, type RasterNode,
} from '@/engine';
import { copyImageToClipboard, exportSelection, importSelection } from '@/io';
import { RED, WHITE, count, painted, twoIslands } from './select-fixture';

const brush: BrushParams = {
  size: 10, hardness: 1, opacity: 1, flow: 1, spacing: 0.1, color: [0, 0, 0, 255],
  pressureSize: false, pressureOpacity: false, mode: 'paint',
};

function tileBytes(n: RasterNode): string {
  const parts: string[] = [];
  for (const k of n.tiles.keys().sort()) {
    const [tx, ty] = k.split(',').map(Number);
    parts.push(k + ':' + Array.from(n.tiles.get(tx, ty)!).join(','));
  }
  return parts.join('|');
}

describe('mask editing', () => {
  it('a mask stroke paints and undoes exactly', () => {
    const { doc, node } = twoIslands();
    doc.history.push(commands.setMask(doc, node.id, createMask(100, 60, 255)));
    const before = node.mask!.data.slice();
    const events: string[] = [];
    doc.subscribe((ev) => events.push(ev.kind));
    const s = beginMaskEdit(doc, node.id);
    const st = createMaskStroke(s, brush, 0, null);
    st.begin({ x: 10.5, y: 30.5, pressure: 0.5 });
    st.move({ x: 90.5, y: 30.5, pressure: 0.5 });
    const rect = st.end();
    expect(rect).not.toBeNull();
    doc.history.record(s.commit('Paint mask'));
    const after = node.mask!.data.slice();
    expect(node.mask!.data[30 * 100 + 50]).toBe(0);
    expect(node.mask!.data[30 * 100 + 50 - 12 * 100]).toBe(255);
    expect(events).toContain('node');
    doc.history.undo();
    expect(Array.from(node.mask!.data)).toEqual(Array.from(before));
    doc.history.redo();
    expect(Array.from(node.mask!.data)).toEqual(Array.from(after));
  });

  it('grey values, the selection and the bucket', () => {
    const { doc, node } = twoIslands();
    doc.history.push(commands.setMask(doc, node.id, createMask(100, 60, 255)));
    doc.selection = selectionFromMask(rectMask(100, 60, { x: 0, y: 0, w: 50, h: 60 }));
    const s = beginMaskEdit(doc, node.id);
    const st = createMaskStroke(s, { ...brush, size: 20 }, 128, doc.selection);
    st.begin({ x: 40, y: 30, pressure: 0.5 });
    st.move({ x: 60, y: 30, pressure: 0.5 });
    st.end();
    expect(node.mask!.data[30 * 100 + 45]).toBe(128);
    expect(node.mask!.data[30 * 100 + 55]).toBe(255);
    const r = fillMask(s, doc, null, 0, 0, true);
    expect(r).toEqual({ x: 0, y: 0, w: 50, h: 60 });
    expect(node.mask!.data[30 * 100 + 10]).toBe(0);
    doc.selection = null;
    const r2 = fillMask(s, doc, { x: 80, y: 5 }, 60, 0, true);
    expect(r2).toEqual({ x: 50, y: 0, w: 50, h: 60 });
    expect(fillMask(s, doc, { x: -3, y: 5 }, 60, 0, true)).toBeNull();
    doc.history.record(s.commit('Fill mask'));
    doc.history.undo();
    expect(count(node.mask!.data, 255)).toBe(6000);
  });

  it('refuses layers without a mask or with a mask of the wrong size', () => {
    const { doc, node } = twoIslands();
    expect(() => beginMaskEdit(doc, node.id)).toThrow('This layer has no mask');
    node.mask = createMask(10, 10, 255);
    expect(() => beginMaskEdit(doc, node.id)).toThrow(/10 x 10/);
  });
});

describe('layer via cut and copy', () => {
  it('layer via cut moves the right pixels and undo restores both layers byte-exact', () => {
    const { doc, node } = twoIslands();
    const original = tileBytes(node);
    doc.selection = selectionFromMask(rectMask(100, 60, { x: 0, y: 0, w: 50, h: 60 }));
    doc.history.push(commands.layerViaCut(doc, node.id));
    expect(doc.root.children.length).toBe(2);
    const cut = doc.root.children[1] as RasterNode;
    expect(cut.name).toBe('Layer via cut');
    expect(cut.opacity).toBe(1);
    expect(cut.blend).toBe('normal');
    expect(doc.activeId).toBe(cut.id);
    const px = (n: RasterNode, x: number, y: number) => Array.from(n.tiles.read({ x, y, w: 1, h: 1 }).data);
    expect(px(cut, 15, 15)).toEqual(RED);
    expect(px(cut, 5, 5)).toEqual(WHITE);
    expect(px(cut, 65, 25)[3]).toBe(0);
    expect(px(node, 15, 15)[3]).toBe(0);
    expect(px(node, 65, 25)).toEqual(RED);
    doc.history.undo();
    expect(doc.root.children.length).toBe(1);
    expect(tileBytes(node)).toBe(original);
    expect(doc.activeId).toBe(node.id);
    doc.history.redo();
    expect(px(node, 15, 15)[3]).toBe(0);
  });

  it('layer via copy keeps the source and refuses an empty selection', () => {
    const { doc, node } = painted(80, 40, (x) => (x < 40 ? RED : [0, 0, 0, 0]));
    const original = tileBytes(node);
    doc.selection = selectionFromMask(rectMask(80, 40, { x: 30, y: 0, w: 50, h: 40 }));
    doc.history.push(commands.layerViaCopy(doc, node.id));
    expect(tileBytes(node)).toBe(original);
    expect((doc.root.children[1] as RasterNode).name).toBe('Layer via copy');
    doc.selection = selectionFromMask(rectMask(80, 40, { x: 50, y: 0, w: 30, h: 40 }));
    expect(() => commands.layerViaCopy(doc, node.id)).toThrow('Nothing selected on this layer');
  });
});

describe('saved selections and stroke', () => {
  it('save, rename and delete undo exactly', () => {
    const { doc } = twoIslands();
    expect(() => commands.saveSelection(doc, 'x')).toThrow();
    doc.selection = selectionFromMask(rectMask(100, 60, { x: 1, y: 2, w: 3, h: 4 }));
    doc.history.push(commands.saveSelection(doc, 'Hat'));
    expect(doc.savedSelections.length).toBe(1);
    const id = doc.savedSelections[0].id;
    expect(maskBounds(doc.savedSelections[0].mask)).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    doc.selection!.mask.data.fill(0);
    expect(maskBounds(doc.savedSelections[0].mask)).not.toBeNull();
    doc.history.push(commands.renameSavedSelection(doc, id, 'Cap'));
    expect(doc.savedSelections[0].name).toBe('Cap');
    doc.history.push(commands.deleteSavedSelection(doc, id));
    expect(doc.savedSelections.length).toBe(0);
    doc.history.undo();
    doc.history.undo();
    expect(doc.savedSelections[0].name).toBe('Hat');
    doc.history.undo();
    expect(doc.savedSelections.length).toBe(0);
    expect(() => commands.deleteSavedSelection(doc, 'nope')).toThrow();
  });

  it('strokes inside, centre and outside', () => {
    for (const [pos, x] of [['inside', 21], ['center', 19], ['outside', 17]] as const) {
      const { doc, node } = painted(60, 60, () => WHITE);
      doc.selection = selectionFromMask(rectMask(60, 60, { x: 20, y: 20, w: 20, h: 20 }));
      const original = tileBytes(node);
      doc.history.push(commands.strokeSelection(doc, node.id, [0, 0, 255, 255], 4, pos));
      expect(Array.from(node.tiles.read({ x, y: 30, w: 1, h: 1 }).data)).toEqual([0, 0, 255, 255]);
      expect(Array.from(node.tiles.read({ x: 30, y: 30, w: 1, h: 1 }).data)).toEqual(WHITE);
      doc.history.undo();
      expect(tileBytes(node)).toBe(original);
    }
  });
});

describe('copy pixels and io', () => {
  it('copyPixels clips to the selection and trims', () => {
    const { doc, comp, node } = painted(80, 40, (x) => (x < 40 ? RED : [0, 0, 0, 0]));
    doc.selection = selectionFromMask(rectMask(80, 40, { x: 30, y: 5, w: 40, h: 10 }));
    const c = copyPixels(comp, doc, node.id)!;
    expect({ x: c.x, y: c.y, w: c.image.width, h: c.image.height }).toEqual({ x: 30, y: 5, w: 10, h: 10 });
    const merged = copyPixels(comp, doc, null)!;
    expect(merged.image.width).toBe(10);
    doc.selection = selectionFromMask(rectMask(80, 40, { x: 50, y: 5, w: 10, h: 10 }));
    expect(copyPixels(comp, doc, node.id)).toBeNull();
    doc.selection = null;
    expect(copyPixels(comp, doc, node.id)!.image.width).toBe(40);
  });

  it('exportSelection and importSelection round trip, and scale other sizes', async () => {
    const { doc } = twoIslands();
    const m = rectMask(100, 60, { x: 10, y: 10, w: 30, h: 20 });
    m.data[11 * 100 + 11] = 77;
    doc.selection = selectionFromMask(m);
    const blob = await exportSelection(doc);
    expect(blob.type).toBe('image/png');
    const back = await importSelection(blob, doc);
    expect(Array.from(back.data)).toEqual(Array.from(m.data));
    const small = painted(50, 30, (x) => (x < 25 ? WHITE : [0, 0, 0, 255]));
    small.doc.selection = selectionFromMask(createMask(50, 30, 255));
    const c = new OffscreenCanvas(50, 30);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 25, 30);
    const jpg = await c.convertToBlob({ type: 'image/jpeg' });
    const scaled = await importSelection(jpg, doc);
    expect(scaled.w).toBe(100);
    expect(scaled.data[30 * 100 + 10]).toBeGreaterThan(240);
    expect(scaled.data[30 * 100 + 90]).toBe(0);
    doc.selection = null;
    await expect(exportSelection(doc)).rejects.toThrow();
  });

  it('copyImageToClipboard resolves to a boolean and never throws', async () => {
    const r = await copyImageToClipboard(new ImageData(2, 2));
    expect(typeof r).toBe('boolean');
  });
});
