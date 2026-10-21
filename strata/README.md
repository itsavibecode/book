# Strata

A browser image editor with layers, masks, selections and (from 0.3.0) live effects. Everything happens on your device: no account, no upload, no server, and a network log in the app that proves it.

Live at **[bookhockeys.com/strata](https://bookhockeys.com/strata/)**. Also available as one self-contained file, [`strata.html`](https://bookhockeys.com/strata/strata.html), for keeping offline.

Strata is inspired by [OpenShop](https://github.com/SysAdminDoc/Openshop) (MIT). No code is shared; the plan in [`PLAN.md`](PLAN.md) explains what OpenShop gets right, what Strata does differently, and the phase-by-phase roadmap to the same abilities. MIT licensed, see [`app/LICENSE`](app/LICENSE).

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `assets/`, `sw.js`, `manifest.webmanifest`, icons | The built app, served as-is by GitHub Pages. Rebuilt from `app/` on every release and committed. |
| `strata.html` | Single-file build of the same version. |
| `app/` | Source: Vite + TypeScript + Preact. `npm run build` writes the files above into this folder. |
| `PLAN.md` | Product plan, decisions, roadmap. |
| `design-preview.html` | The three design directions that were considered (B Graphite was chosen). |
| `reference/openshop-inventory.md` | Exhaustive inventory of the reference app, used as the parity checklist. |

## Working on it

```
cd app
npm install
npm run dev        # local dev server
npm test           # Vitest: unit (Node) + browser (Chromium) projects
npm run build      # writes ../index.html, ../assets, ../strata.html, ../sw.js
npm run e2e        # Playwright smoke against a static server of the book repo at /strata/
```

Releases bump `APP_VERSION` in `app/src/app/constants.ts` (the only place the version lives; the title, meta tag, About box and service-worker cache name read it), rebuild, and add an entry below.

## Changelog

### v0.1.0 - 2026-10-20 - Shell

Why Strata exists: the best free browser editor around is a 1.9 MB single HTML file dressed up as Photoshop CS6, with 24 tools that answer "not implemented", filters that bake into pixels, a mobile layout that cannot open images on iPhone, and a codebase nobody can safely change. The promise underneath it is right (pixels never leave the device, real layers, honest export dialogs), so Strata keeps the promise and rebuilds everything else from scratch so it stays pleasant to use and possible to maintain.

This first release is the shell: the parts every later phase stands on.

- **Start screen.** "What will you make?" with New, Open, a template grid (HD, 4K, square, story, A4, Letter, OG card and more) and Recent documents recovered from this device.
- **One quiet layout.** Graphite theme (light and dark, follows the system), one tool rail, one context bar that changes with the tool, Layers above Inspector on the right, a status bar that says when the work was last saved and how many network requests have been made. Under 820 px or on touch the tools move to a bottom dock and the panels become a sheet.
- **Search does everything.** Ctrl K opens a command palette with fuzzy matching, categories, shortcuts and recents. Every menu item is a command.
- **A real engine.** Documents are trees of raster, text, shape and group layers. Pixels live in 256 px tiles; every brush stroke records only the tiles it touched, so undo is cheap and deep. Compositing runs on WebGL2 with a pixel-identical CPU fallback (normal, darken, multiply, lighten, screen, overlay, soft light, hard light, difference, exclusion).
- **Tools.** Move, rectangle and ellipse select (real masks, marching ants follow the mask), brush and eraser (stamp engine with spacing, hardness, flow and pen pressure), fill, editable text, rectangle and ellipse shapes, hand, zoom, eyedropper.
- **Layers.** Add, group, mask, reorder by drag, blend mode, opacity, lock, visibility, rename, duplicate, merge down, rasterise, flatten.
- **Never lose work.** Every change is autosaved to this device half a second after you stop, and a reload lands you back in the editor with everything intact.
- **Files.** Open PNG, JPEG, WebP and GIF (first frame) by drop, picker or paste. Export PNG, JPEG or WebP at any scale with a plain-language list of what that format loses. Save and reopen `.strata` projects (a zip of JSON plus lossless layer images) that keep text and shapes editable.
- **Site standards.** Semver in the title, inline SVG favicon, OG card, apple-touch-icon, web manifest and service worker for Add to Home Screen, tooltips on every non-obvious control, no horizontal scrollbars, modals that only close on purpose, toasts at the top centre. No analytics at all.
