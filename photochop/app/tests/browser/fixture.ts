// Shared fixture: a document that exercises every compositor feature.
import {
  BLEND_MODES_IMPLEMENTED, createDocument, createGroupNode, createRasterNode, createShapeNode, createTextNode,
  ellipseMask, rectMask, selectionFromMask, type DocumentLike, type RasterNode,
} from '@/engine';
import { makeImageData } from '@/engine/util';

export const FW = 320;
export const FH = 240;

function gradient(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
  return makeImageData(w, h, d);
}

function raster(name: string, img: ImageData, x = 0, y = 0, at = { x: 0, y: 0 }): RasterNode {
  const n = createRasterNode(name);
  n.tiles.write(img, at.x, at.y);
  n.tiles.prune();
  n.x = x;
  n.y = y;
  return n;
}

export function buildFixture(): DocumentLike {
  const doc = createDocument({ name: 'Fixture', width: FW, height: FH, background: null });
  const top = doc.root.children;
  top.push(raster('Base', gradient(FW, FH, (x, y) => [(x * 255) / FW, (y * 255) / FH, 128, 255])));
  top.push(raster('Alpha ramp', gradient(FW, 120, (x, y) => [200, 40 + y, 255 - (x % 256), (x * 255) / FW]), 0, 20));

  const g = createGroupNode('Group');
  g.opacity = 0.6;
  g.children.push(raster('G1', gradient(150, 150, (x, y) => [255, (x + y) % 256, 0, 180]), 10, 10));
  const g2 = raster('G2', gradient(120, 120, (x, y) => [x * 2, 50, y * 2, 200]), 60, 60);
  g2.blend = 'multiply';
  g.children.push(g2);
  top.push(g);

  const masked = raster('Masked', gradient(200, 160, (x, y) => [30, 200, (x * y) % 256, 230]), 90, 50, { x: -20, y: -10 });
  masked.mask = ellipseMask(FW, FH, { x: 80, y: 40, w: 180, h: 140 });
  top.push(masked);

  const stripW = Math.floor(FW / BLEND_MODES_IMPLEMENTED.length);
  BLEND_MODES_IMPLEMENTED.forEach((mode, i) => {
    const n = raster(`Blend ${mode}`, gradient(stripW, FH, (x, y) => [
      (y * 255) / FH, ((x + i * 13) * 255) / stripW % 256, 255 - (y * 255) / FH, y < FH / 2 ? 255 : 150,
    ]), i * stripW, 0);
    n.blend = mode;
    top.push(n);
  });

  top.push(createTextNode('Title', { text: 'PhotoChop\nposter', x: 40, y: 60, size: 40, color: [20, 20, 160, 220], italic: true }));
  const shape = createShapeNode('Card', {
    x: 180, y: 140, w: 110, h: 70, radius: 14, fill: [250, 220, 40, 200], stroke: [10, 10, 10, 255], strokeWidth: 5,
  });
  shape.blend = 'overlay';
  top.push(shape);
  const ell = createShapeNode('Dot', { shape: 'ellipse', x: 20, y: 150, w: 70, h: 60, fill: [255, 0, 120, 255] });
  ell.mask = rectMask(FW, FH, { x: 0, y: 0, w: 60, h: FH });
  top.push(ell);
  doc.activeId = top[0].id;
  doc.selectedIds = [top[0].id];
  doc.selection = selectionFromMask(ellipseMask(FW, FH, { x: 10, y: 10, w: 100, h: 60 }));
  return doc;
}
