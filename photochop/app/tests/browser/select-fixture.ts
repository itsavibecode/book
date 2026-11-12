// Shared fixtures for the selection tests: documents painted from a per-pixel function.
import { createCompositor, createDocument, createRasterNode, type CompositorLike, type DocumentLike, type RGBA, type RasterNode } from '@/engine';
import { makeImageData } from '@/engine/util';

export function painted(w: number, h: number, f: (x: number, y: number) => RGBA): { doc: DocumentLike; node: RasterNode; comp: CompositorLike } {
  const doc = createDocument({ name: 'Select', width: w, height: h, background: null });
  const node = createRasterNode('Paint');
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = f(x, y), i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
    }
  }
  node.tiles.write(makeImageData(w, h, d), 0, 0);
  node.tiles.prune();
  doc.root.children.push(node);
  doc.activeId = node.id;
  doc.selectedIds = [node.id];
  const comp = createCompositor('cpu');
  comp.composite(doc);
  return { doc, node, comp };
}

export const WHITE: RGBA = [255, 255, 255, 255];
export const RED: RGBA = [220, 20, 20, 255];

/** 100 x 60 white document with two red squares: (10..29, 10..29) and (60..79, 20..39). */
export function twoIslands() {
  return painted(100, 60, (x, y) => ((x >= 10 && x < 30 && y >= 10 && y < 30) || (x >= 60 && x < 80 && y >= 20 && y < 40) ? RED : WHITE));
}

export function count(data: Uint8Array, min = 1): number {
  let n = 0;
  for (let i = 0; i < data.length; i++) if (data[i] >= min) n++;
  return n;
}

export function sum(data: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i];
  return s;
}
