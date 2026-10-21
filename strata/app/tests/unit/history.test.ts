import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginRasterEdit, commands, createDocument, createGroupNode, createRasterNode, rectMask, selectionFromMask,
  type ChangeEvent, type DocumentLike, type RasterNode,
} from '@/engine';
import { makeImageData } from '@/engine/util';

function names(doc: DocumentLike): string[] {
  return doc.root.children.map((n) => n.name);
}

function setup() {
  const doc = createDocument({ name: 'Test', width: 64, height: 64, background: [255, 255, 255, 255] });
  const events: ChangeEvent[] = [];
  doc.subscribe((e) => events.push(e));
  return { doc, events };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('history', () => {
  it('push / undo / redo addNode and emits tree events', () => {
    const { doc, events } = setup();
    const a = createRasterNode('A');
    doc.history.push(commands.addNode(doc, a, null, 1));
    expect(names(doc)).toEqual(['Background', 'A']);
    expect(doc.activeId).toBe(a.id);
    expect(events.some((e) => e.kind === 'tree')).toBe(true);
    expect(doc.history.undo()).toBe(true);
    expect(names(doc)).toEqual(['Background']);
    expect(doc.activeId).toBe(doc.root.children[0].id);
    expect(doc.history.redo()).toBe(true);
    expect(names(doc)).toEqual(['Background', 'A']);
    expect(doc.history.labels).toEqual(['Add layer']);
    expect(doc.history.cursor).toBe(1);
  });

  it('removeNodes restores order, parent and active state', () => {
    const { doc } = setup();
    const a = createRasterNode('A'), b = createRasterNode('B'), c = createRasterNode('C');
    const g = createGroupNode('G');
    for (const n of [a, b, g]) doc.history.push(commands.addNode(doc, n, null, doc.root.children.length));
    doc.history.push(commands.addNode(doc, c, g.id, 0));
    doc.activeId = b.id;
    doc.selectedIds = [a.id, b.id];
    doc.history.push(commands.removeNodes(doc, [b.id, a.id, c.id]));
    expect(names(doc)).toEqual(['Background', 'G']);
    expect(g.children).toEqual([]);
    expect(doc.activeId).not.toBe(b.id);
    doc.history.undo();
    expect(names(doc)).toEqual(['Background', 'A', 'B', 'G']);
    expect(g.children.map((n) => n.name)).toEqual(['C']);
    expect(doc.activeId).toBe(b.id);
    expect(doc.selectedIds).toEqual([a.id, b.id]);
  });

  it('moveNode reorders and reparents, undo restores', () => {
    const { doc } = setup();
    const a = createRasterNode('A'), g = createGroupNode('G');
    doc.history.push(commands.addNode(doc, a, null, 1));
    doc.history.push(commands.addNode(doc, g, null, 2));
    doc.history.push(commands.moveNode(doc, a.id, g.id, 0));
    expect(names(doc)).toEqual(['Background', 'G']);
    expect(doc.parentOf(a.id)).toBe(g);
    doc.history.undo();
    expect(names(doc)).toEqual(['Background', 'A', 'G']);
    expect(() => commands.moveNode(doc, g.id, g.id, 0).do(doc)).toThrow();
  });

  it('setProps merges within the window when mergeKey matches', () => {
    vi.useFakeTimers();
    const { doc } = setup();
    const id = doc.root.children[0].id;
    const node = doc.getNode(id)!;
    doc.history.push(commands.setProps(doc, id, { opacity: 0.9 }, 'op'));
    vi.advanceTimersByTime(100);
    doc.history.push(commands.setProps(doc, id, { opacity: 0.5 }, 'op'));
    vi.advanceTimersByTime(300);
    doc.history.push(commands.setProps(doc, id, { opacity: 0.2 }, 'op'));
    expect(doc.history.labels.length).toBe(1);
    expect(node.opacity).toBe(0.2);
    vi.advanceTimersByTime(1000);
    doc.history.push(commands.setProps(doc, id, { opacity: 0.1 }, 'op'));
    expect(doc.history.labels.length).toBe(2);
    doc.history.undo();
    expect(node.opacity).toBe(0.2);
    doc.history.undo();
    expect(node.opacity).toBe(1);
    expect(doc.history.canUndo).toBe(false);
  });

  it('setProps without mergeKey or with a different key does not merge', () => {
    const { doc } = setup();
    const id = doc.root.children[0].id;
    doc.history.push(commands.setProps(doc, id, { opacity: 0.9 }));
    doc.history.push(commands.setProps(doc, id, { opacity: 0.8 }));
    doc.history.push(commands.setProps(doc, id, { name: 'X' }, 'a'));
    doc.history.push(commands.setProps(doc, id, { name: 'Y' }, 'b'));
    expect(doc.history.labels.length).toBe(4);
  });

  it('batch is one undo step', () => {
    const { doc } = setup();
    const a = createRasterNode('A'), b = createRasterNode('B');
    doc.history.push(commands.batch('Add two', [commands.addNode(doc, a, null, 1), commands.addNode(doc, b, null, 2)]));
    expect(names(doc)).toEqual(['Background', 'A', 'B']);
    doc.history.undo();
    expect(names(doc)).toEqual(['Background']);
    doc.history.redo();
    expect(names(doc)).toEqual(['Background', 'A', 'B']);
  });

  it('push clears the redo stack', () => {
    const { doc } = setup();
    doc.history.push(commands.addNode(doc, createRasterNode('A'), null, 1));
    doc.history.undo();
    expect(doc.history.canRedo).toBe(true);
    doc.history.push(commands.addNode(doc, createRasterNode('B'), null, 1));
    expect(doc.history.canRedo).toBe(false);
    expect(doc.history.labels).toEqual(['Add layer']);
  });

  it('trims to the limit, dropping the oldest', () => {
    const { doc } = setup();
    doc.history.limit = 5;
    for (let i = 0; i < 8; i++) doc.history.push(commands.setDocumentName(doc, `N${i}`));
    expect(doc.history.labels.length).toBe(5);
    let n = 0;
    while (doc.history.undo()) n++;
    expect(n).toBe(5);
    expect(doc.name).toBe('N2');
  });

  it('subscribe notifies on every change', () => {
    const { doc } = setup();
    let calls = 0;
    doc.history.subscribe(() => calls++);
    doc.history.push(commands.setDocumentName(doc, 'X'));
    doc.history.undo();
    doc.history.redo();
    doc.history.clear();
    expect(calls).toBe(4);
  });

  it('record() of a raster session restores pixels exactly', () => {
    const { doc, events } = setup();
    const bg = doc.root.children[0] as RasterNode;
    const before = bg.tiles.read({ x: 0, y: 0, w: 64, h: 64 }).data.slice();
    const s = beginRasterEdit(doc, bg.id);
    const buf = s.markTile(0, 0);
    for (let i = 0; i < 64 * 4; i += 4) { buf[i] = 10; buf[i + 3] = 128; }
    const fresh = s.markTile(2, 2);
    fresh[3] = 255;
    const cmd = s.commit('Paint');
    doc.history.record(cmd);
    const after = bg.tiles.read({ x: 0, y: 0, w: 600, h: 600 }).data.slice();
    expect(bg.tiles.has(2, 2)).toBe(true);
    events.length = 0;
    doc.history.undo();
    expect(Array.from(bg.tiles.read({ x: 0, y: 0, w: 64, h: 64 }).data)).toEqual(Array.from(before));
    expect(bg.tiles.has(2, 2)).toBe(false);
    expect(events.some((e) => e.kind === 'pixels' && e.nodeId === bg.id)).toBe(true);
    doc.history.redo();
    expect(Array.from(bg.tiles.read({ x: 0, y: 0, w: 600, h: 600 }).data)).toEqual(Array.from(after));
    // A later edit to the same tile must not leak into the earlier patch.
    const s2 = beginRasterEdit(doc, bg.id);
    s2.markTile(0, 0).fill(7);
    doc.history.record(s2.commit('Paint 2'));
    doc.history.undo();
    doc.history.undo();
    doc.history.redo();
    expect(Array.from(bg.tiles.read({ x: 0, y: 0, w: 600, h: 600 }).data)).toEqual(Array.from(after));
  });

  it('session cancel restores and commit prunes emptied tiles', () => {
    const { doc } = setup();
    const layer = createRasterNode('L');
    layer.tiles.write(makeImageData(2, 2, new Uint8ClampedArray(16).fill(200)), 0, 0);
    doc.history.push(commands.addNode(doc, layer, null, 1));
    const s = beginRasterEdit(doc, layer.id);
    s.markTile(0, 0).fill(0);
    s.cancel();
    expect(layer.tiles.get(0, 0)![0]).toBe(200);
    const s2 = beginRasterEdit(doc, layer.id);
    s2.markTile(0, 0).fill(0);
    doc.history.record(s2.commit('Erase'));
    expect(layer.tiles.size).toBe(0);
    doc.history.undo();
    expect(layer.tiles.get(0, 0)![0]).toBe(200);
  });

  it('clearPixels respects the selection and undoes', () => {
    const { doc } = setup();
    const bg = doc.root.children[0] as RasterNode;
    doc.selection = selectionFromMask(rectMask(64, 64, { x: 0, y: 0, w: 10, h: 10 }));
    doc.history.push(commands.clearPixels(doc, bg.id));
    expect(bg.tiles.read({ x: 5, y: 5, w: 1, h: 1 }).data[3]).toBe(0);
    expect(bg.tiles.read({ x: 20, y: 20, w: 1, h: 1 }).data[3]).toBe(255);
    doc.history.undo();
    expect(bg.tiles.read({ x: 5, y: 5, w: 1, h: 1 }).data[3]).toBe(255);
  });

  it('groupNodes, duplicateNode, mergeDown and flatten undo cleanly', () => {
    const { doc } = setup();
    const a = createRasterNode('A');
    a.tiles.write(makeImageData(1, 1, new Uint8ClampedArray([255, 0, 0, 255])), 3, 3);
    a.opacity = 0.5;
    doc.history.push(commands.addNode(doc, a, null, 1));
    doc.history.push(commands.duplicateNode(doc, a.id));
    expect(names(doc)).toEqual(['Background', 'A', 'A copy']);
    const copy = doc.root.children[2] as RasterNode;
    expect(copy.tiles).not.toBe(a.tiles);
    doc.history.push(commands.groupNodes(doc, [a.id, copy.id]));
    expect(names(doc)).toEqual(['Background', 'Group 1']);
    doc.history.undo();
    expect(names(doc)).toEqual(['Background', 'A', 'A copy']);
    doc.history.push(commands.mergeDown(doc, a.id));
    expect(names(doc)).toEqual(['Background', 'A copy']);
    const merged = doc.root.children[0] as RasterNode;
    const px = merged.tiles.read({ x: 3, y: 3, w: 1, h: 1 }).data;
    expect(Array.from(px)).toEqual([255, 128, 128, 255]);
    doc.history.undo();
    expect(names(doc)).toEqual(['Background', 'A', 'A copy']);
    doc.history.push(commands.flatten(doc));
    expect(names(doc)).toEqual(['Background']);
    doc.history.undo();
    expect(names(doc)).toEqual(['Background', 'A', 'A copy']);
  });
});
