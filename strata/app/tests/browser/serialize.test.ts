import { describe, expect, it } from 'vitest';
import {
  createCompositor, deserializeDocument, serializeDocument, type AnyNode, type DocumentLike,
} from '@/engine';
import { openStrata, saveStrata } from '@/io';
import { buildFixture } from './fixture';

function stripLive(n: AnyNode): unknown {
  const { mask: _m, ...rest } = n as AnyNode & { tiles?: unknown; children?: AnyNode[] };
  const out: Record<string, unknown> = { ...rest };
  delete out.tiles;
  if (n.type === 'group') out.children = n.children.map(stripLive);
  return out;
}

function expectSameDoc(a: DocumentLike, b: DocumentLike, sameId = true) {
  if (sameId) expect(b.id).toBe(a.id);
  expect(b.name).toBe(a.name);
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  expect(b.activeId).toBe(a.activeId);
  expect(b.root.children.map(stripLive)).toEqual(a.root.children.map(stripLive));
  const fa = a.flatten(), fb = b.flatten();
  expect(fb.length).toBe(fa.length);
  fa.forEach(({ node }, i) => {
    const other = fb[i].node;
    if (node.mask) expect(Array.from(other.mask!.data)).toEqual(Array.from(node.mask.data));
    else expect(other.mask).toBeNull();
    if (node.type === 'raster' && other.type === 'raster') {
      expect(other.tiles.keys().sort()).toEqual(node.tiles.keys().sort());
      node.tiles.forEach((buf, tx, ty) => {
        const ob = other.tiles.get(tx, ty)!;
        let same = ob.length === buf.length;
        for (let k = 0; same && k < buf.length; k++) if (ob[k] !== buf[k]) same = false;
        expect(same, `tile ${tx},${ty} of ${node.name}`).toBe(true);
      });
    }
  });
  expect(b.selection?.bounds).toEqual(a.selection?.bounds);
  expect(Array.from(b.selection!.mask.data)).toEqual(Array.from(a.selection!.mask.data));
}

describe('serialisation', () => {
  it('serialize -> deserialize round-trips tree, props, tiles and masks exactly', async () => {
    const doc = buildFixture();
    const s = await serializeDocument(doc);
    expect(Object.keys(s.blobs).some((k) => k.startsWith('layer/'))).toBe(true);
    expect(Object.keys(s.blobs).some((k) => k.startsWith('mask/'))).toBe(true);
    expect(s.blobs.selection).toBeDefined();
    // Through JSON text, as IndexedDB and the zip both store it.
    const back = await deserializeDocument({ json: JSON.parse(JSON.stringify(s.json)), blobs: s.blobs });
    expectSameDoc(doc, back);
  });

  it('saveStrata -> openStrata round-trips exactly', async () => {
    const doc = buildFixture();
    const blob = await saveStrata(doc, createCompositor('cpu'));
    expect(blob.size).toBeGreaterThan(1000);
    const back = await openStrata(blob);
    // Opened files get a fresh id so they never clobber a recovered copy of the same project.
    expect(back.id).not.toBe(doc.id);
    expectSameDoc(doc, back, false);
  });

  it('openStrata rejects files that are not projects', async () => {
    await expect(openStrata(new Blob(['nope']))).rejects.toThrow('not a Strata project');
  });
});
