// GL side of transform previews: one extra pass that draws a node's cached source texture (times
// its own mask) through the preview matrix (projective in the shader) or along the warp mesh.
import type { Interpolation, Mat3, Rect, WarpGrid } from '../types';
import { mat3Identity, mat3Invert } from '../transform/mat3';
import { forEachTriangle, warpMesh } from '../transform/warp';
import { compile, FS_MESH, FS_XFORM, VS, VS_MESH } from './gl-shaders';

export interface PreviewSource { tex: WebGLTexture; x: number; y: number; w: number; h: number }
export interface PreviewSpec { matrix?: Mat3; warp?: WarpGrid; interpolation?: Interpolation }

const UNIFORMS = ['u_src', 'u_mask', 'u_hasMask', 'u_srcOff', 'u_srcSize', 'u_doc', 'u_interp'];

export class GlPreview {
  private xform: WebGLProgram;
  private mesh: WebGLProgram;
  private ux: Record<string, WebGLUniformLocation | null> = {};
  private um: Record<string, WebGLUniformLocation | null> = {};
  private vao: WebGLVertexArrayObject;
  private meshVao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;

  constructor(private gl: WebGL2RenderingContext) {
    this.xform = compile(gl, VS, FS_XFORM);
    this.mesh = compile(gl, VS_MESH, FS_MESH);
    for (const n of [...UNIFORMS, 'u_inv']) this.ux[n] = gl.getUniformLocation(this.xform, n);
    for (const n of [...UNIFORMS, 'u_docF']) this.um[n] = gl.getUniformLocation(this.mesh, n);
    const vao = gl.createVertexArray(), meshVao = gl.createVertexArray(), buf = gl.createBuffer();
    if (!vao || !meshVao || !buf) throw new Error('WebGL2 buffer creation failed');
    this.vao = vao;
    this.meshVao = meshVao;
    this.buf = buf;
    gl.bindVertexArray(meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const pos = gl.getAttribLocation(this.mesh, 'a_pos'), uv = gl.getAttribLocation(this.mesh, 'a_uv');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  private common(u: Record<string, WebGLUniformLocation | null>, src: PreviewSource, mask: WebGLTexture | null, dummy: WebGLTexture, W: number, H: number, interp: Interpolation): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, mask ?? dummy);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.u_src, 1);
    gl.uniform1i(u.u_mask, 2);
    gl.uniform1i(u.u_hasMask, mask ? 1 : 0);
    gl.uniform2i(u.u_srcOff, src.x, src.y);
    gl.uniform2i(u.u_srcSize, src.w, src.h);
    gl.uniform2i(u.u_doc, W, H);
    gl.uniform1i(u.u_interp, interp === 'nearest' ? 0 : 1);
  }

  /**
   * Clears fbo (W x H) and draws src through the preview. warpRect is the source rect the warp
   * grid's parameters span (the node's bounds when the gesture started).
   */
  draw(fbo: WebGLFramebuffer, W: number, H: number, src: PreviewSource, mask: WebGLTexture | null, dummy: WebGLTexture,
    p: PreviewSpec, warpRect: Rect | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const interp = p.interpolation ?? 'bilinear';
    if (p.warp && warpRect && warpRect.w > 0 && warpRect.h > 0) {
      const m = warpMesh(p.warp, warpRect, 48);
      const data: number[] = [];
      forEachTriangle(m.n, (a, b, c) => {
        for (const k of [a, b, c]) data.push(m.pos[k * 2], m.pos[k * 2 + 1], m.src[k * 2], m.src[k * 2 + 1]);
      });
      gl.useProgram(this.mesh);
      this.common(this.um, src, mask, dummy, W, H, interp);
      gl.uniform2f(this.um.u_docF, W, H);
      gl.bindVertexArray(this.meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 4);
      gl.bindVertexArray(null);
      return;
    }
    const inv = mat3Invert(p.matrix ?? mat3Identity());
    if (!inv) return;
    gl.useProgram(this.xform);
    this.common(this.ux, src, mask, dummy, W, H, interp);
    gl.uniformMatrix3fv(this.ux.u_inv, true, new Float32Array(inv));
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.xform);
    gl.deleteProgram(this.mesh);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.meshVao);
    gl.deleteBuffer(this.buf);
  }
}
