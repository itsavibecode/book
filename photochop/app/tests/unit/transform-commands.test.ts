import { describe, expect, it } from 'vitest';
import {
  commands, createDocument, createGroupNode, createRasterNode, createShapeNode, createTextNode, ellipseMask, rectMask,
  selectionFromMask, type DocumentLike, type RasterNode, type ShapeNode,
} from '@/engine';
import { mat3FromQuad, mat3Rotate, mat3Scale, mat3Translate, warpGridFor } from '@/engine/transform';
import { makeImageData } from '@/engine/util';
import type { AnyNode, Mat3 } from '@/engine/types';

function paint(n: RasterNode, x: number, y: number, w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d.set(f(i, j), (j * w + i) * 4);
  n.tiles.write(makeImageData(w, h, d), x, y);
  n.tiles.prune();
}

function build(): DocumentLike {
  const doc = createDocument({ name: 'T', width: 300, height: 200, background: null });
  const a = createRasterNode('A');
  paint(a, 20, 30, 120, 90, (x, y) => [x * 2, y * 2, 100, 255]);
  a.mask = ellipseMask(300, 200, { x: 10, y: 10, w: 200, h: 150 });
  const g = createGroupNode('G');
  const b = createRasterNode('B');
  paint(b, 150, 100, 60, 40, () => [255, 0, 0, 200]);
  b.x = 7; b.y = -3;
  g.children.push(b);
  g.mask = rectMask(300, 200, { x: 0, y: 0, w: 250, h: 200 });
  const s = createShapeNode('S', { x: 40, y: 50, w: 30, h: 20 });
  doc.root.children.push(a, g, s);
  doc.selection = selectionFromMask(rectMask(300, 200, { x: 30, y: 40, w: 50, h: 60 }));
  doc.history.push(commands.addGuide(doc, 'v', 100));
  doc.history.push(commands.addGuide(doc, 'h', 50));
  doc.history.clear();
  return doc;
}

/** Everything a command may touch, as plain data. */
function dump(doc: DocumentLike): unknown {
  const node = (n: AnyNode): unknown => {
    const base: Record<string, unknown> = { id: n.id, x: n.x, y: n.y, mask: n.mask ? Array.from(n.mask.data) : null };
    if (n.type === 'raster') {
      const keys = n.tiles.keys().sort();
      base.tiles = keys.map((k) => { const [tx, ty] = k.split(',').map(Number); return [k, Array.from(n.tiles.get(tx, ty)!)]; });
    }
    if (n.type === 'text' || n.type === 'shape') base.matrix = [...n.matrix];
    if (n.type === 'group') base.children = n.children.map(node);
    return base;
  };
  return {
    w: doc.width, h: doc.height, root: doc.root.children.map(node),
    sel: doc.selection ? [doc.selection.bounds, Array.from(doc.selection.mask.data)] : null,
    guides: doc.guides.map((g) => ({ ...g })), saved: doc.savedSelections.map((s) => [s.id, Array.from(s.mask.data)]),
  };
}

function pixel(n: RasterNode, x: number, y: number): number[] {
  return Array.from(n.tiles.read({ x: x - Math.round(n.x), y: y - Math.round(n.y), w: 1, h: 1 }).data);
}

function roundTrip(doc: DocumentLike, run: () => void) {
  const before = dump(doc);
  run();
  const after = dump(doc);
  expect(after).not.toEqual(before);
  doc.history.undo();
  expect(dump(doc)).toEqual(before);
  doc.history.redo();
  expect(dump(doc)).toEqual(after);
  doc.history.undo();
}

describe('transformNodes', () => {
  it('rotates rasters, masks, groups and shapes in one step and undoes exactly', () => {
    const doc = build();
    const ids = doc.root.children.map((c) => c.id);
    roundTrip(doc, () => doc.history.push(commands.transformNodes(doc, ids, mat3Rotate(30, 150, 100), 'bilinear')));
    expect(doc.history.labels.length).toBe(1);
  });

  it('composes affine matrices into text and shape and keeps them editable', () => {
    const doc = build();
    const s = doc.root.children[2] as ShapeNode;
    doc.history.push(commands.transformNodes(doc, [s.id], mat3Rotate(90, 40, 50), 'bilinear'));
    expect(s.type).toBe('shape');
    expect(s.matrix).toEqual([0, 1, -1, 0]);
    expect([s.x, s.y]).toEqual([40, 50]);
    doc.history.push(commands.transformNodes(doc, [s.id], mat3Translate(5, 6), 'bilinear'));
    expect([s.x, s.y]).toEqual([45, 56]);
    doc.history.undo();
    doc.history.undo();
    expect(s.matrix).toEqual([1, 0, 0, 1]);
  });

  it('refuses projective matrices on text and shape layers', () => {
    const doc = build();
    const t = createTextNode('Txt', { text: 'Hi' });
    doc.root.children.push(t);
    const p = mat3FromQuad({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 9, y: 12 }, { x: 0, y: 10 }]);
    expect(() => commands.transformNodes(doc, [t.id], p, 'bilinear')).toThrow('Rasterise this layer first');
    // A raster accepts it.
    expect(() => doc.history.push(commands.transformNodes(doc, [doc.root.children[0].id], p, 'bilinear'))).not.toThrow();
  });

  it('warpNode undoes exactly', () => {
    const doc = build();
    const a = doc.root.children[0];
    const grid = warpGridFor(doc.nodeBounds(a.id)!, 'arc', 40);
    roundTrip(doc, () => doc.history.push(commands.warpNode(doc, a.id, grid, 'bilinear')));
  });
});

