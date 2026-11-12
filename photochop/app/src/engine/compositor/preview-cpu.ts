// CPU transform preview. At the start of a gesture (once per node and document version) it caches,
// for the node and for every group it sits in, what is below and above it inside that group, plus
// the group's mask as a canvas and the node's own content times its mask. Every preview frame is
// then a handful of drawImage calls per nesting level, with the node drawn through a Canvas2D
// transform (affine) or a triangle mesh (projective, warp), and each group's mask, opacity and
// blend applied to the rebuilt group exactly where the GL compositor applies them. No tile is
// resampled for a preview.
import type { CompositorLike, DocumentLike } from '../contract';
import type { AnyNode, BlendMode, GroupNode, Mask, Mat3, Rect } from '../types';
import { mat3IsAffine } from '../transform/mat3';
import { forEachTriangle, warpMesh } from '../transform/warp';
import { createCanvas, get2d, makeImageData, rectIntersect, rectOuter, type Canvas, type Ctx2D } from '../util';
import { compositeChildren, effectiveMask, renderContent, type CpuContext, type Surface } from './cpu';

type Preview = NonNullable<Parameters<CompositorLike['setPreview']>[0]>;

const BLEND_OP: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
  'normal': 'source-over', 'darken': 'darken', 'multiply': 'multiply', 'lighten': 'lighten', 'screen': 'screen',
  'overlay': 'overlay', 'soft-light': 'soft-light', 'hard-light': 'hard-light', 'difference': 'difference', 'exclusion': 'exclusion',
};

interface NodePic { canvas: Canvas; x: number; y: number; opacity: number; op: GlobalCompositeOperation; bounds: Rect | null }

/** One group on the path from the root to the previewed node. */
interface Level {
  /** The group's content below and above the next element of the path, isolated as the group renders it. */
  below: Canvas | null;
  above: Canvas | null;
  /** Mask, opacity and blend used when this group is drawn into its parent (unused for the root). */
  mask: Canvas | null;
  opacity: number;
  op: GlobalCompositeOperation;
  /** Where the rebuilt group is drawn each frame (null for the root, which draws into the output). */
  scratch: Canvas | null;
}

function surfaceCanvas(data: Uint8ClampedArray, w: number, h: number): Canvas {
  const c = createCanvas(w, h);
  get2d(c).putImageData(makeImageData(w, h, data), 0, 0);
  return c;
}

/** A group's children composited (isolated, document sized) with some of them hidden. */
function renderHiding(g: GroupNode, hide: AnyNode[], W: number, H: number, ctx: CpuContext): Canvas | null {
  if (g.children.every((c) => hide.includes(c) || !c.visible)) return null;
  const was = hide.map((n) => n.visible);
  try {
    hide.forEach((n) => { n.visible = false; });
    const dst: Surface = { data: new Uint8ClampedArray(W * H * 4), x: 0, y: 0, w: W, h: H };
    compositeChildren(g.children, dst, { x: 0, y: 0, w: W, h: H }, ctx, 1);
    return surfaceCanvas(dst.data, W, H);
  } finally {
    hide.forEach((n, i) => { n.visible = was[i]; });
  }
}

/** A mask as a canvas whose alpha is the mask value (for 'destination-in'). */
function maskCanvas(m: Mask): Canvas {
  const d = new Uint8ClampedArray(m.w * m.h * 4);
  for (let i = 0; i < m.data.length; i++) d[i * 4 + 3] = m.data[i];
  return surfaceCanvas(d, m.w, m.h);
}
function triangleAffine(s0x: number, s0y: number, s1x: number, s1y: number, s2x: number, s2y: number,
  d0x: number, d0y: number, d1x: number, d1y: number, d2x: number, d2y: number): [number, number, number, number, number, number] | null {
  const den = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y);
  if (Math.abs(den) < 1e-9) return null;
  const a = ((d1x - d0x) * (s2y - s0y) - (d2x - d0x) * (s1y - s0y)) / den;
  const c = ((d2x - d0x) * (s1x - s0x) - (d1x - d0x) * (s2x - s0x)) / den;
  const b = ((d1y - d0y) * (s2y - s0y) - (d2y - d0y) * (s1y - s0y)) / den;
  const d = ((d2y - d0y) * (s1x - s0x) - (d1y - d0y) * (s2x - s0x)) / den;
  return [a, b, c, d, d0x - a * s0x - c * s0y, d0y - b * s0x - d * s0y];
}

