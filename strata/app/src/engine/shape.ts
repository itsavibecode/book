// Shape rasterisation with Canvas2D, in node space. The stroke is centred on the edge, so the
// raster (and nodeBounds) grow by strokeWidth / 2 on every side.
import type { Rect, ShapeNode } from './types';
import { colorToCss } from './color';
import { createCanvas, get2d, type Ctx2D } from './util';

function geometry(n: ShapeNode) {
  const sx = Math.min(0, n.w), sy = Math.min(0, n.h);
  return { sx, sy, sw: Math.abs(n.w), sh: Math.abs(n.h) };
}

function hasStroke(n: ShapeNode): boolean {
  return !!n.stroke && n.strokeWidth > 0;
}

/** Integer node-space bounds including the stroke. */
export function shapeBounds(n: ShapeNode): Rect {
  const { sx, sy, sw, sh } = geometry(n);
  const half = hasStroke(n) ? n.strokeWidth / 2 : 0;
  const x0 = Math.floor(sx - half), y0 = Math.floor(sy - half);
  const x1 = Math.ceil(sx + sw + half), y1 = Math.ceil(sy + sh + half);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function path(ctx: Ctx2D, n: ShapeNode): void {
  const { sx, sy, sw, sh } = geometry(n);
  ctx.beginPath();
  if (n.shape === 'ellipse') {
    ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    return;
  }
  const r = Math.max(0, Math.min(n.radius, sw / 2, sh / 2));
  if (r <= 0) {
    ctx.rect(sx, sy, sw, sh);
  } else if ('roundRect' in ctx) {
    ctx.roundRect(sx, sy, sw, sh, r);
  } else {
    const c = ctx as Ctx2D;
    c.moveTo(sx + r, sy);
    c.arcTo(sx + sw, sy, sx + sw, sy + sh, r);
    c.arcTo(sx + sw, sy + sh, sx, sy + sh, r);
    c.arcTo(sx, sy + sh, sx, sy, r);
    c.arcTo(sx, sy, sx + sw, sy, r);
    c.closePath();
  }
}

export function rasterizeShape(node: ShapeNode): ImageData | null {
  const { sw, sh } = geometry(node);
  if (sw <= 0 || sh <= 0) return null;
  if (!node.fill && !hasStroke(node)) return null;
  const b = shapeBounds(node);
  const canvas = createCanvas(b.w, b.h);
  const ctx = get2d(canvas);
  ctx.translate(-b.x, -b.y);
  path(ctx, node);
  if (node.fill) {
    ctx.fillStyle = colorToCss(node.fill);
    ctx.fill();
  }
  if (node.stroke && node.strokeWidth > 0) {
    ctx.strokeStyle = colorToCss(node.stroke);
    ctx.lineWidth = node.strokeWidth;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, b.w, b.h);
}
