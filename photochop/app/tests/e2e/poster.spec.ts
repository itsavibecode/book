// Acceptance for 0.1.0 (PLAN.md section 7): the poster from design-preview.html can be built from
// scratch through the real UI, closed, reopened from Recent, recovered after a reload, saved as a
// .photochop project, reopened from that file, and exported as a PNG of the right size.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type RGBA = [number, number, number, number];

// Local view of the window.__photochop test hook (the smoke test declares its own global).
type Hook = {
  activeDoc(): { activeId: string | null; nodeBounds(id: string): { x: number; y: number; w: number; h: number } | null } | null;
  samplePixel(x: number, y: number): RGBA | null;
  docToScreen(x: number, y: number): { x: number; y: number } | null;
  flush(): Promise<void>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true, writable: true });
  });
});

async function screenOf(page: Page, x: number, y: number) {
  const p = await page.evaluate(([dx, dy]) => (window as unknown as { __photochop: Hook }).__photochop.docToScreen(dx, dy), [x, y] as const);
  if (!p) throw new Error('viewport not ready');
  return p;
}

async function sample(page: Page, x: number, y: number): Promise<RGBA> {
  const px = await page.evaluate(([dx, dy]) => (window as unknown as { __photochop: Hook }).__photochop.samplePixel(dx, dy), [x, y] as const);
  if (!px) throw new Error(`no pixel at ${x},${y}`);
  return px;
}

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  const a = await screenOf(page, x1, y1);
  const b = await screenOf(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

/** Types a hex colour into the colour popover opened by `opener`, then closes it. */
async function pickColour(page: Page, opener: () => Promise<void>, hex: string) {
  await opener();
  const field = page.getByTestId('colour-hex');
  await expect(field).toBeFocused();
  await page.keyboard.type(hex);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('colour-popover')).toHaveCount(0);
}

const foreground = (page: Page, hex: string) => pickColour(page, () => page.getByTestId('swatch-fg').click(), hex);

async function tool(page: Page, key: string) {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press(key);
}

async function layerNames(page: Page) {
  return page.locator('[data-testid="layer-row"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-layer-name') ?? ''));
}

function near(px: RGBA, rgb: [number, number, number], tol = 24) {
  return Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
}

