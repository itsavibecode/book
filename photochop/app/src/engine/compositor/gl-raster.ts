// Raster layer textures for the WebGL2 compositor: one RGBA8 texture per raster node, covering
// its tiles plus the document area (with slack when it grows), refreshed tile by tile from
// 'pixels' events.
import { TILE, type NodeId, type RasterNode, type Rect } from '../types';
import { rectContains, rectOuter, rectUnion } from '../util';

export interface GlSource { tex: WebGLTexture; x: number; y: number; w: number; h: number }

interface RasterEntry {
  node: RasterNode;
  tiles: RasterNode['tiles'];
  tex: WebGLTexture;
  /** Node-space rect the texture covers (tile aligned). */
  rect: Rect;
  dirty: Set<string> | 'all';
}

const ZERO_TILE = new Uint8Array(TILE * TILE * 4);

export function createTexture(gl: WebGL2RenderingContext, w: number, h: number, internal: number): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('WebGL2 texture creation failed');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, Math.max(1, w), Math.max(1, h));
  return t;
}

export class GlRasterCache {
  private map = new Map<NodeId, RasterEntry>();

  constructor(private gl: WebGL2RenderingContext, private maxTex: number) {}

  /** Marks the tiles a 'pixels' event touched (document-space rect). */
  onPixels(nodeId: NodeId, rect: Rect): void {
    const e = this.map.get(nodeId);
    if (!e || e.dirty === 'all') return;
    const nx = Math.round(e.node.x), ny = Math.round(e.node.y);
    const r = rectOuter(rect);
    const tx0 = Math.floor((r.x - nx) / TILE), tx1 = Math.floor((r.x + r.w - 1 - nx) / TILE);
    const ty0 = Math.floor((r.y - ny) / TILE), ty1 = Math.floor((r.y + r.h - 1 - ny) / TILE);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 4096) { e.dirty = 'all'; return; }
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) e.dirty.add(`${tx},${ty}`);
  }

  /** Drops textures of nodes no longer in the document. */
  sweep(live: ReadonlySet<NodeId>): void {
    for (const [id, e] of this.map) if (!live.has(id)) { this.gl.deleteTexture(e.tex); this.map.delete(id); }
  }

  clear(): void {
    for (const e of this.map.values()) this.gl.deleteTexture(e.tex);
    this.map.clear();
  }

  private uploadTile(e: RasterEntry, tx: number, ty: number): void {
    const gl = this.gl;
    const x = tx * TILE - e.rect.x, y = ty * TILE - e.rect.y;
    if (x < 0 || y < 0 || x + TILE > e.rect.w || y + TILE > e.rect.h) return;
    const buf = e.tiles.get(tx, ty);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, TILE, TILE, gl.RGBA, gl.UNSIGNED_BYTE,
      (buf ?? ZERO_TILE) as ArrayBufferView<ArrayBuffer>);
  }

  /** Up-to-date texture for the node (W x H = document size), or null when it has no tiles. */
  source(node: RasterNode, W: number, H: number): GlSource | null {
    const tb = node.tiles.bounds();
    if (!tb) return null;
    const gl = this.gl;
    let e = this.map.get(node.id);
    if (e && (e.node !== node || e.tiles !== node.tiles || !rectContains(e.rect, tb))) {
      const grow = e.node === node && e.tiles === node.tiles ? e.rect : null;
      gl.deleteTexture(e.tex);
      this.map.delete(node.id);
      e = undefined;
      if (grow) return this.create(node, tb, grow, W, H);
    }
    if (!e) return this.create(node, tb, null, W, H);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (e.dirty === 'all') {
      const r = e.rect;
      for (let ty = r.y / TILE; ty < (r.y + r.h) / TILE; ty++) for (let tx = r.x / TILE; tx < (r.x + r.w) / TILE; tx++) this.uploadTile(e, tx, ty);
    } else {
      for (const k of e.dirty) {
        const c = k.indexOf(',');
        this.uploadTile(e, +k.slice(0, c), +k.slice(c + 1));
      }
    }
    e.dirty = new Set();
    return this.src(e);
  }

  private src(e: RasterEntry): GlSource {
    return { tex: e.tex, x: Math.round(e.node.x) + e.rect.x, y: Math.round(e.node.y) + e.rect.y, w: e.rect.w, h: e.rect.h };
  }

  private create(node: RasterNode, tb: Rect, previous: Rect | null, W: number, H: number): GlSource {
    const nx = Math.round(node.x), ny = Math.round(node.y);
    // Cover the document area too (with slack when growing) so painting rarely forces a reallocation.
    const docArea = { x: Math.floor(-nx / TILE) * TILE, y: Math.floor(-ny / TILE) * TILE, w: 0, h: 0 };
    docArea.w = Math.ceil((W - nx) / TILE) * TILE - docArea.x;
    docArea.h = Math.ceil((H - ny) / TILE) * TILE - docArea.y;
    let rect = rectUnion(tb, previous) as Rect;
    if (previous) rect = { x: rect.x - 2 * TILE, y: rect.y - 2 * TILE, w: rect.w + 4 * TILE, h: rect.h + 4 * TILE };
    const wanted = rectUnion(rect, docArea) as Rect;
    if (wanted.w <= this.maxTex && wanted.h <= this.maxTex) rect = wanted;
    if (rect.w > this.maxTex || rect.h > this.maxTex) {
      if (tb.w > this.maxTex || tb.h > this.maxTex) throw new Error(`A layer larger than ${this.maxTex} px needs the CPU compositor`);
      rect = tb;
    }
    const gl = this.gl;
    const tex = createTexture(gl, rect.w, rect.h, gl.RGBA8);
    const e: RasterEntry = { node, tiles: node.tiles, tex, rect, dirty: new Set() };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    // texStorage2D leaves contents undefined in some drivers; zero everything not covered by a tile.
    const zeros = new Uint8Array(rect.w * TILE * 4);
    for (let y = 0; y < rect.h; y += TILE) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, rect.w, TILE, gl.RGBA, gl.UNSIGNED_BYTE, zeros);
    node.tiles.forEach((_b, tx, ty) => this.uploadTile(e, tx, ty));
    this.map.set(node.id, e);
    return this.src(e);
  }
}
