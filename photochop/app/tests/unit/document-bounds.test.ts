import { describe, expect, it } from 'vitest';
import {
  beginRasterEdit, commands, createDocument, createGroupNode, createRasterNode, createShapeNode, type RasterNode,
} from '@/engine';
import { mat3Rotate, mat3Translate, warpGridFor } from '@/engine/transform';
import { fillTilesRect } from '@/engine/tiles';
import { makeImageData } from '@/engine/util';
import type { WarpGrid } from '@/engine/types';

function patch(n: RasterNode, x: number, y: number, w: number, h: number, rgba = [200, 30, 60, 255]) {
  fillTilesRect(n.tiles, { x, y, w, h }, rgba);
}

describe('contentBounds', () => {
  it('reports the exact box of a small patch, shrinks after an erase and is restored by undo', () => {
    const doc = createDocument({ name: 'B', width: 800, height: 600, background: null });
    const n = createRasterNode('P');
    patch(n, 300, 300, 10, 10);
    doc.root.children.push(n);
    expect(doc.nodeBounds(n.id)).toEqual({ x: 256, y: 256, w: 256, h: 256 });
    expect(doc.contentBounds(n.id)).toEqual({ x: 300, y: 300, w: 10, h: 10 });
    // Erase the right half through an edit session (emits 'pixels', as tools do).
    const s = beginRasterEdit(doc, n.id);
    s.markRect({ x: 305, y: 300, w: 5, h: 10 });
    fillTilesRect(s.tiles, { x: 305, y: 300, w: 5, h: 10 }, [0, 0, 0, 0]);
    doc.history.record(s.commit('Erase'));
    expect(doc.contentBounds(n.id)).toEqual({ x: 300, y: 300, w: 5, h: 10 });
    doc.history.undo();
    expect(doc.contentBounds(n.id)).toEqual({ x: 300, y: 300, w: 10, h: 10 });
    // Moving the layer shifts the box without a rescan.
    doc.history.push(commands.setProps(doc, n.id, { x: 7, y: -4 }));
    expect(doc.contentBounds(n.id)).toEqual({ x: 307, y: 296, w: 10, h: 10 });
  });

  it('returns null for an empty layer and a layer whose tiles are all transparent', () => {
    const doc = createDocument({ name: 'E', width: 100, height: 100, background: null });
    const a = createRasterNode('A');
    const b = createRasterNode('B');
    b.tiles.getOrCreate(0, 0);
    doc.root.children.push(a, b);
    expect(doc.contentBounds(a.id)).toBeNull();
    expect(doc.contentBounds(b.id)).toBeNull();
  });

  it('spans tiles, negative offsets and soft alpha', () => {
    const doc = createDocument({ name: 'S', width: 100, height: 100, background: null });
    const n = createRasterNode('N');
    patch(n, -20, 250, 600, 3, [1, 1, 1, 1]);
    n.x = 5;
    doc.root.children.push(n);
    expect(doc.contentBounds(n.id)).toEqual({ x: -15, y: 250, w: 600, h: 3 });
  });

  it('a rotated shape matches nodeBounds, and a group is the union of its children', () => {
    const doc = createDocument({ name: 'G', width: 400, height: 400, background: null });
    const s = createShapeNode('S', { x: 50, y: 60, w: 80, h: 40 });
    const r = createRasterNode('R');
    patch(r, 10, 20, 5, 5);
    const g = createGroupNode('G');
    g.children.push(s, r);
    doc.root.children.push(g);
    doc.history.push(commands.transformNodes(doc, [s.id], mat3Rotate(30, 90, 80), 'bilinear'));
    expect(doc.contentBounds(s.id)).toEqual(doc.nodeBounds(s.id));
    const sb = doc.nodeBounds(s.id)!;
    const x1 = Math.max(sb.x + sb.w, 15), y1 = Math.max(sb.y + sb.h, 25);
    expect(doc.contentBounds(g.id)).toEqual({ x: 10, y: 20, w: x1 - 10, h: y1 - 20 });
  });

  it('follows a transform and its undo', () => {
    const doc = createDocument({ name: 'T', width: 800, height: 600, background: null });
    const n = createRasterNode('P');
    patch(n, 300, 300, 10, 10);
    doc.root.children.push(n);
    doc.history.push(commands.transformNodes(doc, [n.id], mat3Translate(40, 3), 'nearest'));
    expect(doc.contentBounds(n.id)).toEqual({ x: 340, y: 303, w: 10, h: 10 });
    doc.history.undo();
    expect(doc.contentBounds(n.id)).toEqual({ x: 300, y: 300, w: 10, h: 10 });
  });
});

describe('warp source rect is contentBounds', () => {
  function small() {
    const doc = createDocument({ name: 'W', width: 800, height: 600, background: null });
    const n = createRasterNode('Img');
    const w = 23, h = 17, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x * 10, y * 14, 99, 255], (y * w + x) * 4);
    n.tiles.write(makeImageData(w, h, d), 301, 333);
    doc.root.children.push(n);
    return { doc, n };
  }

  it("'none' on a small image far from tile edges is the identity", () => {
    const { doc, n } = small();
    const before = n.tiles.read({ x: 290, y: 320, w: 50, h: 50 }).data.slice();
    const box = doc.contentBounds(n.id)!;
    expect(box).toEqual({ x: 301, y: 333, w: 23, h: 17 });
    doc.history.push(commands.warpNode(doc, n.id, warpGridFor(box, 'none', 0), 'bilinear'));
    expect(Array.from(n.tiles.read({ x: 290, y: 320, w: 50, h: 50 }).data)).toEqual(Array.from(before));
  });

  it('a grid built on contentBounds and shifted by whole pixels moves the image exactly', () => {
    const { doc, n } = small();
    const box = doc.contentBounds(n.id)!;
    const before = n.tiles.read(box).data.slice();
    const g = warpGridFor(box, 'none', 0);
    const moved: WarpGrid = { points: g.points.map((p) => ({ x: p.x + 7, y: p.y + 3 })) };
    doc.history.push(commands.warpNode(doc, n.id, moved, 'nearest'));
    expect(Array.from(n.tiles.read({ x: box.x + 7, y: box.y + 3, w: box.w, h: box.h }).data)).toEqual(Array.from(before));
    expect(doc.contentBounds(n.id)).toEqual({ x: 308, y: 336, w: 23, h: 17 });
    doc.history.undo();
    expect(doc.contentBounds(n.id)).toEqual(box);
  });
});
