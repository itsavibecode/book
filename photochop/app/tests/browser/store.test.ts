import { describe, expect, it } from 'vitest';
import { commands, createAutosave, createDocument, store, type RasterNode } from '@/engine';
import { buildFixture } from './fixture';

describe('store (IndexedDB)', () => {
  it('saves, lists, loads and deletes a document', async () => {
    const doc = buildFixture();
    await store.saveDocument(doc);
    const list = await store.listDocuments();
    const meta = list.find((m) => m.id === doc.id);
    expect(meta).toBeDefined();
    expect(meta!.name).toBe('Fixture');
    expect(meta!.thumbnail?.startsWith('data:image/png')).toBe(true);
    const back = await store.loadDocument(doc.id);
    expect(back).not.toBeNull();
    expect(back!.flatten().map((r) => r.node.name)).toEqual(doc.flatten().map((r) => r.node.name));
    const a = doc.root.children[0] as RasterNode, b = back!.root.children[0] as RasterNode;
    expect(Array.from(b.tiles.read({ x: 0, y: 0, w: 50, h: 50 }).data)).toEqual(Array.from(a.tiles.read({ x: 0, y: 0, w: 50, h: 50 }).data));
    expect(back!.history.canUndo).toBe(false);
    await store.deleteDocument(doc.id);
    expect((await store.listDocuments()).some((m) => m.id === doc.id)).toBe(false);
    expect(await store.loadDocument(doc.id)).toBeNull();
  });

  it('keeps settings and the open-documents list', async () => {
    await store.setOpenDocuments(['a', 'b']);
    expect(await store.getOpenDocuments()).toEqual(['a', 'b']);
    expect(await store.getSetting('missing', 42)).toBe(42);
    await store.setSetting('theme', { mode: 'dark' });
    expect(await store.getSetting('theme', null)).toEqual({ mode: 'dark' });
  });

  it('autosave writes after changes and removes blobs of deleted layers', async () => {
    const doc = createDocument({ name: 'Auto', width: 64, height: 64, background: [10, 20, 30, 255] });
    const auto = createAutosave();
    const states: string[] = [];
    auto.subscribe(() => states.push(auto.state));
    auto.attach(doc);
    await auto.flush();
    expect(auto.state).toBe('saved');
    expect(auto.savedAt).toBeGreaterThan(0);
    doc.history.push(commands.setDocumentName(doc, 'Renamed'));
    expect(auto.state).toBe('dirty');
    await auto.flush();
    expect(auto.state).toBe('saved');
    const loaded = await store.loadDocument(doc.id);
    expect(loaded!.name).toBe('Renamed');
    expect((loaded!.root.children[0] as RasterNode).tiles.size).toBe(1);
    doc.history.push(commands.removeNodes(doc, [doc.root.children[0].id]));
    await auto.flush();
    const again = await store.loadDocument(doc.id);
    expect(again!.root.children.length).toBe(0);
    expect(states).toContain('saving');
    auto.detach();
    await store.deleteDocument(doc.id);
  });
});
