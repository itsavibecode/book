import { describe, expect, it } from 'vitest';
import {
  mat3Apply, mat3FromQuad, mat3Identity, mat3Invert, mat3IsAffine, mat3Multiply, mat3Rotate, mat3Scale, mat3Skew, mat3Translate,
  resampleProjective, resampleTiles, warpBuffer, warpGridFor,
} from '@/engine/transform';
import { createTileStore } from '@/engine/tiles';
import { makeImageData } from '@/engine/util';
import type { Mat3, Point } from '@/engine/types';

const close = (a: Point, b: Point, eps = 1e-6) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps);
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps);
};

function image(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4);
  return makeImageData(w, h, d);
}

describe('mat3', () => {
  it('composes, applies and inverts', () => {
    const m = mat3Multiply(mat3Translate(10, 5), mat3Scale(2, 3));
    close(mat3Apply(m, { x: 1, y: 1 }), { x: 12, y: 8 });
    close(mat3Apply(mat3Rotate(90), { x: 1, y: 0 }), { x: 0, y: 1 });
    close(mat3Apply(mat3Rotate(90, 10, 10), { x: 20, y: 10 }), { x: 10, y: 20 });
    close(mat3Apply(mat3Scale(2, 2, 5, 5), { x: 5, y: 5 }), { x: 5, y: 5 });
    close(mat3Apply(mat3Skew(45, 0), { x: 0, y: 2 }), { x: 2, y: 2 });
    const inv = mat3Invert(m)!;
    close(mat3Apply(inv, { x: 12, y: 8 }), { x: 1, y: 1 });
    expect(mat3IsAffine(inv)).toBe(true);
    expect(mat3Invert([1, 2, 0, 2, 4, 0, 0, 0, 1])).toBeNull();
    expect(mat3Identity()).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('builds a projective matrix from a quad and round-trips it through the inverse', () => {
    const rect = { x: 10, y: 20, w: 100, h: 50 };
    const quad: [Point, Point, Point, Point] = [{ x: 5, y: 5 }, { x: 140, y: 20 }, { x: 120, y: 110 }, { x: 15, y: 90 }];
    const m = mat3FromQuad(rect, quad);
    expect(mat3IsAffine(m)).toBe(false);
    close(mat3Apply(m, { x: 10, y: 20 }), quad[0]);
    close(mat3Apply(m, { x: 110, y: 20 }), quad[1]);
    close(mat3Apply(m, { x: 110, y: 70 }), quad[2]);
    close(mat3Apply(m, { x: 10, y: 70 }), quad[3]);
    const inv = mat3Invert(m)!;
    for (const q of quad) {
      const p = mat3Apply(inv, q);
      close(mat3Apply(m, p), q);
    }
    close(mat3Apply(inv, quad[2]), { x: 110, y: 70 });
    // A parallelogram gives an affine matrix.
    expect(mat3IsAffine(mat3FromQuad(rect, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 110, y: 50 }, { x: 10, y: 50 }]))).toBe(true);
  });
});

