import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(fileURLToPath(import.meta.url));

// Read APP_NAME / APP_VERSION from the one constants file so the static HTML carries the
// semver title and app-version meta for crawlers (src/app/head.ts sets the same at runtime).
const constants = fs.readFileSync(path.join(root, 'src', 'app', 'constants.ts'), 'utf8');
const APP_NAME = /APP_NAME\s*=\s*'([^']+)'/.exec(constants)?.[1] ?? 'PhotoChop';
const APP_VERSION = /APP_VERSION\s*=\s*'([^']+)'/.exec(constants)?.[1] ?? '0.0.0';
const versionHtml = () => ({
  name: 'photochop-version-html',
  transformIndexHtml(html: string) {
    return html
      .replace(/<title>[^<]*<\/title>/, `<title>${APP_NAME} v${APP_VERSION}</title>`)
      .replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${APP_VERSION}">`);
  },
});

// Two builds share this file:
//   vite build                -> ../ (book/photochop/ itself; GitHub Pages serves it at /photochop/)
//   vite build --mode single  -> dist-single/index.html, copied to ../photochop.html by scripts/postbuild.mjs
// Vitest projects:
//   unit    : pure engine code (tiles, history, serialisation) in Node with fake-indexeddb
//   browser : real Chromium via Playwright for WebGL2 / Canvas2D (compositor parity, brush, io)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: '/photochop/',
    plugins: [preact(), versionHtml(), ...(single ? [viteSingleFile()] : [])],
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
