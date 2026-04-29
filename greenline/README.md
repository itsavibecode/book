# Green Line — Auto Green Line Theory

A mobile-friendly, fully client-side tool that automates the
[Green Line Theory](https://www.newsweek.com/what-green-line-test-relationship-video-tiktok-1699304) /
"green line test" you've seen on TikTok. Drop in a staged couple photo
and the page draws a green line down each person's body axis (shoulder
midpoint → hip midpoint, extended head-to-toe). Whose line leans toward
their partner — and whose leans away — is the meme.

Live: <https://bookhockeys.com/greenline/>

> **The theory only applies to staged photos.** Per
> [Newsweek](https://www.newsweek.com/what-green-line-test-relationship-video-tiktok-1699304),
> "the green lines just look at the axis' and centre of gravity of each
> person in a photo — but only in staged photos. The green line theory
> can't be applied to candids or photos taken without the couple's
> knowledge."

## What it does

1. You pick or drop a photo (or paste from the clipboard).
2. The page lazy-loads
   [TensorFlow.js](https://www.tensorflow.org/js) and
   [MoveNet MultiPose Lightning](https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md)
   from a CDN — about 9 MB on first visit, browser-cached after.
3. For every person it detects (up to 6), it computes:
   - the shoulder midpoint (between `left_shoulder` and `right_shoulder`),
   - the hip midpoint (between `left_hip` and `right_hip`),
   - and draws a green line through both points, extended ~0.85 body-lengths
     above the shoulders (head) and ~1.7 body-lengths below the hips
     (legs/feet). The canvas clips anything that runs off the edge —
     intentionally, since the manual style often does too.
4. Lines get a black drop-shadow stroke first so they stay visible on
   busy backgrounds.
5. A small, semi-transparent BookHockeys logo is stamped in the
   lower-right corner.
6. **Download** saves a PNG. **Share** uses the Web Share API (with the
   image itself on supporting platforms), and falls back to X / Twitter,
   Facebook, Reddit, and a "copy link" button.

Everything runs in the browser. No upload, no server, no analytics on
the photo bytes.

## How auto-detection works

Pose detection is done with **MoveNet MultiPose Lightning** — a fast,
multi-person 17-keypoint COCO-style model that runs in WebGL via
TensorFlow.js. It returns keypoints (nose, eyes, ears, shoulders,
elbows, wrists, hips, knees, ankles) plus per-keypoint confidence
scores.

We require all four core keypoints (`left_shoulder`, `right_shoulder`,
`left_hip`, `right_hip`) to score at least 0.3 before drawing a line.
That filters out occluded or partial-body subjects rather than guessing
their axis.

The line itself is the geometric line through `shoulder_mid` and
`hip_mid`, extended to head-top and below-feet. This matches the manual
"green line theory" treatment, where lines reveal:

- a line **leaning toward** the partner → that person is leaning in;
- a line **leaning away** → that person is checked out;
- a near-vertical line → balanced.

Detection runs on the canvas after the image is downscaled to a 1600 px
long edge so 4 K phone photos don't choke the GPU.

## Usage

- **Pick or drop** an image into the box (PNG, JPG, WebP, etc.).
- **Paste** an image directly from the clipboard anywhere on the page.
- Hit **Reset** to start over, **Download** to save the PNG, or **Share**
  to send it.

## Configuration

### Google Analytics

Wired to GA4 Measurement ID `G-DYME377V2S` in `index.html`. To swap it,
update both occurrences (the `gtag.js` `src` and the `gtag('config', …)`
call). Events fired:

- `detect_complete` (with `people` count)
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

Served from the same `itsavibecode/book` GitHub Pages repo as the parent
BookHockeys site, under the `/greenline/` path. A push to `main`
triggers a Pages rebuild. The custom domain (`bookhockeys.com`) is set
via the existing root `CNAME`, so the live URL is
<https://bookhockeys.com/greenline/>.

## Changelog

### v0.4.4 — 2026-04-29
**Greenline-specific favicons + PWA manifest.** Before this, the
greenline page was using the parent BookHockeys favicons (its
"splat" logo) for everything except the SVG, so iOS home-screen
pins and Android installs showed the wrong brand. Generated a full
icon set from `favicon.svg`:

- `favicon-16.png`, `favicon-32.png`, `favicon-192.png`
- `apple-touch-icon.png` (180×180, iOS)
- `favicon-512.png` (Android splash + PWA install)
- `favicon.ico` packed with 16/32/48
- `manifest.webmanifest` with name/short_name/scope/icons for PWA install

All wired in the HTML `<head>` with proper `sizes` attributes.
Pinning to iOS or installing on Android now shows the
two-figures-with-axis-lines design that matches the page.

### v0.4.3 — 2026-04-29
**OG image now PNG, not SVG.** Facebook, LinkedIn, WhatsApp, and
iMessage don't render SVG OG images and were dropping the share
preview entirely. Rasterized `og-card.svg` to a 1200×630 PNG and
updated `og:image`, `twitter:image`, the JSON-LD `image` field, and
the sitemap `image:loc` to reference it. Added `og:image:type` and
`og:image:secure_url` for completeness. The SVG is kept around for
hand-editing the design.

### v0.4.2 — 2026-04-27
Consent banner copy now reads "Green Line uses Google Analytics…"
instead of "BookHockeys uses Google Analytics…" so the brand
matches the page the visitor is actually on.

### v0.4.1 — 2026-04-27
**GA4 cookie consent for EU/EEA traffic.** The page now uses
[Google Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent)
with all four consent signals (`ad_storage`, `ad_user_data`,
`ad_personalization`, `analytics_storage`) defaulted to `denied`
before `gtag.js` loads. A small client-side timezone check decides
whether to show a banner: any `Europe/*` timezone (plus EEA outliers
like `Atlantic/Reykjavik` and `Asia/Nicosia`) gets the banner;
everyone else has analytics auto-granted with no UI. Choices are
persisted in `localStorage` under `greenline-consent`. A small
"Cookies" link in the footer reopens the banner so visitors can
revisit their decision.

### v0.4.0 — 2026-04-25
**SEO + AI discoverability + polish.**

- Site-wide additions at the repo root: `robots.txt` (with explicit
  allow lines for `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`,
  `Claude-Web`, `anthropic-ai`, `PerplexityBot`, `Google-Extended`,
  `Applebot-Extended`, `Bytespider`), `sitemap.xml`, and `llms.txt`
  (per the [llmstxt.org](https://llmstxt.org/) spec) so the site is
  legible to both search engines and LLM crawlers.
- New on-page SEO: visually-hidden `<h1>`, expanded `<meta name="keywords">`,
  `<meta name="robots">` with `max-image-preview:large`, FAQ section
  rendered with `FAQPage` schema, and a `WebApplication` JSON-LD block
  for rich-result eligibility.
- Open Graph and Twitter cards refreshed with the v0.4.0 framing
  (`og:image:alt`, `twitter:image:alt`, `og:locale` added).
- Verdict labels on the canvas got bumped from ~26 px to ~36 px on a
  1600 px image — same brutalist pill style, more legible at thumbnail
  size on social previews.
- Header version badge moved to the footer as a small dim
  `v0.4.0` tag — keeps the header clean.
- `logo.svg` subtitle changed from "AUTO-MEME GENERATOR" to
  "MOST CONFIDENT VS LESS DOMINANT" so the page's purpose reads at a
  glance.

### v0.3.0 — 2026-04-25
**Verdict labels.** After axes are drawn, the page now compares each
person's lean angle and stamps a label on the canvas: the straightest
subject is tagged `MOST CONFIDENT` (green), the most-leaning subject is
tagged `LESS DOMINANT` (black/yellow). Footer cleaned up — the text
"BookHockeys / source" links were replaced with a small transparent
BookHockeys logo that links back to the parent site.

### v0.2.0 — 2026-04-25
**Body axis, not eye bar.** Reworked to actually implement the Green
Line Theory: replaced face-api.js eye-corner detection with TensorFlow.js
+ MoveNet MultiPose pose detection, and now draws a vertical green line
through each person's shoulder-mid → hip-mid axis (extended head-to-toe)
instead of a horizontal censor bar across the eyes. Updated favicon, OG
card, and copy throughout to match the actual meme.

### v0.1.1 — 2026-04-24
Watermark switched from a green text pill to a small, semi-transparent
BookHockeys logo (`../logo.png`) in the lower-right — same brand, less
clutter on the meme. Live GA4 Measurement ID wired in.

### v0.1.0 — 2026-04-24
Initial release. Drop-or-pick upload, paste-from-clipboard, auto face
detection with face-api.js Tiny models loaded from jsdelivr, oriented
green censor bars across the eyes for every detected face, translucent
watermark pill bottom-right, download as PNG, native + fallback social
sharing, Open Graph + Twitter Card tags, GA4 hookup with placeholder ID.