describe('resampling', () => {
  const grad = image(40, 30, (x, y) => [x * 6, y * 8, 128, 255]);

  it('identity is exact for every interpolation', () => {
    for (const interp of ['nearest', 'bilinear', 'bicubic'] as const) {
      const r = resampleProjective(grad, { x: 3, y: 4 }, mat3Identity(), interp);
      expect([r.x, r.y, r.image.width, r.image.height]).toEqual([3, 4, 40, 30]);
      expect(Array.from(r.image.data)).toEqual(Array.from(grad.data));
    }
  });

  it('rotating a tile store 90 degrees four times is byte-exact', () => {
    const t = createTileStore();
    t.write(image(300, 270, (x, y) => [(x * 7) % 256, (y * 3) % 256, (x * y) % 256, (x + y) % 256]), 5, -7);
    let cur = t;
    for (let i = 0; i < 4; i++) cur = resampleTiles(cur, mat3Rotate(90, 50.5, 40.5), 'bicubic');
    const b = t.bounds()!;
    expect(Array.from(cur.read(b).data)).toEqual(Array.from(t.read(b).data));
  });

  it('scale 2x then 0.5x of a smooth gradient stays within 3/255', () => {
    const smooth = image(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2, 255]);
    for (const interp of ['bilinear', 'bicubic'] as const) {
      const up = resampleProjective(smooth, { x: 0, y: 0 }, mat3Scale(2, 2), interp);
      const down = resampleProjective(up.image, { x: up.x, y: up.y }, mat3Scale(0.5, 0.5), interp);
      let worst = 0;
      // Interior only: the outer pixel blends with transparency outside the image.
      for (let y = 2; y < 62; y++) {
        for (let x = 2; x < 62; x++) {
          for (let c = 0; c < 4; c++) {
            const a = smooth.data[(y * 64 + x) * 4 + c], b = down.image.data[((y - down.y) * down.image.width + x - down.x) * 4 + c];
            worst = Math.max(worst, Math.abs(a - b));
          }
        }
      }
      expect(worst, interp).toBeLessThanOrEqual(3);
    }
  });

  it('premultiplied interpolation leaves no dark fringe around a red disc', () => {
    const disc = image(41, 41, (x, y) => (Math.hypot(x - 20, y - 20) < 15 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    for (const interp of ['bilinear', 'bicubic'] as const) {
      const r = resampleProjective(disc, { x: 0, y: 0 }, mat3Multiply(mat3Rotate(33, 20, 20), mat3Scale(1.37, 1.37, 20, 20)), interp);
      const d = r.image.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        expect(d[i], `red at ${i}`).toBeGreaterThanOrEqual(250);
        expect(d[i + 1]).toBeLessThanOrEqual(2);
      }
    }
  });

  it('a projective map of a rect lands on the quad', () => {
    const solid = image(20, 20, () => [10, 20, 30, 255]);
    const m = mat3FromQuad({ x: 0, y: 0, w: 20, h: 20 }, [{ x: 10, y: 10 }, { x: 50, y: 12 }, { x: 45, y: 40 }, { x: 12, y: 35 }]);
    const r = resampleProjective(solid, { x: 0, y: 0 }, m, 'bilinear');
    const at = (x: number, y: number) => r.image.data[((y - r.y) * r.image.width + (x - r.x)) * 4 + 3];
    expect(at(30, 25)).toBe(255);
    expect(at(11, 38)).toBe(0);
  });
});

describe('warp', () => {
  it("'none' is the identity", () => {
    const img = image(50, 40, (x, y) => [x * 5, y * 6, 77, 200]);
    const rect = { x: 10, y: 20, w: 50, h: 40 };
    for (const interp of ['nearest', 'bilinear'] as const) {
      const out = warpBuffer({ data: img.data, w: 50, h: 40, x: 10, y: 20, ch: 4 }, rect, warpGridFor(rect, 'none', 50), interp)!;
      let diff = 0;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 50; x++) {
          for (let c = 0; c < 4; c++) {
            const a = img.data[(y * 50 + x) * 4 + c];
            const b = out.data[((y + 20 - out.rect.y) * out.rect.w + (x + 10 - out.rect.x)) * 4 + c];
            diff = Math.max(diff, Math.abs(a - b));
          }
        }
      }
      expect(diff, interp).toBe(0);
    }
  });

  it('presets move the grid and bend 0 is the identity', () => {
    const r = { x: 0, y: 0, w: 90, h: 60 };
    const id = warpGridFor(r, 'none', 0);
    for (const p of ['arc', 'arch', 'bulge', 'flag', 'wave', 'fisheye', 'squeeze'] as const) {
      expect(warpGridFor(r, p, 0)).toEqual(id);
      expect(warpGridFor(r, p, 60)).not.toEqual(id);
      expect(warpGridFor(r, p, 60).points.length).toBe(16);
    }
  });
});

export const _unused: Mat3 | null = null;
