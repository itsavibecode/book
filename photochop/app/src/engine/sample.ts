import type { CompositorLike, DocumentLike } from './contract';
import type { NodeId, Point, RGBA } from './types';

/** One pixel of the last composite, or of one node's own content when nodeId is given. */
export function samplePixel(compositor: CompositorLike, doc: DocumentLike, at: Point, nodeId?: NodeId): RGBA | null {
  const x = Math.floor(at.x), y = Math.floor(at.y);
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
  let d: Uint8ClampedArray;
  if (nodeId) {
    const node = doc.getNode(nodeId);
    if (!node) return null;
    if (node.type === 'raster') {
      d = node.tiles.read({ x: x - Math.round(node.x), y: y - Math.round(node.y), w: 1, h: 1 }).data;
    } else {
      const img = compositor.renderNode(doc, nodeId);
      const i = (y * img.width + x) * 4;
      d = img.data.subarray(i, i + 4);
    }
  } else {
    d = compositor.readImageData({ x, y, w: 1, h: 1 }).data;
  }
  return [d[0], d[1], d[2], d[3]];
}
