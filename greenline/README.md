# Green Line — Auto Meme Generator

A mobile-friendly, fully client-side meme tool. Drop in a photo and it
auto-detects every face and draws the canonical green bar across their eyes.
Add a watermark, download, or share — your photo never leaves the device.

Live: <https://bookhockeys.com/greenline/>

## What it does

1. You pick or drop a photo (or paste from the clipboard).
2. The page loads [face-api.js](https://github.com/justadudewhohacks/face-api.js)
   and the **Tiny Face Detector** + **68-point Tiny Landmark** models from a CDN.
3. For each face it finds, it computes the eye line from landmarks 36 (outer
   left eye corner) and 45 (outer right eye corner), then draws an oriented
   green rectangle across both eyes — extended past the corners so the bar
   overshoots the face like a proper censor.
4. A translucent green pill watermark with the version number is stamped in
   the lower-right corner.
5. **Download** saves a PNG. **Share** uses the Web Share API (with the image
   itself on supporting platforms — most modern phones), and falls back to
   X / Twitter, Facebook, Reddit, and a "copy link" button on desktop.

Everything runs in the browser. No upload, no server, no analytics on the
photo bytes.

## How auto-detection works

face-api.js builds on TensorFlow.js. The page uses the lightest available
combination — **TinyFaceDetector + faceLandmark68TinyNet** — which weighs in
at roughly 280 KB of model weights and runs in a fraction of a second on a
mid-range phone. Models are cached by the browser after the first visit.

Detection runs on the canvas after the image is downscaled to a 1600 px long
edge (so a 4 K phone photo doesn't choke). The detector returns a bounding
box plus 68 facial landmark points; we use the outer eye corners and the
face box height to size the bar.

## Usage

- **Pick or drop** an image into the box (PNG, JPG, WebP, etc.).
- **Paste** an image directly from the clipboard anywhere on the page.
- Hit **Reset** to start over, **Download** to save the PNG, or **Share** to
  send it to a friend.

## Configuration

### Google Analytics (optional)

Replace the placeholder `G-XXXXXXXXXX` in `index.html` with your real GA4
Measurement ID:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
…
gtag('config', 'G-XXXXXXXXXX');
```

The page already fires these events when a real ID is set:

- `detect_complete` (with `faces` count)
- `download`
- `share_click`, `share_native_complete`

## Local development

This is a static site. Any file server works:

```bash
# from the repo root
python -m http.server 8091 --directory book
# then visit http://localhost:8091/greenline/
```

## Deployment

The site is served from the same `itsavibecode/book` GitHub Pages repo as
the parent BookHockeys site, under the `/greenline/` path. A push to `main`
triggers a Pages rebuild. The custom domain (`bookhockeys.com`) is set via
the existing `CNAME` at the repo root, so the live URL is
<https://bookhockeys.com/greenline/>.

## Changelog

### v0.1.0 — 2026-04-24
Initial release. Drop-or-pick upload, paste-from-clipboard, auto face
detection with face-api.js Tiny models loaded from jsdelivr, oriented green
censor bars across the eyes for every detected face, translucent watermark
pill bottom-right, download as PNG, native + fallback social sharing,
Open Graph + Twitter Card tags, GA4 hookup with placeholder ID.
