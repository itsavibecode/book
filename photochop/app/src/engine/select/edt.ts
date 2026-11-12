// Exact Euclidean distance transform with nearest-feature indices (Felzenszwalb and
// Huttenlocher): one 1D pass down the columns, then the lower envelope of parabolas along rows.
// O(N) whatever the distance, which keeps expand / contract / refine independent of the radius.

export const EDT_INF = 1e20;

export interface DistanceField {
  w: number;
  h: number;
  /** Squared distance from each pixel centre to the nearest set pixel centre (EDT_INF when the set is empty). */
  d2: Float32Array;
  /** Index (y * w + x) of that nearest set pixel, -1 when none. */
  feat: Int32Array;
}

/** inSet: 1 for feature pixels, 0 otherwise, row-major w x h. */
export function distanceField(inSet: Uint8Array, w: number, h: number): DistanceField {
  const n = w * h;
  const colD = new Float64Array(n);
  const colArg = new Int32Array(n);
  // Columns: nearest set row above and below, two sweeps.
  for (let x = 0; x < w; x++) {
    let last = -1;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (inSet[i]) last = y;
      colArg[i] = last;
      colD[i] = last < 0 ? EDT_INF : (y - last) * (y - last);
    }
    last = -1;
    for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x;
      if (inSet[i]) last = y;
      if (last >= 0) {
        const d = (last - y) * (last - y);
        if (d < colD[i]) { colD[i] = d; colArg[i] = last; }
      }
    }
  }
  const d2 = new Float32Array(n);
  const feat = new Int32Array(n);
  const v = new Int32Array(w);
  const z = new Float64Array(w + 1);
  const g = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) g[x] = colD[row + x];
    let k = -1;
    for (let q = 0; q < w; q++) {
      const gq = g[q];
      if (gq >= EDT_INF) continue;
      if (k < 0) {
        k = 0; v[0] = q; z[0] = -Infinity; z[1] = Infinity;
        continue;
      }
      const fq = gq + q * q;
      for (;;) {
        const p = v[k];
        const s = (fq - (g[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) { k--; continue; }
        if (s <= z[k]) {
          // k === 0 and z[0] is -Infinity: unreachable, kept for safety.
          v[0] = q; z[1] = Infinity;
          break;
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
        break;
      }
    }
    if (k < 0) {
      for (let x = 0; x < w; x++) { d2[row + x] = EDT_INF; feat[row + x] = -1; }
      continue;
    }
    let j = 0;
    for (let x = 0; x < w; x++) {
      while (z[j + 1] < x) j++;
      const p = v[j];
      d2[row + x] = (x - p) * (x - p) + g[p];
      feat[row + x] = colArg[row + p] * w + p;
    }
  }
  return { w, h, d2, feat };
}
