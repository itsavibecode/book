// WebGL2 compositor. Every buffer is straight-alpha RGBA8 and every blend is a full-screen pass
// that reads the backdrop texture and the layer texture and writes a fresh target (ping-pong),
// so the blend math is the same W3C formula as the CPU path (blend.ts) evaluated in a shader.
//
// Row convention: texel row y == document row y in every texture and framebuffer. Only the final
// copy to the visible canvas flips, because the default framebuffer's origin is bottom-left.
import type { CompositeOptions, CompositorLike, DocumentLike } from '../contract';
import { TILE, type AnyNode, type ChangeEvent, type NodeId, type RasterNode, type Rect, type ShapeNode, type TextNode } from '../types';
import { makeImageData, rectContains, rectOuter, rectUnion } from '../util';
import { blendIndex, GLSL_BLEND } from './blend';
import { ContentCache } from './content';

const VS = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FS_BLEND = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D u_back;
uniform sampler2D u_src;
uniform sampler2D u_mask;
uniform ivec2 u_srcOff;
uniform ivec2 u_srcSize;
uniform int u_hasMask;
uniform float u_opacity;
uniform int u_mode;
out vec4 o;
${GLSL_BLEND}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 back = texelFetch(u_back, p, 0);
  ivec2 sp = p - u_srcOff;
  if (sp.x < 0 || sp.y < 0 || sp.x >= u_srcSize.x || sp.y >= u_srcSize.y) { o = back; return; }
  vec4 src = texelFetch(u_src, sp, 0);
  if (src.a == 0.0) { o = back; return; }
  float sa = src.a * u_opacity;
  if (u_hasMask == 1) {
    float m = texelFetch(u_mask, p, 0).r;
    if (m == 0.0) { o = back; return; }
    sa *= m;
  }
  o = blendPixel(back, src.rgb, sa, u_mode);
}`;

const FS_COPY = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_tex;
uniform int u_h;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  o = texelFetch(u_tex, ivec2(p.x, u_h - 1 - p.y), 0);
}`;

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer }
interface Src { tex: WebGLTexture; x: number; y: number; w: number; h: number; temp?: Target }
interface RasterEntry {
  node: RasterNode;
  tiles: RasterNode['tiles'];
  tex: WebGLTexture;
  /** Node-space rect the texture covers (tile aligned). */
  rect: Rect;
  dirty: Set<string> | 'all';
}
interface ContentTex { rev: number; tex: WebGLTexture | null; w: number; h: number }
interface MaskTex { mask: AnyNode['mask']; tex: WebGLTexture; stale: boolean }

