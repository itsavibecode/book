# BookHockeys

Personal site of streamer Book Hockeys. Live at **[bookhockeys.com](https://bookhockeys.com/)**. Static, no backend, hosted from `main` on GitHub Pages.

## Layout

| Path | What it is | Versioned in |
| --- | --- | --- |
| `/` | Landing page — Kick + Twitch links over the brand video | this README |
| `/greenline/` | Green Line Theory auto-tester (in-browser, BlazeFace + MoveNet) | [`greenline/README.md`](greenline/README.md) |
| `/shoovlator/` | Toy translator that re-writes English with stacked comparatives and redundant fillers | inline `<meta name="version">` on the page |

Site-wide assets live at the repo root: `robots.txt`, `sitemap.xml`, `llms.txt`, `CNAME`, favicon set, `og-card.jpg`, `poster.jpg`, `bookmentions.mp4`, `logo.png`.

## Analytics & privacy

- Google Analytics 4 (`G-DYME377V2S`) is shared between `/` and `/greenline/`.
- EU/EEA/UK/CH visitors (detected by browser timezone) get a consent banner and analytics is denied by default. Everyone else has analytics granted with no banner.
- The decision is stored in `localStorage` under the key `greenline-consent` and persists across both pages — accept or reject once and you're set site-wide.
- A small "Cookies" link in the bottom-right of the home page (and the footer of `/greenline/`) clears the decision and re-shows the banner.

## Changelog — home page

### v0.1.1 — 2026-04-28
- Added a small `v0.1.1` tag in the bottom-left corner of the page (mirrors the "Cookies" link on the right). Same understated style — system font, 55% opacity — so it doesn't fight the brand.

### v0.1.0 — 2026-04-27
First proper release of the landing page. Brings it up to the same baseline `/greenline/` already had:

- Added `<meta name="description">`, `theme-color`, `canonical`, `robots`, Open Graph and Twitter card meta.
- Added JSON-LD `WebSite` + `Person` with `sameAs` pointers to Kick and Twitch.
- Generated `og-card.jpg` (1200×630) — the splat logo on the neon green background — for share previews.
- Wired up Google Consent Mode v2 + GA4. Consent decision is shared site-wide via the `greenline-consent` localStorage key.
- Re-muxed `bookmentions.mp4` with `+faststart` (no re-encoding). The metadata atom moved from 98.6% to 0% of the file, so browsers can begin playback almost immediately instead of pulling the full 19 MB first.
- Switched the background `<video>` to `preload="metadata"` + `poster="poster.jpg"` so mobile sees a still frame instead of hammering data on first load.
- Added a `prefers-reduced-motion` opt-out for the muted-button pulse animation.

The `/greenline/` subproject is versioned independently — see [`greenline/README.md`](greenline/README.md) for its changelog.
