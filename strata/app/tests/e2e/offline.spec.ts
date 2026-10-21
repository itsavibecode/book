import { expect, test } from '@playwright/test';

// The service worker is the "Add to Home Screen, works offline" promise. This test proves it
// with a real browser: first visit installs the worker, the second visit is served by it,
// and a third visit with the network cut off still renders the start screen.
test('service worker serves the app shell offline', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/strata/');
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');

  // Second load: the worker now controls the page and must still fetch the real assets.
  await page.reload();
  await expect(page.getByText('What will you make?')).toBeVisible();
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  expect(controlled).toBe(true);
  const assetStatus = await page.evaluate(async () => {
    const src = [...document.scripts].map((s) => s.src).find((s) => s.includes('/strata/assets/'));
    return src ? (await fetch(src)).status : -1;
  });
  expect(assetStatus).toBe(200);
  // An asset the cache has never seen (a new build after an update) must still come from the network.
  const freshStatus = await page.evaluate(async () => {
    const src = [...document.scripts].map((s) => s.src).find((s) => s.includes('/strata/assets/'));
    return src ? (await fetch(src + '?fresh=1')).status : -1;
  });
  expect(freshStatus).toBe(200);

  // Offline: everything must come from the cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('What will you make?')).toBeVisible();
  await context.setOffline(false);
  await context.close();
});
