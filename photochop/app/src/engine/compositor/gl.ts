// WebGL2 compositor. Every buffer is straight-alpha RGBA8 and every blend is a full-screen pass
// that reads the backdrop texture and the layer texture and writes a fresh target (ping-pong),
// so the blend math is the same W3C formula as the CPU path (blend.ts) evaluated in a shader.
//
// Row convention: texel row y == document row y in every texture and framebuffer. Only the final
// copy to the visible canvas flips, because the default framebuffer's origin is bottom-left.
import type { CompositeOptions, CompositorLike, DocumentLike } from '../contract';
import type { AnyNode, ChangeEvent, NodeId, Rect, ShapeNode, TextNode } from '../types';
import { makeImageData, rectOuter } from '../util';
import { blendIndex } from './blend';
import { compile, FS_BLEND, FS_COPY, VS } from './gl-shaders';
import { GlPreview } from './gl-preview';
import { createTexture, GlRasterCache } from './gl-raster';
import { ContentCache } from './content';

type CompositorPreview = Parameters<CompositorLike['setPreview']>[0];

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer }
interface Src { tex: WebGLTexture; x: number; y: number; w: number; h: number; temp?: Target }
interface ContentTex { rev: number; tex: WebGLTexture | null; w: number; h: number }
interface MaskTex { mask: AnyNode['mask']; tex: WebGLTexture; stale: boolean }

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
  private raster: GlRasterCache;
  private content = new Map<NodeId, ContentTex>();
  private masks = new Map<NodeId, MaskTex>();
  private cache = new ContentCache();
  private doc: DocumentLike | null = null;
  private unsub: (() => void) | null = null;
  private sweepPending = false;
  /** Transform-gesture preview: the node is drawn through the matrix or warp at composite time. */
  preview: CompositorPreview = null;
  private previewer: GlPreview | null = null;
  /** Set when the context is lost; every later call throws so the auto wrapper can switch to the CPU. */
  lost = false;
  /** Called once when the WebGL context is lost (the auto wrapper listens). */
  onContextLost: (() => void) | null = null;
  /** Test hook: pretend MAX_TEXTURE_SIZE is this small (applies to compositors created afterwards). */
  static maxTextureOverride: number | null = null;

  constructor() {
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', {
      alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.maxTex = GlCompositor.maxTextureOverride ?? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
    this.raster = new GlRasterCache(gl, this.maxTex);
    (this.canvas as EventTarget).addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.lost) return;
      this.lost = true;
      this.onContextLost?.();
    });
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
    this.dummyMask = createTexture(this.gl, 1, 1, gl.R8);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
  }

  // ----- resources -----

  private acquire(): Target {
    const t = this.free.pop();
    if (t) return t;
    const gl = this.gl;
    const tex = createTexture(this.gl, this.W, this.H, gl.RGBA8);
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
      this.raster.onPixels(ev.nodeId, ev.rect);
    } else if (ev.kind === 'node') {
      const m = this.masks.get(ev.nodeId);
      if (m) m.stale = true;
    } else if (ev.kind === 'tree') {
      this.sweepPending = true;
    } else if (ev.kind === 'document' && this.doc && (this.doc.width !== this.W || this.doc.height !== this.H)) {
      // Document resize: drop size-bound buffers now; a size beyond MAX_TEXTURE_SIZE throws at the next composite.
      try { this.resize(this.doc.width, this.doc.height); } catch { /* composite reports it */ }
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
    this.raster.sweep(live);
    for (const [id, e] of this.content) if (!live.has(id)) { if (e.tex) gl.deleteTexture(e.tex); this.content.delete(id); this.cache.delete(id); }
    for (const [id, e] of this.masks) if (!live.has(id)) { gl.deleteTexture(e.tex); this.masks.delete(id); }
  }

  // ----- node sources -----

  private contentSource(node: TextNode | ShapeNode): Src | null {
    const ce = this.cache.entry(node);
    if (!ce.data) return null;
    const gl = this.gl;
    let t = this.content.get(node.id);
    if (!t || t.rev !== ce.rev) {
      if (t?.tex) gl.deleteTexture(t.tex);
      if (ce.w > this.maxTex || ce.h > this.maxTex) throw new Error(`A layer larger than ${this.maxTex} px needs the CPU compositor`);
      const w = ce.w, h = ce.h;
      const tex = createTexture(this.gl, w, h, gl.RGBA8);
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
      const tex = e ? e.tex : createTexture(this.gl, this.W, this.H, gl.R8);
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
    if (node.type === 'raster') return this.raster.source(node, this.W, this.H);
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
    const pv = this.preview;
    for (const child of children) {
      if (!child.visible || child.opacity <= 0) continue;
      let src = this.source(child);
      if (!src) continue;
      let mask = this.maskTexture(child);
      if (pv && child.id === pv.nodeId) {
        const t = this.previewTarget(src, mask, this.doc?.contentBounds(child.id) ?? null);
        if (src.temp) this.release(src.temp);
        src = { tex: t.tex, x: 0, y: 0, w: this.W, h: this.H, temp: t };
        mask = null;
      }
      this.drawBlend(b, a.tex, src, child.opacity, mask, blendIndex(child.blend));
      const t = a; a = b; b = t;
      if (src.temp) this.release(src.temp);
    }
    this.release(b);
    return a;
  }

  /** The preview node's source drawn through the preview matrix or warp into a fresh target. */
  private previewTarget(src: Src, mask: WebGLTexture | null, bounds: Rect | null): Target {
    const t = this.acquire();
    if (!this.previewer) this.previewer = new GlPreview(this.gl);
    this.previewer.draw(t.fbo, this.W, this.H, src, mask, this.dummyMask, this.preview ?? {}, bounds);
    return t;
  }

  private checkAlive(): void {
    if (this.lost || this.gl.isContextLost()) {
      this.lost = true;
      throw new Error('The WebGL context was lost');
    }
  }

  composite(doc: DocumentLike, _opts?: CompositeOptions): void {
    // The dirty rect is ignored: a full pass per layer is cheap on the GPU.
    this.checkAlive();
    if (doc.width !== this.W || doc.height !== this.H) this.resize(doc.width, doc.height);
    this.attach(doc);
    if (this.sweepPending) this.sweep(doc);
    const prev = this.result;
    this.result = null;
    if (prev) this.release(prev);
    let res = this.compositeGroup(doc.root.children);
    if (this.preview && this.preview.nodeId === doc.root.id) {
      const t = this.previewTarget({ tex: res.tex, x: 0, y: 0, w: this.W, h: this.H }, null, { x: 0, y: 0, w: this.W, h: this.H });
      this.release(res);
      res = t;
    }
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
    this.checkAlive();
    const r = rect ? rectOuter(rect) : { x: 0, y: 0, w: this.W, h: this.H };
    return this.readTarget(this.result, r);
  }

  /** Content of one node alone at document size, without its own opacity, blend or mask. */
  renderNode(doc: DocumentLike, id: NodeId): ImageData {
    this.checkAlive();
    const pv = this.preview;
    this.preview = null;
    try {
      return this.renderNodeNow(doc, id);
    } finally {
      this.preview = pv;
    }
  }

  private renderNodeNow(doc: DocumentLike, id: NodeId): ImageData {
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

  /** Takes effect at the next composite(): the node, group or 'root' is drawn through the matrix or warp. */
  setPreview(preview: CompositorPreview): void {
    this.preview = preview;
  }

  dispose(): void {
    this.onContextLost = null;
    this.lost = true;
    this.unsub?.();
    this.unsub = null;
    this.doc = null;
    this.dropTargets();
    this.dropNodeCaches();
    const gl = this.gl;
    this.previewer?.dispose();
    this.previewer = null;
    gl.deleteProgram(this.blendProg);
    gl.deleteProgram(this.copyProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.dummyMask);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