/** Draws pic through a mesh of (destination, source) vertex pairs, one clipped drawImage per triangle. */
function drawMesh(g: Ctx2D, pic: NodePic, n: number, pos: ArrayLike<number>, src: ArrayLike<number>, valid: (k: number) => boolean): void {
  forEachTriangle(n, (i0, i1, i2) => {
    if (!valid(i0) || !valid(i1) || !valid(i2)) return;
    const t = triangleAffine(src[i0 * 2], src[i0 * 2 + 1], src[i1 * 2], src[i1 * 2 + 1], src[i2 * 2], src[i2 * 2 + 1],
      pos[i0 * 2], pos[i0 * 2 + 1], pos[i1 * 2], pos[i1 * 2 + 1], pos[i2 * 2], pos[i2 * 2 + 1]);
    if (!t) return;
    // Grow the clip triangle by half a pixel about its centroid so neighbours meet without seams.
    const cx = (pos[i0 * 2] + pos[i1 * 2] + pos[i2 * 2]) / 3, cy = (pos[i0 * 2 + 1] + pos[i1 * 2 + 1] + pos[i2 * 2 + 1]) / 3;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    for (const k of [i0, i1, i2]) {
      const dx = pos[k * 2] - cx, dy = pos[k * 2 + 1] - cy, len = Math.hypot(dx, dy) || 1;
      const x = pos[k * 2] + (dx / len) * 0.5, y = pos[k * 2 + 1] + (dy / len) * 0.5;
      if (k === i0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.clip();
    g.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
    g.drawImage(pic.canvas as CanvasImageSource, pic.x, pic.y);
    g.restore();
  });
}

export class CpuPreview {
  private key = '';
  private levels: Level[] = [];
  private pic: NodePic | null = null;
  /** True when the node or a group around it is hidden: the frame is just the rest of the document. */
  private hidden = false;

  reset(): void {
    this.key = '';
    this.levels = [];
    this.pic = null;
    this.hidden = false;
  }

  private build(doc: DocumentLike, p: Preview, ctx: CpuContext): void {
    const key = `${p.nodeId}|${doc.version}|${doc.width}x${doc.height}`;
    if (key === this.key) return;
    this.reset();
    this.key = key;
    const W = doc.width, H = doc.height;
    if (p.nodeId === doc.root.id) {
      const dst: Surface = { data: new Uint8ClampedArray(W * H * 4), x: 0, y: 0, w: W, h: H };
      compositeChildren(doc.root.children, dst, { x: 0, y: 0, w: W, h: H }, ctx, 0);
      this.pic = { canvas: surfaceCanvas(dst.data, W, H), x: 0, y: 0, opacity: 1, op: 'source-over', bounds: { x: 0, y: 0, w: W, h: H } };
      return;
    }
    const node = doc.getNode(p.nodeId);
    if (!node) return;
    // Path from the root down to the node's parent.
    const path: GroupNode[] = [];
    for (let a = doc.parentOf(node.id); a; a = a === doc.root ? undefined : doc.parentOf(a.id)) path.unshift(a);
    if (path[0] !== doc.root) path.unshift(doc.root);
    path.forEach((g, i) => {
      const child: AnyNode = path[i + 1] ?? node;
      const at = g.children.indexOf(child);
      this.levels.push({
        below: renderHiding(g, g.children.slice(at), W, H, ctx),
        above: renderHiding(g, g.children.slice(0, at + 1), W, H, ctx),
        mask: i > 0 && effectiveMask(g) ? maskCanvas(effectiveMask(g) as Mask) : null,
        opacity: g.opacity,
        op: BLEND_OP[g.blend] ?? 'source-over',
        scratch: i > 0 ? createCanvas(W, H) : null,
      });
      if (i > 0 && (!g.visible || g.opacity <= 0)) this.hidden = true;
    });
    if (!node.visible || node.opacity <= 0) this.hidden = true;
    const nb = doc.contentBounds(node.id);
    if (!nb || this.hidden) return;
    // A transparent 2 px margin: Canvas2D clamps to the image edge when smoothing, the committed
    // resample fades to transparent. Content far outside the canvas is not needed for a preview.
    const o = rectOuter(nb);
    const region = rectIntersect({ x: o.x - 2, y: o.y - 2, w: o.w + 4, h: o.h + 4 }, { x: -W, y: -H, w: 3 * W, h: 3 * H });
    if (!region) return;
    const s = renderContent(node, region, ctx);
    const mask = effectiveMask(node);
    if (mask) {
      for (let y = 0; y < region.h; y++) {
        const dy = y + region.y;
        for (let x = 0; x < region.w; x++) {
          const dx = x + region.x, k = (y * region.w + x) * 4 + 3;
          const m = dx < 0 || dy < 0 || dx >= mask.w || dy >= mask.h ? 0 : mask.data[dy * mask.w + dx];
          s.data[k] = (s.data[k] * m) / 255;
        }
      }
    }
    this.pic = {
      canvas: surfaceCanvas(s.data, region.w, region.h), x: region.x, y: region.y, opacity: node.opacity,
      op: BLEND_OP[node.blend] ?? 'source-over', bounds: nb,
    };
  }

  private drawNode(g: Ctx2D, p: Preview): void {
    const pic = this.pic;
    if (!pic) return;
    g.save();
    g.globalAlpha = pic.opacity;
    g.globalCompositeOperation = pic.op;
    g.imageSmoothingEnabled = p.interpolation !== 'nearest';
    g.imageSmoothingQuality = 'low';
    if (p.warp && pic.bounds) {
      // Same source rect as warpNode and the GL preview: the node's contentBounds.
      const m = warpMesh(p.warp, pic.bounds, 24);
      drawMesh(g, pic, m.n, m.pos, m.src, () => true);
    } else {
      const mx: Mat3 = p.matrix ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (mat3IsAffine(mx)) {
        g.setTransform(mx[0], mx[3], mx[1], mx[4], mx[2], mx[5]);
        g.drawImage(pic.canvas as CanvasImageSource, pic.x, pic.y);
      } else {
        const n = 16, r = { x: pic.x, y: pic.y, w: pic.canvas.width, h: pic.canvas.height };
        const pos = new Float64Array((n + 1) * (n + 1) * 2), src = new Float64Array(pos.length), ok = new Uint8Array((n + 1) * (n + 1));
        for (let j = 0; j <= n; j++) {
          for (let k = 0; k <= n; k++) {
            const idx = j * (n + 1) + k, sx = r.x + (r.w * k) / n, sy = r.y + (r.h * j) / n;
            const w = mx[6] * sx + mx[7] * sy + mx[8];
            src[idx * 2] = sx; src[idx * 2 + 1] = sy;
            ok[idx] = w > 1e-9 ? 1 : 0;
            pos[idx * 2] = (mx[0] * sx + mx[1] * sy + mx[2]) / w;
            pos[idx * 2 + 1] = (mx[3] * sx + mx[4] * sy + mx[5]) / w;
          }
        }
        drawMesh(g, pic, n, pos, src, (k) => ok[k] === 1);
      }
    }
    g.restore();
  }

  /** Rebuilds level i into g: below, the next level (or the node), above, then this group's mask. */
  private drawLevel(i: number, g: Ctx2D, p: Preview, W: number, H: number): void {
    const L = this.levels[i];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    if (L.below) g.drawImage(L.below as CanvasImageSource, 0, 0);
    if (!this.hidden) {
      const next = this.levels[i + 1];
      if (!next) {
        this.drawNode(g, p);
      } else if (next.scratch) {
        this.drawLevel(i + 1, get2d(next.scratch), p, W, H);
        g.globalAlpha = next.opacity;
        g.globalCompositeOperation = next.op;
        g.drawImage(next.scratch as CanvasImageSource, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (L.above) g.drawImage(L.above as CanvasImageSource, 0, 0);
    if (i > 0 && L.mask) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(L.mask as CanvasImageSource, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** Draws the preview frame into g (document sized). */
  draw(doc: DocumentLike, p: Preview, ctx: CpuContext, g: Ctx2D): void {
    this.build(doc, p, ctx);
    const W = doc.width, H = doc.height;
    if (this.levels.length === 0) {
      // 'root' (or a node that no longer exists): the whole composite through the matrix.
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      this.drawNode(g, p);
      return;
    }
    this.drawLevel(0, g, p, W, H);
  }
}