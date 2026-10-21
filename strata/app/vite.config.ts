import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

// Two builds share this file:
//   vite build                -> ../ (book/strata/ itself; GitHub Pages serves it at /strata/)
//   vite build --mode single  -> dist-single/index.html, copied to ../strata.html by scripts/postbuild.mjs
// Vitest projects:
//   unit    : pure engine code (tiles, history, serialisation) in Node with fake-indexeddb
//   browser : real Chromium via Playwright for WebGL2 / Canvas2D (compositor parity, brush, io)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: '/strata/',
    plugins: [preact(), ...(single ? [viteSingleFile()] : [])],
    resolve: { alias: { '@': path.resolve(root, 'src') } },
    publicDir: single ? false : 'public',
    build: single
      ? { outDir: 'dist-single', emptyOutDir: true, target: 'es2022' }
      : { outDir: '..', emptyOutDir: false, assetsDir: 'assets', target: 'es2022', sourcemap: false },
    server: { port: 5173, strictPort: false },
    optimizeDeps: { include: ['fflate'] },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['tests/unit/**/*.test.ts'],
            setupFiles: ['tests/unit/setup.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['tests/browser/**/*.test.ts'],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  };
});
