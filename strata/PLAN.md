# Strata - plan v1

Working name: **Strata** (layers of rock; "strata" = the layer stack). Final name is an open decision (section 10).

One line: a browser image editor with everything OpenShop can do, rebuilt from scratch so that it is pleasant to use. Layers, masks, selections, PSD in and out, live non-destructive adjustments, on-device AI, offline, nothing leaves the device.

Planned 2026-10-20 by Fable 5.1. Design options: `design-preview.html` (open `file:///T:/ClaudeCodeRepo/book/strata/design-preview.html`, arrow keys switch, P toggles phone). Build is done by Opus agents after approval, phase by phase, with Fable reviewing each phase.

Home (decided 2026-10-20): **bookhockeys.com/strata**, a subfolder of the `itsavibecode/book` repo at `T:\ClaudeCodeRepo\book\strata\`, same pattern as `/greenline/` and `/bigtext/`. GitHub Pages serves `main` as-is, so the built app is committed; the source lives beside it in `app/` (section 6).

Reference source (not copied, only studied): https://github.com/SysAdminDoc/Openshop v0.31.0, MIT. Full feature inventory of it is in `reference/openshop-inventory.md`.

---

## 1. What OpenShop gets right (keep)

- **The promise.** No account, no server, no upload, no credit meter. Pixels stay on the device. A visible network log backs the claim.
- **The start screen.** "What will you make?" with New / Open / Open PSD / Templates (HD, 4K, Instagram, A4, Letter, OG card...). Keep this almost as is.
- **The export dialog's honesty.** "13 layers will be flattened, 5 text objects will stop being editable." Every export tells you what you lose before you click. Keep and extend to every format.
- **Real layer structure.** Groups, masks, adjustment layers, editable text and vectors survive in the native project format.
- **Format breadth.** PSD, OpenRaster, SVG, PDF, RAW, HEIC, JPEG XL, AVIF, animated GIF/APNG/WebP, ABR/GRD/ASE/GPL assets.
- **On-device models** with first-use download (background removal, depth, detection, click segmentation, upscaling).
- **Safety net.** Deep undo, named snapshots, recovery storage, dirty-state reporting.
- **Pen input** done properly (coalesced and predicted pointer events, pressure, tilt).

## 2. What is wrong with it (fix)

Observed on the hosted app and in the source, 2026-10-20:

1. **It is a Photoshop CS6 costume.** The parity ledger literally audited CS6 screenshots. Result: 20 tool slots in two columns with hidden flyouts, 60 catalog tools of which 24 are "not implemented" and refuse with a toast, seven menus whose items overlap (Adjustments under Filter; "Enlarge 2x (AI model)" under Image while there is also an AI menu; "Clear All Filters").
2. **Unreadable chrome.** Tool labels about 8 px, uppercase 9 px panel tabs, grey text on navy. Three stacked right-hand panels with their own tab strips make nine tabs; the Layers panel shows about three rows before scrolling.
3. **Destructive by default.** Most filters open a dialog and bake into the pixels. Adjustment layers exist, but filters and layer styles do not live on the layer, so "change the blur I did three steps ago" means undoing three steps.
4. **Noise.** Navy gradient background, grid pattern behind the canvas, glowing accents, duplicated opacity controls (options bar and Layers panel both). The picture competes with the frame.
5. **One 1.9 MB HTML file, 33,801 lines, three script blocks.** Fabric.js 7 runs through a v5 compatibility shim. History is snapshot-based, not transactional. GPU kernels exist for seven filters only. Nobody can safely change it, which is why the roadmap has 42 planned items and 8 verified.
6. **Mobile is emulation-only** and broken on iOS Safari (every image import rejected, open issue since September).
7. **Automation is a tease.** The action recorder can replay six filters. Batch is limited to those.
8. **Bugs that ship** (from the source audit in `reference/openshop-inventory.md`, each with line numbers): Select > Refine Edge runs Group Layers because a handler id is declared twice; the elliptical marquee stores a rectangle; crop, perspective crop, canvas rotate and flip flatten the whole document; Merge Down moves object references instead of merging pixels; group blend modes are stored but never rendered; layer thumbnails never render; the export metadata choice is ignored (every export strips location only); projects over 10 MB cannot be reopened; the L key gives Line, not Lasso, and Shift-cycling through a tool group is not wired; the command palette matches substrings only; only one document can be open; there is no consent or size prompt before a model downloads; there are no clipping masks, fill layers, real text or shape layers (a "layer" is a bag of Fabric objects), 16 blend modes instead of 27, and layer styles are limited to drop shadow, outer glow and stroke on one object.

## 3. Product principles for Strata

1. **The picture is the interface.** Chrome is flat, quiet and neutral. Nothing in the frame glows, gradients or animates unless the user is doing something.
2. **Simple at rest, deep on demand.** One tool rail of 13 groups. One context bar that changes with the tool. One right panel (Layers above, Inspector below). Everything else is a popover, a sheet or a command.
3. **Non-destructive by default.** Adjustments, filters and layer styles are live effects in a per-layer stack: toggle, reorder, re-edit, copy to another layer, flatten only when you choose. Adjustment layers still exist for PSD parity and for "affect everything below".
4. **Search does everything.** Ctrl K (and "/" when the canvas has focus) finds tools, adjustments, filters, export formats, recent files, layers, settings. Menus exist, but you never need them.
5. **Direct manipulation.** Transform, crop, gradient, text, shape, warp and perspective are handled on the canvas with real handles and live numbers. Sliders scrub the picture live.
6. **Readable.** 13 px minimum UI text, two sizes plus one caption size, sentence case, WCAG AA contrast in light and dark, 8 px spacing grid, 44 px touch targets in compact mode.
7. **Tell the truth, visibly.** Status bar shows "Saved on this device, 2 s ago" and a live outbound-request counter. Export shows the exact loss list. Model downloads show size, source and a delete button.
8. **Same brain on every screen.** Desktop, tablet and phone share one layout grammar (direction C does this literally; A and B switch to a bottom dock and sheet under 820 px). Shortcuts, gestures and names are identical.
9. **Every non-obvious control has a tooltip that explains why,** not what (house rule). Modals never close on outside click (house rule). Toasts top-centre, passive only (house rule). No horizontal scrollbars anywhere (house rule).

## 4. Information architecture

### 4.1 Shell

```
+----------------------------------------------------------------------------------+
| Logo  [Poster.strata] [IMG_2041.heic] [+]     [ Search anything... Ctrl K ]  undo redo  (On device)  [Export] |
+----------------------------------------------------------------------------------+
| Brush  Soft round  Size ---o--- 24px  Hardness --o--- 20%  Opacity ----o 100% | Normal | Symmetry Off |
+------+---------------------------------------------------------------+-----------+
| rail |                                                               | Layers    |
| 13   |                        canvas                                 |  (search) |
| tool |              [floating toolbar near selection]                |  rows...  |
| grps |                                                               +-----------+
|      |                        [ - 67% + Fit ]                        | Inspector |
|      |                                                               |  props    |
|      |                                                               |  fx stack |
+------+---------------------------------------------------------------+-----------+
| 1920 x 1080 . sRGB . 8-bit   Brush 24 px   X 412 Y 96        Saved on this device . just now   0 network requests |
+----------------------------------------------------------------------------------+
```

- **Document tabs**: multiple open documents (OpenShop has one). Drag a tab out to compare side by side (v0.9).
- **Search**: command palette with fuzzy match, categories, shortcuts shown, recent first, "Did you mean". Also lists layers by name and settings.
- **On device** badge: green when zero outbound requests since load; click opens the network log.
- **Export** button: opens the export sheet (section 4.6).

### 4.2 Tool rail (13 groups; right-click or long-press opens the group)

| Group | Key | Members |
|---|---|---|
| Move | V | Move, Artboard/Guide drag, Align (in context bar) |
| Select | M | Rectangle, Ellipse, Single row, Single column |
| Lasso | L | Freehand, Polygonal, Magnetic |
| Magic select | W | Magic wand, Quick selection, Object select (AI, click-guided), Colour range... |
| Crop | C | Crop, Perspective crop, Straighten, Canvas size |
| Brush | B | Brush, Pencil, Spray/airbrush, Mixer (later), Colour replace (later) |
| Eraser | E | Eraser, Background eraser, Magic eraser |
| Fill | G | Paint bucket, Gradient, Pattern fill |
| Retouch | J | Spot heal, Healing brush, Clone stamp, Patch, Red eye, Dodge, Burn, Sponge, Smudge, Blur, Sharpen |
| Text | T | Horizontal, Vertical, Type on path (later), Type mask |
| Shape | U | Rectangle, Rounded rect, Ellipse, Polygon, Star, Line, Arrow, Custom |
| Pen | P | Pen, Freeform pen, Add/Delete/Convert anchor, Path select, Direct select |
| View | H / Z | Hand, Zoom, Rotate view, Eyedropper (I), Colour sampler, Ruler/Measure |

Every group member has its own shortcut (Shift+key cycles). Tool icons are a single consistent 20 px line set drawn for Strata.

### 4.3 Context bar

Per-tool options only. Shared layout rule: label, control, numeric field; numeric fields accept units and math ("50%", "+10", "2in"). Every slider has a keyboard-editable number beside it (house rule: fields wide enough for their values).

### 4.4 Right panel

**Layers** (top, resizable split): search/filter box, rows with thumbnail, name, visibility, lock, fx chip (count of live effects), mask thumbnail, group disclosure, drag to reorder and reparent, multi-select, colour tags. Toolbar: add layer, add group, add mask, add adjustment, delete. Row context menu for everything else.

**Inspector** (bottom): shows the selection. Layer: opacity, blend, fill opacity, effects stack. Text: font, size, weight, tracking, leading, alignment, colour, per-range styling. Shape: fill, stroke, corner radius, boolean ops. Effect: that effect's parameters with live preview. Selection: feather, modify, refine edge. Nothing selected: document info and canvas colour.

**Popovers, not panels**: Colour (from the foreground/background swatch in the rail), Swatches and palettes (inside Colour), History (from the undo button, with snapshots and branches), Navigator (toggle minimap on the canvas), Info (status bar), Brush presets (from the preset chip in the context bar), Actions (from the Automate command).

### 4.5 Menus

A compact menu button (hamburger on phone, "Menu" on desktop) with six groups: File, Edit, Image, Layer, Select, View. Adjustments, filters, AI and automation are reached from the layer "+ Add" button, the search, and the Image group. There is no separate Filter or AI menu. Every menu item is also a command.

### 4.6 Export sheet

Format cards (PNG, JPEG, WebP, AVIF, SVG, PDF, PSD, OpenRaster, GIF, Strata project) with one-line suitability ("JPEG: photos, no transparency"). Below: scale, quality, colour profile, metadata (Strip location only / Strip all / Preserve), size estimate, preview, and the loss list ("3 text layers rasterised, 2 live effects flattened, masks baked"). "Save project too" checkbox. Batch export lives here as a tab.

### 4.7 Compact layout (under 820 px wide or any touch-primary device)

Bottom tool dock (scrollable, 44 px targets), context bar above it, Layers and Inspector as a draggable sheet, floating toolbar near selection stays. Gestures: pinch zoom, two-finger pan, two-finger tap undo, three-finger tap redo, long-press for tool group. Stylus: pressure to size or opacity, barrel button for eyedropper, palm rejection.

## 5. Visual design system

Three directions are in `design-preview.html`; one gets picked (open decision). Shared tokens regardless of direction:

- **Type**: system UI stack (no webfonts, offline-safe). Sizes 13 / 12 / 15, weights 400 / 600. Tabular numerals in all numeric fields.
- **Spacing**: 8 px grid, 4 px for inside-control nudges. Panel padding 12. Row height 32 desktop, 44 compact.
- **Radius**: direction-specific (A 10 / B 6 / C 14). Controls use the small radius, panels the large one.
- **Colour**: one accent, used only for selection, active tool, primary button and fx chips. Success green for "saved". Never red except for destructive confirmations.
- **Canvas surround**: independent of theme (light / mid / dark / custom), default mid-grey, because colour judgement needs a neutral surround.
- **Motion**: 120 ms for hover and toggles, 180 ms for panels and sheets, none on the canvas.
- **Icons**: one 20 px line set, 1.75 px stroke, drawn for Strata.
- **Themes**: light and dark always, follows system by default, persisted.

## 6. Architecture

Decided (plumbing is my call per house rules):

- **Language and build**: TypeScript, Vite. Source lives in `book/strata/app/`; `vite build` (base `/strata/`) writes `index.html`, `assets/` and the PWA files into `book/strata/` itself, which GitHub Pages serves at bookhockeys.com/strata/ with no pipeline change to the book repo. The build script clears `../assets` first so stale hashed chunks never pile up. Built files are committed (the book repo has no build step, by design). A second target, `strata.html`, is a single-file build for the "keep one file" use case (vite-plugin-singlefile). Heavy WASM codecs (ONNX runtime, LibRaw, PDF.js, jSquash) add roughly 30 MB of committed binaries; acceptable for this repo (it already carries a 19 MB video), and models are never committed (downloaded from Hugging Face on demand).
- **UI**: Preact + signals for panels, menus and dialogs. The canvas and all tools are plain TypeScript with no framework in the hot path.
- **Engine** (`src/engine`):
  - Document = tree of nodes: `Raster`, `Text`, `Shape` (vector paths), `Group`, `Adjustment`, `SmartObject` (embedded document). Every node has transform, opacity, blend, fill opacity, mask (raster or vector), clip-to-below, and an effects stack.
  - Raster layers are stored as 256 px tiles (RGBA8, optional RGBA16F later). Edits touch only dirty tiles. History stores inverse tile patches, not whole snapshots, so 120+ steps on a 24 MP image is cheap.
  - Compositor on WebGL2 (blend modes, masks, effects as shader passes), Canvas2D fallback for everything. Runs in a worker with OffscreenCanvas where supported, main thread elsewhere. WebGPU is a later optimisation, not a dependency.
  - Effects are pure functions `(input tiles, params) -> output tiles` with a GPU and a CPU implementation each; parity tests compare them.
  - History is command-based: every tool gesture produces one command with do/undo. Snapshots and branches are pointers into the command log. Autosave writes the command log and dirty tiles to IndexedDB after every command, debounced 500 ms.
  - Brush engine: stamp-based with spacing, scatter, pressure/tilt dynamics, ABR sampled tips, symmetry (mirror x/y, radial n), stabiliser.
- **Formats** (`src/io`): adapters with a shared loss report. Libraries bundled from npm and lazy-loaded as separate chunks from our own origin (no CDN, so strict offline works for real): ag-psd (PSD), fflate (ORA, ZIP, batch), pdfjs-dist + jsPDF + svg2pdf (PDF), jsquash avif/jxl, libheif or @discourse/heic (HEIC), libraw-wasm (RAW), gifenc + omggif or modern-gif (GIF), upng (APNG), imagetracerjs (trace), @contentauth/c2pa-web (credentials read).
- **AI** (`src/ai`): @huggingface/transformers + onnxruntime-web in a worker. Model manager with manifest (name, task, size, licence, source URL), download progress, cache in Cache Storage, delete. Models, starting from the ones OpenShop has proven to run in transformers.js (pinned by commit): Xenova/modnet (background removal; BiRefNet as an upgrade candidate), onnx-community/depth-anything-v2-small (depth), Xenova/detr-resnet-50 (detection), Xenova/slimsam-77-uniform (click segmentation, extended to multi-point and box prompts), Xenova/swin2SR x2 and x4 (upscale, tiled). Strata adds what OpenShop lacks: a size-and-source confirmation before the first download, inference in a worker, background removal as a non-destructive mask, and a user-visible device choice (WebGPU or WASM).
- **Persistence**: IndexedDB for projects, tiles, assets, settings; Cache Storage for models and app shell; `navigator.storage.persist()` requested on first save.
- **PWA**: Workbox-generated service worker, precache app shell, runtime cache for codec chunks and models, "Offline ready" indicator, file handlers for all import types, share target, New/Open shortcuts.
- **Plugins** (v0.9): sandboxed iframe with a versioned postMessage API, capability grants shown in settings (same idea as OpenShop, smaller surface).
- **Tests**: Vitest for engine, io and effects parity; Playwright smoke for shell, tool gestures, export, offline. Performance budget test on a 24 MP fixture.
- **Privacy**: no analytics at all (recommended, see open decisions). Outbound requests are logged in-app; the only ones are our own origin (chunks), Hugging Face (models, on demand) and a WebRTC peer if the user starts a session.

Repository layout:

```
book/strata/                      <- served at bookhockeys.com/strata/
  index.html  assets/  manifest.webmanifest  sw.js  og.png  apple-touch-icon.png  icons   <- BUILT (committed)
  strata.html                     <- single-file build (committed)
  PLAN.md  README.md              <- README carries the changelog
  reference/openshop-inventory.md <- what parity means
  app/                            <- SOURCE
    package.json  vite.config.ts  index.html  tsconfig.json  LICENSE
    public/   icon sources, model-manifest.json
    src/
      app/       shell, layout, theme, command palette, settings
      ui/        Preact components, design tokens (css), icons
      engine/    document, tiles, compositor (gl, cpu), history, brush, selection, text, vector
      tools/     one folder per tool group
      effects/   adjustments, filters, styles (gpu + cpu + params schema)
      io/        format adapters + loss report
      ai/        model manager + tasks
      workers/   render, codec, model
    tests/      vitest + playwright
    node_modules/                 <- gitignored