test('the poster can be built, closed, recovered, saved, reopened and exported', async ({ page }, testInfo) => {
  await page.goto('?test=1');
  await page.getByTestId('template-Poster').click();
  await expect(page.getByTestId('editor')).toBeVisible();

  await test.step('fill the background navy', async () => {
    await foreground(page, '0e1726');
    await tool(page, 'g');
    const c = await screenOf(page, 360, 225);
    await page.mouse.click(c.x, c.y);
    expect(near(await sample(page, 10, 10), [14, 23, 38])).toBe(true);
  });

  await test.step('sun: orange ellipse', async () => {
    await foreground(page, 'ff9d2e');
    await tool(page, 'u');
    await page.keyboard.press('Shift+u'); // Rectangle -> Ellipse
    await drag(page, 520, 60, 670, 210);
    expect(near(await sample(page, 595, 135), [255, 157, 46])).toBe(true);
  });

  await test.step('changing the foreground never recolours an existing layer', async () => {
    await foreground(page, '0e1726');
    expect(near(await sample(page, 595, 100), [255, 157, 46])).toBe(true);
  });

  await test.step('stripes: three navy rectangles over the sun', async () => {
    await page.keyboard.press('Shift+u'); // Ellipse -> Rectangle
    await drag(page, 505, 145, 685, 152);
    await drag(page, 505, 165, 685, 172);
    await drag(page, 505, 185, 685, 192);
    expect(near(await sample(page, 595, 148), [14, 23, 38])).toBe(true);
    expect(near(await sample(page, 595, 158), [255, 157, 46])).toBe(true);
  });

  await test.step('hills: two ellipses, the near one recoloured through the Inspector', async () => {
    await foreground(page, '121c33');
    await page.keyboard.press('Shift+u'); // -> Ellipse
    await drag(page, 230, 330, 719, 449);
    await drag(page, 0, 350, 480, 449);
    await pickColour(page, () => page.getByTestId('insp-fill-colour').click(), '0b1120');
    expect(near(await sample(page, 240, 420), [11, 17, 32])).toBe(true);
    expect(near(await sample(page, 650, 400), [18, 28, 51])).toBe(true);
  });

  await test.step('headline text, recoloured white through the Inspector', async () => {
    await tool(page, 't');
    const p = await screenOf(page, 50, 60);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('text-editor')).toBeFocused();
    await page.keyboard.type('SATURDAY');
    await page.keyboard.press('Enter');
    await page.keyboard.type('NIGHT');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="layer-row"][data-layer-type="text"]')).toHaveCount(1);
    await pickColour(page, () => page.getByTestId('insp-text-colour').click(), 'ffffff');
    const white = await page.evaluate(() => {
      const d = (window as unknown as { __photochop: Hook }).__photochop.activeDoc();
      const b = d && d.activeId ? d.nodeBounds(d.activeId) : null;
      if (!b) return 0;
      let n = 0;
      for (let y = b.y; y < b.y + b.h; y += 4) for (let x = b.x; x < b.x + b.w; x += 4) {
        const px = (window as unknown as { __photochop: Hook }).__photochop.samplePixel(x, y);
        if (px && px[0] > 240 && px[1] > 240 && px[2] > 240) n++;
      }
      return n;
    });
    expect(white).toBeGreaterThan(20);
  });

  await test.step('chip: rounded yellow rectangle with its own label', async () => {
    await foreground(page, 'ffe08a');
    await tool(page, 'u'); // reselects the group's last member (Ellipse)
    if (!(await page.getByTestId('ctx-corners').isVisible())) await page.keyboard.press('Shift+u');
    await page.getByTestId('ctx-corners').fill('20');
    await page.getByTestId('ctx-corners').press('Enter');
    await drag(page, 46, 370, 230, 414);
    expect(near(await sample(page, 138, 392), [255, 224, 138])).toBe(true);
    await foreground(page, '3a2200');
    await tool(page, 't');
    const p = await screenOf(page, 60, 380);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('text-editor')).toBeFocused();
    await page.keyboard.type('FREE ENTRY');
    await page.keyboard.press('Escape');
    expect(await layerNames(page)).toHaveLength(10);
  });

  const names = await layerNames(page);
  const pngPath = testInfo.outputPath('Poster.png');
  const projectPath = testInfo.outputPath('Poster.photochop');

  await test.step('export a 720 x 450 PNG', async () => {
    await tool(page, 'Control+e');
    await page.getByTestId('fmt-png').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
    await download.saveAs(pngPath);
    const bytes = fs.readFileSync(pngPath);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(720);
    expect(bytes.readUInt32BE(20)).toBe(450);
  });

  await test.step('save the project as .photochop', async () => {
    await page.getByTestId('canvas').focus();
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
    expect(download.suggestedFilename()).toMatch(/\.photochop$/);
    await download.saveAs(projectPath);
  });

  await test.step('close through the palette, reopen from Recent', async () => {
    await page.evaluate(() => (window as unknown as { __photochop: Hook }).__photochop.flush());
    await tool(page, 'Control+k');
    await expect(page.getByTestId('palette-input')).toBeFocused();
    await page.keyboard.type('close document');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    const card = page.getByTestId('recent-card').filter({ hasText: 'Poster' });
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect.poll(() => layerNames(page)).toEqual(names);
    expect(near(await sample(page, 595, 100), [255, 157, 46])).toBe(true);
  });

  await test.step('a reload recovers the document', async () => {
    await page.evaluate(() => (window as unknown as { __photochop: Hook }).__photochop.flush());
    await page.reload();
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect.poll(() => layerNames(page)).toEqual(names);
    expect(near(await sample(page, 240, 420), [11, 17, 32])).toBe(true);
  });

  await test.step('the .photochop file reopens with every layer and pixel', async () => {
    await page.getByTestId('canvas').focus();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')]);
    await chooser.setFiles(projectPath);
    await expect(page.getByTestId('doc-tab')).toHaveCount(2);
    await expect.poll(() => layerNames(page)).toEqual(names);
    expect(near(await sample(page, 595, 100), [255, 157, 46])).toBe(true);
    expect(near(await sample(page, 138, 392), [255, 224, 138])).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('poster-reopened.png') });
  });
});
