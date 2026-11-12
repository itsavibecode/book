// GLSL sources and program helpers for the WebGL2 compositor.
import { GLSL_BLEND } from './blend';

export const VS = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const FS_BLEND = `#version 300 es
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

export const FS_COPY = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_tex;
uniform int u_h;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  o = texelFetch(u_tex, ivec2(p.x, u_h - 1 - p.y), 0);
}`;

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
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


// Transform preview: the node's source (straight alpha) times its own mask, sampled through an
// inverse matrix (full-screen pass) or along a warp mesh, written as straight alpha.
const FETCH = `
uniform sampler2D u_src;
uniform sampler2D u_mask;
uniform int u_hasMask;
uniform ivec2 u_srcOff;
uniform ivec2 u_srcSize;
uniform ivec2 u_doc;
uniform int u_interp;
vec4 fetchP(ivec2 d) {
  ivec2 sp = d - u_srcOff;
  if (sp.x < 0 || sp.y < 0 || sp.x >= u_srcSize.x || sp.y >= u_srcSize.y) return vec4(0.0);
  vec4 c = texelFetch(u_src, sp, 0);
  float m = 1.0;
  if (u_hasMask == 1) m = (d.x < 0 || d.y < 0 || d.x >= u_doc.x || d.y >= u_doc.y) ? 0.0 : texelFetch(u_mask, d, 0).r;
  float a = c.a * m;
  return vec4(c.rgb * a, a);
}
vec4 samplePremul(vec2 uv) {
  if (u_interp == 0) return fetchP(ivec2(floor(uv)));
  vec2 f = uv - 0.5;
  vec2 i = floor(f);
  vec2 t = f - i;
  ivec2 b = ivec2(i);
  vec4 c00 = fetchP(b), c10 = fetchP(b + ivec2(1, 0)), c01 = fetchP(b + ivec2(0, 1)), c11 = fetchP(b + ivec2(1, 1));
  return mix(mix(c00, c10, t.x), mix(c01, c11, t.x), t.y);
}
vec4 straight(vec4 p) {
  return p.a <= 0.0 ? vec4(0.0) : vec4(clamp(p.rgb / p.a, 0.0, 1.0), p.a);
}`;

export const FS_XFORM = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform mat3 u_inv;
out vec4 o;
${FETCH}
void main() {
  vec3 q = u_inv * vec3(gl_FragCoord.xy, 1.0);
  if (q.z <= 0.0) { o = vec4(0.0); return; }
  o = straight(samplePremul(q.xy / q.z));
}`;

export const VS_MESH = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_docF;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos / u_docF * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FS_MESH = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;
${FETCH}
void main() {
  o = straight(samplePremul(v_uv));
}`;
