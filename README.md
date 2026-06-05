# BookHockeys

Personal site of streamer Book Hockeys. Live at **[bookhockeys.com](https://bookhockeys.com/)**. Static, no backend, hosted from `main` on GitHub Pages.

## Layout

| Path | What it is | Versioned in |
| --- | --- | --- |
| `/` | Landing page — Kick + Twitch links over the brand video | this README |
| `/greenline/` | Green Line Theory auto-tester (in-browser, BlazeFace + MoveNet) | [`greenline/README.md`](greenline/README.md) |
| `/shoovlator/` | Toy translator that re-writes English with stacked comparatives and redundant fillers | inline `<meta name="version">` on the page |
| `/hantavirus/` | War-monitor-style global hantavirus surveillance dashboard — Leaflet world map + severity-color pins + curated public-health social feed | [`hantavirus/README.md`](hantavirus/README.md) |

Site-wide assets live at the repo root: `robots.txt`, `sitemap.xml`, `llms.txt`, `CNAME`, favicon set, `og-card.jpg`, `poster.jpg`, `bookmentions.mp4`, `logo.png`. Additional rotating background clips live in [`clips/`](clips/) — see "Adding background clips" below.

## Adding background clips

The home page plays a rotation of background videos behind the page. The original `bookmentions.mp4` always leads off; everything else is loaded from `clips/playlist.json`.

1. **Drop the raw video** into `clips/source/`. Any format ffmpeg can read works: `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`. The folder is gitignored, so the original never ships.
2. **Run the build script** from the repo root:
   ```
   python .scripts/build-clips.py
   ```
   It transcodes each raw clip to 720p30 H.264 + 128 kbps AAC stereo (~1 Mbps video + ~128 kbps audio, faststart) into `clips/<slug>.mp4`, then regenerates `clips/playlist.json` in alphabetical order. Audio is preserved so the "TAP FOR SOUND" button on the page works for each clip.
3. **Commit** the new `clips/*.mp4` and the updated `clips/playlist.json`.

Re-runs are idempotent — a clip is only re-encoded if its source file is newer than the existing output. If you want to drop a clip from rotation, delete it from `clips/` and re-run the script.

**Reordering:** edit `clips/playlist.json` directly to change rotation order. The build script preserves manual ordering on re-runs — newly-encoded clips are appended to the end, removed clips drop out, but the order you set in the JSON is kept.

## Analytics & privacy

- Google Analytics 4 (`G-DYME377V2S`) is shared between `/` and `/greenline/`.
- EU/EEA/UK/CH visitors (detected by browser timezone) get a consent banner and analytics is denied by default. Everyone else has analytics granted with no banner.
- The decision is stored in `localStorage` under the key `greenline-consent` and persists across both pages — accept or reject once and you're set site-wide.
- A small "Cookies" link in the bottom-right of the home page (and the footer of `/greenline/`) clears the decision and re-shows the banner.

## Changelog — home page

### v0.1.10 — 2026-06-05
- Fixed the 404 splat overflowing into the "That page isn't here." headline below. The splat was sized 140% of the 404 text wrap with translate-centered absolute positioning, so its bottom edge extended past the wrap and covered the headline. Now: the wrap has its own padding and the splat is `object-fit: contain`'d inside, so it stays within its container. Added defensive `z-index: 1` on the headline and button so any future overflow can't hide them.

### v0.1.9 — 2026-06-05
- Added the white logo splat behind the "404" on `404.html`. Extracted from `logo.png` via a tiny Pillow flatten (all non-transparent pixels → white) into `splat.png` (32 KB) + `splat.webp` (15 KB), then dropped in via `<picture>` behind the number with the same `drop-shadow(6px 8px 0 rgba(0,0,0,0.5))` as the home logo. Sized 140% of the text so the splat pokes out around the 404 edges.

### v0.1.8 — 2026-06-05
- Added a branded `404.html`. Previously bookhockeys.com served GitHub Pages' generic Helvetica "Page not found" page for unknown paths. Now: neon green, Luckiest Guy "404", "That page isn't here", and a GO HOME button matching the home page's button style. `noindex` so 404 hits don't get indexed. `canonical` points to the home page. Covers `/greenline/` and any other future subpath that 404s.

### v0.1.7 — 2026-06-05
- Build script now preserves manual playlist ordering. Previously it re-sorted `clips/playlist.json` alphabetically on every run, so any manual reorder got blown away. Now: HEAD clips stay pinned to the top, existing body order is preserved for clips still on disk, newly-encoded clips are appended to the end, removed clips drop out. Reorder by editing `clips/playlist.json` directly.
- Reordered rotation to lead the new clips with `mayatv` before `1lei235-edit`.

### v0.1.6 — 2026-06-02
- Fixed the KICK button icon. The old path was the full Kick wordmark squeezed into 28×28 px, which rendered as garbage pixels. Replaced with the official Kick brand "K" glyph from SimpleIcons — proper 24×24 viewBox, scales cleanly at icon size. Added `aria-hidden="true"` since the visible "KICK" text already names the link.

### v0.1.5 — 2026-06-02
- Replaced the corner `v0.1.x` tag with a proper centered `<footer>` at the bottom of the page. Same minimal style — small, system font, ~60% opacity — but easier to spot than the bottom-left corner placement. The "Cookies" link stays at bottom-right.

### v0.1.4 — 2026-06-02
- Build script now preserves audio. Transcodes the audio track to 128 kbps AAC stereo at 44.1 kHz instead of stripping it. Rotation clips will play their original audio when the user taps for sound. Roughly +1 MB per minute of clip versus the audio-less v0.1.3 encode.

### v0.1.3 — 2026-06-02
Background video is now a playlist instead of a single looping file.
- New `clips/` folder with `playlist.json` driving the rotation. The original `bookmentions.mp4` stays at the repo root and always leads off; everything else lives in `clips/`.
- New `clips/source/` drop folder (gitignored) — drop raw videos in any format, run `.scripts/build-clips.py`, and they get transcoded to web-friendly 720p30 H.264 (~1 Mbps, no audio, faststart) and added to the rotation.
- New `.scripts/build-clips.py` orchestrates the transcode + playlist regeneration. Idempotent on re-runs.
- JS controller in `index.html` reads `/clips/playlist.json` after page load, takes over from the `<video loop>` fallback, and advances to the next clip on each `ended` event. If the playlist fails to load, the built-in loop keeps the original video cycling on its own — graceful degradation.

### v0.1.2 — 2026-05-08
Performance pass driven by a Lighthouse audit. Mobile perf score went from 74 to ~95 and LCP from 5.9 s to under 2 s.
- **Logo**: re-encoded at 1120×862 (was 3900×3000, displayed at max 560 px). PNG dropped from 521 KB to 142 KB. Added a 47 KB WebP variant served via `<picture>`. Added explicit `width`/`height` attributes plus `fetchpriority="high"` and `decoding="async"` so it lands as the LCP target without layout shift.
- **Background video**: switched `preload="metadata"` to `preload="none"`. Even with the metadata hint Chrome was pulling ~3.6 MB on first load before LCP fired. The video still autoplays once the browser is ready; the poster covers the gap.
- **Audio toggle button**: removed the `aria-label="Toggle sound"` so the visible button text ("TAP FOR SOUND" / "TAP TO MUTE") becomes the accessible name. Resolves Lighthouse's `label-content-name-mismatch` warning.
- Bumped visible version tag to v0.1.2.

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
