import type { CompositorLike } from '../contract';
import { AutoCompositor } from './auto';
import { CpuCompositor } from './cpu';
import { GlCompositor } from './gl';

/**
 * 'auto' returns a wrapper that uses WebGL2 while it can and falls back to the CPU (at creation,
 * on oversized documents or layers, on context loss, on any GL error), keeping one stable canvas.
 * 'gl' throws when WebGL2 is unavailable; 'cpu' is the CPU compositor alone.
 */
export function createCompositor(prefer: 'auto' | 'gl' | 'cpu' = 'auto'): CompositorLike {
  if (prefer === 'gl') return new GlCompositor();
  if (prefer === 'cpu') return new CpuCompositor();
  return new AutoCompositor();
}

export { AutoCompositor } from './auto';
export { CpuCompositor } from './cpu';
export { GlCompositor } from './gl';
