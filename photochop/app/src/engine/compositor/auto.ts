// createCompositor('auto'): WebGL2 when it can serve the document, the CPU otherwise. Falls back
// for good when the document or a layer exceeds MAX_TEXTURE_SIZE, when the context is lost, or
// when a GL call throws. The UI always sees the same `canvas` object: this wrapper owns a 2D
// canvas, copies each GL frame into it, and hands the same canvas to the CPU compositor.
import type { CompositeOptions, CompositorLike, DocumentLike } from '../contract';
import type { NodeId, Rect } from '../types';
import { canCreateCanvas, createCanvas, type Canvas, type Ctx2D } from '../util';
import { CpuCompositor } from './cpu';
import { GlCompositor } from './gl';

type Preview = Parameters<CompositorLike['setPreview']>[0];

export class AutoCompositor implements CompositorLike {
  private gl: GlCompositor | null;
  private cpu: CpuCompositor | null = null;
  /** null only where no canvas exists at all (Node unit tests); the CPU path then works without one. */
  private readonly own: Canvas | null;
  private g: Ctx2D | null = null;
  private W = 1;
  private H = 1;
  private preview: Preview = null;
  private lastDoc: DocumentLike | null = null;
  /** Why the wrapper moved to the CPU (null while GL is in use). */
  fallbackReason: string | null = null;
  /** Called after a switch to the CPU so the UI can recomposite and redraw. */
  onFallback: ((reason: string) => void) | null = null;

  constructor() {
    this.own = canCreateCanvas() ? createCanvas(1, 1) : null;
    let gl: GlCompositor | null = null;
    try {
      if (!this.own) throw new Error('No canvas is available');
      gl = new GlCompositor();
    } catch (err) {
      this.fallbackReason = (err as Error).message;
    }
    this.gl = gl;
    if (gl) gl.onContextLost = () => this.fallBack('The WebGL context was lost');
    else this.useCpu();
  }

  get kind(): 'gl' | 'cpu' {
    return this.gl ? 'gl' : 'cpu';
  }

  get canvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.own ?? this.useCpu().canvas;
  }

  private useCpu(): CpuCompositor {
    if (!this.cpu) {
      this.cpu = new CpuCompositor(this.own ?? undefined);
      this.cpu.resize(this.W, this.H);
      this.cpu.setPreview(this.preview);
    }
    return this.cpu;
  }

  private fallBack(reason: string): void {
    if (!this.gl) return;
    const gl = this.gl;
    this.gl = null;
    this.fallbackReason = reason;
    gl.onContextLost = null;
    try { gl.dispose(); } catch { /* already gone */ }
    // The 2D context of the owned canvas may already exist (GL copies); the CPU path reuses it.
    const cpu = this.useCpu();
    if (this.lastDoc) {
      try { cpu.composite(this.lastDoc); } catch { /* the next composite reports it */ }
    }
    this.onFallback?.(reason);
  }

  /** Runs fn on GL; any throw moves to the CPU and runs cpuFn instead. */
  private run<T>(fn: (gl: GlCompositor) => T, cpuFn: (cpu: CpuCompositor) => T): T {
    if (this.gl) {
      try {
        return fn(this.gl);
      } catch (err) {
        this.fallBack((err as Error).message || 'WebGL failed');
      }
    }
    return cpuFn(this.useCpu());
  }

  resize(width: number, height: number): void {
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    this.run((gl) => {
      gl.resize(this.W, this.H);
      this.sizeOwn();
    }, (cpu) => cpu.resize(this.W, this.H));
  }

  private sizeOwn(): void {
    if (!this.own) return;
    if (this.own.width !== this.W || this.own.height !== this.H) {
      this.own.width = this.W;
      this.own.height = this.H;
    }
    if (!this.g) this.g = (this.own as OffscreenCanvas).getContext('2d') as Ctx2D | null;
  }

  composite(doc: DocumentLike, opts?: CompositeOptions): void {
    this.lastDoc = doc;
    this.W = doc.width;
    this.H = doc.height;
    this.run((gl) => {
      gl.composite(doc, opts);
      this.sizeOwn();
      const g = this.g;
      if (g) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'copy';
        g.drawImage(gl.canvas as CanvasImageSource, 0, 0);
        g.globalCompositeOperation = 'source-over';
      }
    }, (cpu) => cpu.composite(doc, opts));
  }

  readImageData(rect?: Rect): ImageData {
    return this.run((gl) => gl.readImageData(rect), (cpu) => cpu.readImageData(rect));
  }

  renderNode(doc: DocumentLike, id: NodeId): ImageData {
    return this.run((gl) => gl.renderNode(doc, id), (cpu) => cpu.renderNode(doc, id));
  }

  setPreview(preview: Preview): void {
    this.preview = preview;
    this.gl?.setPreview(preview);
    this.cpu?.setPreview(preview);
  }

  dispose(): void {
    if (this.gl) {
      this.gl.onContextLost = null;
      this.gl.dispose();
      this.gl = null;
    }
    this.cpu?.dispose();
    this.lastDoc = null;
  }
}
