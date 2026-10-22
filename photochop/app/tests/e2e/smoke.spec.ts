// Shell smoke test against the BUILT app (run `npm run build` first; playwright.config.ts
// serves the book repo at http://127.0.0.1:4173/photochop/).
// The app always installs window.__photochop (see src/app/testhook.ts); ?test=1 only skips the
// service worker so reloads hit fresh files.
import { expect, test, type Page } from '@playwright/test';

type RGBA = [number, number, number, number];

declare global {
  interface Window {
    __photochop: {
      activeDoc(): { activeNode(): { type: string; tiles?: { size: number } } | undefined; name: string } | null;
      samplePixel(x: number, y: number): RGBA | null;
      docToScreen(x: number, y: number): { x: number; y: number } | null;
      flush(): Promise<void>;
    };
  }
}

test.beforeEach(async ({ page }) => {
  // Force the plain-download path of io.saveAs so Playwright sees a download event.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true, writable: true });
  });
});

async function screenOf(page: Page, x: number, y: number) {
  const p = await page.evaluate(([dx, dy]) => window.__photochop.docToScreen(dx, dy), [x, y] as const);
  if (!p) throw new Error('viewport not ready');
  return p;
}

async function sample(page: Page, x: number, y: number): Promise<RGBA | null> {
  return page.evaluate(([dx, dy]) => window.__photochop.samplePixel(dx, dy), [x, y] as const);
}

test('start screen, paint, text, export, save and open, recovery', async ({ page }, testInfo) => {
  await test.step('start screen renders with versioned title and templates', async () => {
    await page.goto('?test=1');
    await expect(page).toHaveTitle(/PhotoChop v0\.1\.0/);
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(page.getByTestId('template-grid')).toBeVisible();
    await expect(page.getByTestId('template-Poster')).toBeVisible();
  });

  await test.step('Poster template opens the editor with a Background layer', async () => {
    await page.getByTestId('template-Poster').click();
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('doc-tab').first()).toContainText('Poster');
    await expect(page.locator('[data-testid="layer-row"][data-layer-name="Background"]')).toBeVisible();
  });

  await test.step('brush paints pixels on the active layer', async () => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('b');
    await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');
    const a = await screenOf(page, 100, 100);
    const b = await screenOf(page, 400, 100);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y, { steps: 2 });
    await page.mouse.up();
    const tiles = await page.evaluate(() => window.__photochop.activeDoc()?.activeNode()?.tiles?.size ?? 0);
    expect(tiles).toBeGreaterThan(0);
    const px = await sample(page, 250, 100);
    expect(px).not.toBeNull();
    expect(px![0]).toBeLessThan(128);
  });

  await test.step('text tool creates a text layer', async () => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('t');
    const p = await screenOf(page, 120, 300);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('text-editor')).toBeFocused();
    await page.keyboard.type('Saturday Night');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-editor')).toHaveCount(0);
    await expect(page.locator('[data-testid="layer-row"][data-layer-type="text"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="layer-row"][data-layer-type="text"]')).toHaveAttribute('data-layer-name', 'Saturday Night');
  });

  await test.step('Ctrl E exports a PNG download', async () => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-sheet')).toBeVisible();
    await page.getByTestId('fmt-png').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-go').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    await expect(page.getByTestId('export-sheet')).toHaveCount(0);
  });

  const projectPath = testInfo.outputPath('Poster.photochop');
  let layerNames: string[] = [];

  await test.step('Save project downloads a .photochop file', async () => {
    layerNames = await page.locator('[data-testid="layer-row"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-layer-name') ?? ''));
    await page.getByTestId('canvas').focus();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.photochop$/);
    await download.saveAs(projectPath);
  });

  await test.step('opening the saved project adds a second tab with the same layers', async () => {
    await page.getByTestId('canvas').focus();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('Control+o'),
    ]);
    await chooser.setFiles(projectPath);
    await expect(page.getByTestId('doc-tab')).toHaveCount(2);
    await expect(page.getByTestId('doc-tab').nth(1)).toHaveClass(/\bon\b/);
    await expect.poll(() => page.locator('[data-testid="layer-row"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-layer-name') ?? '')))
      .toEqual(layerNames);
    await page.getByTestId('doc-tab').first().click();
  });

  await test.step('reload recovers the document', async () => {
    await page.evaluate(() => window.__photochop.flush());
    await page.reload();
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('doc-tab').first()).toContainText('Poster');
    await expect(page.locator('[data-testid="layer-row"][data-layer-type="text"]')).toHaveCount(1);
    await expect.poll(async () => (await sample(page, 250, 100))?.[0] ?? 255).toBeLessThan(128);
  });

  await test.step('desktop editor at 1280 x 800 with the Brush has no clipped or scrolling element', async () => {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('b');
    await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(100);
    const offenders = await page.evaluate(() => {
      // Lists that are meant to scroll (or to hold many tabs) are excluded.
      const allowed = '.layer-list, .pal-list, .doctabs, .mm-items';
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('[data-testid="editor"] *')) as HTMLElement[]) {
        if (el.closest(allowed)) continue;
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          out.push(`${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`);
        }
      }
      return out;
    });
    expect(offenders).toEqual([]);
  });
});

test('compact layout at phone width has a dock and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('?test=1');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByTestId('template-Poster').click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('dock')).toBeVisible();
  await expect(page.getByTestId('sheet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth)).toBe(true);
});
