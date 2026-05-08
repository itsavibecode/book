# Hantavirus Monitor

Live global hantavirus surveillance dashboard. Live at **[bookhockeys.com/hantavirus](https://bookhockeys.com/hantavirus/)**.

A single-file static SPA in the war-monitor / live-ops genre. Dark theme, Leaflet world map, left-rail event feed with severity badges, scrolling LIVE ticker with adjustable speed, 16-month timeline strip, and a SOCIAL tab that embeds curated tweets from authoritative public-health accounts. No backend; no upload of user content; no signup.

## What it tracks

- **HPS** — Hantavirus Pulmonary Syndrome (Sin Nombre, Choclo, Andes virus).
- **HFRS** — Hemorrhagic Fever with Renal Syndrome (Hantaan, Puumala, Seoul).
- **Andes virus** clusters (the only hantavirus with documented person-to-person transmission).
- Environmental advisories (e.g. NPS rodent-presence alerts).

## Severity model

| Tier | Meaning |
| --- | --- |
| `S1` | Confirmed case, recovered |
| `S2` | Confirmed case, hospitalised or active |
| `S3` | Death, or cluster of three or more linked cases |

Map pins, feed cards, and timeline dots all colour-code to severity (cyan / yellow / red).

## Stack

- Static single-file `index.html` — vanilla HTML / CSS / JS, no build step.
- [Leaflet 1.9.4](https://leafletjs.com/) for the map.
- [CARTO Dark](https://carto.com/basemaps/) tile layer.
- [Twitter widgets](https://platform.twitter.com/widgets.js) for the SOCIAL tab — lazy-loaded only when at least one curated tweet ID is present.
- Google Analytics 4 (`G-DYME377V2S`) with Google Consent Mode v2; consent banner gates EU/EEA visitors.

The page weighs around 50 KB of HTML/CSS/JS; the rest is the Leaflet bundle (CDN, ~140 KB) and tile imagery.

## Local preview

This subproject is served by the parent `book` repo's static-server launch profile. From the `book/` root:

```sh
python -m http.server 8091
```

Then open <http://localhost:8091/hantavirus/>.

## Adding curated tweets to the SOCIAL tab

Each entry in the `SOCIAL[]` array in `index.html` is one tweet. To add a new tweet, paste the X URL — for example `https://x.com/CDCgov/status/2052188048520032692` — and add an entry like:

```js
{ handle: 'CDCgov', name: 'CDC', tweetId: '2052188048520032692', note: 'fallback note' }
```

If `tweetId` is `null`, the entry renders as a skeleton placeholder card. Once a real ID is provided, `widgets.js` is lazy-loaded and the tweet renders as an official X embed with photos, engagement counts, and timestamps.

## Logo variants

The active mark is a four-ring radar-pulse rendering at `logo.svg`. Three alternates live in `logos/` if you want to swap:

| Variant | File | Concept |
| --- | --- | --- |
| Pulse (active) | [`logos/logo-pulse.svg`](logos/logo-pulse.svg) | Concentric cyan rings + centre dot — radar/sonar ping |
| Reticle | [`logos/logo-reticle.svg`](logos/logo-reticle.svg) | Crosshair frame around a hex cell |
| H + EKG | [`logos/logo-h-ekg.svg`](logos/logo-h-ekg.svg) | Bold H letterform with a heartbeat trace |
| Pin | [`logos/logo-pin.svg`](logos/logo-pin.svg) | Map pin riding a globe arc |

To swap the active logo, copy the chosen variant to `logo.svg` and `favicon.svg` and re-run `python .scripts/build-icons.py` (which also regenerates `og-card.png`).

## Privacy

See [`privacy.html`](privacy.html). No personal data, no uploads, no tracking beyond anonymous Google Analytics page views (gated by EU consent banner).

## Changelog

### v0.2.3 &mdash; 2026-05-08
- **New PRIMER tab** &mdash; clinical reference panel covering: HPS vs HFRS overview; phase-by-phase symptoms for both syndromes; average duration of illness and recovery; case-fatality ranges per strain; person-to-person contagiousness (only Andes virus, with isolation guidance); and exposure-prevention guidance. Sourced from CDC and WHO references; "last updated" date displayed at the top of the panel for transparency. Content lives in a JS constant so updates are a one-line content edit.

### v0.2.2 &mdash; 2026-05-08
- **Accessibility pass.** Added a skip-to-content link, semantic `<h2>` markup on the LIVE WIRE and TIMELINE labels, `role="banner"` on the topbar, and `aria-label`s on the rail, map, and timeline regions. The map element gets a descriptive `role="img"` so screen readers announce it correctly.
- **`prefers-reduced-motion` honoured.** Users with the OS-level reduce-motion preference no longer see the ticker scroll, the S3 marker pulse, or any other CSS transitions. The data still updates; only the animation stops.
- **Meta description trimmed** from ~280 chars to ~155 chars for a cleaner SERP snippet.

### v0.2.1 &mdash; 2026-05-08
- **Stat strip expanded** to 6 cells with secondary date subtitles: TODAY (with today's date), THIS WEEK (with the week-of date), LAST CASE (with `Nd ago` and the date), CASES 90D, DEATHS 18MO, DOMINANT STRAIN (with most-active-region subtitle).
- **Timeline tooltips fixed** — now position-fixed and z-indexed above the map's tile and marker panes; previously they were getting clipped behind the map when extending above the timeline strip.
- **SOCIAL skeleton placeholders hidden** &mdash; only entries with a real tweet ID render. The placeholder slots remain in the source so curated tweets can be dropped in cleanly, but they no longer show in the UI.

### v0.2.0 — 2026-05-08
First production-ready release. SEO + brand pass:

- **Brand assets** — radar-pulse logo (`logo.svg`, `favicon.svg`), full favicon set (16 / 32 / 192 / 512 / apple-touch / multi-res `.ico`), `og-card.png` (1200&times;630). Three alternate logo concepts in `logos/` (reticle, H+EKG, map-pin). Build script at `.scripts/build-icons.py`.
- **SEO** — keyword-rich title and description, `keywords` meta, canonical link, full Open Graph + Twitter card, JSON-LD covering `WebApplication` + `Dataset` + `Organization` + `FAQPage`, `manifest.webmanifest` for PWA install, sitemap entry under `book/sitemap.xml`.
- **Accessibility** — visually-hidden `<h1>`, `aria-label` on the brand link and social icons, `alt` on the logo image, header-tag hierarchy maintained for the privacy page.
- **Analytics** — Google Analytics 4 with Google Consent Mode v2. EU/EEA timezones get a consent banner; everyone else opts in by default. Choice persists site-wide via the `greenline-consent` localStorage key.
- **Privacy policy** — added `privacy.html` with the full disclosure (no PII, no uploads, no email addresses listed).
- **Footer** — replaced the throwaway one-liner with structured links to Privacy, Cookies (re-shows banner), Source repo, plus placeholder social icons (Facebook / X / YouTube / LinkedIn).
- **LLM discovery** — subpage `llms.txt` with full structure description for AI search engines.

### v0.1.2 &mdash; 2026-05-07
- 5 real X embeds rendering on the SOCIAL tab (DrTedros, Outbreak Updates &times;2, WHO, CDCgov). Lazy-loaded `widgets.js` &mdash; no network hit when SOCIAL is empty.
- TIMELINE panel below the map: 16-month strip, severity-coloured dot per event, hover tooltip, click-to-focus syncs with rail card and map marker.
- Ticker speed control (`SLOW` / `NORM` / `FAST` / `||`); choice persists in localStorage.
- Removed the placeholder DAILY BRIEFING email signup section.

### v0.1.1 &mdash; 2026-05-07
- Relocated from a standalone `itsavibecode/hantavirus` repo to `book/hantavirus/`. Live URL set to `bookhockeys.com/hantavirus/`.
- Added the SOCIAL tab to the rail with skeleton placeholder cards for six public-health X handles (CDCgov, WHO, PAHO, ECDC_EU, NMHealth, CDPHE).
- Wired Twitter widgets.js to be lazy-loaded only when at least one tweet ID is set, so the FEED tab makes no network calls to twitter.com.

### v0.1.0 &mdash; 2026-05-07
- First release. War-monitor-style dashboard scaffold: dark theme, top stat strip, scrolling LIVE ticker, left rail with FEED / CASES / ADVISORIES tabs, severity + region filters, search, and event cards. Leaflet world map with CARTO Dark tiles and severity-pulsing markers. Click-card-to-focus-marker interaction.
- Seeded with 15 events: Mono County 2025 cluster, Santa Fe County 2025 fatality, plus representative endemic-surveillance entries for HFRS (Shaanxi, Heilongjiang, Korea, Russia, Finland), Andes (Patagonia), and Choclo (Panama).
