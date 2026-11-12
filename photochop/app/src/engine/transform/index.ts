// 3x3 matrix helpers, resampling and warp (0.2.0). src/engine/index.ts re-exports the EngineApi names.
export {
  mat3Apply, mat3FromQuad, mat3Identity, mat3Invert, mat3IsAffine, mat3IsAxisPermutation, mat3MapRect,
  mat3Multiply, mat3Rotate, mat3Scale, mat3Skew, mat3Translate,
} from './mat3';
export { resampleMask, resampleNodeTiles, resampleProjective, resampleTiles } from './resample';
export { evalPatch, identityGrid, warpBuffer, warpGridFor, warpMesh } from './warp';