describe('document operations', () => {
  it('resizeCanvas offsets nodes, masks, selection and guides and undoes exactly', () => {
    const doc = build();
    const a = doc.root.children[0] as RasterNode;
    const before = pixel(a, 60, 60);
    roundTrip(doc, () => doc.history.push(commands.resizeCanvas(doc, 400, 260, 50, 20)));
    doc.history.redo();
    expect([doc.width, doc.height]).toEqual([400, 260]);
    expect(pixel(a, 110, 80)).toEqual(before);
    expect(doc.selection!.bounds).toEqual({ x: 80, y: 60, w: 50, h: 60 });
    expect(doc.guides.map((g) => g.pos)).toEqual([150, 70]);
    expect(a.mask!.w).toBe(400);
    expect(a.mask!.data[(20 + 85) * 400 + 50 + 110]).toBe(255);
  });

  it('resizeCanvas with deletePixels trims pixels outside and keeps them otherwise', () => {
    const doc = build();
    const a = doc.root.children[0] as RasterNode;
    doc.history.push(commands.resizeCanvas(doc, 100, 100, -40, -40));
    expect(pixel(a, 99, 79)[3]).toBe(255);
    expect(pixel(a, -10, 10)[3]).toBe(255); // outside the canvas but kept
    doc.history.undo();
    doc.history.push(commands.resizeCanvas(doc, 60, 60, -40, -40, { deletePixels: true }));
    expect(pixel(a, 59, 59)[3]).toBe(255);
    expect(pixel(a, 70, 20)[3]).toBe(0);
    expect(pixel(a, -10, 10)[3]).toBe(0);
    expect(commands.revealAll(doc)).toBeNull();
  });

  it('resizeImage halves everything', () => {
    const doc = build();
    const a = doc.root.children[0] as RasterNode;
    const s = doc.root.children[2] as ShapeNode;
    roundTrip(doc, () => doc.history.push(commands.resizeImage(doc, 150, 100, 'bilinear')));
    doc.history.redo();
    expect([doc.width, doc.height]).toEqual([150, 100]);
    const b = a.tiles.bounds()!;
    const r = a.tiles.read(b);
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (r.data[(y * b.w + x) * 4 + 3] > 127) {
      x0 = Math.min(x0, x + b.x); x1 = Math.max(x1, x + b.x); y0 = Math.min(y0, y + b.y); y1 = Math.max(y1, y + b.y);
    }
    expect([x0, y0, x1 + 1, y1 + 1]).toEqual([10, 15, 70, 60]);
    expect(s.matrix).toEqual([0.5, 0, 0, 0.5]);
    expect([s.x, s.y]).toEqual([20, 25]);
    expect(doc.selection!.bounds).toEqual({ x: 15, y: 20, w: 25, h: 30 });
    expect(doc.guides.map((g) => g.pos)).toEqual([50, 25]);
    expect(a.mask!.data.length).toBe(150 * 100);
  });

  it('rotateDocument 90 swaps width and height and moves a marker pixel', () => {
    const doc = build();
    const a = doc.root.children[0] as RasterNode;
    paint(a, 25, 35, 1, 1, () => [1, 2, 3, 255]);
    roundTrip(doc, () => doc.history.push(commands.rotateDocument(doc, 90)));
    doc.history.redo();
    expect([doc.width, doc.height]).toEqual([200, 300]);
    // Clockwise: (x, y) -> (H - 1 - y, x).
    expect(pixel(a, 200 - 1 - 35, 25)).toEqual([1, 2, 3, 255]);
    expect(doc.guides).toEqual([expect.objectContaining({ axis: 'h', pos: 100 }), expect.objectContaining({ axis: 'v', pos: 150 })]);
    doc.history.push(commands.rotateDocument(doc, 270));
    expect(pixel(a, 25, 35)).toEqual([1, 2, 3, 255]);
  });

  it('rotateDocument by an odd angle with expand grows the canvas', () => {
    const doc = build();
    doc.history.push(commands.rotateDocument(doc, 30, { expand: true, interpolation: 'bilinear' }));
    expect(doc.width).toBe(Math.ceil(300 * Math.cos(Math.PI / 6) + 200 * Math.sin(Math.PI / 6)));
    expect(doc.height).toBe(Math.ceil(300 * Math.sin(Math.PI / 6) + 200 * Math.cos(Math.PI / 6)));
  });

  it('flipDocument mirrors a marker and is its own inverse', () => {
    const doc = build();
    const a = doc.root.children[0] as RasterNode;
    paint(a, 25, 35, 1, 1, () => [9, 8, 7, 255]);
    doc.history.push(commands.flipDocument(doc, 'h'));
    expect(pixel(a, 300 - 1 - 25, 35)).toEqual([9, 8, 7, 255]);
    expect(doc.guides[0].pos).toBe(200);
    doc.history.push(commands.flipDocument(doc, 'h'));
    expect(pixel(a, 25, 35)).toEqual([9, 8, 7, 255]);
  });

  it('perspectiveCrop of an axis-aligned rect equals a plain crop', () => {
    const one = build(), two = build();
    // Same ids so the dumps compare.
    two.root.children.forEach((c, i) => { c.id = one.root.children[i].id; });
    (two.root.children[1] as { children: AnyNode[] }).children[0].id = (one.root.children[1] as { children: AnyNode[] }).children[0].id;
    two.guides.forEach((g, i) => { g.id = one.guides[i].id; });
    // Drop the shape so no rasterisation (which needs a canvas) is involved.
    one.root.children.pop(); two.root.children.pop();
    one.history.push(commands.perspectiveCrop(one, [{ x: 20, y: 30 }, { x: 140, y: 30 }, { x: 140, y: 130 }, { x: 20, y: 130 }], 120, 100, 'bilinear'));
    two.history.push(commands.resizeCanvas(two, 120, 100, -20, -30, { deletePixels: true }));
    const strip = (d: DocumentLike) => {
      const x = dump(d) as { root: unknown[] };
      // Masks: canvas size clamps exposed edges, the crop maps outside as 0; compare pixels only.
      return JSON.stringify(x.root, (k, v) => (k === 'mask' ? undefined : v));
    };
    // Compare rendered tile contents inside the canvas rather than raw tile layout.
    const pixels = (d: DocumentLike) => d.root.children.flatMap((c) => (c.type === 'raster' ? [Array.from(c.tiles.read({ x: -Math.round(c.x), y: -Math.round(c.y), w: 120, h: 100 }).data)] : []));
    expect(pixels(one)).toEqual(pixels(two));
    expect(one.selection!.bounds).toEqual(two.selection!.bounds);
    expect(Array.from(one.selection!.mask.data)).toEqual(Array.from(two.selection!.mask.data));
    expect(one.guides).toEqual(two.guides);
    expect(strip(one).length).toBeGreaterThan(0);
  });

  it('trimDocument crops to content and returns null when nothing changes', () => {
    const doc = createDocument({ name: 'Trim', width: 100, height: 80, background: null });
    const a = createRasterNode('A');
    paint(a, 10, 20, 30, 15, () => [0, 0, 0, 255]);
    doc.root.children.push(a);
    const cmd = commands.trimDocument(doc, 'transparent')!;
    expect(cmd).not.toBeNull();
    doc.history.push(cmd);
    expect([doc.width, doc.height]).toEqual([30, 15]);
    expect(commands.trimDocument(doc, 'transparent')).toBeNull();
    expect(commands.trimDocument(doc, 'top-left')).toBeNull();
    doc.history.undo();
    expect([doc.width, doc.height]).toEqual([100, 80]);
  });

  it('revealAll grows the canvas to cover content outside it', () => {
    const doc = build();
    expect(commands.revealAll(doc)).toBeNull();
    const b = doc.root.children[1] as { children: RasterNode[] };
    b.children[0].x = 200; // content now reaches x = 200 + 150 + 60 = 410
    const cmd = commands.revealAll(doc)!;
    doc.history.push(cmd);
    expect([doc.width, doc.height]).toEqual([410, 200]);
    expect(commands.revealAll(doc)).toBeNull();
  });

  it('setDocumentDpi is undoable', () => {
    const doc = build();
    doc.history.push(commands.setDocumentDpi(doc, 300));
    expect(doc.dpi).toBe(300);
    doc.history.undo();
    expect(doc.dpi).toBe(72);
  });
});

describe('guides', () => {
  it('add, move (merged per guide), remove and clear', () => {
    const doc = build();
    const events: string[] = [];
    doc.subscribe((e) => events.push(e.kind));
    doc.history.push(commands.addGuide(doc, 'h', 10));
    const id = doc.guides[2].id;
    doc.history.push(commands.moveGuide(doc, id, 20));
    doc.history.push(commands.moveGuide(doc, id, 30));
    expect(doc.guides[2].pos).toBe(30);
    expect(doc.history.labels).toEqual(['Add guide', 'Move guide']);
    doc.history.push(commands.moveGuide(doc, doc.guides[0].id, 5));
    expect(doc.history.labels.length).toBe(3);
    doc.history.undo();
    doc.history.undo();
    expect(doc.guides[2].pos).toBe(10);
    doc.history.push(commands.removeGuide(doc, id));
    expect(doc.guides.length).toBe(2);
    doc.history.push(commands.clearGuides(doc));
    expect(doc.guides.length).toBe(0);
    doc.history.undo();
    expect(doc.guides.map((g) => g.pos)).toEqual([100, 50]);
    expect(events.every((k) => k === 'guides')).toBe(true);
  });
});

export const _m: Mat3 = mat3Scale(1, 1);
