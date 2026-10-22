import { defineConfig } from '@playwright/test';

// Smoke tests run against a plain static server of the whole book repo so the
// app is exercised exactly as GitHub Pages serves it: http://127.0.0.1:4173/photochop/
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173/photochop/',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node scripts/static-server.mjs 4173',
    url: 'http://127.0.0.1:4173/photochop/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
