import { describe, expect, it } from 'vitest';
import { createDocument, createRasterNode, createShapeNode, createTextNode, rectMask, selectionFromMask, type DocumentLike } from '@/engine';
import { deserializeParts, serializeDocument, serializeParts } from '@/engine/serialize';
import { Document } from '@/engine/document';
import { encodePng } from '@/engine/png';
import { makeImageData } from '@/engine/util';
import type { SerializedDocumentJson } from '@/engine/contract';
import type { ShapeNode, TextNode } from '@/engine/types';

/** A document.json exactly as PhotoChop 0.1.0 wrote it (format 1: no dpi, guides, saved selections or matrices). */
function format1(): { json: SerializedDocumentJson; blobs: Record<string, Uint8Array> } {
  const px = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 200; px[i + 1] = 100; px[i + 2] = 50; px[i + 3] = 255; }
  const mask = new Uint8Array(64 * 48).fill(128);
  const sel = new Uint8Array(64 * 48);
  sel.fill(255, 0, 64 * 10);
  const json = {
    app: 'PhotoChop', version: '0.1.0', format: 1, id: 'doc-1', name: 'Old', width: 64, height: 48,
    createdAt: 1, updatedAt: 2, activeId: 'r1', selectionBounds: { x: 0, y: 0, w: 64, h: 10 },
    root: {
      id: 'root', type: 'group', name: 'Root', visible: true, locked: false, opacity: 1, blend: 'normal', x: 0, y: 0,
      maskEnabled: true, effects: [], expanded: true, mask: false,
      children: [
        { id: 'r1', type: 'raster', name: 'Background', visible: true, locked: false, opacity: 1, blend: 'normal', x: 0, y: 0, maskEnabled: true, effects: [], mask: true, bounds: { x: 0, y: 0, w: 256, h: 256 } },
        { id: 't1', type: 'text', name: 'Hello', visible: true, locked: false, opacity: 1, blend: 'normal', x: 5, y: 6, maskEnabled: true, effects: [], mask: false,
          text: 'Hi', font: 'system-ui', size: 20, weight: 400, italic: false, color: [0, 0, 0, 255], align: 'left', lineHeight: 1.2, letterSpacing: 0, width: null },
        { id: 's1', type: 'shape', name: 'Box', visible: true, locked: false, opacity: 1, blend: 'normal', x: 1, y: 2, maskEnabled: true, effects: [], mask: false,
          shape: 'rect', w: 10, h: 10, radius: 0, fill: [1, 2, 3, 255], stroke: null, strokeWidth: 2 },
      ],
    },
  } as unknown as SerializedDocumentJson;
  return {
    json,
    blobs: {
      'layer/r1': encodePng(px, 256, 256, 4),
      'mask/r1': encodePng(mask, 64, 48, 1),
      selection: encodePng(sel, 64, 48, 1),
    },
  };
}

describe('document format', () => {
  it('a 0.1.0 (format 1) document loads with defaults', async () => {
    const f = format1();
    const doc = await deserializeParts(JSON.parse(JSON.stringify(f.json)), f.blobs);
    expect(doc.dpi).toBe(72);
    expect(doc.guides).toEqual([]);
    expect(doc.savedSelections).toEqual([]);
    expect((doc.getNode('t1') as TextNode).matrix).toEqual([1, 0, 0, 1]);
    expect((doc.getNode('s1') as ShapeNode).matrix).toEqual([1, 0, 0, 1]);
    expect(doc.selection!.bounds).toEqual({ x: 0, y: 0, w: 64, h: 10 });
    expect(doc.getNode('r1')!.mask!.data[100]).toBe(128);
    expect([doc.width, doc.height, doc.activeId]).toEqual([64, 48, 'r1']);
  });

  it('rejects files from a newer format', async () => {
    const f = format1();
    await expect(deserializeParts({ ...f.json, format: 3 as 2 }, f.blobs)).rejects.toThrow('newer version');
  });

  it('format 2 round-trips dpi, guides, saved selections and matrices', async () => {
    const doc = createDocument({ name: 'New', width: 80, height: 60, background: [10, 20, 30, 255] }) as Document;
    doc.dpi = 300;
    doc.guides.push({ id: 'g1', axis: 'v', pos: 12.5 }, { id: 'g2', axis: 'h', pos: 40 });
    const m = rectMask(80, 60, { x: 5, y: 5, w: 20, h: 30 });
    doc.savedSelections.push({ id: 'sv1', name: 'Left', mask: m });
    doc.selection = selectionFromMask(rectMask(80, 60, { x: 1, y: 1, w: 3, h: 3 }));
    doc.root.children.push(createTextNode('T', { text: 'Hi', matrix: [0.5, 0.5, -0.5, 0.5], x: 3.25 }));
    doc.root.children.push(createShapeNode('S', { matrix: [2, 0, 0, 1] }));
    const r = createRasterNode('R');
    r.tiles.write(makeImageData(2, 2, new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])), 3, 3);
    doc.root.children.push(r);
    const parts = serializeParts(doc);
    expect(parts.json.format).toBe(2);
    expect(parts.keys).toContain('saved/sv1');
    const back = await deserializeParts(JSON.parse(JSON.stringify(parts.json)), parts.files) as DocumentLike;
    expect(back.dpi).toBe(300);
    expect(back.guides).toEqual(doc.guides);
    expect(back.savedSelections.map((s) => [s.id, s.name])).toEqual([['sv1', 'Left']]);
    expect(Array.from(back.savedSelections[0].mask.data)).toEqual(Array.from(m.data));
    expect((back.root.children[1] as TextNode).matrix).toEqual([0.5, 0.5, -0.5, 0.5]);
    expect((back.root.children[1] as TextNode).x).toBe(3.25);
    expect((back.root.children[2] as ShapeNode).matrix).toEqual([2, 0, 0, 1]);
    expect(Array.from((back.root.children[3] as typeof r).tiles.read({ x: 3, y: 3, w: 2, h: 2 }).data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('async serialisation (worker or fallback) writes the same bytes as the synchronous path', async () => {
    const doc = createDocument({ name: 'Same', width: 300, height: 280, background: [200, 10, 90, 255] }) as Document;
    doc.savedSelections.push({ id: 'a', name: 'A', mask: rectMask(300, 280, { x: 0, y: 0, w: 9, h: 9 }) });
    const sync = serializeParts(doc);
    const asyncDoc = await serializeDocument(doc);
    for (const [k, v] of Object.entries(sync.files)) {
      expect(new Uint8Array(await asyncDoc.blobs[k].arrayBuffer())).toEqual(v);
    }
  });
});
