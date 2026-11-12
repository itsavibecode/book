// Selection building and modification (0.2.0). Signatures follow EngineApi in contract.ts;
// src/engine/index.ts re-exports these names.
export { polygonMask } from './polygon';
export { magicWand, growSelection, similarSelection } from './wand';
export { createQuickSelect } from './quick';
export { createMagneticLasso } from './magnetic';
export { colorRange } from './colorrange';
export { featherMask, expandMask, contractMask, smoothMask, borderMask } from './modify';
export { refineMask } from './refine';
export { transformMask } from './transform';
