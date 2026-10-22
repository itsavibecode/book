import type { CompositorLike } from '../contract';
import { CpuCompositor } from './cpu';
import { GlCompositor } from './gl';

/** 'auto' tries WebGL2 and falls back to the CPU; 'gl' throws when WebGL2 is unavailable. */
export function createCompositor(prefer: 'auto' | 'gl' | 'cpu' = 'auto'): CompositorLike {
  if (prefer !== 'cpu') {
    try {
      return new GlCompositor();
    } catch (err) {
      if (prefer === 'gl') throw err;
    }
  }
  return new CpuCompositor();
}

export { CpuCompositor } from './cpu';
export { GlCompositor } from './gl';