const ZERO_TILE = new Uint8Array(TILE * TILE * 4);

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('WebGL2 shader creation failed');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`WebGL2 shader error: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram();
  if (!p) throw new Error('WebGL2 program creation failed');
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`WebGL2 link error: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export class GlCompositor implements CompositorLike {
  readonly kind = 'gl' as const;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private W = 0;
  private H = 0;
  private maxTex: number;
  private blendProg: WebGLProgram;
  private copyProg: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private vao: WebGLVertexArrayObject;
  private free: Target[] = [];
  private all: Target[] = [];
  private result: Target | null = null;
  private dummyMask: WebGLTexture;
  private raster = new Map<NodeId, RasterEntry>();
  private content = new Map<NodeId, ContentTex>();
  private masks = new Map<NodeId, MaskTex>();
  private cache = new ContentCache();
  private doc: DocumentLike | null = null;
  private unsub: (() => void) | null = null;
  private sweepPending = false;

  constructor() {
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', {
      alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.blendProg = compile(gl, VS, FS_BLEND);
    this.copyProg = compile(gl, VS, FS_COPY);
    for (const n of ['u_back', 'u_src', 'u_mask', 'u_srcOff', 'u_srcSize', 'u_hasMask', 'u_opacity', 'u_mode']) {
      this.u[n] = gl.getUniformLocation(this.blendProg, n);
    }
    this.u.copy_tex = gl.getUniformLocation(this.copyProg, 'u_tex');
    this.u.copy_h = gl.getUniformLocation(this.copyProg, 'u_h');
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('WebGL2 vertex array creation failed');
    this.vao = vao;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.dummyMask = this.texture(1, 1, gl.R8);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
  }

  // ----- resources -----

  private texture(w: number, h: number, internal: number): WebGLTexture {
    const gl = this.gl;
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

  private acquire(): Target {
    const t = this.free.pop();
    if (t) return t;
    const gl = this.gl;
    const tex = this.texture(this.W, this.H, gl.RGBA8);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('WebGL2 framebuffer creation failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const target = { tex, fbo };
    this.all.push(target);
    return target;
  }

  private release(t: Target): void {
    if (t !== this.result) this.free.push(t);
  }

  private clearTarget(t: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private dropTargets(): void {
    const gl = this.gl;
    for (const t of this.all) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.all = [];
    this.free = [];
    this.result = null;
  }

  private dropNodeCaches(): void {
    const gl = this.gl;
    for (const e of this.raster.values()) gl.deleteTexture(e.tex);
    for (const e of this.content.values()) if (e.tex) gl.deleteTexture(e.tex);
    for (const e of this.masks.values()) gl.deleteTexture(e.tex);
    this.raster.clear();
    this.content.clear();
    this.masks.clear();
    this.cache.clear();
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    if (w === this.W && h === this.H) return;
    if (w > this.maxTex || h > this.maxTex) throw new Error(`Documents larger than ${this.maxTex} px need the CPU compositor`);
    this.dropTargets();
    this.dropNodeCaches();
    this.W = w;
    this.H = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // ----- document tracking -----

  private attach(doc: DocumentLike): void {
    if (this.doc === doc) return;
    this.unsub?.();
    this.dropNodeCaches();
    this.doc = doc;
    this.unsub = doc.subscribe((ev) => this.onChange(ev));
  }

  private onChange(ev: ChangeEvent): void {
    if (ev.kind === 'pixels') {
      const e = this.raster.get(ev.nodeId);
      if (!e || e.dirty === 'all') return;
      const nx = Math.round(e.node.x), ny = Math.round(e.node.y);
      const r = rectOuter(ev.rect);
      const tx0 = Math.floor((r.x - nx) / TILE), tx1 = Math.floor((r.x + r.w - 1 - nx) / TILE);
      const ty0 = Math.floor((r.y - ny) / TILE), ty1 = Math.floor((r.y + r.h - 1 - ny) / TILE);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 4096) { e.dirty = 'all'; return; }
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) e.dirty.add(`${tx},${ty}`);
    } else if (ev.kind === 'node') {
      const m = this.masks.get(ev.nodeId);
      if (m) m.stale = true;
    } else if (ev.kind === 'tree') {
      this.sweepPending = true;
    }
  }

  private sweep(doc: DocumentLike): void {
    this.sweepPending = false;
    const live = new Set<NodeId>();
    const walk = (nodes: AnyNode[]) => {
      for (const n of nodes) {
        live.add(n.id);
        if (n.type === 'group') walk(n.children);
      }
    };
    walk(doc.root.children);
    const gl = this.gl;
    for (const [id, e] of this.raster) if (!live.has(id)) { gl.deleteTexture(e.tex); this.raster.delete(id); }
    for (const [id, e] of this.content) if (!live.has(id)) { if (e.tex) gl.deleteTexture(e.tex); this.content.delete(id); this.cache.delete(id); }
    for (const [id, e] of this.masks) if (!live.has(id)) { gl.deleteTexture(e.tex); this.masks.delete(id); }
  }

  // ----- node sources -----

  private uploadTile(e: RasterEntry, tx: number, ty: number): void {
    const gl = this.gl;
    const x = tx * TILE - e.rect.x, y = ty * TILE - e.rect.y;
    if (x < 0 || y < 0 || x + TILE > e.rect.w || y + TILE > e.rect.h) return;
    const buf = e.tiles.get(tx, ty);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, TILE, TILE, gl.RGBA, gl.UNSIGNED_BYTE,
      (buf ?? ZERO_TILE) as ArrayBufferView<ArrayBuffer>);
  }

  private rasterSource(node: RasterNode): Src | null {
    const tb = node.tiles.bounds();
    if (!tb) return null;
    const gl = this.gl;
    let e = this.raster.get(node.id);
    if (e && (e.node !== node || e.tiles !== node.tiles || !rectContains(e.rect, tb))) {
      const grow = e.node === node && e.tiles === node.tiles ? e.rect : null;
      gl.deleteTexture(e.tex);
      this.raster.delete(node.id);
      e = undefined;
      if (grow) return this.createRaster(node, tb, grow);
    }
    if (!e) return this.createRaster(node, tb, null);
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
    return this.rasterSrc(e);
  }

  private rasterSrc(e: RasterEntry): Src {
    return { tex: e.tex, x: Math.round(e.node.x) + e.rect.x, y: Math.round(e.node.y) + e.rect.y, w: e.rect.w, h: e.rect.h };
  }

  private createRaster(node: RasterNode, tb: Rect, previous: Rect | null): Src {
    const nx = Math.round(node.x), ny = Math.round(node.y);
    // Cover the document area too (with slack when growing) so painting rarely forces a reallocation.
    const docArea = { x: Math.floor(-nx / TILE) * TILE, y: Math.floor(-ny / TILE) * TILE, w: 0, h: 0 };
    docArea.w = Math.ceil((this.W - nx) / TILE) * TILE - docArea.x;
    docArea.h = Math.ceil((this.H - ny) / TILE) * TILE - docArea.y;
    let rect = rectUnion(tb, previous) as Rect;
    if (previous) rect = { x: rect.x - 2 * TILE, y: rect.y - 2 * TILE, w: rect.w + 4 * TILE, h: rect.h + 4 * TILE };
    const wanted = rectUnion(rect, docArea) as Rect;
    if (wanted.w <= this.maxTex && wanted.h <= this.maxTex) rect = wanted;
    if (rect.w > this.maxTex || rect.h > this.maxTex) {
      rect = tb.w <= this.maxTex && tb.h <= this.maxTex ? tb
        : { x: tb.x, y: tb.y, w: Math.min(tb.w, Math.floor(this.maxTex / TILE) * TILE), h: Math.min(tb.h, Math.floor(this.maxTex / TILE) * TILE) };
    }
    const gl = this.gl;
    const tex = this.texture(rect.w, rect.h, gl.RGBA8);
    const e: RasterEntry = { node, tiles: node.tiles, tex, rect, dirty: new Set() };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    // texStorage2D leaves contents undefined in some drivers; zero everything not covered by a tile.
    const zeros = new Uint8Array(rect.w * TILE * 4);
    for (let y = 0; y < rect.h; y += TILE) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, rect.w, TILE, gl.RGBA, gl.UNSIGNED_BYTE, zeros);
    node.tiles.forEach((_b, tx, ty) => this.uploadTile(e, tx, ty));
    this.raster.set(node.id, e);
    return this.rasterSrc(e);
  }

  private contentSource(node: TextNode | ShapeNode): Src | null {
    const ce = this.cache.entry(node);
    if (!ce.data) return null;
    const gl = this.gl;
    let t = this.content.get(node.id);
    if (!t || t.rev !== ce.rev) {
      if (t?.tex) gl.deleteTexture(t.tex);
      const w = Math.min(ce.w, this.maxTex), h = Math.min(ce.h, this.maxTex);
      const tex = this.texture(w, h, gl.RGBA8);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, ce.w);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, ce.data as ArrayBufferView<ArrayBuffer>);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      t = { rev: ce.rev, tex, w, h };
      this.content.set(node.id, t);
    }
    if (!t.tex) return null;
    return { tex: t.tex, x: Math.round(node.x) + ce.bx, y: Math.round(node.y) + ce.by, w: t.w, h: t.h };
  }

  private maskTexture(node: AnyNode): WebGLTexture | null {
    const mask = node.mask;
    if (!mask || !node.maskEnabled || mask.w !== this.W || mask.h !== this.H) return null;
    const gl = this.gl;
    let e = this.masks.get(node.id);
    if (!e || e.mask !== mask || e.stale) {
      const tex = e ? e.tex : this.texture(this.W, this.H, gl.R8);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.W, this.H, gl.RED, gl.UNSIGNED_BYTE, mask.data as ArrayBufferView<ArrayBuffer>);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      e = { mask, tex, stale: false };
      this.masks.set(node.id, e);
    }
    return e.tex;
  }

  private source(node: AnyNode): Src | null {
    if (node.type === 'raster') return this.rasterSource(node);
    if (node.type === 'group') {
      const t = this.compositeGroup(node.children);
      return { tex: t.tex, x: 0, y: 0, w: this.W, h: this.H, temp: t };
    }
    return this.contentSource(node);
  }

  // ----- drawing -----

  private drawBlend(target: Target, back: WebGLTexture, src: Src, opacity: number, mask: WebGLTexture | null, mode: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.blendProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, back);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, mask ?? this.dummyMask);
    gl.activeTexture(gl.TEXTURE0);
    const u = this.u;
    gl.uniform1i(u.u_back, 0);
    gl.uniform1i(u.u_src, 1);
    gl.uniform1i(u.u_mask, 2);
    gl.uniform2i(u.u_srcOff, src.x, src.y);
    gl.uniform2i(u.u_srcSize, src.w, src.h);
    gl.uniform1i(u.u_hasMask, mask ? 1 : 0);
    gl.uniform1f(u.u_opacity, opacity);
    gl.uniform1i(u.u_mode, mode);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private compositeGroup(children: AnyNode[]): Target {
    let a = this.acquire();
    this.clearTarget(a);
    let b = this.acquire();
    for (const child of children) {
      if (!child.visible || child.opacity <= 0) continue;
      const src = this.source(child);
      if (!src) continue;
      this.drawBlend(b, a.tex, src, child.opacity, this.maskTexture(child), blendIndex(child.blend));
      const t = a; a = b; b = t;
      if (src.temp) this.release(src.temp);
    }
    this.release(b);
    return a;
  }

  composite(doc: DocumentLike, _opts?: CompositeOptions): void {
    // The dirty rect is ignored: a full pass per layer is cheap on the GPU.
    if (doc.width !== this.W || doc.height !== this.H) this.resize(doc.width, doc.height);
    this.attach(doc);
    if (this.sweepPending) this.sweep(doc);
    const prev = this.result;
    this.result = null;
    if (prev) this.release(prev);
    const res = this.compositeGroup(doc.root.children);
    this.result = res;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.copyProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.tex);
    gl.uniform1i(this.u.copy_tex, 0);
    gl.uniform1i(this.u.copy_h, this.H);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private readTarget(t: Target | null, r: Rect): ImageData {
    const out = new Uint8ClampedArray(r.w * r.h * 4);
    if (t && r.w > 0 && r.h > 0) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
      gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.buffer));
    }
    return makeImageData(r.w, r.h, out);
  }

  readImageData(rect?: Rect): ImageData {
    const r = rect ? rectOuter(rect) : { x: 0, y: 0, w: this.W, h: this.H };
    return this.readTarget(this.result, r);
  }

  /** Content of one node alone at document size, without its own opacity, blend or mask. */
  renderNode(doc: DocumentLike, id: NodeId): ImageData {
    if (doc.width !== this.W || doc.height !== this.H) this.resize(doc.width, doc.height);
    this.attach(doc);
    const node = doc.getNode(id);
    const full = { x: 0, y: 0, w: this.W, h: this.H };
    if (!node) return makeImageData(this.W, this.H);
    if (node.type === 'group') {
      const t = this.compositeGroup(node.children);
      const img = this.readTarget(t, full);
      this.release(t);
      return img;
    }
    const src = this.source(node);
    if (!src) return makeImageData(this.W, this.H);
    const a = this.acquire();
    const b = this.acquire();
    this.clearTarget(a);
    this.drawBlend(b, a.tex, src, 1, null, 0);
    const img = this.readTarget(b, full);
    this.release(a);
    this.release(b);
    return img;
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    this.doc = null;
    this.dropTargets();
    this.dropNodeCaches();
    const gl = this.gl;
    gl.deleteProgram(this.blendProg);
    gl.deleteProgram(this.copyProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.dummyMask);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