```

## 7. Build phases (each is a release; semver; README changelog explains the why)

| Version | Name | Scope | Done when |
|---|---|---|---|
| 0.1.0 | Shell | Design tokens and layout for the chosen direction; start screen with templates; document model, tiles, WebGL2 compositor with CPU fallback; Layers panel (add, group, mask, reorder, blend, opacity, lock, visibility); tools: move, rect/ellipse select, brush, eraser, fill, text, rect/ellipse shape, hand, zoom, eyedropper; command history undo/redo; autosave; open PNG/JPEG/WebP/GIF(first frame); export PNG/JPEG/WebP with loss list; save/open `.strata`; command palette; favicon, OG card, semver in title, A2HS, manifest | A poster like the mockup can be built from scratch, closed, reopened from autosave, and exported |
| 0.2.0 | Select and transform | Lasso (free/poly/magnetic), magic wand, quick select, colour range, refine edge, feather/expand/contract/smooth/border, save and load selections, selection to mask; crop, perspective crop, straighten; free transform (scale, rotate, skew, distort, perspective, warp) with on-canvas handles; image size, canvas size, rotate/flip; rulers, guides, smart guides, snapping, pixel grid | OpenShop's selection and transform menus have no item Strata lacks |
| 0.3.0 | Live effects | Per-layer effects stack; adjustments (levels, curves, exposure, gamma, shadows/highlights, brightness/contrast, hue/saturation/lightness, vibrance, colour balance, black and white, sepia, grayscale, invert, photo filter, channel mixer, posterize, threshold, solarize, gradient map, duotone, selective colour, replace colour, LUT); filters (gaussian, box, motion, radial, lens and tilt-shift blur; sharpen, unsharp mask, smart sharpen; add noise, generate noise, median, dust; pixelate, mosaic, crystallise; emboss, edge detect, oil paint, halftone, vignette, chromatic aberration, lens correction; wave, ripple, twirl, spherize, liquify); layer styles (drop and inner shadow, outer and inner glow, stroke, colour/gradient/pattern overlay, bevel, satin, multiple instances); adjustment layers that composite over everything below and can clip to one layer; clipping masks; solid/gradient/pattern fill layers; all 27 Photoshop blend modes in the GPU compositor; auto levels, auto contrast, auto enhance; photo presets; histogram; watermark; before/after compare; GPU implementations with CPU parity tests | Every OpenShop adjustment and filter exists, and all are non-destructive |
| 0.4.0 | Formats | PSD import/export (groups, masks, adjustment layers, text, styles where ag-psd allows), OpenRaster, SVG import/export (editable), PDF import (page per layer) and export (vector where possible), animated GIF/APNG/WebP import, AVIF export, HEIC/JXL/BMP/RAW import, ICC profiles, EXIF/XMP options, C2PA read, batch export tab, Place/paste/drop router | The OpenShop formats table is matched or exceeded, with loss reports |
| 0.5.0 | Paint and retouch | Brush engine v2 (ABR import, dynamics, tilt, stabiliser, symmetry, presets panel), pencil, airbrush, clone, spot heal, healing brush, patch, red eye, dodge/burn/sponge, smudge/blur/sharpen tools, gradient editor with GRD import, pattern fill, swatches with ASE/GPL import, colour sampler, history brush | A retouch job on a 24 MP photo stays above 50 fps while painting |
| 0.6.0 | Vectors and type | Pen with anchor editing, path select/direct select, boolean ops, stroke/fill styles, polygon/star/line/arrow/custom shapes, per-range text styling, vertical text, type mask, text to shape, trace to vector, align/distribute | SVG round trip preserves everything drawn in Strata |
| 0.7.0 | On-device AI | Model manager; background removal, depth map, object detection, click-guided segmentation, 2x/4x upscale; object select tool | Each task runs offline after one download and reports its time |
| 0.8.0 | Automate and time | Action recorder that can replay every command, batch folder to ZIP, named snapshots, history branches, frame timeline with onion skin, GIF/APNG/WebP animation export, watermark, before/after compare | A ten-step recipe replays on 50 files without touching the mouse |
| 0.9.0 | Everywhere | Compact layout and gestures, stylus tuning, strict offline mode, file handlers and share target, collaborative session (WebRTC), plugin sandbox, localisation scaffold, accessibility pass (axe clean) | Works on a real iPhone and Android phone, installed, offline |
| 1.0.0 | Release | Performance budgets, docs site, single-file build, final icon and OG assets | Public launch |

Each phase is a brief to one or more Opus agents (engine work and UI work split), with Fable writing the brief, reviewing the diff, and running the acceptance test before the version bump.

## 8. Site standards (house rules, built in at 0.1.0)

- Semver in `<title>`, driven from one `APP_VERSION` constant; `<meta name="app-version">`; visible version in Settings and About; README changelog every release.
- Inline SVG favicon; real PNG `og.png` 1200x630 at the canonical URL; `apple-touch-icon.png` 180x180; theme-color; manifest with 192/512 maskable icons; standalone display.
- No link to the GitHub repo anywhere in the UI.
- No horizontal scrollbars; card-stack tables under 640 px; `minmax(0,1fr)`.
- Tooltips on every non-obvious control, explaining intent.
- Form modals close only via X, Cancel or confirm. Toasts top-centre, passive.
- Numeric fields wide enough for their widest value; dates never truncate.

## 9. Feature parity matrix

See `reference/openshop-inventory.md` for the exhaustive list. Summary of what "same abilities" means, mapped to phases:

| OpenShop area | Strata phase | Notes |
|---|---|---|
| 62 toolbar buttons, 39 of them working (23 refuse with a toast) | 0.1 to 0.6 | Strata ships only tools that work; no "not implemented" toasts. Every one of the 39 is covered by the 13 groups in section 4.2 |
| 16 Canvas-2D blend modes; layer = bag of objects; no clipping masks, fill layers, text or shape layers | 0.1 / 0.3 | 27 blend modes on the GPU; real layer types; clipping masks; fill layers |
| Adjustment layers: levels, curves, HSL only; styles: drop shadow, outer glow, stroke | 0.3 | Full set, see phase 0.3 |
| Marquee, lasso, magnetic, quick select, wand, colour range, refine edge | 0.2 | |
| Groups, masks, adjustment layers, blend modes, drag reorder | 0.1 / 0.3 | |
| Per-range text styling, editable vectors | 0.6 | |
| Crop, perspective crop, resize, rotate, skew, warp, guides, rulers, snapping, pixel-perfect zoom | 0.2 | |
| 120-step undo, snapshots, branches, recovery, dirty state | 0.1 / 0.8 | Tile-patch history is cheaper than OpenShop's snapshots |
| Actions and batch (six replayable filters) | 0.8 | Every command replayable |
| Background removal, depth, detection, click segmentation, 2x/4x | 0.7 | |
| Plugin sandbox, host bridge | 0.9 | Smaller API |
| PNG, JPEG, WebP, AVIF, SVG, PDF, PSD, ORA, GIF, project | 0.1 / 0.4 | AVIF export in 0.4 |
| APNG, HEIC, JXL, BMP, RAW import | 0.4 | |
| ASE, GPL, ABR, GRD assets | 0.5 | |
| ICC, EXIF/XMP, C2PA read | 0.4 | |
| Workspaces, screen modes, light/dark, command palette | 0.1 (palette, themes), 0.9 (workspaces) | |
| PWA, offline ready, strict offline, file handlers, share target | 0.1 (basic), 0.9 (strict, handlers) | |
| Collaborative session (WebRTC) | 0.9 | |
| Localisation | 0.9 scaffold | OpenShop's is partial too |

Beyond parity (new in Strata): multiple open documents, live per-layer effects stack, layer styles, LUTs, liquify-lite, model manager with delete, animation onion skin, stabiliser, tool groups with working members only, phone layout that actually works on iOS.

## 10. Decisions

Answered by the user 2026-10-20 unless marked open.

1. **Design direction**: OPEN. User is reviewing `design-preview.html`. Default until told otherwise: B Graphite for desktop, with C's floating dock as the compact layout (photo work wants a neutral dark surround; C's dock is the right phone answer).
2. **Name**: Strata, with "we may change it". Keep the name in one constant (`APP_NAME`) and the folder name stable so a rename is a one-line change plus a redirect.
3. **Home**: `bookhockeys.com/strata`, subfolder of the book repo (decided, "easier").
4. **Public, MIT**: yes. The book repo is already public. No OpenShop code is copied; it is credited as inspiration in the README. Every dependency is MIT/Apache.
5. **Analytics**: none. "Zero outbound requests" is the product. The book repo's GA4 tag is NOT added to this subfolder.

## 11. What happens next

1. User picks a direction (or confirms the default).
2. Scaffold in `book/strata/app/`, icons and share assets, first build committed as `book/strata/`.
3. 0.1.0 brief (engine and UI split) goes to Opus agents. Fable reviews, runs the acceptance check, bumps to 0.1.0, commits with the `strata: v0.1.0 -` prefix. Push is a production deploy of bookhockeys.com, so the user is asked before each push.
