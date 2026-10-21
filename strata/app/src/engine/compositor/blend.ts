// Blend-mode math: the reference implementation for the CPU compositor and the GLSL source for
// the GL one. Both use the W3C compositing formula on straight-alpha inputs:
//   ao = as + ab (1 - as)
//   co = Cs as (1 - ab) + as ab B(Cb, Cs) + Cb ab (1 - as)      (premultiplied)
//   Co = co / ao                                                 (stored straight)
// Keep the JS and GLSL versions in step; the parity test compares them.
import type { BlendMode } from '../types';

export const BLEND_INDEX: Partial<Record<BlendMode, number>> = {
  'normal': 0, 'darken': 1, 'multiply': 2, 'lighten': 3, 'screen': 4,
  'overlay': 5, 'soft-light': 6, 'hard-light': 7, 'difference': 8, 'exclusion': 9,
};

/** Unimplemented modes render as normal. */
export function blendIndex(mode: BlendMode): number {
  return BLEND_INDEX[mode] ?? 0;
}

export function blendChannel(m: number, b: number, s: number): number {
  switch (m) {
    case 1: return b < s ? b : s;
    case 2: return b * s;
    case 3: return b > s ? b : s;
    case 4: return b + s - b * s;
    case 5: return b <= 0.5 ? s * 2 * b : s + (2 * b - 1) - s * (2 * b - 1);
    case 6: {
      if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      return b + (2 * s - 1) * (d - b);
    }
    case 7: return s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1);
    case 8: return Math.abs(b - s);
    case 9: return b + s - 2 * b * s;
    default: return s;
  }
}

/**
 * Blends a straight-alpha source colour (0..1 channels, sa already multiplied by opacity and mask)
 * over the straight-alpha pixel at d[i]. Writes the result back in place.
 */
export function blendPixel(d: Uint8ClampedArray, i: number, sr: number, sg: number, sb: number, sa: number, m: number): void {
  const ba = d[i + 3] / 255;
  if (ba === 0 || (sa === 1 && m === 0)) {
    // Both cases reduce to the source exactly; skip the division.
    d[i] = sr * 255; d[i + 1] = sg * 255; d[i + 2] = sb * 255; d[i + 3] = sa * 255;
    return;
  }
  const br = d[i] / 255, bg = d[i + 1] / 255, bb = d[i + 2] / 255;
  const ao = sa + ba * (1 - sa);
  const k = ba * (1 - sa);
  let r: number, g: number, b: number;
  if (m === 0) {
    r = sr * sa + br * k;
    g = sg * sa + bg * k;
    b = sb * sa + bb * k;
  } else {
    const s1 = sa * (1 - ba), s2 = sa * ba;
    r = sr * s1 + s2 * blendChannel(m, br, sr) + br * k;
    g = sg * s1 + s2 * blendChannel(m, bg, sg) + bg * k;
    b = sb * s1 + s2 * blendChannel(m, bb, sb) + bb * k;
  }
  const inv = 255 / ao;
  d[i] = r * inv; d[i + 1] = g * inv; d[i + 2] = b * inv; d[i + 3] = ao * 255;
}

export const GLSL_BLEND = /* glsl */ `
float blendCh(int m, float b, float s) {
  if (m == 1) return min(b, s);
  if (m == 2) return b * s;
  if (m == 3) return max(b, s);
  if (m == 4) return b + s - b * s;
  if (m == 5) return b <= 0.5 ? s * 2.0 * b : s + (2.0 * b - 1.0) - s * (2.0 * b - 1.0);
  if (m == 6) {
    if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
    float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
    return b + (2.0 * s - 1.0) * (d - b);
  }
  if (m == 7) return s <= 0.5 ? b * 2.0 * s : b + (2.0 * s - 1.0) - b * (2.0 * s - 1.0);
  if (m == 8) return abs(b - s);
  if (m == 9) return b + s - 2.0 * b * s;
  return s;
}

vec4 blendPixel(vec4 back, vec3 s, float sa, int m) {
  float ba = back.a;
  if (ba == 0.0 || (sa == 1.0 && m == 0)) return vec4(s, sa);
  float ao = sa + ba * (1.0 - sa);
  float k = ba * (1.0 - sa);
  vec3 c;
  if (m == 0) {
    c = s * sa + back.rgb * k;
  } else {
    float s1 = sa * (1.0 - ba);
    float s2 = sa * ba;
    vec3 B = vec3(blendCh(m, back.r, s.r), blendCh(m, back.g, s.g), blendCh(m, back.b, s.b));
    c = s * s1 + s2 * B + back.rgb * k;
  }
  return vec4(c / ao, ao);
}
`;
