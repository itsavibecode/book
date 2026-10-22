// Renders the share and install images from HTML with headless Chromium (no native image libs):
//   public/og.png (1200x630), public/apple-touch-icon.png (180), public/icons/icon-192.png, icon-512.png (maskable-safe).
// Run: npm run assets   (then vite build copies public/ into book/photochop/)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '..', 'public');
const constants = fs.readFileSync(path.resolve(here, '..', 'src', 'app', 'constants.ts'), 'utf8');
const APP_VERSION = /APP_VERSION\s*=\s*'([^']+)'/.exec(constants)[1];
const APP_NAME = /APP_NAME\s*=\s*'([^']+)'/.exec(constants)[1];
const TAGLINE = /APP_TAGLINE\s*=\s*'([^']+)'/.exec(constants)[1];
fs.mkdirSync(path.join(pub, 'icons'), { recursive: true });

const mark = (size) => `
  <div style="position:relative;width:${size}px;height:${size}px;border-radius:${size * 0.22}px;background:#202024;flex:none">
    <div style="position:absolute;left:${size * .22}px;right:${size * .22}px;top:${size * .265}px;height:${size * .11}px;border-radius:${size * .055}px;background:#4c8dff"></div>
    <div style="position:absolute;left:${size * .22}px;right:${size * .22}px;top:${size * .445}px;height:${size * .11}px;border-radius:${size * .055}px;background:#ececf0;opacity:.85"></div>
    <div style="position:absolute;left:${size * .22}px;right:${size * .22}px;top:${size * .625}px;height:${size * .11}px;border-radius:${size * .055}px;background:#ececf0;opacity:.45"></div>
  </div>`;

const base = `<style>*{box-sizing:border-box}html,body{margin:0}body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}</style>`;

// OG card: graphite shell with the mark, name, tagline and a stylised layer stack on the right.
const og = `${base}<body style="width:1200px;height:630px;background:#19191c;color:#ececf0;display:flex;align-items:center;padding:0 88px;gap:72px;overflow:hidden">
  <div style="flex:1">
    <div style="display:flex;align-items:center;gap:28px">${mark(104)}<div style="font-size:96px;font-weight:800;letter-spacing:-2px">${APP_NAME}</div></div>
    <div style="margin-top:34px;font-size:36px;line-height:1.3;color:#9b9ba6;max-width:600px">${TAGLINE}</div>
    <div style="margin-top:40px;display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border:2px solid #313137;border-radius:999px;font-size:24px;color:#9b9ba6"><span style="width:14px;height:14px;border-radius:50%;background:#35c26f"></span>On device</div>
  </div>
  <div style="position:relative;width:380px;height:420px;flex:none">
    ${[0, 1, 2, 3].map((i) => `<div style="position:absolute;left:${i * 26}px;top:${i * 44}px;width:300px;height:230px;border-radius:12px;background:${['#3b2a6b', '#d6336c', '#ff7a18', '#ffe08a'][i]};opacity:${0.55 + i * 0.15};box-shadow:0 20px 50px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08)"></div>`).join('')}
    <div style="position:absolute;left:92px;top:210px;width:300px;height:92px;border:3px dashed rgba(255,255,255,.9);outline:3px dashed rgba(0,0,0,.5);outline-offset:-3px"></div>
  </div>
</body>`;

const icon = (size, pad) => `${base}<body style="width:${size}px;height:${size}px;background:#202024;display:grid;place-items:center">${mark(size - pad * 2).replace('border-radius', 'xborder-radius')}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const shot = async (html, w, h, file) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: false });
  console.log('wrote', path.relative(pub, file));
};
await shot(og, 1200, 630, path.join(pub, 'og.png'));
await shot(icon(180, 0), 180, 180, path.join(pub, 'apple-touch-icon.png'));
await shot(icon(192, 16), 192, 192, path.join(pub, 'icons', 'icon-192.png'));
await shot(icon(512, 44), 512, 512, path.join(pub, 'icons', 'icon-512.png'));
await browser.close();
console.log(`assets for ${APP_NAME} v${APP_VERSION}`);
