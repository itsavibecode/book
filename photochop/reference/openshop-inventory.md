# OpenShop v0.31.0 feature inventory

Exhaustive inventory of https://github.com/SysAdminDoc/Openshop (MIT, Matthew Parker) produced 2026-10-20 from the source (index.html 33,801 lines) by Opus agents, for the Strata rewrite. Line numbers refer to that index.html. Nothing from the source was executed. This is the definition of 'same abilities' in PLAN.md; items marked MISSING or 'not implemented' are OpenShop gaps, not Strata requirements.

Parts, in order: architecture (E) is placed first, then tools/menus/panels (A), adjustments/filters (B), layers/selection/text/transform (C), history/automation/IO (D), gaps (Z).

---

# OpenShop v0.31.0 inventory -- Part E: Architecture, AI, Workspaces, Network/PWA, Preferences, Other

Source audited: `index.html` (33,801 lines), `sw.js` (855), `plugin-sandbox.js` (60), `plugin-sandbox.html` (47), `manifest.webmanifest` (220), `tools/runtime-assets.mjs` (543), `SECURITY.md`, `PHOTOSHOP_PARITY_ROADMAP.md`. Line numbers refer to `index.html` unless another file is named. Items marked "Not present" are gaps the rewrite should decide on explicitly.

---

## 1. Architecture

### 1.1 Delivery model

- Single-file app: all CSS, HTML and application JS are inline in `index.html`. No bundler output and no ES modules of its own.
- Two "lanes":
  - **Standalone file lane** (`file://`, or any non-HTTPS non-localhost origin): network-first, no service worker, the 3 core libraries are fetched from jsDelivr on every cold start.
  - **Hosted PWA lane** (`https:`, `localhost`, `127.0.0.1`): registers `./sw.js`; verified shell caching, staged updates, health-checked promotion, rollback.
- Companion static files: `sw.js`, `plugin-sandbox.html` + `plugin-sandbox.js` (plugin iframe), `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `design/*.png` (OG image and manifest screenshots).
- Build-time tooling (not shipped at runtime): `tools/runtime-assets.mjs` is the canonical manifest of every pinned CDN asset (key, display name, package, exact version, URL, SHA-384, MIME type, SPDX license, provenance; validated by `validateRuntimeProvenance`). `tools/sync-runtime-assets.mjs` rewrites the marked regions `/* OPENSHOP_RUNTIME_MANIFEST:BOOT|LAZY|SHELL:BEGIN/END */` in `index.html` and `sw.js`. `tools/security.mjs` recomputes the inline-script CSP hashes and rejects executable `on*=` attributes.

### 1.2 index.html block map

| Lines | Block | Contents |
|---|---|---|
| 1-23 | `<head>` metas | charset, OG/Twitter cards (`./design/openshop-social-preview.png` 1280x640), viewport, description, `theme-color` `#0a0c10` (`id="theme-color-meta"`), CSP meta (line 22), `<title>OpenShop v0.31.0 \| Browser Image Editor</title>` |
| 24-325 | Inline script #1 (bootstrap) | `configureFabric()` (Fabric 7.4.0 version gate, origin defaults left/top, `customProperties` whitelist); `OPENSHOP_NETWORK` fetch ledger and strict-offline enforcer (`window.__openshopNetwork`); `OPENSHOP_BOOT_ASSETS` (3 pinned libs); in-page SHA-384 verifier; Trusted Types policy `openshop-loader`; `OpenShopTrustedWorker` subclass replacing `globalThis.Worker`; `window.__openshopBoot` promise |
| 326-328 | favicon (`data:image/x-icon;base64`) and `<link rel="manifest" id="pwa-manifest">` | |
| 329-3124 | `<style>` | Tokens on `:root` (330-345), theme classes `:root.theme-midnight/oled/light` (990-992), `prefers-color-scheme:light` fallback (993), component CSS, responsive breakpoints (2692-3096), `forced-colors` (3097), `prefers-contrast:more` (3117) |
| 3126-4126 | `<body>` markup | Topbar and menubar (3129-3430), left toolbar (3433+), tool options bar, canvas area inside `#mini-bridge-panel` (3692-3726), bottom tabs (3727), sr-only canvas a11y tree, welcome overlay, right dock `#panels` with 3 tab groups (3783-4013), statusbar (4019-4031), `#ai-progress` (4032), toast container, command palette, context menu, dropzone, sticky-note container, liquify overlay, timeline (4075), macro panel, before/after overlay, hidden file inputs (4122-4124) |
| 4126-33799 | Inline script #2 (core engine) | `OS_EVENT_HANDLERS` registry, `registerDeclarativeEvents()`, the `OS` object literal (4501-33677), global document listeners and boot (33679-33799) |

### 1.3 Main script section map

| Lines | Section | Notes |
|---|---|---|
| 4127-4461 | `OS_EVENT_HANDLERS` | Frozen map `{click, change, input, keydown}` of opaque action ids (`click-001`...`click-237`, `click-diagnostics`, `change-001`...`change-047`, `input-001`...`input-031`, `input-filter-preview`, `keydown-001`) to handler functions |
| 4463-4499 | `registerDeclarativeEvents()` | One delegated document listener per event type (see 1.11) |
| 4501 | `const OS = {` | Single global god-object; everything below is a property or method |
| 4502-4510 | `_esc`, `_trustedHTML` | HTML escaping; tagged template routed through the TT policy |
| 4511-4669 | `_runtimeAssets` (LAZY manifest) | 33 lazily loaded verified assets (see 1.9) |
| 4670-4880 | Runtime asset plumbing | `_runtimeAssetPromises`, `_runtimeBlobUrls`, owner refcounts, `_verifyRuntimeBytes` (4711), `_releaseVerified*`, `_runtimeResourceReport` (4748), `_disposeRuntimeResources` (4760; also terminates `_photonFilterWorker`, `_filterWorker`, `_rendererWorker`), `_fetchVerifiedRuntimeAsset` (4809; `cache:'force-cache'`, refetch with `reload` on hash failure), `_verifiedRuntimeBlobUrl` (4854) |
| 4882-4926 | `_executeVerifiedRuntimeScript(name, globalName)` | Runs a verified UMD via `<script src=blob:>`; `_loadFabricExtensions`, `_loadImageTracer`, `_loadSvgToPdf` |
| 4927-5397 | Codec loaders | `_loadC2PA` (4927), `_loadLibRaw` (4978), `_loadPdfJs` (5030), `_loadAvifEncoder` (5067), `_encodeAvifImageData` (5103), `_loadAvifDecoder` (5133), `_readAvifDimensions`, `_decodeAvif`, `_loadPortableDecoder(format)` (5194, HEIC/JXL), `_decodeNativePortableImage` (5275, color-space aware), `_loadPortableImageFile` (5319), `_prepareClassicPhotonSource` (5383) |
| 5398-5408 | `_downloadBlob(blob, filename, deliver)` | Anchor download; diverted to embed host when `overrideSave` |
| 5409-5876 | i18n | `_locales = { en:{}, zh:{...} }` (zh ~335 strings, 5409-5747), `_t`, pseudo-locale, `_localeDirection`, `_initI18n`, `setLocale`, `i18nKeys`, `missingLocaleKeys` |
| 5877-5886 | `session` | Application/session owner (see 1.5) |
| 5887-5908 | `renderer` | Renderer seam contract `openshop-render-v1` |
| 5909-6176 | Document and state fields | layers, history config, document schema v3 and migration registry, ids, persistence state, color profile, plugin config, prefs, import limits, templates, `state` (tool option values) |
| 6177-6292 | Session sync | `_hasActiveDocument`, `_syncSessionDocument`, `_syncSessionWorkspace`, `setWorkspaceMode` (6228), `_updateDocumentAvailability` |
| 6293-6406 | Scene / render seam | `_captureDocumentScene` (kind `openshop-scene` schema 1), `_renderPreviewScene`, `_renderExportScene`, `_renderReferenceScene`, `renderDocumentScene(scene,{target})` |
| 6407-6597 | Canvas ceiling probe | see 1.6.4 |
| 6598-6664 | `_initializeBlankWorkspace()` | Resets every document field to the "no document" state |
| 6665-6831 | INIT `init()` | Fabric canvas creation and all startup wiring (see 1.4) |
| 6832-6912 | Offscreen renderer probe | `_disableOffscreenRenderer`, `_initializeRenderer`, `_ensureRendererReady`, `_rendererReport` |
| 6914-19566 | DOCUMENT | Document create/load/save, history, layers, selections, tools, PSD/ORA/RAW/PDF import, export, collaboration (11823-12241), project save (12242+); covered by other parts |
| 19567-19831 | ZOOM and edit ops | pixel-zoom levels, zoom rendering, canvas resize |
| 19832-20030 | COLORS | OKLCH readout, FG/BG, swatch grids (ARIA grid, roving tabindex) |
| 20031-20694 | PDF / PSD / ORA export | |
| 20695-20885 | WELCOME SCREEN and RECENT FILES | |
| 20886-21000 | GRID, RULERS, SNAP | |
| 21000-21150 | FULLSCREEN, mobile panel drawer, panel splitters, canvas focus context | |
| 21151-21240 | PWA | lane detection, offline-state badge |
| 21241-21415 | EMBED CONTRACT | postMessage host bridge |
| 21416-22199 | NETWORK TRANSPARENCY and PWA management | Network Activity dialog, strict offline, SW messaging, update/rollback/restage, install prompt, AI cache inventory, Offline & Install dialog, launch queue, share-target intake |
| 22200-23290 | AUTO-SAVE / RECOVERY (OPFS) | |
| 23293+ | Smart alignment snapping, measurement (23716), curves, guides (24203), text effects... | |
| 25243-25311 | COLOR WHEEL | |
| 25419-25450 | IMAGE INFO | |
| 25451-25853 | PREFERENCES | |
| 25963-26800 | FILTER WORKER | Inline worker source: Photon WASM, WebGPU compute, WebGL2, OffscreenCanvas 2D, CPU |
| 27448-27526 | BEFORE / AFTER | |
| 27583-27932 | COMMAND PALETTE | `_getCommands()` list of 130 commands (27657-27797) |
| 27933-28002 | NATIVE POPOVER SURFACES | |
| 28003-28205 | CONTEXT MENU | |
| 28206-28563 | MENU ACCESSIBILITY | |
| 28564-28735 | MODAL FOCUS MANAGEMENT | |
| 28736-28774 | DROPZONE, CLIPBOARD PASTE | |
| 28775-28857 | MINIMAP / NAVIGATOR | |
| 28858-28906 | STICKY NOTES | |
| 28907-29300+ | COLOR PALETTES, ABR brushes, gradient presets | |
| 29492+ | Keyboard shortcuts | |
| 30114-30166 | THEME SYSTEM | |
| 30567-30588 | PIXEL GRID | |
| 30589-30956 | ANIMATION TIMELINE | |
| 30957-31071 | ACTION / MACRO RECORDING | |
| 31072-31882 | AI MODULE (Transformers.js) | includes AI Segment Select and selection combine modes |
| 31883-32086 | AI BG REMOVAL, DEPTH MAP, OBJECT DETECTION | |
| 32087-32201 | RASTER TO VECTOR | |
| 32202-32438 | SUPER-RESOLUTION, SMART UPSCALE | |
| 32439-32593 | PRESETS | |
| 32594-33221 | PLUGIN SYSTEM | |
| 33222-33511 | STATUS / TOAST, a11y tree | |
| 33512-33677 | DIAGNOSTICS, `toast()` | `OS` literal closes at 33677 |
| 33679-33799 | Globals | `[data-modal-close]` click handler, Enter-confirms-dialog, Escape cascade, range suffix sync, `error`/`unhandledrejection` toasts, `renderBootFailure`, `DOMContentLoaded` boot |

### 1.4 Boot sequence

1. Inline script #1 runs immediately: installs the fetch wrapper (ledger) before any request, creates the Trusted Types policy, wraps `Worker`, then `window.__openshopBoot` sequentially fetches Fabric -> ag-psd -> jsPDF, verifies SHA-384 in page (`crypto.subtle`; Web Crypto is mandatory), executes each from a `blob:` URL, then `configureFabric()`. If boot fails while strict offline is on, strict mode is disabled with a reason and boot is retried, so strict mode can never brick a cold start.
2. `DOMContentLoaded` (33780): `await window.__openshopBoot` -> `OS.init()` -> `document.documentElement.dataset.osBoot = 'ready'`. Failures render "OpenShop could not start" with a Reload button inside the welcome screen (`renderBootFailure(stage, error)`, stages "verified library boot" / "editor initialization").
3. All declarative UI actions are refused (preventDefault) until `<html data-os-boot="ready">`.
4. `init()` (6666) order: `new fabric.Canvas('editor-canvas', {preserveObjectStacking, enableRetinaScaling, stopContextMenu, fireRightClick, renderOnAddRemove:false, backgroundColor:'#1a1a1a', selection:true})` -> `_ensureCanvasCeiling()` -> `_initializeBlankWorkspace()` -> `_initializeRenderer()` (async) -> input observers -> canvas events (mouse, `object:modified` -> command `object.transform.set` + history, selection, text, wheel, `path:created` -> raster stroke commit and symmetry mirror) -> window resize / beforeunload (dirty prompt) -> `_restorePreferences`, `_restoreTheme`, `initCmdPalette`, `setTool('select')`, `_restoreToolOptionState` -> property-panel buttons -> drag/drop -> touch gestures -> snap-to-grid and smart guides -> welcome templates and recent files -> tool-button a11y -> `_initNativePopoverUI`, `_initMenuAccessibility`, `_initModalFocusManagement`, `_initCanvasFocusContext`, `_initPanelSplitters`, `_initSelectionModes`, tab semantics, `_initAccessibleControls` -> `initPWA()` -> `_initEmbedBridge()` -> `_initAutoSave()` -> `initColorWheel`, `updateHistogram` -> `session.application.ready = true`.
5. `dismissWelcome()` (20733) performs one-time deferred initialisation: command palette, context menu, tool groups, dropzone, clipboard paste, minimap, palettes, imported assets, keyboard shortcuts, i18n stamping, restore `os_lang` and `os_workspace_mode`; captures the Before/After baseline 500 ms later.

### 1.5 Global state model

**Single global object `OS`** (const, 4501-33677) owns UI wiring, document, history, tools and every subsystem. Other globals: `window.__openshopNetwork`, `window.__openshopBoot`, `globalThis.__openshopTrustedHTML`.

**Session owner** (`OS.session`, 5877):

| Field | Default | Meaning |
|---|---|---|
| `application` | `{ id:'openshop', version:'0.31.0', ready:false }` | |
| `workspace` | `{ layout:'default', mode:'standard' }` | mode in `standard/essentials/motion/mobile` |
| `tool` | `{ selectedId:'select' }` | |
| `document` | `{ activeId:null, openIds:[], name:null }` | `openIds` holds at most one id |
| `viewport` | `{ zoom:1, transform:[1,0,0,1,0,0] }` | |
| `panels` | `{ visible:true, activeTabs:{ ptg1:'ptg1-layers', ptg2:'ptg2-color', ptg3:'ptg3-history' } }` | |
| `preferences` | `{ language:'en', theme:'default' }` (plus `toolOptions`) | |
| `persistence` | `{ state:'clean', dirty:false }` | |

**Multi-document: NOT supported.** One active document per window; `_syncSessionDocument` sets `openIds` to `[activeId]` or `[]`. Roadmap PS-002 states multi-document tabs and independent document windows are not implemented. A blank workspace (`_blankWorkspace:true`, `_documentId:null`) is a first-class state with its own card (`#blank-workspace`) and `<html data-os-document="blank|open">`; document-dependent panel actions are disabled.

**Document fields on OS** (5909-6176, selected): `canvas` (Fabric), `layers[]`, `activeLayerIdx`, `_selectedLayerIds`, `canvasW/H` (new-doc default 1920x1080), `zoom`, `_documentResolution` 96, `_documentSchemaVersion` 3 with `_documentMigrationRegistry` {1: add `kind/parentId/collapsed`, 2: normalize text range styles, 3: identity}, `_documentId` and `_documentIdAliases` (max 20), `_docName`, `_isDirty`, `_persistenceState`, `_documentRevision`, `_documentGeneration`, `_computeJobs` (cancellable job registry), `_imageMetadata {version, sourceFormat, exif, xmp, exifSegment, xmpSegment, c2pa}`, `_workingColorSpace` ('srgb'), `_colorProfile`, `_aiMasks`, `guides`, `_stickyNotes`, animation (`_animFrames`, `_animDelays`, `_animIdx`), macros, history (`maxHistory` 120, `maxHistoryBytes` 192 MB, schema v2, 64 px history tiles, checkpoint every 16 entries), typed command registry (`_commandSchemaVersion` 1).

**Layer record**: `{ id, name, visible, locked, opacity 0-100, blend (canvas composite op, default 'source-over'), kind:'pixel'|'group'|'adjustment', parentId, collapsed, adjustment, psd, objects[] (live Fabric objects) }`; serialized with `objectIds[]` instead of objects. A new document creates `Background` (locked) and `Layer 1`.

**Serialized document** (`_captureDocumentState`, 8446): `kind:'openshop-document'`, `document`, `canvas {width, height, fabric: canvas.toJSON(props)}`, `layers`, `guides`, `selection {bounds, mask}`, `animation {frames, activeFrameIndex}`, `interchange {psd}`. Fabric custom properties are whitelisted in `configureFabric` (line 31) and `_fabricDocumentProperties` (5980).

**Scene seam** (6312): `{ kind:'openshop-scene', schemaVersion:1, document, canvas, layers, nodes[{id, type, attributes}], guides, selection, animation, interchange }`.

### 1.6 Rendering approach

#### 1.6.1 Main preview and export
- **Fabric.js 7.4.0 on Canvas 2D on the main thread** is the only production renderer for both preview and export. `renderer.adapters = { preview:'fabric-preview', export:'fabric-export', reference:'scene-reference' }`, contract `'openshop-render-v1'`. Export resets the viewport to identity, calls `canvas.toDataURL({format, quality 0.01-1, multiplier 0.01-16, left:0, top:0, width, height})`, then restores the viewport.
- The reference adapter only fingerprints the scene JSON (determinism tests); there is no independent pixel compositor. Roadmap PS-003/PS-060: worker, WebGL2 and WebGPU render adapters are future work.
- Overlays are separate DOM canvases: `#grid-overlay`, ruler canvases, `.pixel-grid-canvas`, minimap, histogram, color wheel; guides, measure, lasso, pen, crop and selection overlays are DOM elements over `#canvas-area`.
- Zoom range 0.05-20. Optional integer pixel-zoom snapping (`_pixelZoomLevels`: 1/20 ... 1/2 and 1 ... 20); above 1x with snapping on, `imageSmoothingEnabled=false` on every Fabric context.

#### 1.6.2 Offscreen renderer probe
- `_initializeRenderer()` (6842): if `HTMLCanvasElement.prototype.transferControlToOffscreen` and `Worker` exist, creates the filter worker in `'offscreen'` mode, transfers an OffscreenCanvas, waits up to 3000 ms for `{_rendererProbeId, supported}`. Success sets `capabilities.offscreenCanvasWorker = offscreenFilter = true` and `paths.preview = paths.filter = 'offscreen-filter-worker'`; failure records `fallbackReason` and keeps `paths = {preview:'fabric-main-thread', filter:'filter-worker'}`. In practice preview still renders with Fabric; the offscreen worker serves filter pipelines.

#### 1.6.3 Filter worker (25963-26780)
Inline worker source assembled from a template string into a verified `blob:` URL; three instances keyed by backend: `_filterWorker` ('worker'), `_photonFilterWorker` ('photon'), `_rendererWorker` ('offscreen').

| Backend | Implementation | Ops |
|---|---|---|
| `photon` | Photon 0.3.3 WASM (bytes passed from main thread, verified) | edgeDetect, threshold, gaussianBlur, sharpen, emboss, grayscale, sepia, invert |
| `gpu` | `runAcceleratedFilter`: WebGPU compute (`navigator.gpu.requestAdapter` inside the worker), fallback WebGL2 on OffscreenCanvas (fragment shader) | invert, grayscale, threshold, brightness, contrast, blur, sharpen (`_gpuParityOps`) |
| `offscreen` | OffscreenCanvas 2D `getImageData` pipeline; supports `op:'pipeline'` with `params.filters[]` | any `filterOps` entry |
| `worker` (default) | Pure JS `filterOps` on a transferred `Uint8ClampedArray` | full CPU filter set |

- Firefox: `_gpuFilterDisabled` is true (WebGL2 in an OffscreenCanvas worker can crash Firefox's GPU process).
- Per-op benchmarks (`_recordFilterBenchmark`, `filterBackendReport()`): samples, totalMs, lastMs, fps per backend.
- Jobs are cancellable (`_runFilterJob`, `job.cancel`); the progress dialog is deferred 150 ms.

#### 1.6.4 Canvas ceiling probe (6407-6597)
- Configured budget: `maxImageDimension` 30000, `maxImagePixels` 80,000,000.
- `_probeCanvasCeiling()`: tests a `max x 1` canvas, else binary-searches the max dimension; then tests area with near-square sizes, else binary-searches max pixels. Each candidate writes `rgb(17,34,51)` to pixel (0,0), reads it back (`willReadFrequently`), then shrinks to 1x1 to free memory.
- Result `{version:1, maxDimension, maxPixels, measured, source:'probe'|'cache'|'fallback', environment{userAgent, platform, devicePixelRatio, deviceMemory, hardwareConcurrency, configuredDimension, configuredPixels}, measuredAt, cappedByApplicationBudget}` is cached in localStorage `openshop.canvas-ceiling.v1`; the cache is invalidated when the environment JSON changes.
- `_applyCanvasCeiling` clamps `_importLimits` and `_psdLimits`. `_assertCanvasDimensions` throws `code:'openshop.canvas-ceiling'` with "... exceeds the measured browser canvas ceiling (N px per side / M MP total)". Exposed via `getCanvasCeiling()` and the diagnostics report. Probe failure records diagnostic `openshop.canvas-ceiling-probe` and falls back to the configured budget.

#### 1.6.5 Workers
| Worker | Created at | Purpose |
|---|---|---|
| Filter / Photon / Offscreen renderer | 26771 | see above |
| Auto-save worker | 23136 | OPFS writes via `createSyncAccessHandle` (temp file -> verify -> promote -> verify -> remove temp) |
| PSD parse worker | 13012 | ag-psd (`psdDecoder` asset) with `initializeCanvas` -> `OffscreenCanvas` (12752); cancellable, bounded allocator |
| GIF encoder/decoder worker | modern-gif `worker.js` (verified blob URL) | GIF import/export |
| LibRaw worker | libraw-wasm `worker.js` | Camera RAW decode |
| PDF.js worker | `pdf.worker.min.mjs` | PDF import |
| C2PA worker | via `highgain` transport | Content Credentials read |
| Transformers.js / ONNX | not a worker: main thread, `numThreads=1`, `proxy=false` | AI |

All workers pass through `OpenShopTrustedWorker`: only URLs minted from verified bytes (`OPENSHOP_SCRIPT_URLS`) are accepted; a library's own inline `blob:`/`data:` worker is allowed only while `OPENSHOP_VERIFIED_INLINE_WORKER_DEPTH > 0`.

### 1.7 Persistence

#### localStorage keys

| Key | Value | Written by | Notes |
|---|---|---|---|
| `os_strict_offline` | `'on'` / `'off'` | ledger `setStrict` / `disableStrict` (line 44) | read before first fetch |
| `os_prefs` | JSON preference record (schema v2) | `_persistPreferences` (25661) | see section 16 |
| `os_theme` | `default` / `light` / `midnight` / `oled` | `setTheme` (30126) | absent = follow OS color scheme |
| `os_lang` | `en` / `zh` | Preferences Apply (25644), settings import | |
| `os_workspace_mode` | `standard` / `essentials` / `motion` / `mobile` | `setWorkspaceMode` (6236) | |
| `os_palette` | JSON array of hex colors | palette add / clear / import | max 256 colors |
| `os_brushes` | JSON array of imported ABR brushes | `_persistImportedAssets` (29206) | |
| `os_gradients` | JSON array of gradient presets | (29207) | max 200 presets, 256 stops |
| `os_presets` | JSON array of photo presets | (32560) | |
| `openshop_recent` | JSON array (max 10) `{name, dims:'WxH', date}` | `trackRecentFile` (20883) | display only; cannot reopen |
| `openshop.canvas-ceiling.v1` | probe result JSON | 6500 | |
| `openshop.plugin-consents.v1` | `{ [pluginId]: {id, version, name, sourceHash, capabilities[], allowedAt, lastFailure} }` (max 100) | `_pluginPersistConsents` | |

All writes go through `_persistLocal(key, value, {label})` (7071), which detects quota errors (`QuotaExceededError`, codes 22/1014), records a diagnostic, and toasts "<label> could not be saved because browser storage is full". Settings import writes the 7 settings keys transactionally with rollback (`_writeSettingsStorage`).

- **sessionStorage: not used.**

#### IndexedDB

| DB | Version | Store | keyPath | Use |
|---|---|---|---|---|
| `openshop-share-v1` | 1 | `payloads` | `id` | Web Share Target handoff from SW to page: `{ id:'share-<ts36>-<uuid>', createdAt, files:[{name, type, lastModified, size, data:ArrayBuffer}] }`. Purged after 30 min (`SHARE_MAX_AGE_MS`); deleted after the page consumes it. |

No other IndexedDB databases are opened by app code.

#### OPFS (Origin Private File System)

| Path | Contents |
|---|---|
| `/openshop-recovery-v1/` | recovery directory (`_recoveryDirectoryName`) |
| `/openshop-recovery-v1/index.json` | `{ kind:'openshop-recovery-index', schemaVersion:1, updatedAt, snapshots:[...] }` |
| `/openshop-recovery-v1/recovery-<documentId>-<generationId>.json` | Envelope `{ kind:'openshop-recovery', schemaVersion:1, payload:<JSON string>, checksumAlgorithm:'fnv1a-32', checksum, documentId, ownerId, leaseExpiresAt, ... }` |
| `/openshop-recovery-v1/.tmp-<token>.json` | atomic-write staging files |
| `/openshop-autosave.json` | legacy single-file autosave (migrated by `_migrateLegacyRecovery`, deleted on discard) |

- Autosave every 30 s (`setInterval(_autoSave, 30000)`) when dirty; retention 5 generations per document and 30 total.
- Multi-tab coordination: `BroadcastChannel('openshop-recovery-v1')` messages `claim` / `saved` / `release` (lease 65 s, re-claim every 20 s); Web Lock `openshop-recovery-index-v1` (exclusive) around index rewrites; a tab finding a foreign owner forks a new document id ("Another tab owns that recovery stream; this tab will save a separate copy").
- Recovery is offered on startup; a corrupt newest generation falls back to the newest verified older one. The "Recovery Storage" manager (command palette) lists generations with Preview / Export (`.openshop`, or `-corrupt-envelope.json`) / Discard, shows `navigator.storage.estimate()` and `persisted()`, and offers "Keep recovery data" (`navigator.storage.persist()`), with a Safari 7-day eviction warning.

#### Cache Storage

| Cache name | Owner | Contents |
|---|---|---|
| `openshop-shell-<rev>` (+ `-staging`, `-candidate`, `-candidate-retry`) | sw.js | verified app shell per revision |
| `openshop-runtime-<rev>` | sw.js | allowlisted runtime CDN assets, cap 60 entries (oldest evicted first) |
| `openshop-offline-meta-v1` | sw.js | state JSON at `./__openshop_offline_state__` |
| `openshop-transformers-4.2.0` | page (`lib.env.cacheKey`) | verified ONNX WASM + factory (with `X-OpenShop-Integrity` header) and Transformers.js model files from Hugging Face |

#### File System Access and downloads
- Open uses `showOpenFilePicker` when available, else `<input type=file>`. Save Project uses `showSaveFilePicker` and keeps `_projectFileHandle` in memory only (not persisted across reloads). PWA `launchQueue` file handles open launched files.
- Downloads via anchor + `URL.createObjectURL` (revoked after 60 s): `openshop-settings.json`, `openshop-palette.json`, `openshop-presets.json`, `openshop-diagnostics.json`, `openshop-action.json` (macros), `openshop-project.openshop`, GIF / spritesheet, all image export formats.

### 1.8 Service worker (`sw.js`)

| Constant | Value |
|---|---|
| `SHELL_REVISION` | `'0.31.0-r1'` |
| `TRUSTED_SHELL_REVISIONS` | `0.31.0-r1, 0.30.0-r2, 0.29.0-r2, 0.29.0-r1, 0.28.0-r1, 0.27.0-r2, 0.27.0-r1, 0.26.0-r4, 0.26.0-r3, 0.26.0-r2, 0.26.0-r1, 0.25.0-r1` (state is origin-readable, so only these known revision/cache names are honoured; `sanitizeState` drops anything else) |
| `STATE_SCHEMA` | 1 |
| Caches | `openshop-shell-<rev>`, `<shell>-staging`, `<shell>-candidate`, `<shell>-candidate-retry`, `openshop-runtime-<rev>` (limit 60), `openshop-offline-meta-v1` |
| `MAX_TRIAL_NAVIGATIONS` | 3 |
| Share target | DB `openshop-share-v1` / `payloads`; max 8 files, 128 MiB each, 256 MiB total, 30 min retention |
| Test hook | `?openshop-test-abort-promotion=N` on the SW URL aborts promotion after N copies |

**REQUIRED_ASSETS** (13): `./`, `./index.html`, `./plugin-sandbox.html`, `./plugin-sandbox.js`, `./manifest.webmanifest`, `./icon-192.png`, `./icon-512.png`, `./design/openshop-social-preview.png`, `./design/openshop-studio-master.png`, `./design/openshop-menu-states.png`, Fabric 7.4.0, ag-psd 31.0.2, jsPDF 4.2.1.
**OPTIONAL_ASSETS** (4): Photon JS + WASM 0.3.3, modern-gif 2.1.0 index + worker.
**CACHEABLE_RUNTIME_URLS**: required + optional + every other pinned lazy asset URL (pdf.js x2, libraw x4, AVIF enc/dec x4, svg2pdf, imagetracer, fabric extensions, transformers, c2pa x4, heic x2, jxl x2, onnx x4). `RUNTIME_ORIGINS = {https://cdn.jsdelivr.net}`.

**Lifecycle**:
1. `install` -> `stageShell()`: fill `-staging` with required assets (`cache:'reload'`, CORS for cross-origin); any required failure deletes staging and fails the install (active shell untouched). Optional failures are recorded. Writes a per-revision report `{requiredTotal, requiredCached, requiredAssets, optionalTotal, optionalCached, optionalMissing, stagedAt}` (keeps 4 revisions), writes a resume marker `promotion:{revision, cache}`, copies staging -> candidate cache, verifies every entry, sets `stagedRevision/stagedCache`, deletes staging.
2. `activate` -> `activateShell()`: resumes an interrupted promotion; if the candidate contains all required assets, flips the pointer: `previousRevision/Cache` = old active, `activeRevision/Cache` = candidate, `confirmed = !hadActive` (first install is auto-confirmed; upgrades start on trial). Trims shell caches to active + previous; `clients.claim()`.
3. **Trial / health check**: each navigation while `!confirmed && previousRevision` increments `trialAttempts`; after more than 3 unconfirmed navigations the SW rolls back to the previous revision (records `rolledBackFrom`, `failedRevision`; failed cache kept so a restage can recover). The page confirms health with `OPENSHOP_CONFIRM_BOOT {revision}` two animation frames after registration, only if `canvas.getObjects`, `fabric`, `agPsd` and `window.jspdf` all exist and status reports `shellReady`.
4. **Routing** (`fetch`): POST to scope with `?share=target` -> `handleShareTarget` (store in IDB, 303 redirect to `./?share=ready&share_id=...` or `./?share=error&share_error=unavailable`); other non-GET ignored; `navigate` -> cached `index.html` (or `./`) from the active revision cache, else network, else inline 503 page "OpenShop is not ready offline"; same-origin or jsDelivr GET -> `handleAsset`: shell cache first, then (if allowlisted) runtime cache, else network. Runtime caching only for `ok`, non-opaque responses without `no-store/private` and without `Vary: *|cookie|authorization`; `no-cors` requests to jsDelivr are re-fetched with CORS so the status is visible. **Hugging Face model weights are not handled by the SW** (not in `RUNTIME_ORIGINS`); they rely on the Transformers.js cache.
5. **Messages** (reply on `event.ports[0]`; accepted only from a client whose URL path is the scope root or `index.html`): `OPENSHOP_GET_STATUS`, `OPENSHOP_CONFIRM_BOOT`, `OPENSHOP_APPLY_UPDATE` (`skipWaiting`), `OPENSHOP_ROLLBACK`, `OPENSHOP_RESTAGE` (re-runs `stageShell` + `activateShell` after a rollback without needing a new release). Page side times out after 7000 ms.
6. Status payload: state + `requiredTotal`, `requiredCached`, `optionalTotal`, `optionalCached`, `shellReady`, `rollbackAvailable`, `activeRevision`, `workerRevision`.

Registration: `navigator.serviceWorker.register(OPENSHOP_TRUSTED_SERVICE_WORKER_URL('./sw.js'), { scope:'./', updateViaCache:'none' })`; the TT policy allows exactly `./sw.js`. `updatefound` -> `statechange` sets "Update ready" when a waiting worker exists; `redundant` reports "An offline update failed validation; the verified shell remains active." Apply Update / Restore Previous Shell / Rebuild Offline Shell each require a confirmation that handles the unsaved document (`_authorizeOfflineRuntimeReplacement`, discards OPFS recovery for the document before replacement).

### 1.9 CDN libraries

All from `https://cdn.jsdelivr.net/npm/...`, exact versions, SHA-384 verified in page, executed only from `blob:` URLs (or as bytes handed to workers / WASM instantiation). `script-src` names no CDN.

| Key | Package@version | File | License | Load | Used by |
|---|---|---|---|---|---|
| (boot) Fabric.js | fabric@7.4.0 | dist/index.min.js | MIT | Eager (boot) | entire canvas/document model |
| (boot) ag-psd | ag-psd@31.0.2 | dist/bundle.js | MIT | Eager (boot) | PSD export on main thread; health check |
| (boot) jsPDF | jspdf@4.2.1 | dist/jspdf.umd.min.js | MIT | Eager (boot) | PDF export |
| `psdDecoder` | ag-psd@31.0.2 | dist/bundle.js | MIT | Lazy | PSD import worker (12743) |
| `photonModule` / `photonWasm` | @silvia-odwyer/photon@0.3.3 | photon_rs.js / photon_rs_bg.wasm | Apache-2.0 | Lazy | Photon filter worker (26929) |
| `gifCodec` / `gifWorker` | modern-gif@2.1.0 | dist/index.js / dist/worker.js | MIT | Lazy | GIF import (10509) and export (30844) |
| `pdfModule` / `pdfWorker` | pdfjs-dist@6.2.108 | build/pdf.min.mjs / build/pdf.worker.min.mjs | Apache-2.0 | Lazy | PDF import (5030) |
| `rawIndex` / `rawWorker` / `rawLib` / `rawWasm` | libraw-wasm@1.6.0 | dist/index.js, worker.js, libraw.js, libraw.wasm | ISC | Lazy | Camera RAW import (4978) |
| `avifEncoderModule` / `avifEncoderWasm` | @jsquash/avif@2.1.1 | codec/enc/avif_enc.js / .wasm | Apache-2.0 | Lazy | AVIF export (5067) |
| `avifDecoderModule` / `avifDecoderWasm` | @jsquash/avif@2.1.1 | codec/dec/avif_dec.js / .wasm | Apache-2.0 | Lazy | AVIF import fallback (5133) |
| `svg2pdf` | svg2pdf.js@2.7.0 | dist/svg2pdf.umd.min.js | MIT | Lazy | vector PDF export |
| `imageTracer` | imagetracerjs@1.2.6 | imagetracer_v1.2.6.js | Unlicense | Lazy | Trace to Vector (32104) |
| `fabricExtensions` | fabric@7.4.0 | dist-extensions/fabric-extensions.min.js | MIT | Lazy | on-canvas gradient handles |
| `transformers` | @huggingface/transformers@4.2.0 | package root (ESM) | Apache-2.0 | Lazy | AI module (31248) |
| `onnxWasm` / `onnxWasmFactory` | onnxruntime-web@1.26.0-dev.20260416-b7804b056c | dist/ort-wasm-simd-threaded.asyncify.wasm / .mjs | MIT | Lazy | AI (non-Safari) |
| `onnxSafariWasm` / `onnxSafariWasmFactory` | same | dist/ort-wasm-simd-threaded.wasm / .mjs | MIT | Lazy | AI (Safari UA) |
| `c2paModule` | @contentauth/c2pa-web@0.13.4 | +esm | MIT | Lazy | Content Credentials read (4927) |
| `c2paHighgain` | highgain@0.1.0 | +esm | ISC | Lazy | C2PA worker transport |
| `c2paDeepmerge` | ts-deepmerge@8.0.0 | +esm | ISC | Lazy | C2PA settings merge |
| `c2paWasm` | @contentauth/c2pa-wasm@0.11.2 | pkg/c2pa_bg.wasm | MIT | Lazy | C2PA reader |
| `heicDecoderModule` / `heicDecoderWasm` | @discourse/heic@1.0.0 | codec/dec/heic_dec.js / .wasm | Apache-2.0 | Lazy | HEIC/HEIF import (5199) |
| `jxlDecoderModule` / `jxlDecoderWasm` | @jsquash/jxl@1.3.0 | codec/dec/jxl_dec.js / .wasm | Apache-2.0 | Lazy | JPEG XL import (5206) |

Strict-offline capability groups (`_networkCapabilities`, 21424): "AVIF import and export", "Animated GIF import and export", "GPU-accelerated filters (Photon)", "PSD import and export", "Trace to Vector", "On-canvas gradient handles", "AI features (model weights are fetched separately)", "Content Credentials validation", "HEIC and JPEG XL import".

Fonts: no webfont files are loaded; UI uses system font stacks (`--font-ui`, `--font-mono`); canvas text defaults name 'DM Sans' and 'JetBrains Mono' (fall back to system fonts).

### 1.10 Content Security Policy and Trusted Types

Meta CSP (line 22):

| Directive | Value |
|---|---|
| `default-src` | `'self'` |
| `base-uri` | `'none'` |
| `object-src` | `'none'` |
| `form-action` | `'none'` |
| `script-src` | `'self'` + two inline `sha256-` hashes (bootstrap script and main script) + `'wasm-unsafe-eval'` + `blob:` |
| `require-trusted-types-for` | `'script'` |
| `trusted-types` | `openshop-loader` |
| `style-src` | `'self' 'unsafe-inline'` |
| `font-src` | `'self' data:` |
| `img-src` | `'self' data: blob: https:` |
| `connect-src` | `'self' https://cdn.jsdelivr.net https://huggingface.co https://*.hf.co blob:` |
| `worker-src` | `'self' blob:` |
| `frame-src` | `'self' blob:` |

- No `frame-ancestors` (impossible in a meta tag); SECURITY.md tells hosts to send the same CSP as an HTTP header and set `frame-ancestors` if embedding is allowed, and to serve from a dedicated HTTPS subdirectory.
- Trusted Types policy `openshop-loader` (line 206): `createScriptURL` accepts only URLs in `OPENSHOP_SCRIPT_URLS` (blob URLs minted for verified bytes) or `OPENSHOP_STATIC_SCRIPT_URLS` (only `./sw.js`); `createHTML` passes application-owned template strings (`OS._trustedHTML` tagged template). Browsers without TT use the same allowlist checks.
- Plugin sandbox page CSP: `default-src 'none'; base-uri 'none'; object-src 'none'; connect-src 'none'; img-src 'none'; style-src 'none'; script-src 'self' 'unsafe-eval' 'sha256-khrnJif+Cin/8nBGgc7cXb9GsB2tU9n5+Fn9DNJXrMM='; trusted-types openshop-loader;`.

### 1.11 Declarative event-handler registry (security pattern)

- Static markup contains no `on*=` attributes. Controls declare `data-os-click="click-NNN"`, `data-os-change`, `data-os-input`, `data-os-keydown`.
- `OS_EVENT_HANDLERS` (4131) is a frozen object of frozen maps; handlers are `function(event){...}` called with `this` = the control.
- `registerDeclarativeEvents()` installs exactly one delegated listener per type on `document`; resolves `closest('[data-os-<type>]')`; blocks clicks on `.dd-item[aria-disabled="true"]`; refuses all actions until `<html data-os-boot="ready">`; unknown action ids are `preventDefault()`ed and logged "Blocked undeclared UI action"; a handler returning `false` prevents default and stops propagation; input/change inside `#tool-options` auto-persists tool options.
- Dynamically created dialogs attach listeners in code (never string handlers). `tools/security.mjs` forbids executable event attributes and verifies CSP hashes at release.

### 1.12 Plugin sandbox

**Model**: a plugin is data (`{ manifest, source }`), never host functions; `plugin.init` functions are rejected. There is **no menu or file-picker UI to install a plugin**; entry points are `OS.showPluginConsent(plugin)` (consent dialog, then load) and `OS.registerPlugin(plugin, {consent})`, called programmatically. Preferences has a "Plugin access" section listing grants with "Revoke access".

**Manifest fields** (`_pluginManifestFor`):

| Field | Rule |
|---|---|
| `id` | lowercased, `/^[a-z0-9][a-z0-9._-]{2,79}$/` |
| `version` | semver-like `/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/` |
| `name` | required, max 80 chars |
| `sourceHash` | `sha256:<64 hex>`; must equal SHA-256 of `source` (verified with Web Crypto before init) |
| `minApiVersion` (or `apiVersion`) | integer 1..`_pluginProtocolVersion` (1) |
| `capabilities` | array, subset of the allowed capabilities |

**Capabilities** (`_pluginCapabilities`): `commands`, `document:read`, `selection:read`, `ui:toast`. No document-write, pixel, file, DOM or network capability.

**Limits**: source 512 KiB (`_pluginMaxSourceBytes`, also enforced inside the sandbox), 32 commands per plugin, ready handshake timeout 10 s, command invocation timeout 10 s, consent store max 100 entries.

**Consent**: dialog "Allow plugin: <name>" shows Plugin ID, Version, Source SHA-256, Minimum API, requested capabilities; buttons "Deny" / "Allow and load". The grant is bound to `{id, version, sourceHash, capabilities}` and persisted in `openshop.plugin-consents.v1`; any version or hash change requires consent again. Revoke disposes running instances.

**Isolation**: hidden `<iframe sandbox="allow-scripts">` (opaque origin, `aria-hidden`, `tabIndex=-1`, `display:none`) loading `plugin-sandbox.html`; the sandbox evaluates `source` with `new Function('"use strict";...')` once and exposes a frozen non-configurable `window.__openShopPluginHost = {protocolVersion, pluginId, token, manifest, capabilities, api}`. Host accepts messages only when `event.source === iframe.contentWindow`, `event.origin === 'null'`, and `protocolVersion`, `pluginId` and the per-load random `token` match.

**Message types**:

| Direction | Type | Payload |
|---|---|---|
| host -> sandbox | `openshop:host-init` | `source, manifest, capabilities, api:{version:1, methods:['register-command','get-document','get-selection','toast']}, protocolVersion, pluginId, token` |
| sandbox -> host | `openshop:plugin-ready` | |
| sandbox -> host | `openshop:plugin-error` | `error` |
| sandbox -> host | `openshop:plugin-request` | `requestId, method, args` |
| host -> sandbox | `openshop:host-response` | `requestId, ok, result` or `error` |
| host -> sandbox | `openshop:command-invoked` | `commandId, requestId` |
| sandbox -> host | `openshop:plugin-result` | `requestId, ok, result` or `error` |

**Host API methods**:

| Method | Capability | Behavior |
|---|---|---|
| `register-command` | `commands` | args `{label (120), category (60), shortcut (30)}`; appends `{label, cat, key, fn}` to the command palette; returns `{commandId, label, category}` |
| `get-document` | `document:read` | `{width, height, activeLayer, layers:[{id, name, visible, locked, opacity, blend, objectCount}]}` (no pixels) |
| `get-selection` | `selection:read` | `{bounds:{x,y,w,h} or null, selectedPixels}` |
| `toast` | `ui:toast` | args `{message (240), type info/success/error}` |

**Handle** returned by `registerPlugin`: frozen `{id, name, manifest, sourceHash, capabilities, protocolVersion, ready:Promise, dispose()}`. Also `listPlugins()`, `listPluginConsents()`, `removePluginConsent(id)`, `disposePlugin(id)`. States: `consented` ("Granted · not loaded"), `pending` ("Loading"), `ready`, `failed`, `disposed`; last failure is remembered per plugin and shown in Preferences.

### 1.13 Embed contract / host bridge (21241-21415)

- Active only when `window.parent !== window`. Protocol version 1 (`_embedProtocolVersion`). Data only; no message carries code.
- On load the editor posts `{type:'openshop:ready', version:1}` to the parent with targetOrigin `'*'` (the only unbound message; carries only the version).
- Binding: the first `openshop:hello` binds `{origin, source window, target}`; afterwards messages from any other window or origin are ignored. Origin `"null"` (file:// or sandboxed host) binds with targetOrigin `'*'`.
- Version mismatch -> `openshop:error` "Unsupported protocol version X; this build speaks 1".
- Every reply includes `version:1` and echoes `id`.

| Host -> editor | Fields | Editor reply |
|---|---|---|
| `openshop:hello` | `id` | `openshop:ready` `{capabilities:{exportFormats:['png','jpeg','webp','avif','svg','pdf','ora'], tools:[all data-tool ids], overrides:['open','save']}}` |
| `openshop:configure` | `document?`, `tools?[]`, `overrides?{open, save}` | `openshop:configured` `{tools, overrides}`; tool allowlist hides other `.tool-btn` and removes them from tab order, switching away from a disallowed active tool |
| `openshop:open` | `document` = `{dataUrl or blob, name}` or `{width, height, background:'#rrggbb'}` | `openshop:opened` |
| `openshop:export` | `format`, `options` | `openshop:exported` `{format, filename, blob}` |
| anything else `openshop:*` | | `openshop:error` `{message}` |

| Editor -> host (unsolicited) | When |
|---|---|
| `openshop:open-requested` | user invokes Open while `overrideOpen` is true (9188) |
| `openshop:save-requested` `{filename, blob}` | any download while `overrideSave` is true (5401, 11323) |

Not present: change/dirty/selection/close events, project (`.openshop`) or PSD round-trip over the bridge (raster or blank document only), readonly mode, theme/locale control from host.

### 1.14 Import limits (`_importLimits`, 6101)
maxJsonBytes 10 MB; maxImageBytes 100 MB; maxImagePixels 80 MP; maxImageDimension 30000; maxProjectObjects 5000; maxProjectLayers 512; ORA entries 640, layer 64 MB, total 100 MB, decoded 512 MB; palette 256 colors; presets 200; asset 64 MB; ABR tip 512 KB / 128x128 px, stroke 2048x2048 px; gradient stops 256; text 10000 chars; GIF frames 300 / 512 MB decoded; animation frames 300 / 512 MB; PDF pages 512 / 512 MB; ICC profile 4 MB; metadata 1 MB; AI masks 32; layer mask 8 MB; smart object 8 MB; batch 500 files / 1 GB input / 2 GB output.

---

## 12. AI / local-model features

### 12.1 Runtime

| Item | Value |
|---|---|
| Library | Transformers.js `@huggingface/transformers@4.2.0`, ESM imported from a verified `blob:` URL; version asserted (`lib.env.version === '4.2.0'`) |
| Inference engine | ONNX Runtime Web `1.26.0-dev.20260416-b7804b056c`: `ort-wasm-simd-threaded.asyncify.{wasm,mjs}`; Safari UA uses `ort-wasm-simd-threaded.{wasm,mjs}` |
| ONNX config | `numThreads = 1`, `proxy = false` (no worker; inference on main thread); `wasmPaths` point at the verified cached URLs, or fall back to in-memory `wasmBinary` + blob factory URL when Cache Storage is unavailable |
| Device selection | `_selectAIDevice()` (31087): `'webgpu'` if `navigator.gpu.requestAdapter()` resolves an adapter, else `'wasm'`; cached for the session. No user override |
| dtype | default `q8`; Background Removal uses `fp32` |
| Model hosting | Hugging Face Hub (`huggingface.co`, `*.hf.co`), each model pinned to a commit revision |
| Caching | `lib.env.cacheKey = 'openshop-transformers-4.2.0'`, `useBrowserCache = true`, `useWasmCache = true` (Cache Storage). Not part of the SW shell; each model must be used online once |
| Concurrency | one model load at a time (`_aiLoadingJobId`); a second attempt toasts "Another AI model is loading, please wait". Every AI run is a cancellable compute job tied to document generation/revision/target; stale results are discarded with a toast ("... result discarded because the document changed") |
| Registry | `_aiPipelines['task:model']`, `_aiArtifacts[model]`; `aiBackendReport()` returns device, cached models, pinned revisions, filter backends, renderer report |

**Pinned models** (`_modelRevisions`, 31297):

| Model id | Revision | Feature |
|---|---|---|
| `Xenova/modnet` | `fa2fa546052fba4c08921230a26cc69a333fca12` | Background removal |
| `onnx-community/depth-anything-v2-small` | `4472b7362082ad9968fee890ca0f1e5aca36b93d` | Depth map |
| `Xenova/slimsam-77-uniform` | `5850ab45f587c112167512ffef949107115e26a0` | Segment Select (SAM) |
| `Xenova/detr-resnet-50` | `8be7ab59ff663484ee9ba2e8d8f267330d5ad03e` | Object detection |
| `Xenova/swin2SR-classical-sr-x2-64` | `93dfc9089abda257351d3a58d5771e2c1ff69442` | Super-resolution 2x |
| `Xenova/swin2SR-classical-sr-x4-64` | `c60eac19ef391153929330791f241a7c861b3214` | Super-resolution 4x |

### 12.2 Download / consent UX

- **No explicit consent or size-confirmation dialog before a model download.** Disclosure: AI menu note "Models download on first use -- no API keys needed" (`role=note`), Segment Select tool-options hint "Panoptic model loads on demand", the Network Activity panel, and the Offline & Install dialog.
- Pre-flight footprint (`_modelDownloadFootprint`): `lib.ModelRegistry.get_pipeline_files/get_files` + `get_file_metadata` -> total bytes, cached bytes, download bytes. Progress message: "X download · Y installed size (webgpu|wasm)", "X model verified in cache (device)", or "First-time download, cached for future use (device)".
- Progress dialog `#ai-progress` (`role="dialog" aria-modal="true"`): title with spinner, message, bar, percent, Cancel (`#compute-cancel`). Callback messages "Downloading: <file>", "Loading: <file>", "Model loaded". Reveal deferred 150 ms; focus returns to the previous element on close. Cancelled downloads dispose the loaded model.
- Toasts "<Label> model ready" / "<Label> model ready (cached)".
- Offline & Install dialog, "AI assets": Transformers.js WASM runtime status ("Offline ready (size)" / not cached) and one row per pinned model (short name, cache entries/bytes, loaded state) with a **Clear** button (`clearModelCache(model)` deletes matching requests across all caches and disposes live pipelines).
- Strict Offline Mode refuses uncached model downloads (fetch wrapper throws).

### 12.3 Features

| Feature | UI entry | Task / API | Params | Output |
|---|---|---|---|---|
| **Background Remove** (`aiRemoveBackground`, 31885) | AI > Background Remove; Filter > Remove Background (AI); palette "AI Background Remove" (`click-094`) | `pipeline('background-removal', 'Xenova/modnet', {dtype:'fp32'})` | active image object (`_getActiveImage`) | RGBA result (must be 4 channels), resized to the original natural size, replaces the image destructively (`_replaceActiveImage`, history "AI BG Remove"). No mask output |
| **Depth Map** (`aiDepthMap`, 31938) | AI > Depth Map (`click-096`), palette | `pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small')`, q8 | active image | depth normalized min-max, false-color (plasma-like) map, scaled to original size, added as a NEW image object "Depth Map" at opacity 0.85 on the active layer; history "AI Depth Map" |
| **Detect Objects** (`aiObjectDetect`, 32018) | AI > Detect Objects (`click-097`), palette | `pipeline('object-detection', 'Xenova/detr-resnet-50')`, `{threshold:0.7, percentage:true}` | active image | per detection a dashed `fabric.Rect` (stroke 2, dash [4,2], 8-color cycle) named `detect-<label>` and a `fabric.Text` "<label> NN%" (12 px JetBrains Mono, rgba(0,0,0,0.7) background) named `detect-label-<label>`; added to the active layer; history "AI Object Detection" |
| **Segment Select** (`activateSegmentSelect`, `aiSegmentSelectAt` 31852) | AI > Segment Select (`click-098`), toolbar selection flyout `data-tool="ai-segment"`, palette | `SamModel.from_pretrained('Xenova/slimsam-77-uniform')` + `AutoProcessor`; `processor(image, {input_points:[[[x,y]]]})`; `post_process_masks(pred_masks, original_sizes, reshaped_input_sizes)`; best mask by IoU (`_bestSamSegment`) | **one positive click point per run** (no negative points, boxes, or iterative refine); click must hit an image object; honors selection combine mode (replace/add/subtract/intersect from options bar and modifier keys) | mask mapped image -> document space through the object transform (0-2 px fill radius), sets the pixel selection mask; recorded in `_aiMasks` (max 32) as `{label, source:'ai-segment'}`; toast "Selected segment (N px)" |
| **Enlarge 2x / 4x (AI model)** (`aiSuperResolve`, 32245) | Image > Enlarge 2x (AI model) (`click-222`), Enlarge 4x (AI model) (`click-223`), palette | `pipeline('image-to-image', 'Xenova/swin2SR-classical-sr-x{2,4}-64')` | factor 2 or 4; output cap 16 MP; **tiling** 128 px tiles with 16 px overlap skirt, max 256 tiles (more -> falls back to resample enlarger with toast); each tile output normalized to exact factor size before cropping the skirt | replaces the image, history "Super Resolution Nx"; if the model fails to load -> falls back to `aiUpscale` |
| **Enlarge 2x / 4x (resample)** (`aiUpscale`, 32343), not ML | Image > Enlarge 2x/4x (resample) (`click-099`/`click-100`) | stepped 2x `drawImage` with `imageSmoothingQuality:'high'` + unsharp mask (1 px blur, strength 0.5) | output cap 16 MP | replaces the image, history "Upscale Nx" |
| **Trace to Vector** (`showTraceDialog` / `traceRasterLayer` 32096), not ML but in the same progress UX | Image > Trace to Vector... (`click-224`) | imagetracerjs 1.2.6 `imagedataToSVG` | Colors 2-64 (default 16), Smoothing 0-5 (0), Detail/pathomit 0-64 (8); input downscaled to at most 1600x1600 px; max 4000 paths | SVG parsed by Fabric into editable Path objects |

Command palette entries: "AI Background Remove", "AI Depth Map", "AI Object Detection", "AI Segment Select" (category AI); "Trace to Vector...", "Enlarge 2x (AI model)", "Enlarge 4x (AI model)", "Enlarge 2x (resample)", "Enlarge 4x (resample)" (category Image).

**Not present**: generative fill / inpainting, model-based object removal, sky replacement, face/portrait tools, multi-point or box-prompt SAM, background removal as a non-destructive mask, pre-download size confirmation, worker-hosted inference, user-selectable device or model.

---

## 14b. Workspaces, screen modes, compact/mobile layout, stylus/pressure

### 14b.1 Workspace presets

Selector `#workspace-selector` in the topbar (label "Workspace", `change-043`), persisted in `os_workspace_mode`, applied by `setWorkspaceMode(mode)` (6228), which sets `<html data-os-workspace>`.

| Mode | Behavior |
|---|---|
| `standard` (default) | desktop layout: topbar 52 px, left toolbar 112 px, options bar, right dock 312 px, statusbar 52 px, bottom tabs 32 px |
| `essentials` | accepted value only; no CSS or behavior differs from Standard (placeholder) |
| `motion` | shows the Timeline tray and selects the Timeline bottom tab (does not auto-create a frame). Leaving Motion stops playback, hides the timeline, selects Mini Bridge |
| `mobile` | forces the phone layout on any viewport (CSS 3044-3075): topbar scrolls horizontally, logo word/version and local badge hidden, statusbar and canvas HUD hidden, floating horizontal toolbar (34 px buttons) at the bottom, tool options as a floating pill, right dock becomes an off-canvas drawer (`#panels.mobile-open`, `right:-320px` -> `6px`) toggled by `#mobile-panel-toggle` ("Show panels"/"Hide panels"); rulers forced off |

Changing mode toasts "Workspace: <Mode>" and re-runs resize + zoom-fit. **Not present**: user-defined/saved workspaces, Reset Essentials, Window menu (roadmap PS-046 PLANNED), floating/undockable panels, panel re-ordering or re-grouping.

### 14b.2 Panel layout save/restore

- Right dock = 3 vertical tab groups: ptg1 (Layers / Properties / Align), ptg2 (Color / Swatches), ptg3 (History / Navigator / Info). ARIA tablist semantics with roving tabindex.
- Splitters (`_initPanelSplitters`, 21060): `<button role="separator" aria-orientation="horizontal">` between groups; pointer drag, ArrowUp/ArrowDown 16 px (Shift 48 px), Home or double-click restores natural size; min 80 px, max 2000. Heights persisted as `prefs.panelSizes` (max 8) in `os_prefs`.
- Active tabs are tracked in `session.panels.activeTabs` but **not persisted** across reloads.
- `togglePanels()` hides/shows `#panels`, `#toolbar`, `#tool-options` (Tab key while the canvas has focus context; palette "Toggle Panels").
- Bottom tabs: "Mini Bridge" (the canvas container) and "Timeline"; `<html data-os-bottom-tab>`.
- Tool option values persisted as `prefs.toolOptions` (control id -> `{value}` / `{checked}`), restored at init by dispatching input/change events.

### 14b.3 Screen modes / fullscreen

- `toggleFullscreen()` (21001): toggles `body.fullscreen`, which hides topbar, toolbar, panels, statusbar, tool options and rulers so the canvas fills the window. It does **not** call the browser Fullscreen API. Shortcut `F`; View > Fullscreen Mode (menuitemcheckbox); palette "Fullscreen"; tool catalog entry `mode.screen` maps to it. Toast "Fullscreen (click View > Fullscreen to exit)".
- **Not present**: Photoshop's three screen modes (Standard / Full Screen With Menu Bar / Full Screen), Rotate View (catalogued, unimplemented), Quick Mask mode (catalogued, unimplemented). Roadmap PS-015 PLANNED.

### 14b.4 Responsive breakpoints and compact behavior

| Media query / rule | Effect |
|---|---|
| `max-height:800px and min-width:768px` (653) | compressed vertical chrome |
| `max-width:1160px` | hide `#command-launch` button |
| `max-width:1080px` | hide status color profile |
| `max-width:940px` | hide offline-state badge |
| `max-width:860px` | hide object count |
| `max-width:1024px` (3036) | modal buttons min-height 44 px (touch targets) |
| `min-width:768px and max-width:1023px` (3077) | tablet: panel 248 px, toolbar 104 px, local-badge text hidden, smaller menu items, 2-column welcome, 3-column template grid |
| `max-width:767px` (2814) | phone: `--panel-width:0`, `--toolbar-w:0`, topbar 44 px, tool size 34 px, statusbar and canvas HUD hidden, bottom tabs 40 px, tooltips off, flyouts open upward, vertical ruler hidden, timeline floats above the toolbar |
| `max-width:767px and orientation:landscape` (2995) | welcome as 2-column grid without scroll |
| Rulers | hidden whenever `innerWidth < 1024` or workspace is `mobile` (`_syncRulerChrome`) |
| Mobile panel drawer | `_isMobilePanelLayout()` = workspace mobile or `max-width:767px`; closed drawer is `inert` + `aria-hidden` |
| `prefers-reduced-motion:reduce` (361) | animations and transitions 0.01 ms |
| `forced-colors:active` (3097) | system colors, no blur/shadows, canvas `forced-color-adjust:none` |
| `prefers-contrast:more` (3117) | stronger text and border contrast |

### 14b.5 Touch gestures

- `_initTouchGestures(area)` (16236): with exactly two touches on `#canvas-area`, combined **pinch zoom** (ratio of finger distance, clamped 0.05-20, honors pixel-zoom snap, zooms about the midpoint) and **two-finger pan** (midpoint delta added to the viewport translate). `passive:false` + `preventDefault`. Updates grid and minimap viewport.
- One finger goes to Fabric as pointer input (tools draw). Mouse wheel zoom `zoom * 0.999^deltaY` about the cursor.
- **Not present**: rotate gesture, two/three-finger tap undo/redo, long-press context menu, inertia, gesture-based pan with one finger in Hand tool beyond normal pointer.

### 14b.6 Stylus pressure and tilt

| Aspect | Implementation |
|---|---|
| Pressure detection | `_beginPressureStroke` (15863): tools brush/pencil/eraser with `pointerType === 'pen'` only. Tracks min/max pressure in the stroke; considered real once range >= 0.05 ("Stylus: pressure"), otherwise "Stylus: tracking"; after stroke "Stylus: pressure" or "Stylus: fixed". Status element `#brush-pressure-status` |
| Pressure -> Fabric brush | `brush.width = base * (0.25 + 0.75 * pressure)` (pencil base 1); reset on stroke end. Pressure does not drive opacity/flow for the native brush |
| Pressure -> ABR stamp brushes | per asset `pressureSize` (default true): size x (0.25 + 0.75p); `pressureOpacity` (default false): opacity x (0.25 + 0.75p) |
| Tilt | opt-in checkbox `#brush-tilt` (`change-047`, `setTiltDynamics`), status `#brush-tilt-status` ("Tilt: off/on/active"). Reads `tiltX/tiltY/azimuthAngle/altitudeAngle` (derives azimuth/altitude from tilt if missing). Fabric brush width x (0.45 + 0.55 sin(altitude)); ABR stamps: flatten = 1 + (1 - max(0.35, sin(altitude))) x 1.5, rotation = azimuth |
| Sample stream | `getCoalescedEvents()` for full-rate samples; `getPredictedEvents()` for latency hiding (predicted points removed on the next real sample, `_reconcilePredictedBrushSamples`); samples interpolated including pressure and tilt |
| Capability report | `_buildInputCapabilityReport()` (diagnostics): pointerEvents, touchEvents, maxTouchPoints, coarsePointer, pressure api/observedVariance/mode, coalesced/predicted/tilt API + observed sample counts, visualViewport resize count, orientation API/changes/type, `env(safe-area-inset-*)` support and measured insets, workspace |
| Not present | barrel rotation (`twist`), eraser-end detection (button 5), palm rejection, pressure curve editor, per-tool pressure toggles |

### 14b.7 Themes

| Theme id | Menu label | Notes |
|---|---|---|
| `default` | Dark (Default) | `:root` tokens, `--bg-depth-0 #070b12`, `--accent #3978ff`, `--theme-color #0a0c10` |
| `midnight` | Midnight | `:root.theme-midnight`, accent `#588cff` |
| `oled` | OLED Black | `:root.theme-oled`, `--bg-depth-0 #000`, accent `#4f86ff` |
| `light` | Light | `:root.theme-light` plus component overrides (2704+) |

- `setTheme()` sets class `theme-<id>` and `data-os-theme` on `<html>`, updates `<meta name="theme-color">` from `--theme-color`, repaints canvas-drawn chrome (grid, rulers, pixel grid, minimap, histogram), persists `os_theme`.
- With no saved theme it follows `prefers-color-scheme: light` live (`_watchSystemTheme`); the CSS fallback at line 993 applies light tokens when `<html>` lacks `data-os-theme`.
- Custom accent: Preferences "Accent Color" sets inline `--accent` on `<html>`, persisted as `prefs.accent`.
- Entry points: View > Theme submenu (menuitemradio), palette "Theme: Dark/Midnight/OLED/Light".

---

## 15. Collaboration, network, offline, PWA

### 15.1 Collaborative Session (WebRTC, 11823-12241)

| Item | Value |
|---|---|
| Entry | command palette "Collaborative Session" (category File); not in the File menu |
| Transport | `RTCPeerConnection({ iceServers:[] })` (no STUN/TURN, so it only connects where host candidates are mutually reachable, e.g. same LAN) + one ordered DataChannel `'openshop-document'` created by the offerer |
| Signaling | manual copy/paste. "Local signaling text" (readonly textarea) and "Remote signaling text". Text = JSON `{type:'offer'|'answer', sdp, protocolVersion:2, sessionId, peerId, documentId}` produced after ICE gathering completes (non-trickle). Max 2 MB, schema-validated |
| Roles | **Offerer** ("Create offer"): creates session id, data channel and offer. **Answerer** ("Join with offer", paste offer, "Apply remote / create answer"). Offerer then pastes the answer and applies it. Exactly one remote peer; messages from a second peer id are rejected |
| Consent | checkbox "I consent to share this document with the peer..." must be ticked before Create/Join; every send re-checks it |
| Identity | random `peer-<20 hex>` per side, shown as "Peer fingerprint: <peerId>" (not the DTLS certificate fingerprint) |
| What is sent | the whole document state (`_captureDocumentState()`, same as a project file) on channel open and after each change, debounced 120 ms. Message `{kind:'openshop-collab', version:2, type:'state', sessionId, peerId, documentId, revision, baseRevision, state}` |
| Chunking | payloads > 180 KiB are split into `type:'chunk'` messages `{transferId, index, total (<=512), data (base64), sessionId, peerId, documentId, revision, baseRevision}`; max state 32 MiB |
| Conflict policy | last-writer-wins by tuple key `revision (12-digit) : peerId`; incoming tuples <= current are ignored ("Conflict resolved locally; retained revision N"); stale per-peer revisions ignored; concurrency flagged when `baseRevision` differs |
| Apply | serialized through `applyChain`; rollback snapshot; `_loadDocumentState(state, {trusted:false, fitToViewport:true})`; on rejection the local document is restored |
| Status | `#collab-status` (aria-live): "Connected -- peer channel is ready (peer ...)", "Peer channel closed -- local changes are queued for reconnect", "Synchronized with peer", "Concurrent edit resolved deterministically", errors also toast |
| Buttons | Create offer, Join with offer, Copy local (Clipboard API, fallback selects text), Apply remote / create answer, Disconnect, Close |
| Not present | signaling server / room codes / QR, presence cursors, operation-level sync or CRDT, more than 2 participants, view-only role, chat, TURN relay |

### 15.2 Network Activity panel

- Recording: `OPENSHOP_NETWORK` replaces `window.fetch` before any request (inline script #1). Covers `fetch` only (not `<img>`, XHR, WebSocket, WebRTC, or SW-internal fetches).
- Entry: `{url (first 300 chars), host, purpose, external, method, outcome:'sent'|'blocked'|'failed', status}`; ring buffer of 250 (`dropped` counter).
- Purpose classification: same host = "Application shell"; no host (blob:/data:/file:) = "In-page data"; `jsdelivr.net` = "Pinned library or codec"; `huggingface.co` / `hf.co` = "AI model weights"; anything else = "Unclassified third party".
- Status-bar badge `#network-state` (`click-220`): "Nothing sent" (ready) / "N downloads" (limited; tooltip lists hosts and "code and model weights only, never document pixels") / "Strict offline" / "Strict · N blocked".
- Dialog "Network Activity" (`showNetworkActivity`, 21497): intro (no upload path exists), summary "N outbound request(s) this session across M host(s)", list grouped per host: **Host** -> "**Purpose** · N sent [· N blocked] [· N failed]"; Strict offline section (checkbox "Refuse every request that is not already cached", note, auto-disable reason) and per-capability impact rows (label -> "Available" / "Disabled while strict" / "Downloads on first use"); Close.
- Snapshot API: `__openshopNetwork.snapshot()` -> `{strict, strictDisabledReason, dropped, blocked, entries[], hosts[{host, purpose, external, sent, blocked, failed}]}`; `subscribe(listener)`.
- Not present: per-request URL list in the UI, timing/size columns, ledger export or clear.

### 15.3 Strict Offline Mode

- Toggle: Network Activity checkbox, or palette "Toggle Strict Offline Mode" (Help). Persisted `os_strict_offline`.
- Enforcement in the fetch wrapper: if strict and the URL host is external and `caches.match(url)` finds nothing -> record `blocked` and throw `Error('Strict offline mode blocked a request to <host>')`. Same-origin and in-page URLs always pass; already-cached external URLs pass.
- Cold-start safety: if a boot library fetch fails while strict, strict is disabled with reason "A cold start needs the pinned libraries and none were cached (...)" (shown in the dialog).
- A quota failure persisting the toggle sets `strictDisabledReason`.
- Toasts "Strict offline mode on -- uncached downloads are refused" / "Strict offline mode off".

### 15.4 Offline status and PWA install

Status bar `#offline-state` (`click-193`):

| Lane / state | Label | data-state |
|---|---|---|
| initial HTML | "Checking offline support" | limited |
| standalone, online | "Network-first" | limited |
| standalone, offline | "Offline unavailable" | limited |
| hosted, shell not cached, no error | "Preparing offline" | preparing |
| hosted, `shellReady` | "Offline ready" | ready |
| hosted, update waiting | "Update ready" | update |

Tooltip: the error text, or "Standalone file: a cold open requires network access", "Hosted shell cached for offline reload", "Hosted shell is not yet cached".

"Offline & Install" dialog (`showOfflineManager`, 21887): rollback warning ("OpenShop returned to <rev> because <rev> did not confirm a healthy startup"); facts: Distribution (Hosted PWA lane / Standalone file lane), Connection, Installation (Installed / Install available / Use browser install menu / Unavailable for file://), Core shell "N/M required assets verified", Optional shell "N/M helpers cached", File launch support, Active shell revision; AI assets (12.2); buttons Install (when `beforeinstallprompt` was captured), Apply Update, Check for Update, Restore Previous Shell (when rollback available), Rebuild Offline Shell, Close.

- Install flow: `beforeinstallprompt` captured with `preventDefault`; `requestInstall()` calls `prompt()`; without a captured prompt the toast says "Use your browser install menu when installation is supported"; `appinstalled` toasts "OpenShop installed". Installed state from `display-mode: standalone`.
- File launch: `launchQueue.setConsumer` opens the first launched file (toast if more); Share Target intake via `?share=ready&share_id=...` (first file only); both confirm discarding unsaved work; URL params cleaned with `history.replaceState`.
- Manifest shortcuts declare `?action=new` and `?action=open`, but **no code reads the `action` query parameter** (shortcuts simply open the app).

### 15.5 manifest.webmanifest

| Field | Value |
|---|---|
| `id` / `start_url` / `scope` | `./` |
| `name` / `short_name` | OpenShop Image Editor / OpenShop |
| `version` | 0.31.0 |
| `description` | "Private browser image editing with layers, selections, PSD interchange, local export, and optional browser-local models." |
| `display` / `orientation` | standalone / any |
| `background_color` / `theme_color` | `#0a0c10` |
| `categories` | graphics, photo |
| `icons` | icon-192.png and icon-512.png, each as `any` and `maskable` |
| `screenshots` | `design/openshop-studio-master.png` 1536x1024 wide "OpenShop desktop editor"; `design/openshop-menu-states.png` 768x1024 narrow "OpenShop compact workspace" |
| `shortcuts` | "New canvas" (`./?action=new`), "Open image" (`./?action=open`) |
| `launch_handler` | `client_mode: navigate-existing` |
| `share_target` | POST `./?share=target`, multipart/form-data, param `files` accepting `image/*`, `.ora`, `.psd`, `.openshop`, `.pdf`, and 26 RAW extensions (.3fr .arw .cr2 .cr3 .dcr .dng .erf .gpr .iiq .kdc .mef .mos .mrw .nef .nrw .orf .pef .raf .raw .r3d .rw2 .rwl .sr2 .srf .srw .x3f) |
| `file_handlers` | action `./`, `launch_type: single-client`; png, jpg/jpeg, webp, gif, apng, avif, jxl, heic, heif, svg, bmp, ora (`image/openraster`), psd (`image/vnd.adobe.photoshop`), pdf, RAW list (`application/octet-stream`), `.openshop` (`application/vnd.openshop+json`), `.json` |

Not present: `protocol_handlers`, `display_override` (e.g. window-controls-overlay), `edge_side_panel`.

---

## 16. Preferences / settings

Dialog: Edit > Preferences... (`click-026`) or palette "Preferences". Buttons Apply / Cancel; Export Settings / Import Settings / Reset to Defaults. Storage `os_prefs` (JSON, `version:2`; unknown keys preserved up to 120 in `_preferenceExtras`) plus the separate keys noted. Migration registry `{1 -> 2}`; failures record diagnostic `openshop.preference-migration`. Out-of-range values are clamped with toast "Some preferences were out of range and have been clamped".

| Section | Label | Control id | Type | Accepted range | Default | Stored as |
|---|---|---|---|---|---|---|
| Canvas | Default Width | `pref-dw` | number | 1-30000 (input max 10000) | 1920 | `os_prefs.defaultW` |
| Canvas | Default Height | `pref-dh` | number | 1-30000 (input max 10000) | 1080 | `os_prefs.defaultH` |
| Grid & Snap | Grid Size (px) | `pref-grid` | number | 1-500 (input 2-200) | 20 | `os_prefs.gridSize` |
| Grid & Snap | Snap Tolerance | `pref-snap` | number | 0-100 (input 1-50) | 5 | `os_prefs.snapTolerance` (smart-alignment reach in screen px; 0 disables) |
| Layers | Stack new objects in the active layer | `pref-stack` | checkbox | | false | `os_prefs.stackNewObjects` |
| Layers | Keep brush strokes as editable paths | `pref-vector` | checkbox | | false | `os_prefs.vectorStrokes` (false = strokes rasterized into the layer) |
| Performance | History States | `pref-hist` | number | 10-200 | 120 (fallback 60 if unreadable) | `os_prefs.maxHistory` |
| Interface | Accent Color | `pref-accent` | color | `#rrggbb` | current `--accent` (theme default `#3978ff`) | `os_prefs.accent` (omitted when unset) |
| Interface | Show rulers on desktop | `pref-rulers` | checkbox | | true | `os_prefs.rulersVisible` (also View > Toggle Rulers) |
| Interface | Snap zoom to integer ratios | `pref-pixel-zoom` | checkbox | | false | `os_prefs.pixelZoomSnap` (also `#zoom-pixel-snap`) |
| Interface | Language | `pref-lang` | select | English (`en`), Simplified Chinese (`zh`) | `en` | `os_lang` |
| Plugin access | grant cards (name, status, id, Version, Source digest, Granted at, capabilities, last failure) + "Revoke access" | | list | | none | `openshop.plugin-consents.v1` |

Implicit preferences (not in the dialog):

| Key | Source | Default | Stored as |
|---|---|---|---|
| `toolOptions` | any control in `#tool-options` | `{}` | `os_prefs.toolOptions` |
| `panelSizes` | dock splitters | `[]` | `os_prefs.panelSizes` |
| Theme | View > Theme | follow OS (dark/light) | `os_theme` |
| Workspace | Workspace selector | `standard` | `os_workspace_mode` |
| Strict offline | Network Activity | off | `os_strict_offline` |
| Saved palette / ABR brushes / gradient presets / photo presets | panels | `[]` | `os_palette`, `os_brushes`, `os_gradients`, `os_presets` |
| `_prefs.theme:'dark'`, `_prefs.historyStates:120` | legacy fields in the `_prefs` literal | | never persisted; unused |

Settings bundle (Export Settings -> `openshop-settings.json`): `{ kind:'openshop-settings', version:1, prefs, palette, brushes, gradients, presets, theme, language }`. Import validates kind/version, 10 MB budget, array types, supported language and theme, sanitizes every list, then writes all 7 keys (`os_prefs, os_palette, os_brushes, os_gradients, os_presets, os_theme, os_lang`) transactionally with rollback. Reset to Defaults (nested confirm "Reset preferences?") resets prefs, palettes, imported assets, presets, theme `default` and language `en`; "This cannot be undone".

**Not present**: keyboard shortcut customization, color management settings, memory/scratch limits, autosave interval, default export format/quality, ruler units (px only; `_rulerUnit:'px'`), cursor preferences (precise/brush-size), GPU on/off, AI device choice, telemetry (none exists).

---

## 17. Other notable

### 17.1 Color management
- ICC profiles read from JPEG (APP2 `ICC_PROFILE`), PNG (`iCCP`, inflated), WebP (`ICCP` chunk), AVIF; `_parseICCProfile` (7744) extracts description and rgbXYZ primaries (D50 PCS) to classify `srgb` / `display-p3` / `icc-rgb` / `unknown`.
- Working space: `srgb` by default; `display-p3` when the source is P3 and `canvas.getContext('2d', {colorSpace:'display-p3'})` is supported (`_displayP3CanvasSupported`); otherwise a matrix conversion to sRGB with toast "<Profile> converted to sRGB for editing". The native decode path draws into a canvas with the matching `colorSpace`.
- `_colorProfile = {name, sourceKind:'assumed'|'embedded', iccData (base64, <= 4 MB), colorSpace, workingSpace, conversion:'identity'|'display-p3-to-srgb'|...}`; shown in the status bar (`#status-color-profile`, default "sRGB IEC61966-2.1"), bit depth "8 bit", Info panel "RGB / 8 bit".
- Export re-embeds the source ICC profile into PNG, JPEG, WebP, AVIF and PSD (`_embedRasterICCDataUrl`, `_embedAVIFICCProfile`, `_embedPSDICCProfile`).
- **Not present**: soft proofing, CMYK/Lab/Grayscale document modes, Assign/Convert Profile commands, 16/32-bit channels, rendering intents, gamut warning.

### 17.2 Guides, rulers, grid, pixel grid, snapping, measurement
- Rulers: two canvases (`#ruler-h-canvas`, `#ruler-v-canvas`, 20 px), step chosen from [1,2,5,10,20,50,100,200,500,1000,2000,5000] so ticks are >= 50 px apart; px labels; theme-aware; hidden below 1024 px and in mobile workspace. No unit switching, no ruler origin, no dragging guides out of rulers.
- Guides (`addGuide`, 24203): View > Guides > Add Horizontal Guide / Add Vertical Guide (placed at viewport center), Clear All Guides; DOM lines in `#guides-container` (color `--guide #6cdcff`), mouse-draggable, double-click removes; add/move/remove recorded in history and saved with the document. Positions are **screen-space pixels**, not document coordinates (they drift on zoom/pan). No lock, numeric placement, or guide layouts.
- Grid: View > Show > Toggle Grid; `#grid-overlay` canvas; minor lines every `gridSize` (pref) at accent 12% alpha, major every 5 cells at 25%; hidden if spacing < 4 screen px.
- Snap to Grid (View > Show > Toggle Snap to Grid): rounds object left/top to the grid while moving; smart alignment guides (`_snapToAlignment`, color `--smart-guide #ff5078`) against other objects and the canvas take precedence; Alt suppresses snapping for the drag.
- Pixel Grid: View > Show > Pixel Grid; drawn only at zoom >= 8 (800%); white 15% lines, 0.5 px.
- Measure tool (crop flyout, `data-tool="measure"`): two clicks, result "N.Npx / A.Adeg" in `#measure-result` plus an overlay line with endpoints. No persistent measurements or straighten.
- Symmetry painting: View > Show > Symmetry: Off / Horizontal / Vertical / Both Axes / Radial (6-fold).

### 17.3 Animation timeline (30589-30956)
- Opened by the Timeline bottom tab, View > Panels > Animation Timeline, or Motion workspace. Header: "Timeline" + "N frames", Previous, Play/Pause, Next, "+ Frame", "Duplicate", FPS number input (1-60, default 12), "Export GIF", close.
- Frames are **flattened raster snapshots** of the whole canvas (data URLs); switching frames replaces the layer stack with a single layer (one-time warning toast). Per-frame delays `_animDelays` (10-60000 ms, default 1000/12) come from GIF/APNG import; no UI to edit a frame's delay (tooltip shows it).
- 80 px-wide thumbnails with "#n" and delete "x"; frame add/duplicate/remove/select are typed commands (`frame.add` etc.) with history.
- Playback: setTimeout loop that highlights thumbnails; the canvas itself does not change during playback.
- Export: animated GIF via modern-gif (maxColors 255, worker); on failure falls back to a PNG spritesheet `openshop-spritesheet-<cols>x<rows>-<fps>fps.png`. Max 300 frames.
- **Not present**: onion skinning, layer-based/video timeline, tweening, loop count, APNG/animated WebP/MP4 export, per-frame layer visibility.

### 17.4 Actions / macros (30957-31071)
View > Panels > Actions / Macros. Record / Play / Clear / Save (`openshop-action.json`, `{kind:'openshop-command-sequence', schemaVersion:1, appVersion, commands[]}`) / Load. Records typed command objects.

### 17.5 Content Credentials (C2PA)
- Read-only. On import (JPEG, PNG, WebP, AVIF, GIF, APNG, SVG, portable formats), a byte scan (`_hasPotentialC2PAMetadata`: JUMBF / `c2pa` / `cabx` markers) gates lazy loading of `@contentauth/c2pa-web` + WASM; `reader.fromBlob` extracts the manifest store.
- Normalized to `{status:'valid'|'invalid'|'unavailable', active manifest, manifests (max 32) with title, claim generator, signature, actions (max 64), ingredients (max 32), validation; validation (max 64) [{code, explanation, status}], error}`. Unreadable marker -> `c2pa.manifest-unreadable`; reader failure -> `c2pa.validation-error`.
- Shown in Image Info ("Content Credentials: valid / validation failed / validation unavailable" + manifest chain with Pass/Fail rows). Export warns "Imported Content Credentials are read-only provenance; OpenShop does not sign or re-sign exports."
- **Not present**: signing/creating manifests on export, thumbnails, remote manifest fetch.

### 17.6 Image Info (25419)
Image > Image Info... (also canvas context menu). Fields: Canvas Size, Layers, Total Objects, Images, Text Objects, Shapes, History States (n / max), History Memory (MB of 192 MB), Zoom, Color Mode "RGB 8-bit", Source Metadata (EXIF/XMP/C2PA summary), Content Credentials status, Export Metadata "Strip location by default", Est. Memory (W x H x 4, uncompressed), plus C2PA details.
Info panel tab (ptg3-info): Canvas, Layers, Objects, Zoom, Color Mode, Profile, Cursor.

### 17.7 Before / After compare (27448)
Image > Before / After Compare (palette "Before / After"). Baseline captured once, 500 ms after the welcome screen is dismissed (`_captureBA`, hides non-exportable overlays); it is not re-captured when a new document opens. Full-screen `#ba-overlay` with two fit-to-view canvases and a draggable vertical divider (`clip-path`), Before/After labels, Close; Escape closes. Mouse-only divider (no touch/keyboard), no side-by-side or toggle modes, no re-baseline command.

### 17.8 Navigator / minimap and histogram
Navigator tab (ptg3-nav): thumbnail via `toDataURL({multiplier:scale})`; viewport rectangle `#minimap-vp` updated cheaply on pan/zoom; click centers the view there (no rectangle drag, no zoom slider). Histogram canvas 240x80 with L/R/G/B channel buttons and Min/Mean/Max readouts.

### 17.9 Sticky notes / annotations (28858)
Tool `note` (`data-tool="note"`): clicking the canvas creates a DOM note (6 rotating colors) at the screen point inside `#sticky-container`, mouse-draggable, textarea, delete button ("Delete note"). Notes are screen-positioned (not anchored to document coordinates) and **not saved** with the document, project or recovery.

### 17.10 Color tools, palettes, swatches
- Color tab: 120x120 HSV color wheel canvas (mouse drag only), H/S/B sliders, FG/BG boxes (click opens a hidden `<input type=color>`), swap (`X`), default black/white (`D`), hex readout, OKLCH readout (`_hexToOklch`), quick swatch grid.
- Swatches tab: Default palette (24 fixed colors) and Saved palette; "+ Add FG", "Clear" (undo via toast), "Export" (JSON `{name:'OpenShop Palette', colors}`), "Import" (JSON, GIMP `.gpl`, Adobe `.ase` with CMYK/Gray/LAB to hex conversion). Swatch grids are ARIA grids with roving tabindex and arrow-key navigation.
- Eyedropper tool (`I`), Color Range dialog with eyedroppers, gradient presets, ABR brush import.
- **Not present**: color harmony rules, color libraries (Pantone etc.), HUD color picker, recent-colors list, swatch groups, ACO import.

### 17.11 Welcome screen and recent files
- `#welcome-overlay` (`role=dialog aria-modal`): hero ("Edit boldly. Stay local.", chips "Zero install" / "Private by default" / "PSD ready"), actions New Canvas, Open Image, Open PSD, Enter Studio, "Ctrl + K" hint, boot status "Preparing the editing engine...", "Start from Template" grid of 16 templates as keyboard-accessible buttons -- Video: HD 1080p 1920x1080, 4K UHD 3840x2160; Social: Instagram Post 1080x1080, Instagram Story 1080x1920, Facebook Cover 820x312, Twitter Header 1500x500, YouTube Thumb 1280x720, LinkedIn Banner 1584x396; Print: A4 Portrait 2480x3508, A4 Landscape 3508x2480, Letter 2550x3300, Business Card 1050x600; Web: Web Banner 728x90, Favicon 512x512, Open Graph 1200x630; Display: Wallpaper QHD 2560x1440 -- and "Recently opened" (top 5 of `openshop_recent`: name, dims, date; informational only, cannot reopen).
- Escape dismisses; dismissal makes the overlay `inert` and moves focus to the first menu root.
- Blank workspace card: New Canvas, Open Image, "Ctrl N New canvas", "Drop files anywhere".
- File > Templates... dialog shows the same templates grouped by category.

### 17.12 Diagnostics (33512-33645)
- `recordDiagnostic(kind, message, detail)`: ring buffer of 200 `{at, kind, message (300 chars), detail (max 8 scalar fields)}`; every error/warning toast is recorded; errors increment the status-bar badge `#diagnostics-badge` ("N errors"; click exports).
- `_reportFailure(stage, error, {retry, key})`: de-duplicates by key and error object; error toast with a **Retry** button.
- `buildDiagnosticsReport()` -> `openshop-diagnostics.json`: `{kind:'openshop-diagnostics', schemaVersion:1, version, generatedAt, environment{userAgent, language, devicePixelRatio, viewport, locale, theme}, capabilities{fileSystemAccess, originPrivateFileSystem, webLocks, broadcastChannel, imageDecoder, offscreenCanvas, serviceWorker, input}, canvasCeiling, document{width, height, resolution, layers, objects, historyEntries, historyIndex, persistenceState, animationFrames, hasSelection}, errorCount, events[]}`. Excludes document/file names and pixels; nothing is transmitted.
- Entry: palette "Export Diagnostics" / "Clear Diagnostics" (Help) and the badge. Global `error` / `unhandledrejection` handlers toast "Something went wrong -- see console".

### 17.13 Toasts
`#toast-container` (`role=status aria-live=polite`), max 4 visible (oldest removed). Types info/success/error/warning. Duration 2500 ms (error 9000 ms) + 45 ms per character beyond 40, max 20 s; click dismisses; hover pauses, leaving restarts 1.2 s. Text goes through `_t()` and is mirrored to the a11y live region. Variants `_toastWithUndo` (Undo button, 9 s) and `_toastWithAction` (Retry etc.). Positioned at the bottom, raised above bottom tabs on phone/mobile, 24 px from bottom in fullscreen.

### 17.14 Internationalization
- Locales: `en` (identity) and `zh` (Simplified Chinese, ~335 strings, 5409-5747). `pseudo` (accented and bracketed) for testing via `setLocale('pseudo')` only.
- `_initI18n` stamps `data-i18n` (menu items, tabs, labels) and `data-i18n-tip` (tool buttons) with the English text as key; `setLocale` rewrites text nodes and tooltips; toasts are translated inside `toast()`. `setLocale` sets `<html lang>` and `dir` (RTL via `Intl.Locale#textInfo` or the list ar/he/fa/ur/ps/sd/yi/dv/ckb). `i18nKeys()` / `missingLocaleKeys(lang)` measure coverage by scanning source for `_t`/toast literals.
- Separate artwork text direction (`setTextDirection('ltr'|'rtl')`) for text objects.
- Gaps: most dynamically built dialogs untranslated; no plural rules; minimal locale-aware number formatting.

### 17.15 Accessibility
- Menu bar: `role=menubar`; roots `menuitem` with roving tabindex; dropdowns `role=menu` with aria-label; items `menuitem` / `menuitemcheckbox` / `menuitemradio` (from `data-os-menu-check` / `data-os-menu-radio`) with `aria-checked` synced (`_syncViewMenuState`); submenus `aria-haspopup` / `aria-expanded`; shortcuts in `aria-keyshortcuts`; separators `role=separator`. Keys: arrows, Home, End, Enter, Space, Escape, Tab. Items `aria-disabled` when no document (`_syncMenuCommandState`).
- Native Popover API + CSS anchor positioning for menus and modals when both are supported (`<html class="os-native-popovers">`), legacy positioning otherwise.
- Modal focus management: MutationObserver adopts every `.modal-overlay` (role/label, modal stack), Tab trap, focus reclaim on `focusin`, focus return on close; Enter confirms (`[data-modal-action]`), Escape cancels the topmost dialog -> liquify -> before/after -> filter panel -> welcome.
- Canvas: `#canvas-area role=application aria-roledescription="image editor canvas"`, focusable, keyboard nudge (arrows; Alt resizes), sr-only state tree `#canvas-a11y-tree` (summary, tool, active layer, selection, objects, layer list) and live region `#canvas-a11y-live` refreshed on status changes.
- Tool buttons get `aria-label` from tooltips and Enter/Space activation; splitters keyboard operable (WCAG 2.5.7); swatch grids ARIA grid; tabs ARIA tablist; `_initAccessibleControls` auto-associates labels for dynamically added inputs (MutationObserver).
- `forced-colors`, `prefers-contrast:more`, `prefers-reduced-motion` supported; 44 px modal buttons below 1024 px.

### 17.16 Command palette
Ctrl/Cmd+K or the topbar "Search commands" button; combobox + listbox; 130 built-in commands with categories (File, Edit, Image, Filter, AI, View, Help, tools) and shortcut labels adapted to the physical keyboard layout (`navigator.keyboard.getLayoutMap`). Plugins can append commands. Some features are reachable only here: Collaborative Session, Recovery Storage, Toggle Strict Offline Mode, Export/Clear Diagnostics, Toggle Panels.

### 17.17 Canvas ceiling probe
See 1.6.4. Surfaces in new-document, resize and import validation messages, embed `openshop:open` with explicit dimensions, and the diagnostics report.

### 17.18 Other UI in scope
- Dropzone overlay ("Drop files here"; PNG, JPEG, WebP, SVG, GIF, PDF, RAW, PSD, .openshop) and clipboard paste of images.
- Canvas context menu (`#context-menu role=menu`), includes Image Info.
- "Local only" badge in the topbar ("Your files and edits stay on this device").
- Persistence indicator in the status bar (`#persistence-state`, e.g. "All changes saved").
- Canvas HUD (Pan tool, Zoom out, zoom readout, Zoom in, Fit).
- Liquify overlay (Forward Warp, Bloat, Pucker, Twirl CW, Twirl CCW; Size 10-200, Pressure 10-100, Density 10-100; Reset/Cancel/Apply).


---

<!-- Part A of the OpenShop v0.31.0 rewrite inventory. Source: Openshop/index.html (33,801 lines). Line numbers refer to that file. -->

## 2. Tools

### 2.0 How the toolbox is built (important for the rewrite)

| Aspect | Behavior | Lines |
|---|---|---|
| Static shell | `#toolbar` markup holds 34 hand-drawn SVG tool buttons in 8 legacy flyout groups (`data-group` = selection, crop, brush, stamp, retouch, shape, fillgrp, nav) plus 6 ungrouped buttons. Handlers `click-125..146` -> `OS.setTool(id)` / `OS.flyoutSelect(this, group)`. | 3431-3511 |
| Runtime rebuild | `_buildToolboxFromRegistry()` harvests the static SVG icons into a Map keyed by tool id, **deletes the static toolbar**, and rebuilds it from the audited tool catalog (`_toolCatalog()`, family != Mode) plus 4 "extension" tools. The runtime toolbar is what users see. | 14929-15047 |
| Catalog | `_toolCatalog()` = 60 rows `[id, family, label, shortcut, output, sideEffect, toolState]`: 58 tools + 2 modes. Each entry also gets `kind:'tool'`, `optionsContext`, `optionsSchema`, `prerequisite`, `requiresDocument`, `undoPolicy` ('none' for viewport/application side effects, else 'gesture'), `auditStatus:'VISUALLY_INSPECTED'`, `implemented`, `visible`. | 18038-18122 |
| Unimplemented list | `_unimplementedToolStates` (23 ids). Rendered as disabled flyout members (`disabled`, `aria-disabled`, `data-unimplemented`); selecting via command/shortcut calls `_refuseUnimplementedTool` -> toast "<Label> is not implemented" + error diagnostic. | 18019-18037 |
| Extensions | Brush family: `brush` 'B', `pencil` 'N', `spray` ''; AI Select family: `ai-segment` ''. Appended after catalog. `_toolExtensionStates = ['brush','pencil','spray','ai-segment']`. | 14955-14960, 18028 |
| Family order | Marquee, Move, Lasso, Selection, Crop, Sampling, Brush, Healing, Clone, History, Eraser, Fill, Blur, Tone, Pen, Type, Path Selection, Shape, Navigation, AI Select (20 groups). | 14962 |
| Family glyph fallback | Used when a tool has no SVG: Marquee M, Move V, Lasso L, Selection W, Crop C, Sampling I, Healing J, Clone S, History Y, Eraser E, Fill G, Blur R, Tone O, Pen P, Type T, Path Selection A, Shape U, Navigation H/Z, Brush B, AI Select AI. | 14963-14967 |
| Family face | One face button per family (`.audit-tool-face`), tip `"<Family>: <member label>"`, shows icon + family label text. Default member = first implemented member. Face disabled if its default member is unimplemented (History family). | 14971-15000, 15040-15043 |
| Flyout | `.audit-tool-flyout` role=menu, one `.tool-btn` role=menuitem per member: icon, `.tool-name` label, `.tool-shortcut` (catalog shortcut, keyboard-layout-localized). Member click = `click-229` -> `OS.selectRegistryTool(this)`: copies member icon/label onto the family face, closes flyouts, `setTool`. | 15001-15039, 15095-15103, 4368 |
| Opening flyouts | Flyouts are portalled into a fixed `#flyout-host` on `<body>`. Face click: if flyout closed -> open it (native popover anchored `inline-end span-block-end`, or fixed position right of the face +4 px); if already open -> close it and activate the face's tool. Face right-click always opens the flyout. Outside mousedown (non-popover mode) and Escape close all flyouts. | 15104-15145 |
| Keyboard on tool buttons | Every `.tool-btn[data-tip]` gets `role=button`, `tabindex=0`, Enter/Space = click, `aria-label` = tip. Active tool marked with `.active` + `aria-pressed`. | 6795-6801, 15377-15400 |
| Shift-cycle | **Not wired.** `cycleToolGroup(family, {reverse})` exists (cycles implemented members of a family, wraps) but no key handler calls it; only a unit test uses it. Single-letter shortcuts ignore Shift (Shift+B behaves as B). | 18212-18221 |
| setTool guard | `setTool(tool)` refuses (toast) any id that is in the unimplemented list, not in catalog/extensions, or is `quick-mask`/`screen-mode`. **Consequence: `triangle`, `arrow`, `star`, `pattern` (present in the old static toolbar, the keyboard map and the palette "Tool:" list) are refused at runtime even though `setTool` still has switch branches for them.** | 15371-15376 |
| Tool display name | Status bar `#tool-display`: special names marquee-rect "Rect Marquee", marquee-ellipse "Ellipse Marquee", magic-wand "Magic Wand", quick-selection "Quick Selection", ai-segment "AI Segment", spot-healing "Spot Healing", perspective-crop "Perspective Crop"; others = capitalized id with dashes as spaces. | 15488-15489 |
| Selection persistence | Pixel selections persist across tool switches; cleared only by Esc, Ctrl+D, Select > Deselect, or a new selection. Lasso points cleared when leaving lasso tools without a finalized selection. Switching tool always cancels crop and hides pen/measure overlays. | 15412-15429 |
| Layer write guard | Tools in `_activeLayerWriteTools` (brush, pencil, eraser, spray, text, gradient, pattern, line, rect, rounded-rect, circle, triangle, arrow, polygon, star, custom-shape, pen) call `_guardActiveLayerEdit()` first (hidden/locked layer blocks). | 13760, 15982 |

### 2.1 Full tool catalog (runtime toolbar, in display order)

Legend: Impl = implemented (Y) or refused stub (N). "Catalog key" = shortcut shown in the flyout. "Actual key" = what the keyboard handler does for that letter (see 14a). Options context: see 2.2.

| # | Family (flyout group) | UI name | Catalog id | Tool id (toolState) | Catalog key | Actual single-key handler | Impl | Options context | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Marquee | Rectangular Marquee Tool | tool.marquee.rect | marquee-rect | M | M -> marquee-rect | Y | marquee | Drag draws screen-space rect overlay (`#selection-overlay`). |
| 2 | Marquee | Elliptical Marquee Tool | tool.marquee.ellipse | marquee-ellipse | M | - | Y | marquee | Same with 50% radius overlay. |
| 3 | Marquee | Single Row Marquee Tool | tool.marquee.single-row | marquee-row | (none) | - | N | marquee | |
| 4 | Marquee | Single Column Marquee Tool | tool.marquee.single-column | marquee-column | (none) | - | N | marquee | |
| 5 | Move | Move Tool | tool.move | select | V | V -> select | Y | select | Enables Fabric selection; objects selectable except `__boundary__`. Default tool at boot. |
| 6 | Lasso | Lasso Tool | tool.lasso.free | lasso | L | L -> **line** (conflict) | Y | lasso | Click to add points, double-click closes. `_lassoMode='free'`. |
| 7 | Lasso | Polygonal Lasso Tool | tool.lasso.polygonal | lasso-polygonal | L | - | Y | lasso | `_lassoMode='polygonal'`. |
| 8 | Lasso | Magnetic Lasso Tool | tool.lasso.magnetic | lasso-magnetic | L | - | Y | lasso | `_magneticLassoStart/Move/Finish` (23418+). |
| 9 | Selection | Quick Selection Tool | tool.selection.quick | quick-selection | W | W -> **magic-wand** | Y | wand | Paint-to-select stroke while button held; uses wand options. |
| 10 | Selection | Magic Wand Tool | tool.selection.magic-wand | magic-wand | W | W -> magic-wand | Y | wand | `_doMagicWand(ptr)` (16349). |
| 11 | Crop | Crop Tool | tool.crop | crop | C | C -> crop | Y | crop | `_initCrop()`; Enter applies, Esc cancels. |
| 12 | Crop | Perspective Crop Tool | tool.crop.perspective | perspective-crop | C | - | Y | crop | `_initPerspectiveCrop()` 4-corner handles. |
| 13 | Crop | Slice Tool | tool.crop.slice | slice | C | - | N | crop | |
| 14 | Crop | Slice Select Tool | tool.crop.slice-select | slice-select | C | - | N | crop | |
| 15 | Sampling | Eyedropper Tool | tool.sampling.eyedropper | eyedropper | I | I -> eyedropper | Y | none | Uses native `EyeDropper` API when present (screen-wide), else samples the canvas pixel under the pointer (viewport/retina corrected). Sets FG; toast "Picked: #hex". |
| 16 | Sampling | Color Sampler Tool | tool.sampling.color-sampler | color-sampler | I | - | N | none | |
| 17 | Sampling | Ruler Tool | tool.sampling.ruler | measure | I | - | Y | measure | Click two points; distance shown in `#measure-result`. Old tip "Measure". |
| 18 | Sampling | Note Tool | tool.sampling.note | note | I | N -> note | Y | none | Click adds sticky note annotation (`addStickyNote`, 28858). Old tip "Sticky Note". |
| 19 | Brush (extension) | Brush | (none) | brush | B | B -> brush | Y | brush | Fabric PencilBrush; preset-dependent; pressure + tilt. |
| 20 | Brush (extension) | Pencil | (none) | pencil | N | N -> **note** (conflict) | Y | brush | Like brush but width forced to 1. |
| 21 | Brush (extension) | Spray / Airbrush | (none) | spray | (none) | - | Y | spray | Fabric SprayBrush. |
| 22 | Healing | Spot Healing Brush Tool | tool.healing.spot | spot-healing | J | - | Y | healing | Shares `_healStart/_healStroke` with healing. |
| 23 | Healing | Healing Brush Tool | tool.healing.brush | healing | J | J -> healing | Y | healing | "Click to heal blemish". |
| 24 | Healing | Patch Tool | tool.healing.patch | patch | J | - | N | healing | |
| 25 | Healing | Content-Aware Move Tool | tool.healing.content-aware-move | content-aware-move | J | - | N | healing | |
| 26 | Healing | Red Eye Tool | tool.healing.red-eye | red-eye | J | - | N | healing | |
| 27 | Clone | Clone Stamp Tool | tool.clone.stamp | clone | S | S -> clone | Y | clone | Alt+Click sets source (toast "Clone source set"); drag paints once a source exists. |
| 28 | Clone | Pattern Stamp Tool | tool.clone.pattern | pattern-stamp | S | - | N | clone | |
| 29 | History | History Brush Tool | tool.history.brush | history-brush | Y | (none) | N | history | Family face disabled. |
| 30 | History | Art History Brush Tool | tool.history.art | art-history-brush | Y | - | N | history | |
| 31 | Eraser | Eraser Tool | tool.eraser | eraser | E | E -> eraser | Y | eraser | PencilBrush composited destination-out into the layer raster. |
| 32 | Eraser | Background Eraser Tool | tool.eraser.background | background-eraser | E | - | N | eraser | |
| 33 | Eraser | Magic Eraser Tool | tool.eraser.magic | magic-eraser | E | - | N | eraser | |
| 34 | Fill | Gradient Tool | tool.fill.gradient | gradient | G | G -> gradient | Y | fill | Drag defines the gradient vector. |
| 35 | Fill | Paint Bucket Tool | tool.fill.bucket | fill | G | - | Y | none | Click image = contiguous flood fill with FG, fixed tolerance 32 (24129); click vector object = set its fill; click empty = add full-canvas rect named "Fill". Old tip "Fill Bucket". |
| 36 | Blur | Blur Tool | tool.blur | blur | R | R -> **rect** (conflict) | N | blur | |
| 37 | Blur | Sharpen Tool | tool.blur.sharpen | sharpen | R | - | N | blur | |
| 38 | Blur | Smudge Tool | tool.blur.smudge | smudge | R | - | Y | smudge | Family face default (first implemented member). |
| 39 | Tone | Dodge Tool | tool.tone.dodge | dodge | O | O -> **circle** (conflict) | Y | dodge | |
| 40 | Tone | Burn Tool | tool.tone.burn | burn | O | - | Y | burn | |
| 41 | Tone | Sponge Tool | tool.tone.sponge | sponge | O | - | Y | sponge | |
| 42 | Pen | Pen Tool | tool.pen | pen | P | P -> pen | Y | pen | Click anchors; double-click or Enter (>1 point) finishes. |
| 43 | Pen | Freeform Pen Tool | tool.pen.freeform | freeform-pen | P | - | N | pen | |
| 44 | Pen | Add Anchor Point Tool | tool.pen.add-anchor | add-anchor | P | - | N | pen | |
| 45 | Pen | Delete Anchor Point Tool | tool.pen.delete-anchor | delete-anchor | P | - | N | pen | |
| 46 | Pen | Convert Point Tool | tool.pen.convert-point | convert-point | P | - | N | pen | |
| 47 | Type | Horizontal Type Tool | tool.type.horizontal | text | T | T -> text | Y | type | Click creates IText "Type here" as a new layer and enters editing; history "Add Text". |
| 48 | Type | Vertical Type Tool | tool.type.vertical | vertical-text | T | - | N | type | |
| 49 | Type | Horizontal Type Mask Tool | tool.type.horizontal-mask | horizontal-text-mask | T | - | N | type | |
| 50 | Type | Vertical Type Mask Tool | tool.type.vertical-mask | vertical-text-mask | T | - | N | type | |
| 51 | Path Selection | Path Selection Tool | tool.path-selection.path | path-selection | A | A -> **arrow** (refused) | Y | none | `_pathSelectionClick`. |
| 52 | Path Selection | Direct Selection Tool | tool.path-selection.direct | direct-selection | A | - | Y | none | Leaving the tool calls `finishPathEdit(true)`. |
| 53 | Shape | Rectangle Tool | tool.shape.rectangle | rect | U | U -> rect; R -> rect | Y | shape | Drag from corner. |
| 54 | Shape | Rounded Rectangle Tool | tool.shape.rounded-rectangle | rounded-rect | U | - | Y | shape | Corner radius auto = min(24, w/2, h/2); no radius control. |
| 55 | Shape | Ellipse Tool | tool.shape.ellipse | circle | U | O -> circle | Y | shape | Fabric Ellipse in the drag box. |
| 56 | Shape | Polygon Tool | tool.shape.polygon | polygon | U | K -> polygon | Y | polygon | Drag distance = radius from start point. |
| 57 | Shape | Line Tool | tool.shape.line | line | U | L -> line | Y | shape | |
| 58 | Shape | Custom Shape Tool | tool.shape.custom | custom-shape | U | - | Y | shape | Only one built-in shape: a heart path sized to the drag box (min 3x3). No shape picker. |
| 59 | Navigation | Hand Tool | tool.navigation.hand | pan | H | H -> pan | Y | none | Drag pans viewport. Also on the canvas HUD. |
| 60 | Navigation | Rotate View Tool | tool.navigation.rotate | rotate-view | R | - | N | none | |
| 61 | Navigation | Zoom Tool | tool.navigation.zoom | zoom | Z | Z -> zoom | Y | zoom | Click = zoom in x1.25, Alt+Click = zoom out. |
| 62 | AI Select (extension) | AI Segment Select | (none) | ai-segment | (none) | - | Y | ai-segment | Click runs the on-demand panoptic segmentation model (`aiSegmentSelectAt`); same as AI > Segment Select. |

Mode entries (catalog only; not on the toolbar; reachable through the typed command registry):

| Catalog id | Label | toolState | Behavior |
|---|---|---|---|
| mode.quick-mask | Quick Mask Mode | quick-mask | `toggleQuickMaskMode()` flips the `_quickMaskMode` boolean and announces it; no visual quick-mask implementation found. Requires document. |
| mode.screen | Screen Mode | screen-mode | `toggleFullscreen()`. |

Counts: 58 catalog tools (35 implemented, 23 refused) + 4 extensions = 62 toolbar members, 39 usable. The README's "34 tools" is the count of the legacy static toolbar.

Legacy/orphan tool ids (in static markup, keyboard map and palette "Tool:" list, but refused by the setTool guard at runtime):

| Tool id | Old UI name (static tip) | Old group | Intended behavior per code | Options group |
|---|---|---|---|---|
| triangle | Triangle | shape | Fabric Triangle in drag box | opt-shape |
| arrow | Arrow | shape | Line with `_isArrow` head; keyboard A | opt-shape |
| star | Star | shape | Star polygon from Points + Inner R % | opt-star |
| pattern | Pattern Fill | fillgrp | Drag fills with a procedural pattern | opt-pattern |

Legacy static flyout groups (pre-rebuild, 3431-3511), for reference:

| Static group | Face (tip) | Members (tips) |
|---|---|---|
| (none) | Move / Select (V) | select |
| selection | Rect Marquee (M) | Rect Marquee, Ellipse Marquee, Lasso, Magic Wand (W), AI Segment Select |
| crop | Crop (C) | Crop, Measure |
| brush | Brush (B) | Brush, Pencil, Spray / Airbrush |
| (none) | Eraser (E) | eraser |
| stamp | Clone Stamp (S) | Clone Stamp, Healing Brush |
| retouch | Dodge | Dodge (Lighten), Burn (Darken), Sponge, Smudge |
| shape | Rectangle (R) | Rectangle, Ellipse, Triangle, Line (L), Arrow, Polygon, Star |
| (none) | Pen (P) | pen |
| (none) | Text (T) | text |
| fillgrp | Gradient (G) | Gradient, Fill Bucket, Pattern Fill |
| (none) | Eyedropper (I) | eyedropper |
| (none) | Sticky Note | note |
| nav | Pan (H) | Pan, Zoom (Z) |

### 2.2 Options bar (`#tool-options`, 3514-3685)

Mechanics:
- `_toolOptionSchemas()` maps a context to `{groupId, requiresDocument, controls[]}`; `_toolOptionContext(tool)` maps tool id -> context (15240-15301).
- `_applyToolOptions` hides every `.opt-group`, shows the schema's group, sets `#tool-options[data-options-context]`; controls are disabled (`aria-disabled`) when the context requires a document and none is open (15306-15329).
- Persistence: any input/change on a control inside `#tool-options` serializes ALL option inputs/selects into `prefs.toolOptions` (`{id:{value}}` or `{id:{checked}}`) and persists preferences; restored at boot by dispatching synthetic events (15330-15354, 4488-4490).
- Reset button `#tool-options-reset` (label "Reset", title "Reset the current tool options", `click-227` -> `OS.resetToolOptions()`): restores HTML defaults only for the current context's schema controls (cached in `data-os-default`), dispatches events, announces "Tool options reset" (15355-15369).
- Every `input[type=range]` in the app is auto-paired with a clamped numeric box (`.range-number`, Enter commits) by `_initRangeNumberInputs` + MutationObserver (7470-7522).

Context map:

| Context | Tools | Group id | Schema controls (reset/disable scope) |
|---|---|---|---|
| none | eyedropper, color-sampler, note, pan, path-selection, direct-selection, rotate-view, fill (Paint Bucket), quick-mask, screen-mode, unknown | (none) | - |
| select | select | opt-select | select-auto, select-transform |
| brush | brush, pencil | opt-brush | brush-preset, brush-size, brush-opacity, brush-tilt |
| eraser | eraser, background-eraser, magic-eraser | opt-brush | brush-size, brush-opacity, brush-tilt (preset select visible but not in schema) |
| spray | spray | opt-spray | spray-density, spray-width |
| marquee | marquee-rect, marquee-ellipse, marquee-row, marquee-column | opt-marquee | (mode buttons, not schema-tracked) |
| lasso | lasso, lasso-polygonal, lasso-magnetic | opt-lasso | - |
| wand | quick-selection, magic-wand | opt-wand | wand-tolerance, wand-contiguous |
| crop | crop, perspective-crop, slice, slice-select | opt-crop | crop-ratio, crop-w, crop-h |
| healing | healing, spot-healing, patch, content-aware-move, red-eye | opt-healing | healing-size |
| clone | clone, pattern-stamp | opt-clone | clone-size |
| history | history-brush, art-history-brush | (none) | - |
| fill | gradient | opt-gradient | gradient-preset, grad-from, grad-to, grad-type |
| pattern | pattern (orphan) | opt-pattern | pattern-type, pattern-scale, pattern-color |
| blur | blur, sharpen | (none) | - |
| smudge | smudge | opt-smudge | smudge-size, smudge-str |
| dodge | dodge | opt-dodge | dodge-size, dodge-exp, dodge-range |
| burn | burn | opt-burn | burn-size, burn-exp, burn-range |
| sponge | sponge | opt-sponge | sponge-size, sponge-flow, sponge-mode |
| pen | pen, freeform-pen, add-anchor, delete-anchor, convert-point | opt-pen | pen-stroke, pen-width, pen-filled |
| type | text, vertical-text, horizontal-text-mask, vertical-text-mask | opt-text | text-font, text-size, text-color, text-direction, text-bold, text-italic, apply-text-range, clear-text-range |
| shape | rect, rounded-rect, circle, triangle, arrow, line, custom-shape | opt-shape | shape-fill, shape-stroke, shape-stroke-w, shape-filled, shape-dash |
| polygon | polygon | opt-polygon | poly-sides, poly-fill, poly-stroke, poly-filled |
| star | star (orphan) | opt-star | star-points, star-inner, star-fill, star-filled |
| measure | measure | opt-measure | - |
| ai-segment | ai-segment | opt-ai-segment | - |
| zoom | zoom | opt-zoom | zoom-pixel-snap |

Controls per options group (exact labels, types, ranges, defaults, handlers):

| Group | Label (as shown) | Control id | Type | Range / options | Default | Handler / state key |
|---|---|---|---|---|---|---|
| opt-select | chip "Move" | - | static chip with icon | - | - | - |
| opt-select | Auto-select | select-auto | checkbox | - | checked | change-045 `OS.setAutoSelect(checked)` -> state.autoSelect |
| opt-select | Show transform controls | select-transform | checkbox | - | checked | change-046 `OS.setTransformControls(checked)` -> state.showTransformControls |
| opt-select | Align left / Align horizontal centers / Align right / Align top / Align vertical centers / Align bottom | - | 6 icon buttons (group "Align selected objects") | - | - | click-168..173 `OS.alignObjects('left'/'centerH'/'right'/'top'/'centerV'/'bottom')` |
| opt-brush | Preset | brush-preset | select | Round (round), Soft Round (soft), Flat/Calligraphy (flat), Scatter (scatter), Pixel (pixel), plus imported ABR brushes "<name> (ABR)" | round | change-001 `OS.setBrushPreset(value)` |
| opt-brush | Size | brush-size | range | 1-150 | 8 | input-001 `OS.setBrushSize` (readout `#brush-size-val`) |
| opt-brush | Opacity | brush-opacity | range | 1-100 | 100 | input-002 `OS.setBrushOpacity` (FG converted to rgba when < 100) |
| opt-brush | "Stylus: ready" | brush-pressure-status | status text | ready / tracking / pressure / fixed | "Stylus: ready" | title "Pressure changes are enabled after a pen stroke reports varying pressure" |
| opt-brush | Tilt dynamics | brush-tilt | checkbox | - | unchecked | change-047 `OS.setTiltDynamics(checked)`; title "Use pen tilt to rotate and flatten brush stamps" |
| opt-brush | "Tilt: off" | brush-tilt-status | status text | off / on / active | "Tilt: off" | title "Tilt is enabled after a pen reports tilt data" |
| opt-spray | Density | spray-density | range | 5-100 | 30 | input-003 state.sprayDensity |
| opt-spray | Width | spray-width | range | 5-150 | 30 | input-004 state.sprayWidth |
| opt-shape | Fill | shape-fill | color | - | #6c8cff | change-002 state.shapeFill |
| opt-shape | Stroke | shape-stroke | color | - | #ffffff | change-003 state.shapeStroke |
| opt-shape | Width | shape-stroke-w | number | 0-50 | 2 | change-004 state.shapeStrokeWidth |
| opt-shape | Filled | shape-filled | checkbox | - | checked | change-005 state.shapeFilled (off -> transparent fill) |
| opt-shape | Dash | shape-dash | select | Solid (""), Dashed (8,4), Dotted (2,4), Dash-Dot (12,4,2,4), Long Dash (16,8) | Solid | change-006 state.shapeDash -> strokeDashArray |
| opt-text | Font | text-font | select | DM Sans, Arial, Georgia, Courier New, Verdana, Times New Roman, JetBrains Mono, Impact | DM Sans | change-007 state.textFont |
| opt-text | Size | text-size | number | 8-200 | 24 | change-008 state.textSize |
| opt-text | Color | text-color | color | - | #ffffff | change-009 state.textColor |
| opt-text | Direction | text-direction | select | Left to right (ltr), Right to left (rtl) | ltr | change-049 `OS.setTextDirection(value)` (records history) |
| opt-text | B | text-bold | checkbox | - | off | change-010 state.textBold |
| opt-text | I | text-italic | checkbox | - | off | change-011 state.textItalic |
| opt-text | U | text-underline | checkbox | - | off | change-038 `OS.setTextDecoration('underline', checked)` |
| opt-text | O | text-overline | checkbox | - | off | change-039 `setTextDecoration('overline', checked)` |
| opt-text | S | text-linethrough | checkbox | - | off | change-040 `setTextDecoration('linethrough', checked)` |
| opt-text | Stroke | text-decoration-color | color | - | #ffffff | change-041 `setTextDecoration('textDecorationColor', value)` |
| opt-text | Width | text-decoration-thickness | number | 10-500 step 10 | 100 | change-042 `setTextDecoration('textDecorationThickness', value)` |
| opt-text | status "Select characters to format" | text-range-status | live text | - | - | - |
| opt-text | Apply to range | apply-text-range | button | - | - | `applySelectedTextRange()` (6765) |
| opt-text | Clear range | clear-text-range | button | - | - | `applySelectedTextRange({clear:true})` |
| opt-gradient | Preset | gradient-preset | select | Custom ("") plus imported GRD presets "<name> (<type>)" | Custom | change-044 `OS.selectGradientPreset(value)` (sets From/To/Type from first/last stop) |
| opt-gradient | From | grad-from | color | - | #6c8cff | change-012 state.gradFrom |
| opt-gradient | To | grad-to | color | - | #000000 | change-013 state.gradTo |
| opt-gradient | Type | grad-type | select | Linear, Radial | linear | change-014 state.gradType |
| opt-gradient | Edit Stops | grad-edit-stops | button | - | - | click-221 `OS.editGradientStops()` (multi-stop editor, 17207) |
| opt-pattern | Pattern | pattern-type | select | Checkerboard, Stripes, Dots, Grid, Diagonal, Crosshatch | checkerboard | change-015 state.patternType |
| opt-pattern | Scale | pattern-scale | range | 5-80 | 20 | input-005 state.patternScale |
| opt-pattern | Color | pattern-color | color | - | #6c8cff | change-016 state.patternColor |
| opt-clone | Size | clone-size | range | 5-100 | 20 | input-006 state.cloneSize (+ `#clone-size-val`) |
| opt-clone | hint "Alt+Click source" | - | text | - | - | - |
| opt-wand | Tolerance | wand-tolerance | range | 0-100 | 32 | input-007 state.wandTolerance (+ `#wand-tol-val`) |
| opt-wand | Contiguous | wand-contiguous | checkbox | - | checked | change-017 state.wandContiguous |
| opt-crop | Ratio | crop-ratio | select | Freeform (free), Original Ratio (original), 1:1 (Square), 4:3, 3:2, 16:9, 9:16 (Portrait), 5:4, 2:3, Custom... (custom) | free | change-018 `OS.setCropRatio(value)` (17280) |
| opt-crop | W | crop-w | number | - | empty | change-019 `OS.setCropSize()` |
| opt-crop | x / H | crop-h | number | - | empty | change-019 `OS.setCropSize()` |
| opt-crop | swap icon, title "Swap W/H" | - | button | - | - | click-147 `OS.swapCropRatio()` |
| opt-crop | Apply | - | primary button | - | - | click-148 `OS.applyCrop()` |
| opt-crop | Cancel | - | button | - | - | click-149 `OS.cancelCrop()` |
| opt-marquee | Mode: New / Add / Subtract / Intersect | `.selection-mode[data-combine=replace/add/subtract/intersect]` | toggle button group (aria-pressed) | - | New | `setSelectionCombineMode(mode)` (31745). Hint "Or hold Shift to add, Alt to subtract." Shift+Alt = intersect. Modifier captured at gesture start; applies to marquee-rect/ellipse, magic-wand, all lassos, quick-selection, ai-segment (31741) |
| opt-lasso | hint "Click to add points. Double-click to close selection." | - | text | - | - | - |
| opt-ai-segment | "Segment Select" + "Panoptic model loads on demand" | - | text | - | - | - |
| opt-pen | hint "Click to add anchor points. Double-click to finish path." | - | text | - | - | - |
| opt-pen | Stroke | pen-stroke | color | - | #ffffff | change-020 state.penStroke |
| opt-pen | Width | pen-width | number | 1-20 | 2 | change-021 state.penWidth |
| opt-pen | Fill | pen-filled | checkbox | - | off | change-022 state.penFilled |
| opt-polygon | Sides | poly-sides | number | 3-20 | 5 | change-023 state.polySides |
| opt-polygon | Fill | poly-fill | color | - | #6c8cff | change-002 state.shapeFill (shared with Shape) |
| opt-polygon | Stroke | poly-stroke | color | - | #ffffff | change-003 state.shapeStroke (shared) |
| opt-polygon | Filled | poly-filled | checkbox | - | checked | change-005 state.shapeFilled (shared) |
| opt-star | Points | star-points | number | 3-20 | 5 | change-024 state.starPoints |
| opt-star | Inner R | star-inner | range | 10-90 (%) | 40 | input-008 state.starInner |
| opt-star | Fill | star-fill | color | - | #6c8cff | change-002 (shared) |
| opt-star | Filled | star-filled | checkbox | - | checked | change-005 (shared) |
| opt-healing | Size | healing-size | range | 5-80 | 15 | input-009 state.healingSize (+ `#heal-size-val`); hint "Click to heal blemish" |
| opt-dodge | Size | dodge-size | range | 5-100 | 20 | input-010 state.dodgeSize |
| opt-dodge | Exposure | dodge-exp | range | 5-100 | 30 | input-011 state.dodgeExposure |
| opt-dodge | Range | dodge-range | select | Midtones, Shadows, Highlights | midtones | change-025 state.dodgeRange |
| opt-burn | Size | burn-size | range | 5-100 | 20 | input-012 state.burnSize |
| opt-burn | Exposure | burn-exp | range | 5-100 | 30 | input-013 state.burnExposure |
| opt-burn | Range | burn-range | select | Midtones, Shadows, Highlights | midtones | change-026 state.burnRange |
| opt-sponge | Size | sponge-size | range | 5-100 | 20 | input-014 state.spongeSize |
| opt-sponge | Flow | sponge-flow | range | 5-100 | 50 | input-015 state.spongeFlow |
| opt-sponge | Mode | sponge-mode | select | Saturate, Desaturate | saturate | change-027 state.spongeMode |
| opt-smudge | Size | smudge-size | range | 3-80 | 15 | input-016 state.smudgeSize |
| opt-smudge | Strength | smudge-str | range | 10-100 | 60 | input-017 state.smudgeStrength |
| opt-measure | hint "Click two points to measure distance." + result span | measure-result | text | - | - | - |
| opt-zoom | hint "Click to zoom in. Alt-click to zoom out." | - | text | - | - | - |
| opt-zoom | Pixel-perfect | zoom-pixel-snap | checkbox | - | off | change-048 `OS.setPixelZoomSnap(checked)`; title "Snap zoom to integer ratios and use nearest-neighbour sampling above 100%" (also a Preferences option, 25636) |
| opt-zoom | Fit | - | button | - | - | click-103 `OS.zoomFit()` |
| (all) | Reset | tool-options-reset | button | - | - | click-227 `OS.resetToolOptions()` |

### 2.3 Brush presets, imported assets, dynamics

| Preset value | Label | Implementation (`setBrushPreset`, 15830) |
|---|---|---|
| round | Round | Fabric PencilBrush |
| soft | Soft Round | PencilBrush + Shadow(blur 8, color = FG, affectStroke) |
| flat | Flat/Calligraphy | PencilBrush, strokeLineCap 'butt' |
| scatter | Scatter | SprayBrush, density 15, dotWidth 2 |
| pixel | Pixel | PencilBrush, strokeLineCap 'square' |
| abr-* | "<name> (ABR)" | `_createABRStampBrush` raster stamp brush; stroke committed as a new image layer "ABR: <name>", history "ABR Brush Stroke" (15780-15829) |

- ABR import (Swatches > Import accepts .abr): versions 1, 2, 6; sanitized fields id, name, size 1-8192 (default 32), softness 0-32, spacing 1-500 (default 25), opacity 0-100, scatter 0-100, pressureSize (default true), pressureOpacity (default false), unsupportedFeatures (listed in the toast). Capped at `_importLimits.maxPresets`. Persisted in localStorage `os_brushes` (29150-29300).
- GRD import (.grd): gradients with color and transparency stops; persisted in `os_gradients`; first imported preset auto-selected.
- Pressure: pen pointers only (brush, pencil, eraser). If a stroke's pressure range >= 0.05, width = base * (0.25 + 0.75 * pressure); status "Stylus: tracking" -> "Stylus: pressure" or "Stylus: fixed" (15862-15900).
- Tilt: azimuthAngle/altitudeAngle or tiltX/tiltY from pen events; status "Tilt: off / on / active".
- Pointer stream: coalesced and predicted pointer events are consumed for brush/eraser/spray (`_bindPointerStreamBrush`).
- Strokes are composited into the active layer's raster (one raster image per layer, created on first paint) and the Fabric path is discarded (29984-30060). Hidden/locked layer: stroke removed, toast "Show and unlock the active layer before drawing".
- Keyboard `[` / `]` change brush size by 2 (clamped 1..200; slider max is 150).

### 2.4 Symmetry (View > Show > Symmetry; palette "Symmetry: ...") (29978-30112)

| Mode value | Menu label | Mirrors produced per stroke (about the canvas center) |
|---|---|---|
| off | Off | none |
| horizontal | Horizontal | 1 (flipX mirror) |
| vertical | Vertical | 1 (flipY mirror) |
| both | Both Axes | 3 (flipX, flipY, both) |
| radial | Radial (6-fold) | 5 rotated copies at 60, 120, 180, 240, 300 degrees |

Toast "Symmetry off" / "Symmetry: <mode>". Menu items are `menuitemradio`, synced via `_syncViewMenuState`. Mirrors are committed together with the stroke. No symmetry axis overlay or custom center/fold count.

### 2.5 Other canvas interaction tied to tools

| Interaction | Behavior |
|---|---|
| Space (hold) | Temporary pan (grab cursor) from any tool; release restores cursor. |
| Mouse wheel | Zoom about pointer, factor 0.999^deltaY, clamp 0.05-20 (no modifier needed). |
| Pinch (2 touches) | Zoom about center (0.05-20; pixel snap if enabled) + two-finger pan (16235). |
| Zoom steps | In x1.25 / out /1.25 (0.05-20); pixel-snap mode steps integer ratios. Fit = fit inside 40 px padding, never above 100%. 100% = `zoomReset()` centered. |
| Snap | With View > Toggle Snap on, moving objects snap to smart alignment guides first, else to grid (`gridSize`); Alt suppresses snapping for that drag (6774-6790). |
| Shape drag | No Shift (square/circle) or Alt (from center) constraints. |
| Canvas HUD (3715) | Pan tool (click-145, title "Pan tool (H)"), Zoom out (click-102), zoom readout `#canvas-zoom-display`, Zoom in (click-101), Fit (click-103). Hidden on blank document and in the mobile workspace. |

## 3. Menus

Menubar `#topbar .menu-bar` (role=menubar, 3135-3408). Top-level order: **File, Edit, Select, Image, Filter, AI, View**. There is no Layer, Window or Help menu (Help-category items exist only in the command palette). There is no menubar search field; the topbar has a "Search commands" button that opens the command palette (14a).

Notes for all menus:
- Only the Select menu displays shortcut text (`.dd-shortcut`); other menus show none even where a key works.
- Each leaf dispatches through `OS_EVENT_HANDLERS.click[id]` (4131-4462). Items whose number is 1-123 or in {219, 222, 223, 224, 225, 230, 231, 232, 236, 237} are projected into command state `menu.click-NNN`; they are `aria-disabled` while no document is open, except the documentless set {001, 002, 003, 012, 014, 026, 118, 119, 120, 121, 122, 123, 236, 237} (18145-18180, 28245-28258).
- BUG to avoid in the rewrite: the registry declares `"click-234"` twice (4170 `OS.showRefineEdge()` and 4296 `OS.groupLayers()`); the later key wins, so **Select > Modify > Refine Edge... actually runs Group Layers**. The Layers panel "Group Layers" button also uses click-234.

### 3.1 File

| Item | Submenu item | Shortcut shown | Handler id | Invokes |
|---|---|---|---|---|
| New | | - (Ctrl+N works) | click-001 | `OS.newImage()` |
| Open Image | | - | click-002 | `OS.openFile()` |
| Place Image | | - | click-237 | `OS.placeFile()` |
| Open PSD | | - | click-003 | `OS.openPSD()` |
| (separator) | | | | |
| Export As > | PNG | - | click-004 | `OS.saveFile('png')` |
| | JPEG | - | click-005 | `OS.saveFile('jpeg')` |
| | WebP | - | click-006 | `OS.saveFile('webp')` |
| | AVIF | - | click-219 | `OS.saveFile('avif')` |
| | SVG | - | click-007 | `OS.saveFile('svg')` |
| | PDF | - | click-008 | `OS.exportPDF()` |
| | PSD (Photoshop) | - | click-009 | `OS.exportPSD()` |
| | OpenRaster (.ora) | - | click-233 | `OS.saveFile('ora')` |
| Batch Export... | | - | click-010 | `OS.batchExport()` |
| Export Settings... | | - | click-011 | `OS.showExportSettings()` |
| (separator) | | | | |
| Templates... | | - | click-012 | `OS.showTemplates()` |
| (separator) | | | | |
| Save Project (.openshop) | | - (Ctrl+S works) | click-013 | `OS.saveProject()` |
| Open Project | | - | click-014 | `OS.openProject()` |

Hidden file inputs: `#file-input` (accept image/*, .ora, .pdf, .jxl, .heic/.heif, RAW .cr2 .cr3 .nef .arw .dng .raf .rw2 .orf .srw .pef .raw) change-034 `OS.handleFileOpen`; `#psd-input` (.psd) change-035 `OS.handlePSDOpen`; `#project-input` (.openshop, .json, application/vnd.openshop+json) change-036 `OS.handleProjectOpen` (4122-4124).

### 3.2 Edit

| Item | Submenu item | Shortcut shown | Handler id | Invokes |
|---|---|---|---|---|
| Undo | | - (Ctrl+Z) | click-015 | `OS.undo()` |
| Redo | | - (Ctrl+Shift+Z / Ctrl+Y) | click-016 | `OS.redo()` |
| Snapshots & Branches... | | - | click-225 | `OS.showSnapshotManager()` |
| (separator) | | | | |
| Copy | | - | click-017 | `OS.copyObj()` |
| Paste | | - | click-018 | `OS.pasteObj()` |
| Duplicate | | - | click-019 | `OS.duplicateSelected()` |
| (separator) | | | | |
| Delete | | - | click-020 | `OS.deleteSelected()` |
| (separator) | | | | |
| Transform > | Free Transform... | - | click-021 | `OS.showFreeTransform()` |
| | Skew... | - | click-022 | `OS.skewObject()` |
| | Perspective... | - | click-023 | `OS.showPerspective()` |
| | Liquify... | - | click-024 | `OS.showLiquify()` |
| | Curved Text... | - | click-025 | `OS.showCurvedText()` |
| (separator) | | | | |
| Preferences... | | - | click-026 | `OS.showPreferences()` |

Note: no Cut item in the Edit menu (Cut exists only as Ctrl+X and in the canvas context menu).

### 3.3 Select

| Item | Submenu item | Shortcut shown | Handler id | Invokes |
|---|---|---|---|---|
| All | | Ctrl+A | click-027 | `OS.selectAll()` (switches to Move tool and selects every selectable object) |
| Deselect | | Ctrl+D | click-028 | `OS.deselectAll()` |
| Reselect | | Ctrl+Shift+D | click-029 | `OS.reselectSelection()` |
| Inverse | | Ctrl+Shift+I | click-030 | `OS.invertSelection()` |
| (separator) | | | | |
| Color Range... | | - | click-031 | `OS.showColorRange()` |
| (separator) | | | | |
| Modify > | Expand... | - | click-032 | `OS.modifySelection('expand')` |
| | Contract... | - | click-033 | `OS.modifySelection('contract')` |
| | Feather... | - | click-034 | `OS.modifySelection('feather')` |
| | Refine Edge... | - | click-234 | intended `OS.showRefineEdge()`; actually runs `OS.groupLayers()` (duplicate-key bug) |
| | Border... | - | click-035 | `OS.modifySelection('border')` |
| | Smooth | - | click-036 | `OS.modifySelection('smooth')` |
| (separator) | | | | |
| Grow | | - | click-037 | `OS.growSelection()` |
| Similar | | - | click-038 | `OS.similarSelection()` |
| (separator) | | | | |
| Transform Selection... | | - | click-230 | `OS.showTransformSelection()` |
| (separator) | | | | |
| Save Selection... | | - | click-231 | `OS.showSaveSelectionDialog()` |
| Load Selection... | | - | click-232 | `OS.openSelectionFile()` |

### 3.4 Image

| Item | Submenu item | Shortcut shown | Handler id | Invokes |
|---|---|---|---|---|
| Resize Canvas | | - | click-039 | `OS.showResize()` |
| Trace to Vector... | | - | click-224 | `OS.showTraceDialog()` |
| Enlarge 2x (AI model) | | - | click-222 | `OS.aiSuperResolve(2)` |
| Enlarge 4x (AI model) | | - | click-223 | `OS.aiSuperResolve(4)` |
| Enlarge 2x (resample) | | - | click-099 | `OS.aiUpscale(2)` |
| Enlarge 4x (resample) | | - | click-100 | `OS.aiUpscale(4)` |
| (separator) | | | | |
| Image Rotation > | Flip Horizontal | - | click-040 | `OS.flipH()` (active object) |
| | Flip Vertical | - | click-041 | `OS.flipV()` |
| | (separator) | | | |
| | Rotate 90° CW | - | click-042 | `OS.rotateObj(90)` |
| | Rotate 90° CCW | - | click-043 | `OS.rotateObj(-90)` |
| Canvas Rotation > | Rotate 90° CW | - | click-044 | `OS.canvasRotate(90)` |
| | Rotate 90° CCW | - | click-045 | `OS.canvasRotate(-90)` |
| | (separator) | | | |
| | Flip Horizontal | - | click-046 | `OS.canvasFlip('h')` |
| | Flip Vertical | - | click-047 | `OS.canvasFlip('v')` |
| (separator) | | | | |
| Flatten Image | | - | click-048 | `OS.flattenImage()` |
| (separator) | | | | |
| Add Watermark... | | - | click-049 | `OS.addWatermark()` |
| Auto Enhance | | - | click-050 | `OS.autoEnhance()` |
| Image Info... | | - | click-051 | `OS.showImageInfo()` |
| Before / After Compare | | - | click-052 | `OS.showBeforeAfter()` |

### 3.5 Filter

| Item | Submenu item | Sub-submenu item | Handler id | Invokes |
|---|---|---|---|---|
| Blur > | Blur... | | click-053 | `OS.showFilterDialog('Blur')` |
| | Sharpen | | click-054 | `OS.applyFilterDirect('Sharpen')` |
| | Unsharp Mask... | | click-055 | `OS.filterUnsharpMask()` |
| | Tilt Shift... | | click-056 | `OS.filterTiltShift()` |
| Distort > | Pixelate... | | click-057 | `OS.showFilterDialog('Pixelate')` |
| | Chromatic Aberration... | | click-058 | `OS.filterChromaticAberration()` |
| | Lens Correction... | | click-059 | `OS.adjLensCorrection()` |
| Noise > | Add Noise... | | click-060 | `OS.showFilterDialog('Noise')` |
| | Generate Noise... | | click-061 | `OS.filterNoiseGen()` |
| Stylize > | Emboss | | click-062 | `OS.applyFilterDirect('Emboss')` |
| | Edge Detect | | click-063 | `OS.filterEdgeDetect()` |
| | Solarize | | click-064 | `OS.filterSolarize()` |
| | (separator) | | | |
| | Oil Paint... | | click-065 | `OS.filterOilPaint()` |
| | Halftone... | | click-066 | `OS.filterHalftone()` |
| | Duotone... | | click-067 | `OS.filterDuotone()` |
| | Vignette... | | click-068 | `OS.filterVignette()` |
| | (separator) | | | |
| | Posterize... | | click-069 | `OS.filterPosterize()` |
| | Threshold... | | click-070 | `OS.filterThreshold()` |
| (separator) | | | | |
| Adjustments > | Tone > | Brightness... | click-071 | `OS.showFilterDialog('Brightness')` |
| | | Contrast... | click-072 | `OS.showFilterDialog('Contrast')` |
| | | Gamma... | click-073 | `OS.showFilterDialog('Gamma')` |
| | | (separator) | | |
| | | Exposure... | click-074 | `OS.adjExposure()` |
| | | Shadows / Highlights... | click-075 | `OS.adjShadowsHighlights()` |
| | | (separator) | | |
| | | Curves... | click-076 | `OS.showCurvesDialog()` |
| | | Levels... | click-077 | `OS.showLevelsDialog()` |
| | Color > | Saturation... | click-078 | `OS.showFilterDialog('Saturation')` |
| | | Hue Rotation... | click-079 | `OS.showFilterDialog('HueRotation')` |
| | | Vibrance... | click-080 | `OS.adjVibrance()` |
| | | (separator) | | |
| | | Color Balance... | click-081 | `OS.showColorBalanceDialog()` |
| | | Channel Mixer... | click-082 | `OS.showChannelMixer()` |
| | | Gradient Map... | click-083 | `OS.showGradientMap()` |
| | | (separator) | | |
| | | Photo Filter... | click-084 | `OS.adjPhotoFilter()` |
| | | Selective Color... | click-085 | `OS.adjSelectiveColor()` |
| | | Replace Color... | click-086 | `OS.adjReplaceColor()` |
| Color Mode > | Grayscale | | click-087 | `OS.applyFilterDirect('Grayscale')` |
| | Invert | | click-088 | `OS.applyFilterDirect('Invert')` |
| | Sepia | | click-089 | `OS.applyFilterDirect('Sepia')` |
| | Black & White | | click-090 | `OS.applyFilterDirect('BlackWhite')` |
| (separator) | | | | |
| Auto Levels | | | click-091 | `OS.autoLevels()` |
| Auto Contrast | | | click-092 | `OS.autoContrast()` |
| Photo Presets... | | | click-093 | `OS.showPresets()` |
| (separator) | | | | |
| Remove Background (AI) | | | click-094 | `OS.aiRemoveBackground()` |
| (separator) | | | | |
| Clear All Filters | | | click-095 | `OS.clearFilters()` |

Dialog-internal handler ids (built in JS, not in the menubar markup): Curves channel buttons click-210..213 (`_curvesChannel` = rgb/r/g/b), Curves presets click-214..218 (`_curvesPreset` linear/brighten/darken/contrast/invert); Gradient Map preview change-037 `_updateGMPreview`; generic filter preview `input-filter-preview` `_filterPreview(name)`; Levels preview input-024; Color Balance preview input-025; slider readout formatters input-026 (value + "%"), input-027 (value + degree sign), input-028 (raw), input-029 (value + "px"), input-030 (value/100, 1 dp + "EV"), input-031 (value/100, 2 dp).

### 3.6 AI

| Item | Handler id | Invokes |
|---|---|---|
| Background Remove | click-094 | `OS.aiRemoveBackground()` |
| Depth Map | click-096 | `OS.aiDepthMap()` |
| Detect Objects | click-097 | `OS.aiObjectDetect()` |
| Segment Select | click-098 | `OS.activateSegmentSelect()` |
| (separator) | | |
| Note (non-interactive, role=note): "Models download on first use — no API keys needed" | | |

### 3.7 View

| Item | Submenu item | Item role / state key | Handler id | Invokes |
|---|---|---|---|---|
| Zoom > | Zoom In | menuitem | click-101 | `OS.zoomIn()` |
| | Zoom Out | menuitem | click-102 | `OS.zoomOut()` |
| | Fit to Screen | menuitem | click-103 | `OS.zoomFit()` |
| | 100% | menuitem | click-104 | `OS.zoomReset()` |
| Show > | Toggle Grid | checkbox `grid` | click-105 | `OS.toggleGrid()` |
| | Toggle Rulers | checkbox `rulers` | click-106 | `OS.toggleRulers()` |
| | Toggle Snap to Grid | checkbox `snap` | click-107 | `OS.toggleSnap()` |
| | Symmetry > Off | radio `symmetry=off` | click-108 | `OS.setSymmetryMode('off')` |
| | Symmetry > Horizontal | radio `symmetry=horizontal` | click-109 | `OS.setSymmetryMode('horizontal')` |
| | Symmetry > Vertical | radio `symmetry=vertical` | click-110 | `OS.setSymmetryMode('vertical')` |
| | Symmetry > Both Axes | radio `symmetry=both` | click-111 | `OS.setSymmetryMode('both')` |
| | Symmetry > Radial (6-fold) | radio `symmetry=radial` | click-112 | `OS.setSymmetryMode('radial')` |
| | Pixel Grid | checkbox `pixel-grid` | click-113 | `OS.togglePixelGrid()` |
| Guides > | Add Horizontal Guide | menuitem | click-114 | `OS.addGuide('horizontal')` |
| | Add Vertical Guide | menuitem | click-115 | `OS.addGuide('vertical')` |
| | (separator) | | | |
| | Clear All Guides | menuitem | click-116 | `OS.clearGuides()` |
| (separator) | | | | |
| Panels > | Animation Timeline | checkbox `timeline` | click-117 | `OS.toggleTimeline()` |
| | Actions / Macros | checkbox `macros` | click-118 | `OS.toggleMacroPanel()` |
| Theme > | Dark (Default) | radio `theme=default` | click-119 | `OS.setTheme('default')` |
| | Midnight | radio `theme=midnight` | click-120 | `OS.setTheme('midnight')` |
| | OLED Black | radio `theme=oled` | click-121 | `OS.setTheme('oled')` |
| | Light | radio `theme=light` | click-236 | `OS.setTheme('light')` |
| (separator) | | | | |
| Fullscreen Mode | | checkbox `fullscreen` | click-122 | `OS.toggleFullscreen()` (CSS `body.fullscreen`, not the Fullscreen API; toast "Fullscreen (click View > Fullscreen to exit)") |
| Keyboard Shortcuts... | | menuitem | click-123 | `OS.showShortcuts()` |

Check/radio state (`aria-checked`) is recomputed on each popup open by `_syncViewMenuState` (28260-28282): grid = `gridVisible`, rulers = `rulersVisible`, snap = `snapEnabled`, pixel-grid = `_pixelGridVisible`, timeline/macros = panel has `.visible`, fullscreen = `body.fullscreen`; radios symmetry = `_symmetryMode`, theme = `_currentTheme`.

### 3.8 Topbar controls beside the menus (3409-3427)

| Control | Id | Behavior |
|---|---|---|
| Logo | - | "OS" mark, "OpenShop", "v0.31" |
| "Search commands" button (magnifier icon, `<kbd>Ctrl K</kbd>`) | command-launch | click-228 `OS.toggleCmdPalette(this)`; title "Open command palette (Ctrl+K)"; aria-keyshortcuts "Control+K Meta+K" |
| Workspace select (label "Workspace") | workspace-selector | change-043 `OS.setWorkspaceMode(value)`; options Standard, Essentials, Motion, Mobile (4.9) |
| "Local only" badge | - | shield icon; title "Your files and edits stay on this device" |
| Hamburger (mobile only) | mobile-panel-toggle | click-124 `OS.toggleMobilePanels()`; aria-controls `panels`; aria-keyshortcuts "Alt+P" (no Alt+P key handler exists) |

### 3.9 Menu behavior (MENU ACCESSIBILITY, 28206-28562)

| Behavior | Detail |
|---|---|
| Roles | menubar > menuitem roots (aria-haspopup, aria-expanded, roving tabindex: first root 0); `.menu-dropdown` role=menu labelled by owner text; items menuitem / menuitemcheckbox / menuitemradio; separators role=separator; shortcut text moved to `aria-keyshortcuts`. |
| Pointer | Click on root toggles its popup; hover opens (native popover with 600 ms close grace; anchored `block-end span-inline-end` for roots and `inline-end span-block-end` for submenus). Click on a `.dd-sub` toggles its submenu; clicking a leaf runs it and collapses the whole tree. Disabled items (`aria-disabled=true`) swallow clicks. |
| Fallback positioning | Without native popovers: dropdowns right-align near the window's right edge; submenus get `.flip-left` if they would overflow, and shift up if they would pass the bottom (28176-28203). |
| Keys on roots | Left/Right move between roots (preserving open state), Down/Enter/Space open and focus the first item, Up opens and focuses the last, Home/End first/last root, Escape closes. |
| Keys in menus | Up/Down wrap, Home/End, Right opens a submenu (or moves to the next root), Left closes a submenu (or moves to the previous root), Escape closes one level, Enter/Space activates (opens submenus), Tab closes all. Type-ahead: one character jumps to the next item whose text starts with it. |
| Keyboard mode | `.keyboard-nav` class while navigating by keys; pointer movement > 2 px exits it. |
| Command-state sync | Each popup open re-runs `_syncMenuCommandState` (document prerequisite -> aria-disabled; sets `data-os-command="menu.click-NNN"`). |

### 3.10 Context menus

Canvas context menu (`#context-menu`, built in `initContextMenu`, 28004-28204). Right-click on `#canvas-area`; contents depend on state. Rendered as `.ctx-item` (with `.ctx-shortcut`) and `.ctx-sub` submenus (hover popovers); positioned at the pointer (native anchor, or clamped to the window assuming 220 px width). Escape or any document click closes it.

A. When an object is active:

| Item | Submenu item | Shortcut shown | Invokes |
|---|---|---|---|
| Cut | | Ctrl+X | `copyObj(); deleteSelected()` |
| Copy | | Ctrl+C | `copyObj()` |
| Paste | | Ctrl+V | `pasteObj()` |
| Duplicate | | Ctrl+J | `duplicateSelected()` |
| Delete | | Del | `deleteSelected()` |
| (separator) | | | |
| Transform > | Free Transform | Ctrl+T | `showFreeTransform()` |
| | Flip Horizontal | | `flipH()` |
| | Flip Vertical | | `flipV()` |
| | (separator) | | |
| | Rotate 90° CW | | `rotateObj(90)` |
| | Rotate 90° CCW | | `rotateObj(-90)` |
| Arrange > | Bring to Front | | `_moveObjectWithinLayer(active,'front')` |
| | Bring Forward | | `_moveObjectWithinLayer(active,'forward')` |
| | Send Backward | | `_moveObjectWithinLayer(active,'backward')` |
| | Send to Back | | `_moveObjectWithinLayer(active,'back')` |
| (separator) | | | |
| Layer Via Copy | | | `_layerViaCopy()` |
| Layer Via Cut | | | `_layerViaCut()` |
| (image only) separator | | | |
| (image only, if a filter was applied) Last Filter: <name> | | | `_reapplyLastFilter()` |
| (image only) Clear Filters | | | `clearFilters()` |

B. When a pixel selection exists and no object is active:

| Item | Submenu item | Shortcut shown | Invokes |
|---|---|---|---|
| Deselect | | Ctrl+D | `deselectAll()` |
| Select Inverse | | Ctrl+Shift+I | `invertSelection()` |
| (separator) | | | |
| Modify > | Feather... | | `modifySelection('feather')` |
| | Expand... | | `modifySelection('expand')` |
| | Contract... | | `modifySelection('contract')` |
| | Smooth | | `modifySelection('smooth')` |
| Grow | | | `growSelection()` |
| Similar | | | `similarSelection()` |
| (separator) | | | |
| Layer Via Copy | | | `_layerViaCopy()` |
| Layer Via Cut | | | `_layerViaCut()` |

C. Nothing selected:

| Item | Submenu item | Shortcut shown | Invokes |
|---|---|---|---|
| Paste | | Ctrl+V | `pasteObj()` |
| Select All | | Ctrl+A | `selectAll()` |
| (separator) | | | |
| New Layer | | | `addLayer()` |
| Flatten Image | | | `flattenImage()` |
| (separator) | | | |
| Zoom > | Zoom In | | `zoomIn()` |
| | Zoom Out | | `zoomOut()` |
| | Zoom to Fit | Ctrl+0 | `zoomFit()` |
| | Actual Pixels | Ctrl+1 | `zoomActual()` |
| (separator) | | | |
| Toggle Grid | | | `toggleGrid()` |
| Toggle Rulers | | Ctrl+R | `toggleRulers()` |
| (separator) | | | |
| Canvas Size... | | | `showResize()` |
| Image Info... | | | `showImageInfo()` |

Other right-click behaviors:

| Target | Behavior |
|---|---|
| Layers panel rows | **No context menu** (not implemented). |
| Any swatch (Color panel swatches, Default/Saved palette) | Right-click (or Shift+F10 / ContextMenu key) sets the Background color (19951, 19985). |
| Toolbar family face | Right-click opens that family's flyout (15120). |

## 4. Panels

### 4.0 Docking model

| Aspect | Behavior | Lines |
|---|---|---|
| Right dock | `#panels` (role=complementary "Editor panels") holds 3 fixed `.panel-tab-group` stacks, top to bottom: Group 1 Layers / Properties / Align (`.ptg-flex`, takes remaining height), Group 2 Color / Swatches, Group 3 History / Navigator / Info. No drag-to-redock, floating, collapsing to icons, or moving tabs between groups. | 3782-4016 |
| Tabs | `.panel-tabs` role=tablist. `switchTab(btn, groupId, contentId)` toggles `.active`, `aria-selected`, roving tabindex, `hidden` on contents; records `session.panels.activeTabs[group] = contentId`. Keys: Left/Right (wrap), Home, End. Handlers click-154..156 (ptg1), click-176..177 (ptg2), click-185..187 (ptg3). | 15146-15218 |
| Splitters | A `.panel-splitter` (button, role=separator) after each group except the last; dragging resizes the group above (min 80 px, max 2000); keyboard Up/Down = 16 px (Shift = 48), Home or double-click = natural size. Heights persisted in `prefs.panelSizes`, restored at boot. Title "Drag, or focus and use the arrow keys, to resize"; aria-label "Resize <first tab> panel". | 21060-21137 |
| Hide all | Tab key (when the canvas is the working context and no modal is open) or palette "Toggle Panels" -> `togglePanels()` hides/shows `#panels`, `#toolbar`, `#tool-options` together. | 21049-21058 |
| Mobile | Workspace "mobile" or viewport <= 767 px: `#panels` becomes a slide-in drawer (right -320 px -> 6 px, `.mobile-open`), inert/aria-hidden when closed, toggled by `#mobile-panel-toggle`. Toolbar becomes a horizontal bottom strip, options bar a top strip; status bar and canvas HUD hidden; family labels hidden. | 21014-21047, CSS 3044-3075 |
| Bottom tabs | `#bottom-tabs` tablist: "Mini Bridge" (click-226 `selectBottomTab('mini-bridge')`) and "Timeline" (click-117 `toggleTimeline()`, frame-count badge `#timeline-tab-count`). Mini Bridge's tabpanel (`#mini-bridge-panel`) is just the canvas wrapper: there is no file-browser content. Arrow/Home/End keys. `html[data-os-bottom-tab]` reserves space for the timeline tray. | 3692, 3727-3730, 30601-30660 |
| Floating panels | Actions/Macros (`#macro-panel`) floats, toggled via `.visible`. Liquify and Before/After are full-screen overlays. | 4094-4121 |

### 4.1 Layers (tab "Layers", `#ptg1-layers`)

| Control | Type | Handler | Notes |
|---|---|---|---|
| New Layer | icon button | click-157 `OS.addLayer()` | |
| Group Layers | icon button | click-234 `OS.groupLayers()` (Ctrl+G) | |
| Ungroup Layers | icon button | click-235 `OS.ungroupLayers()` (Ctrl+Shift+G) | |
| Duplicate | icon button | click-158 `OS.duplicateLayer()` | |
| Merge Down | icon button | click-159 `OS.mergeDown()` (Ctrl+E) | |
| Delete | icon button | click-160 `OS.deleteLayer()` | |
| Mask | icon button | click-161: active object has `_openShopLayerMask` -> `showLayerMaskDialog()`; else `_hasMask` -> `removeLayerMask()`; else `addLayerMask()` | |
| Blend mode | select `#layer-blend` | change-028 `OS.setLayerBlend(value)` | Normal (source-over), Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity (16) |
| Opacity | range `#layer-opacity` 0-100, default 100, readout `#layer-opacity-val` | input-018 `OS.setLayerOpacity(value,false)` (live); change-029 `OS.commitLayerOpacity()` (history) | |
| Layer list | `#layers-list` role=listbox (sr-only options) + `#layers-list-visual` (visible rows) | `updateLayersPanel()` (14810) | Empty text `#layers-empty`: "No layers. Click + to add one." / "No document open" / "No layers yet". All `.panel-action` buttons disabled with no document. |

Layer row (`.layer-item`; indentation 7 + 16 px per group depth):

| Element | Behavior |
|---|---|
| Disclosure (groups only) | ▾ / ▸ button -> `toggleGroupCollapsed(i)`, aria-expanded; non-group rows get a spacer |
| Drag handle (☰) | title "Drag to reorder"; `initLayerDrag(row, i)` with drop-above / drop-below / drop-into (into a group) indicators (25853) |
| Visibility (eye) | `toggleLayerVisibility(i)`; title/aria "Hide layer" / "Show layer", aria-pressed |
| Lock | `toggleLayerLock(i)`; history "Lock Layer" / "Unlock Layer" via command `layer.lock.set`; toast |
| Thumbnail | 32x32 box (38x38 in later CSS); checkerboard for the background layer; folder glyph for groups; no real pixel preview |
| Name | Double-click: adjustment layer -> `showAdjustmentLayerDialog(i)`; smart object -> `showSmartObjectDialog()`; text-on-path -> `editSelectedTextOnPath()`; otherwise inline rename input (Enter or blur commits `renameLayer`) |
| Subtitle | "Locked · " prefix; non-normal blend mode name; groups "Group · N item(s)[ · Collapsed]"; adjustment layers "<Type> adjustment"; others "N obj" + " · M" (mask) + " · SO" (smart object) + " · Text Path" |
| Click | `selectLayer(i, {extend: Shift, toggle: Ctrl/Cmd})` (multi-select) |
| Keyboard (listbox) | Up/Down, Home/End, PageUp/PageDown (5 rows), Enter/Space select, Delete/Backspace delete layer, Ctrl+Alt+Up/Down move layer (14729-14800) |

### 4.2 Properties (tab "Properties", `#ptg1-props`): adjustments, layer types, text, styles

| Section | Control (label) | Id | Type / range / default | Handler |
|---|---|---|---|---|
| Adjustments | Brightness | adj-bright | range -100..100, 0 | input-019 `OS.liveAdjust()` |
| | Contrast | adj-contrast | range -100..100, 0 | input-019 |
| | Saturation | adj-sat | range -100..100, 0 | input-019 |
| | Hue | adj-hue | range -180..180, 0 | input-019 |
| | Blur | adj-blur | range 0..100, 0 | input-019 |
| | Apply | - | primary button | click-162 `OS.applyAdjustments()` |
| | Reset | - | button | click-163 `OS.resetAdjustments()` |
| Non-destructive layers | Type | adjustment-layer-kind | select: Levels (levels), Curves (curves), HSL (hsl) | - |
| | Add Layer | add-adjustment-layer | button | `addAdjustmentLayer(type)` then `showAdjustmentLayerDialog()` |
| | Apply Stack | apply-adjustment-layers | button | `applyAdjustmentLayers()` |
| Smart Object | Convert | convert-smart-object | button | `convertToSmartObject()` |
| | Edit Source | edit-smart-object | button | `showSmartObjectDialog()` |
| Vector Path | Convert to Path | convert-vector-path | button | `convertSelectedVectorToPath()` |
| | Edit Path | edit-vector-path | button | `editSelectedVectorPath()` |
| Text & Type | Ligatures | text-feature-ligatures | checkbox | read by Apply Type Features |
| | Small caps | text-feature-smallcaps | checkbox | |
| | Tabular numbers | text-feature-tabular | checkbox | |
| | Apply Type Features | apply-text-features | button | `applySelectedTextFeatures()` |
| | Text on Path | attach-text-path | button | `attachSelectedTextToPath()` |
| | Edit Text on Path | edit-text-path | button | `editSelectedTextOnPath()` |
| Text Effects | Shadow X | tfx-sx | range -20..20, 2 | input-020 `OS.applyTextFx()` |
| | Shadow Y | tfx-sy | range -20..20, 2 | input-020 |
| | Blur | tfx-blur | range 0..30, 4 | input-020 |
| | Color | tfx-color | color #000000 | change-030 `OS.applyTextFx()` |
| | Outline W | tfx-stroke | range 0..10, 0 | input-020 |
| | Outline C | tfx-stroke-color | color #000000 | change-030 |
| | Apply | - | primary button | click-164 `OS.applyTextFx()` |
| | Clear | - | button | click-165 `OS.clearTextFx()` |
| Layer Styles: Drop Shadow (details, open) | Offset X | ls-ds-x | range -30..30, 3 | input-021 `OS.previewLayerStyle()` |
| | Offset Y | ls-ds-y | range -30..30, 3 | input-021 |
| | Blur | ls-ds-blur | range 0..40, 6 | input-021 |
| | Color | ls-ds-color | color #000000 | change-031 `OS.previewLayerStyle()` |
| Layer Styles: Outer Glow (details) | Size | ls-og-size | range 0..40, 0 | input-021 |
| | Color | ls-og-color | color #6c8cff | change-031 |
| Layer Styles: Stroke (details) | Width | ls-st-w | range 0..20, 0 | input-021 |
| | Color | ls-st-color | color #ffffff | change-031 |
| Layer Styles | Apply | - | primary button | click-166 `OS.applyLayerStyle()` |
| | Clear | - | button | click-167 `OS.clearLayerStyle()` |

There is no separate "Adjustments" panel; adjustments live in Properties and in the Filter > Adjustments dialogs.

### 4.3 Align (tab "Align", `#ptg1-align`)

| Control (title) | Handler |
|---|---|
| Align Left | click-168 `OS.alignObjects('left')` |
| Align Center | click-169 `alignObjects('centerH')` |
| Align Right | click-170 `alignObjects('right')` |
| Align Top | click-171 `alignObjects('top')` |
| Align Middle | click-172 `alignObjects('centerV')` |
| Align Bottom | click-173 `alignObjects('bottom')` |
| Distribute H | click-174 `OS.distributeObjects('horizontal')` |
| Distribute V | click-175 `OS.distributeObjects('vertical')` |

(The six align buttons are duplicated in the Move tool options bar.)

### 4.4 Color (tab "Color", `#ptg2-color`)

| Control | Id | Type / range / default | Behavior |
|---|---|---|---|
| Color wheel | color-wheel (120x120 canvas) + cursor `#cw-cursor` | canvas | mousedown/drag picks hue/saturation -> FG (`initColorWheel`, `_pickColorWheel`, 25244-25300) |
| H | hsb-h | range 0-360, 0 | input-022 `OS._hsbToFg()` |
| S | hsb-s | range 0-100, 0 | input-022 |
| B | hsb-b | range 0-100, 100 | input-022 |
| FG box | fg-color | click | click-178 opens hidden `#fg-picker` (native color input; change-032 `OS.setFgColor`) |
| BG box | bg-color | click | click-179 opens hidden `#bg-picker` (change-033 `OS.setBgColor`) |
| Swap (⇄) | - | button | click-180 `OS.swapColors()` |
| Readouts | fg-hex / bg-hex / fg-oklch | text | "FG / BG" caption, "#FFFFFF / #000000", OKLCH line `oklch(L% C H)` for FG |
| Swatches grid | color-swatches | role=grid of 28 fixed colors: #000000 #333333 #666666 #999999 #cccccc #ffffff #ff0000 #ff6600 #ffcc00 #33cc33 #0099ff #6633ff #ff3399 #cc0000 #cc6600 #999900 #009933 #006699 #330099 #cc0066 #ff9999 #ffcc99 #ffff99 #99ff99 #99ccff #cc99ff #ff99cc #6c8cff | Click/Enter/Space = FG; right-click / Shift+F10 / ContextMenu = BG; arrow keys/Home/End roving focus by measured visual rows; `aria-selected` marks the current FG (20019) |

App default colors: FG #ffffff, BG #000000. The `D` key sets FG #000000 / BG #ffffff (the inverse of the app default).

### 4.5 Swatches (tab "Swatches", `#ptg2-palettes`)

| Control | Behavior |
|---|---|
| "Default" palette grid (`#palette-default`) | 24 fixed colors: #ffffff #000000 #ff0000 #00ff00 #0000ff #ffff00 #ff00ff #00ffff #ff6b6b #ffa500 #48bb78 #4299e1 #9f7aea #ed64a6 #667eea #38b2ac #e53e3e #dd6b20 #2f855a #2b6cb0 #6b46c1 #d53f8c #434190 #285e61 (28912) |
| "Saved" palette grid (`#palette-saved`) | User colors, localStorage `os_palette` |
| + Add FG | click-181 `OS.savePaletteColor()` (dedupes; toast "Added #x to palette") |
| Clear | click-182 `OS.clearPalette()` (toast with inline Undo) |
| Export | click-183 `OS.exportPalette()` -> `openshop-palette.json` `{name:'OpenShop Palette', colors:[...]}` (exports [#ffffff, #000000] if empty) |
| Import | click-184 `OS.importPalette()`; accepts .json, .gpl (GIMP), .ase (Adobe Swatch Exchange), .abr (-> brush presets), .grd (-> gradient presets) (29435) |

Swatch interaction is identical to the Color panel swatches.

### 4.6 History (tab "History", `#ptg3-history`)

| Element | Behavior |
|---|---|
| List `#history-list` (role=listbox) | First row = baseline (`_historyBaseLabel`, index -1); then one row per entry (`entry.action`). Current row `.current`; rows after the cursor `.future` + aria-disabled. Click restores that state (`_restoreHistory`). Auto-scrolls to bottom. Blank workspace: "History begins after you open a document." (19270-19323) |
| Keyboard | Up/Down, Home/End, PageUp/PageDown, Enter/Space restore. |
| Capacity | 60-step ring; named snapshots and branches via Edit > Snapshots & Branches... and palette "Name This State..." (19325+). |

### 4.7 Navigator (tab "Navigator", `#ptg3-nav`), includes the Histogram

| Element | Behavior |
|---|---|
| Minimap `#minimap-wrap` / `#minimap-canvas` + viewport rectangle `#minimap-vp` | Document thumbnail; click-188 `OS._minimapClick(event)` recenters the viewport on the clicked point; rectangle tracks zoom/pan (28775-28857) |
| "Histogram" heading | |
| Channel buttons L / R / G / B | click-189..192 set `OS._histChannel` = luminance / red / green / blue, call `updateHistogram()`, toggle `.active` (L default) |
| Histogram canvas | `#histogram-canvas` 240x80 |
| Stats | `#hist-min` "Min: 0", `#hist-mean` "Mean: 128", `#hist-max` "Max: 255" |

### 4.8 Info (tab "Info", `#ptg3-info`)

| Row (dt) | Id | Default text | Source |
|---|---|---|---|
| Canvas | info-dims | 1920 x 1080 | `updateInfoPanel` (25954); "No document" when blank |
| Layers | info-layers | 1 | layer count |
| Objects | info-objects | 0 | non-boundary object count |
| Zoom | info-zoom | 100% | "—" when blank |
| Color Mode | info-color-mode | RGB / 8 bit | `_updateDocumentMetadataReadouts` |
| Profile | info-color-profile | sRGB IEC61966-2.1 | same |
| Cursor | info-cursor | 0, 0 | pointer document coordinates |

### 4.9 Workspace modes (topbar selector; `setWorkspaceMode`, 6228-6259)

| Mode | Effect |
|---|---|
| standard | Default layout. |
| essentials | Only sets `html[data-os-workspace=essentials]`; no CSS or behavior specific to it exists (effectively identical to Standard). |
| motion | Shows the Timeline tray (without creating a frame) and selects the Timeline bottom tab. Leaving motion stops playback and hides the tray. |
| mobile | Mobile layout (4.0). |

Persisted in localStorage `os_workspace_mode`; re-fits the canvas; toast "Workspace: <Mode>".

### 4.10 Timeline (bottom tab "Timeline", `#timeline-panel`, 4075-4092, 30589-30957)

| Control | Handler | Notes |
|---|---|---|
| Title "Timeline" + summary `#timeline-summary` ("N frames") | | |
| Previous frame | click-198 `OS.prevFrame()` | |
| Play/Pause `#tl-play` | click-199 `OS.togglePlay()` | Loops frames with per-frame delays (fallback 1000/fps); toast "Add a frame before playback" when empty |
| Next frame | click-200 `OS.nextFrame()` | |
| + Frame | click-201 `OS.addFrame()` | Command `frame.add` (captures a flattened canvas raster); toast "Frame N added" |
| Duplicate | click-202 `OS.dupFrame()` | Command `frame.duplicate` |
| FPS `#tl-fps` | number 1-60, default 12 | |
| Export GIF | click-203 `OS.exportGIF()` | Needs >= 2 frames; verified modern-gif worker encoder; per-frame delays 10-60000 ms; on encoder failure falls back to a PNG spritesheet `openshop-spritesheet-<cols>x<rows>-<fps>fps.png` |
| Close (×) | click-117 `OS.toggleTimeline()` | |
| Frame strip `#timeline-frames` | | Thumbnails 80 px wide, label "#N", title "Frame N · <delay> ms", × removes (`removeFrame`), click selects (`selectFrame`). Empty state button "+ Add first frame". |

Opening the timeline with more than one layer shows a one-time toast that frames are flattened snapshots. Toggling it open with zero frames auto-adds one. No per-frame delay editor, onion skin, or layer-based tweening.

### 4.11 Actions / Macros (floating `#macro-panel`, 4094-4107, 30957-31070)

| Control | Handler | Notes |
|---|---|---|
| Header "Actions" + red recording indicator | | Indicator visible while recording |
| Step list `#macro-list` | | "1. <command label>" per recorded typed command |
| Record / Stop `#macro-rec-btn` | click-204 `OS.toggleMacroRec()` | Records normalized typed commands (`recordMacroStep`); toast "Recording actions..." / "Recorded N steps" |
| Play | click-205 `OS.playMacro()` | Runs as one `macro.sequence` command, history "Play Action (N steps)" |
| Clear | click-206 `OS.clearMacro()` | Toast with Undo |
| Save | click-207 `OS.saveMacro()` | Downloads `openshop-action.json` `{kind:'openshop-command-sequence', schemaVersion, appVersion, commands}` |
| Load | click-208 `OS.loadMacro()` | Accepts .json; max 200 commands |

Single action slot only (no named action sets, no per-step toggles or edit).

### 4.12 Status bar (`#statusbar`, 4019-4031)

| Element | Id | Behavior |
|---|---|---|
| Canvas size | canvas-dims | "1920 x 1080" / "No document" |
| Zoom | zoom-display (button) | click-103 `zoomFit()`; title "Fit canvas to view" |
| Cursor | cursor-pos | "X: 0 Y: 0" |
| Bit depth | status-bit-depth | "8 bit" |
| Color profile | status-color-profile | "sRGB IEC61966-2.1" |
| Tool name | tool-display | current tool display name |
| Save state | persistence-state | dot + label (e.g. "All changes saved"); `data-state` |
| Network activity | network-state (button) | label e.g. "Nothing sent"; click-220 `OS.showNetworkActivity()` |
| Offline status | offline-state (button) | "Checking offline support"; click-193 `OS.showOfflineManager()` |
| Object count | object-count | "0 objects" |
| Diagnostics badge | diagnostics-badge (hidden until errors) | click-diagnostics `OS.exportDiagnostics()`; title "Errors this session — run Export Diagnostics from the command palette" |

### 4.13 Network Activity dialog (status bar; palette "Network Activity") (21497-21600)

Modal "Network Activity": intro (all processing is local; only program code and AI model weights are fetched); summary "N outbound request(s) this session across M host(s)." or "No request has left this page this session."; host list (`dt` host, `dd` "<purpose> · N sent[ · N blocked][ · N failed]"; "Outbound hosts: None" when empty); section "Strict offline mode" with checkbox `#network-strict-toggle` "Refuse every request that is not already cached" (`setStrictOffline`), a status note, and an impact list (each asset: Available / Disabled while strict / Downloads on first use); Close button.

### 4.14 Offline & Install dialog (status bar; 21887)

Modal "Offline & Install": lane (hosted / standalone) intro, rollback warning when applicable, detail grid, "AI assets" section (Transformers.js WASM runtime cache state, per-model cache rows, inference backend). Detailed contents belong to the PWA/offline part of the spec.

### 4.15 Other always-present surfaces

| Surface | Id | Contents |
|---|---|---|
| Blank workspace card | blank-workspace | "Local workspace ready" / "No document open" / "The workspace is ready. Create a canvas or open an image to begin." / buttons New Canvas (click-001), Open Image (click-002) / hint "Ctrl N New canvas • Drop files anywhere" |
| Welcome overlay | welcome-overlay | Buttons New Canvas (click-150 dismiss + newImage), Open Image (click-151), Open PSD (click-152), Enter Studio (click-153 `dismissWelcome({startDocument:true})`); "Ctrl + K" hint; boot status line; "Start from Template" grid (`#template-grid`); recent files (`#recent-files-area`). Escape dismisses. |
| AI / compute progress dialog | ai-progress | "Loading AI Model...", message, progress bar + %, Cancel (`#compute-cancel` -> `cancelActiveCompute()`) |
| Dropzone overlay | dropzone-overlay | "Drop files here" / "PNG, JPEG, WebP, SVG, GIF, PDF, RAW, PSD, .openshop" |
| Sticky notes layer | sticky-container | Note tool annotations |
| Liquify overlay | liquify-overlay | Tool select Forward Warp (push), Bloat, Pucker, Twirl CW, Twirl CCW; Size 10-200 (60); Pressure 10-100 (50); Density 10-100 (50); Reset (click-195), Cancel (click-196), Apply (click-197). Escape closes. |
| Before/After overlay | ba-overlay | Title "Before / After Compare", Close (click-209), draggable divider (starts 50%), labels Before / After. Escape closes. |
| Screen-reader canvas tree | canvas-a11y-tree | Summary, Tool, Active layer, Selection, Objects, layer list (sr-only); live region `#canvas-a11y-live` |
| Rulers | ruler-h / ruler-v | 20 px canvases; Ctrl+R / View toggle |
| Toasts | toast-container | role=status, polite |

Not present (relevant for Photoshop parity): Channels panel, Paths panel, standalone Adjustments panel, Character/Paragraph panels, Brushes panel, Libraries. "Mini Bridge" has no content.

## 14a. Keyboard shortcuts and command palette

### 14a.1 Global keydown handler (`_initKeyboardShortcuts`, 29491-29727)

Rules: ignored while focus is in INPUT, TEXTAREA or SELECT. Letters and digits are resolved by physical key (`event.code` KeyX / DigitN / NumpadN), so shortcuts follow key position on non-US layouts; displayed labels are remapped through `navigator.keyboard.getLayoutMap()` when available (27584-27655). Cmd counts as Ctrl. Arrow keys are handled before Ctrl combos. Any unmatched Ctrl/Cmd combination is swallowed (returns without action).

Ctrl / Cmd combinations:

| Keys | Action | Function |
|---|---|---|
| Ctrl+Z | Undo | `undo()` |
| Ctrl+Shift+Z | Redo | `redo()` |
| Ctrl+Y | Redo | `redo()` |
| Ctrl+S | Save Project | `saveProject()` |
| Ctrl+A | Select All | `selectAll()` |
| Ctrl+D | Deselect | `deselectAll()` |
| Ctrl+Shift+D | Reselect | `reselectSelection()` |
| Ctrl+C | Copy (pixels when a pixel selection exists, else object; pixel copy also writes PNG to the system clipboard) | `_copySelection()` |
| Ctrl+X | Cut | `_cutSelection()` |
| Ctrl+V | Paste the internal clipboard if one exists; otherwise lets the native paste event through (system clipboard image paste) | `_pasteSelection()` / `initClipboardPaste` |
| Ctrl+J | Duplicate | `_duplicateSelection()` |
| Ctrl+G | Group Layers | `groupLayers()` |
| Ctrl+Shift+G | Ungroup Layers | `ungroupLayers()` |
| Ctrl+R | Toggle Rulers | `toggleRulers()` |
| Ctrl+T | Free Transform | `freeTransform()` |
| Ctrl+0 | Zoom to Fit | `zoomFit()` |
| Ctrl+1 | Zoom 100% | `setZoom(1)` |
| Ctrl++ / Ctrl+= | Zoom In | `zoomIn()` |
| Ctrl+- | Zoom Out | `zoomOut()` |
| Ctrl+K | Command palette (separate listener; works even inside inputs) | `toggleCmdPalette()` |
| Ctrl+E | Merge Down | `mergeDown()` |
| Ctrl+Shift+E | Merge Visible | `mergeVisibleLayers()` |
| Ctrl+N | New document | `newImage()` (often reserved by the browser) |
| Ctrl+Shift+I | Inverse selection | `invertSelection()` |

Non-modifier keys:

| Key | Action |
|---|---|
| Escape | If crop/perspective-crop has a region: cancel crop. Else if a pixel selection or lasso points exist: clear selection. Else deselect objects. Also closes the command palette, context menu and tool flyouts; separate global handlers (33697-33736) first close, in order: topmost modal (its cancel/close button), Liquify, Before/After, filter panels, the welcome overlay. |
| Enter | Crop/perspective crop with a region: apply. Pen with > 1 point: finish path. Inside a modal field (not textarea, no Shift): clicks the modal's confirm/primary button (33685). |
| Delete / Backspace | Delete pixels inside the selection, else delete the active object. |
| Space (hold) | Temporary pan; keyup restores. |
| Tab | Toggle panels/toolbar/options only when the canvas is the focus context and no modal is open; otherwise normal focus traversal. |
| [ | Brush size -2 (min 1) |
| ] | Brush size +2 (max 200) |
| F | Toggle fullscreen (CSS mode) |
| X | Swap FG/BG |
| D | Default colors: FG #000000, BG #ffffff; toast "Colors reset" |
| Arrow keys | Nudge active object 1 px (Shift = 10 px); coalesced history "Move Object" |
| Alt+Arrow | Resize active object by 1 px (Shift = 10); coalesced history "Resize Object" |
| Ctrl+Alt+Up / Down | Move active layer up / down |

Single-letter tool keys (no modifier; Shift ignored; `preventDefault`):

| Key | Tool id set | Matches catalog? |
|---|---|---|
| V | select | yes |
| B | brush | yes |
| E | eraser | yes |
| T | text | yes |
| G | gradient | yes (no cycling to Paint Bucket) |
| C | crop | yes |
| Z | zoom | yes |
| H | pan | yes |
| L | line | no (catalog L = Lasso family) |
| R | rect | no (catalog R = Blur family and Rotate View) |
| O | circle | no (catalog O = Tone family) |
| P | pen | yes |
| M | marquee-rect | yes |
| W | magic-wand | partly (catalog lists Quick Selection first) |
| S | clone | yes |
| I | eyedropper | yes |
| J | healing | yes (Healing Brush, not Spot Healing) |
| N | note | no (catalog N = Pencil; catalog Note is under I) |
| A | arrow | no; `arrow` is refused by setTool, so A only shows an error toast |
| U | rect | yes (Shape family) |
| K | polygon | not in catalog |
| Y | (none) | catalog Y = History family (unimplemented) |

No Shift+letter cycling exists (see 2.0).

Context-specific keys:

| Context | Keys |
|---|---|
| Layers list | Up/Down, Home/End, PageUp/PageDown (5), Enter/Space select, Delete/Backspace delete, Ctrl+Alt+Up/Down reorder |
| History list | Up/Down, Home/End, PageUp/PageDown, Enter/Space restore |
| Panel tabs / bottom tabs | Left/Right (wrap), Home, End |
| Panel splitter | Up/Down 16 px (Shift 48), Home reset |
| Swatch grids | Arrows, Home/End, Enter/Space = FG, Shift+F10 / ContextMenu = BG |
| Menubar | See 3.9 |
| Tool buttons | Enter/Space activate; Escape closes flyouts |
| Range numeric boxes | Enter commits |
| Layer rename input | Enter commits |
| Canvas | Focusable (`tabindex=0`); aria-keyshortcuts ArrowUp/Down/Left/Right |
| Command palette | See 14a.3 |

Declared but not handled: `Alt+P` on the mobile panel toggle (aria-keyshortcuts only).

### 14a.2 Keyboard Shortcuts dialog (View > Keyboard Shortcuts..., `showShortcuts`, 29452-29487)

Modal "Keyboard Shortcuts" (`dl.shortcut-grid`, keys localized to the keyboard layout, Close button). Exact list, in order:

| Key (as listed) | Description |
|---|---|
| Ctrl+K | Command Palette |
| Ctrl+S | Save Project |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+Y | Redo (alt) |
| Ctrl+C | Copy |
| Ctrl+X | Cut |
| Ctrl+V | Paste |
| Ctrl+J | Duplicate Object |
| Delete | Delete Selected |
| Ctrl+T | Free Transform |
| Ctrl+A | Select All |
| Ctrl+D | Deselect |
| Ctrl+Shift+D | Reselect |
| Ctrl+Shift+I | Inverse Selection |
| Ctrl+E | Merge Down |
| Ctrl+Shift+E | Merge Visible |
| Ctrl+G | Group Layers |
| Ctrl+Shift+G | Ungroup Layers |
| Ctrl+R | Toggle Rulers |
| Ctrl+1 | Zoom 100% |
| Ctrl+0 | Zoom Fit |
| Ctrl++ | Zoom In |
| Ctrl+- | Zoom Out |
| Tab | Toggle UI Panels (while working on the canvas) |
| F | Fullscreen |
| Scroll | Zoom |
| Enter | Apply Crop / Finish Pen |
| Escape | Cancel / Deselect |
| Space (hold) | Temporary Pan |
| [ / ] | Brush Size |
| X | Swap Colors |
| D | Default Colors |
| V | Move |
| B | Brush |
| E | Eraser |
| T | Text |
| G | Gradient |
| C | Crop |
| Z | Zoom |
| H | Pan |
| L | Line |
| R / U | Rectangle |
| O | Ellipse |
| P | Pen |
| M | Marquee |
| W | Magic Wand |
| S | Clone Stamp |
| I | Eyedropper |
| J | Healing |
| A | Arrow |
| N | Sticky Note |
| Alt+Click | Set Clone Source |

Missing from the dialog but handled: Ctrl+N (New), K (Polygon), arrow-key nudge, Alt+Arrow resize, Ctrl+Alt+Arrow layer move. Listed but broken: A (Arrow is refused).

### 14a.3 Command palette (PHASE 8, 27583-27931; markup 4043-4048)

| Aspect | Behavior |
|---|---|
| Open | Ctrl+K / Cmd+K (physical K; document-level listener in `initCmdPalette`, active even in inputs); topbar "Search commands" button (click-228 `toggleCmdPalette(this)`); Ctrl+K again closes it. Welcome screen shows a "Ctrl + K" hint. |
| Close | Escape (also closes the context menu), clicking the backdrop (click-194, only when the click target is the overlay itself), or executing a command. Focus returns to the trigger / previously focused element, else to `#command-launch`. |
| Markup | `#cmd-palette` role=dialog aria-modal; `#cmd-input` role=combobox, placeholder "Type a command... (Ctrl+K)", aria-controls `#cmd-results` (role=listbox), aria-activedescendant -> active option `openshop-command-option-<i>`. Input handlers input-023 `filterCommands(value)`, keydown-001 `cmdKeyDown(event)`. |
| Registration | Static array built once by `_getCommands()` (27657-27796): objects `{label, cat, fn, key?, toolState?}`. Plugins add commands at runtime through the sandboxed plugin message `register-command` (requires the `commands` capability; per-plugin cap `_pluginMaxCommands`; label max 120 chars; category defaults to plugin name; optional shortcut is display text only and is not bound); plugin commands are removed when the plugin is disposed (33008-33024, 32924). The palette is separate from the typed command registry used by history, macros and menu state. |
| Matching | Case-insensitive **substring** match on the English label, the translated label (`_t(label)`), or the category name. No fuzzy matching, no ranking (source order), no aliases/keywords. |
| Results | Max 20 shown. Empty query: first 20 commands plus status row "Showing 20 of N commands — keep typing to narrow". No match: "No commands match “<q>”". Each row: label (translated, max 80 chars), shortcut chip `.cmd-shortcut` (layout-localized) when `key` is set, category chip `.cmd-cat`. |
| Keyboard | ArrowDown / ArrowUp move (clamped, no wrap, scrollIntoView), Enter executes; hover sets active; click executes. |
| Recent commands | **None** (no MRU, no pinning, no usage ranking). |
| Enablement | The palette does not check prerequisites; each command applies its own guards (e.g. the "not implemented" toast for refused tools). |

Complete static command list, in source order:

| Cat | Label | Shortcut chip | Function |
|---|---|---|---|
| File | New Document | | newImage() |
| File | Open Image | | openFile() |
| File | Place Image | | placeFile() |
| File | Open PSD | | openPSD() |
| File | Export PNG | | saveFile('png') |
| File | Export JPEG | | saveFile('jpeg') |
| File | Export WebP | | saveFile('webp') |
| File | Export AVIF | | saveFile('avif') |
| File | Export SVG | | saveFile('svg') |
| File | Export PDF | | exportPDF() |
| File | Export PSD | | exportPSD() |
| File | Export OpenRaster | | saveFile('ora') |
| File | Export Settings | | showExportSettings() |
| File | Save Project | | saveProject() |
| File | Open Project | | openProject() |
| File | Collaborative Session | | showCollaborationDialog() (palette-only) |
| File | Recovery Storage | | showRecoveryManager() (palette-only) |
| File | Templates | | showTemplates() |
| Edit | Undo | Ctrl+Z | undo() |
| Edit | Redo | Ctrl+Shift+Z | redo() |
| Edit | Copy | Ctrl+C | copyObj() |
| Edit | Paste | Ctrl+V | pasteObj() |
| Edit | Duplicate | Ctrl+J | duplicateSelected() |
| Edit | Delete | Del | deleteSelected() |
| Select | Select All | Ctrl+A | selectAll() |
| Select | Deselect | Ctrl+D | deselectAll() |
| Select | Reselect | Ctrl+Shift+D | reselectSelection() |
| Select | Inverse Selection | Ctrl+Shift+I | invertSelection() |
| Select | Color Range... | | showColorRange() |
| Select | Grow Selection | | growSelection() |
| Select | Similar | | similarSelection() |
| Select | Transform Selection... | | showTransformSelection() |
| Select | Save Selection... | | showSaveSelectionDialog() |
| Select | Load Selection... | | openSelectionFile() |
| Select | Expand Selection... | | modifySelection('expand') |
| Select | Contract Selection... | | modifySelection('contract') |
| Select | Feather Selection... | | modifySelection('feather') |
| Select | Smooth Selection | | modifySelection('smooth') |
| Edit | Free Transform | Ctrl+T | showFreeTransform() |
| Edit | Preferences | | showPreferences() |
| Image | Resize Canvas | | showResize() |
| Image | Flip Horizontal | | flipH() |
| Image | Flip Vertical | | flipV() |
| Image | Rotate 90 CW | | rotateObj(90) |
| Image | Rotate 90 CCW | | rotateObj(-90) |
| Image | Flatten Image | | flattenImage() |
| Image | Canvas Rotate CW | | canvasRotate(90) |
| Image | Canvas Rotate CCW | | canvasRotate(-90) |
| Image | Add Watermark | | addWatermark() |
| Image | Auto Enhance | | autoEnhance() |
| Image | Image Info | | showImageInfo() |
| Image | Before / After | | showBeforeAfter() |
| Filter | Grayscale | | applyFilterDirect('Grayscale') |
| Filter | Invert | | applyFilterDirect('Invert') |
| Filter | Sepia | | applyFilterDirect('Sepia') |
| Filter | B&W | | applyFilterDirect('BlackWhite') |
| Filter | Posterize | | filterPosterize() |
| Filter | Threshold | | filterThreshold() |
| Filter | Solarize | | filterSolarize() |
| Filter | Edge Detect | | filterEdgeDetect() |
| Filter | Vignette | | filterVignette() |
| Filter | Unsharp Mask | | filterUnsharpMask() |
| Filter | Oil Paint | | filterOilPaint() |
| Filter | Halftone | | filterHalftone() |
| Filter | Duotone | | filterDuotone() |
| Filter | Tilt Shift | | filterTiltShift() |
| Filter | Chromatic Aberration | | filterChromaticAberration() |
| Filter | Generate Noise | | filterNoiseGen() |
| Filter | Gradient Map | | showGradientMap() |
| Filter | Curves | | showCurvesDialog() |
| Filter | Levels | | showLevelsDialog() |
| Filter | Color Balance | | showColorBalanceDialog() |
| Filter | Channel Mixer | | showChannelMixer() |
| Filter | Auto Levels | | autoLevels() |
| Filter | Photo Presets | | showPresets() |
| Filter | Auto Contrast | | autoContrast() |
| Filter | Vibrance | | adjVibrance() |
| Filter | Exposure | | adjExposure() |
| Filter | Shadows/Highlights | | adjShadowsHighlights() |
| Filter | Photo Filter | | adjPhotoFilter() |
| Filter | Selective Color | | adjSelectiveColor() |
| Filter | Replace Color | | adjReplaceColor() |
| Filter | Lens Correction | | adjLensCorrection() |
| Edit | Liquify | | showLiquify() |
| AI | AI Background Remove | | aiRemoveBackground() |
| AI | AI Depth Map | | aiDepthMap() |
| AI | AI Object Detection | | aiObjectDetect() |
| AI | AI Segment Select | | activateSegmentSelect() |
| Edit | Name This State... | | promptNameCurrentState() (palette-only) |
| Edit | Snapshots & Branches... | | showSnapshotManager() |
| Image | Trace to Vector... | | showTraceDialog() |
| Image | Enlarge 2x (AI model) | | aiSuperResolve(2) |
| Image | Enlarge 4x (AI model) | | aiSuperResolve(4) |
| Image | Enlarge 2x (resample) | | aiUpscale(2) |
| Image | Enlarge 4x (resample) | | aiUpscale(4) |
| Edit | Curved Text | | showCurvedText() |
| Edit | Text Direction: Left to Right | | setTextDirection('ltr') |
| Edit | Text Direction: Right to Left | | setTextDirection('rtl') |
| View | Animation Timeline | | toggleTimeline() |
| View | Actions / Macros | | toggleMacroPanel() |
| View | Pixel Grid | | togglePixelGrid() |
| View | Toggle Grid | | toggleGrid() |
| View | Toggle Rulers | | toggleRulers() |
| View | Toggle Snap | | toggleSnap() |
| View | Symmetry: Off | | setSymmetryMode('off') |
| View | Symmetry: Horizontal | | setSymmetryMode('horizontal') |
| View | Symmetry: Vertical | | setSymmetryMode('vertical') |
| View | Symmetry: Both Axes | | setSymmetryMode('both') |
| View | Symmetry: Radial | | setSymmetryMode('radial') |
| View | Fullscreen | F | toggleFullscreen() |
| View | Zoom In | Ctrl++ | zoomIn() |
| View | Zoom Out | Ctrl+- | zoomOut() |
| View | Zoom Fit | Ctrl+0 | zoomFit() |
| View | Keyboard Shortcuts | | showShortcuts() |
| View | Theme: Dark | | setTheme('default') |
| View | Theme: Midnight | | setTheme('midnight') |
| View | Theme: OLED | | setTheme('oled') |
| View | Theme: Light | | setTheme('light') |
| View | Toggle Panels | Tab | togglePanels() |
| Edit | Edit Gradient Stops | | editGradientStops() |
| Help | Network Activity | | showNetworkActivity() |
| Help | Toggle Strict Offline Mode | | setStrictOffline(!strict) (palette-only) |
| Help | Export Diagnostics | | exportDiagnostics() (also status-bar badge) |
| Help | Clear Diagnostics | | clearDiagnostics() (palette-only) |
| Layer | Add Layer | | addLayer() |
| Layer | Group Layers | Ctrl+G | groupLayers() |
| Layer | Ungroup Layers | Ctrl+Shift+G | ungroupLayers() |
| Layer | Delete Layer | | deleteLayer() |
| Layer | Duplicate Layer | | duplicateLayer() |
| Layer | Merge Down | | mergeDown() |
| Tool | 34 entries: Tool: Select, Tool: Marquee rect, Tool: Marquee ellipse, Tool: Magic wand, Tool: Lasso, Tool: Ai segment, Tool: Brush, Tool: Eraser, Tool: Pencil, Tool: Spray, Tool: Clone, Tool: Healing, Tool: Dodge, Tool: Burn, Tool: Sponge, Tool: Smudge, Tool: Line, Tool: Rect, Tool: Circle, Tool: Triangle, Tool: Arrow, Tool: Polygon, Tool: Star, Tool: Pen, Tool: Text, Tool: Gradient, Tool: Pattern, Tool: Fill, Tool: Eyedropper, Tool: Measure, Tool: Note, Tool: Crop, Tool: Pan, Tool: Zoom (label = "Tool: " + capitalized id, dashes as spaces) | | setTool(id). Triangle, Arrow, Star, Pattern are refused at runtime. Newer catalog tools (polygonal/magnetic lasso, quick selection, perspective crop, spot healing, path/direct selection, rounded rectangle, custom shape) are NOT in the palette. |

Palette-only features (no menu item): Collaborative Session, Recovery Storage, Name This State..., Toggle Strict Offline Mode, Export/Clear Diagnostics, Text Direction, Edit Gradient Stops, Toggle Panels, Layer-category commands (otherwise only via Layers panel buttons and shortcuts).

Typed command registry (separate from the palette; used by history, macros, menu prerequisite state and plugins; 18222-18573): ids `layer.add, layer.group, layer.ungroup, layer.adjustment.add, layer.adjustment.update, layer.adjustment.apply, layer.delete, layer.rename, layer.opacity.set, layer.blend.set, layer.visibility.set, layer.lock.set, layer.move, object.transform.set, object.rotate, object.flip, filter.apply, image.adjust, canvas.resize, canvas.flatten, canvas.crop, canvas.perspective-crop, canvas.rotate, canvas.flip, frame.add, frame.duplicate, frame.remove, frame.select, macro.sequence`, plus the 60 tool/mode ids from the catalog; each definition has `validate(args)` and `execute(args)`. Menu rows are projected as virtual ids `menu.click-NNN` for enable/disable state only.


---

## 5. Adjustments and filters

Source: `Openshop/index.html` (OpenShop v0.31.0, Fabric.js 7.4.0). Line numbers refer to that file. "Range" = HTML `<input type=range>` min..max; step is the browser default of 1 unless stated. "Internal" = the value after the UI-to-engine conversion.

### 5.0 Where things live (menu map)

The Image menu does NOT hold the adjustments. Almost everything is under **Filter**. Action ids are `data-os-click="click-NNN"` mapped in `OS_EVENT_HANDLERS` (4131+).

| Menu path | Item | Action id | Handler (line) |
|---|---|---|---|
| Edit > Transform | Liquify... | click-024 | `OS.showLiquify()` (30421) |
| Image | Add Watermark... | click-049 | `OS.addWatermark()` (25372) |
| Image | Auto Enhance | click-050 | `OS.autoEnhance()` (24064) |
| Image | Before / After Compare | click-052 | `OS.showBeforeAfter()` (27471) |
| Filter > Blur | Blur... | click-053 | `showFilterDialog('Blur')` |
| Filter > Blur | Sharpen | click-054 | `applyFilterDirect('Sharpen')` |
| Filter > Blur | Unsharp Mask... | click-055 | `filterUnsharpMask()` (27088) |
| Filter > Blur | Tilt Shift... | click-056 | `filterTiltShift()` (27161) |
| Filter > Distort | Pixelate... | click-057 | `showFilterDialog('Pixelate')` |
| Filter > Distort | Chromatic Aberration... | click-058 | `filterChromaticAberration()` (27176) |
| Filter > Distort | Lens Correction... | click-059 | `adjLensCorrection()` (30378) |
| Filter > Noise | Add Noise... | click-060 | `showFilterDialog('Noise')` |
| Filter > Noise | Generate Noise... | click-061 | `filterNoiseGen()` (27190) |
| Filter > Stylize | Emboss | click-062 | `applyFilterDirect('Emboss')` |
| Filter > Stylize | Edge Detect | click-063 | `filterEdgeDetect()` (27065) |
| Filter > Stylize | Solarize | click-064 | `filterSolarize()` (27058) |
| Filter > Stylize | Oil Paint... | click-065 | `filterOilPaint()` (27103) |
| Filter > Stylize | Halftone... | click-066 | `filterHalftone()` (27118) |
| Filter > Stylize | Duotone... | click-067 | `filterDuotone()` (27145) |
| Filter > Stylize | Vignette... | click-068 | `filterVignette()` (27073) |
| Filter > Stylize | Posterize... | click-069 | `filterPosterize()` (27029) |
| Filter > Stylize | Threshold... | click-070 | `filterThreshold()` (27044) |
| Filter > Adjustments > Tone | Brightness... | click-071 | `showFilterDialog('Brightness')` |
| Filter > Adjustments > Tone | Contrast... | click-072 | `showFilterDialog('Contrast')` |
| Filter > Adjustments > Tone | Gamma... | click-073 | `showFilterDialog('Gamma')` |
| Filter > Adjustments > Tone | Exposure... | click-074 | `adjExposure()` (30262) |
| Filter > Adjustments > Tone | Shadows / Highlights... | click-075 | `adjShadowsHighlights()` (30281) |
| Filter > Adjustments > Tone | Curves... | click-076 | `showCurvesDialog()` (23740) |
| Filter > Adjustments > Tone | Levels... | click-077 | `showLevelsDialog()` (23953) |
| Filter > Adjustments > Color | Saturation... | click-078 | `showFilterDialog('Saturation')` |
| Filter > Adjustments > Color | Hue Rotation... | click-079 | `showFilterDialog('HueRotation')` |
| Filter > Adjustments > Color | Vibrance... | click-080 | `adjVibrance()` (30245) |
| Filter > Adjustments > Color | Color Balance... | click-081 | `showColorBalanceDialog()` (24001) |
| Filter > Adjustments > Color | Channel Mixer... | click-082 | `showChannelMixer()` (25313) |
| Filter > Adjustments > Color | Gradient Map... | click-083 | `showGradientMap()` (27222) |
| Filter > Adjustments > Color | Photo Filter... | click-084 | `adjPhotoFilter()` (30299) |
| Filter > Adjustments > Color | Selective Color... | click-085 | `adjSelectiveColor()` (30321) |
| Filter > Adjustments > Color | Replace Color... | click-086 | `adjReplaceColor()` (30352) |
| Filter > Color Mode | Grayscale | click-087 | `applyFilterDirect('Grayscale')` |
| Filter > Color Mode | Invert | click-088 | `applyFilterDirect('Invert')` |
| Filter > Color Mode | Sepia | click-089 | `applyFilterDirect('Sepia')` |
| Filter > Color Mode | Black & White | click-090 | `applyFilterDirect('BlackWhite')` |
| Filter | Auto Levels | click-091 | `autoLevels()` (24050) |
| Filter | Auto Contrast | click-092 | `autoContrast()` (24057) |
| Filter | Photo Presets... | click-093 | `showPresets()` (32451) |
| Filter | Remove Background (AI) | click-094 | `aiRemoveBackground()` (AI section; out of scope here) |
| Filter | Clear All Filters | click-095 | `clearFilters()` (18008) |
| Properties tab (panel) | Adjustments sliders + Apply / Reset | input-019, click-162 / click-163 | `liveAdjust` (17715), `applyAdjustments` (17738), `resetAdjustments` (17755) |
| Properties tab (panel) | Non-destructive layers: Type + Add Layer / Apply Stack | `#add-adjustment-layer`, `#apply-adjustment-layers` (markup 3838-3844, wired 6755-6759) | `addAdjustmentLayer` (14337), `applyAdjustmentLayers` (14398) |
| Properties tab (panel) | Layer Styles (Drop Shadow / Outer Glow / Stroke) | input-021, change-031, click-166 / click-167 | `previewLayerStyle` (27253) |
| Right-click on an image object | "Last Filter: <name>", "Clear Filters" | context menu 28048-28053 | `_reapplyLastFilter` (19742), `clearFilters` |
| Command palette (Ctrl+K) | ~32 filter/adjustment commands (category "Filter", plus "Auto Enhance" under Image, "Liquify" under Edit) | list at ~27709-27744 | same handlers as menus |

**Keyboard shortcuts:** none. No adjustment or filter has a shortcut (no Ctrl+L / Ctrl+M / Ctrl+U / Ctrl+I / Ctrl+B / Shift+Ctrl+U, no Ctrl+F "reapply last filter", no Ctrl+Alt+F). The shortcut table (`showShortcuts` 29452) and the key handler (29489+) contain none. The rewrite should add the Photoshop-standard ones.

**Global constraints shared by every filter/adjustment below**
- Target is always `canvas.getActiveObject()` and it must be `type === 'image'`; otherwise toast "Select an image first". Text, shapes, paths, groups and whole layers cannot be filtered.
- Selections are ignored: no filter or adjustment reads `_selectionMask`; the whole image object is processed. (Missing feature: selection-limited filtering with feathered blend.)
- No "Fade <filter>", no blend mode/opacity on apply, no smart filters, no filter gallery, no per-filter saved settings, no LUT / `.cube` / 3D LUT / Hald import (grep finds none).
- Pixel results are 8-bit sRGB RGBA only; alpha is preserved by every op except where noted.

---

### 5.1 Two pixel pipelines (important for the rewrite)

OpenShop has two unrelated ways a filter lands on pixels:

| Pipeline | Used by | Storage | Destructive? |
|---|---|---|---|
| **A. Fabric filter stack** (`image.filters[]`, Fabric 7.4.0 `fabric.filters.*`) | Filter dialogs Blur, Brightness, Contrast, Gamma, Saturation, Hue Rotation, Pixelate, Add Noise; Properties-panel Adjustments | Filters serialized with the Fabric object in the project; rendered by Fabric's default filter backend (WebGL when available, else Canvas2D; OpenShop never sets `textureSize` / `enableGLFiltering`) | Semi non-destructive: the original element is retained and the stack can be wiped with **Clear All Filters**. No UI to list, reorder, toggle or edit individual stack entries. Baked into pixels on ORA/PSD export (warning "filtered image object(s) will be baked", 11368, 20596). |
| **B. ImageData round-trip** (`_getActiveImageData` 26984 -> op -> `_commitImageData` 27013 -> `_replaceActiveImage` 24071) | Every other filter/adjustment (Curves, Channel Mixer, Auto*, Posterize, Threshold, ... Liquify, Presets) | A new `FabricImage` built from a PNG data URL replaces the object | Destructive. Transform, opacity, blend (`globalCompositeOperation`), shadow, visibility, `clipPath`, layer masks, PSD metadata and object id are carried over. Refuses Smart Objects ("Edit the Smart Object source instead..."). Commit is guarded by `{generation, revision, targetId}`; a stale result is discarded with toast "Filter result discarded because the document or target layer changed". Any Fabric filter stack on the object is baked in (source is `getElement()`). |

Levels and Color Balance are a third variant: they render on the main thread into a canvas and `setElement()` it onto the same object (`_swapImageElement` 23869; no PNG round-trip, no Smart Object guard), then `saveHistory`.

---

### 5.2 Adjustments (tonal and color)

"Adj. layer" = also available as a non-destructive adjustment layer (only Levels, Curves, HSL exist as layer types; see 5.4).

| Label (menu) | Function | Parameters (UI range, default, internal) | Algorithm | Engine | Live preview | Adj. layer |
|---|---|---|---|---|---|---|
| Brightness... | `showFilterDialog('Brightness')` 17761 | Brightness -100..100, def 0; internal `v/250` (-0.4..0.4) | `fabric.filters.Brightness` (additive in 0..1 space) | Pipeline A (Fabric) | Yes (50 ms debounce) | No |
| Contrast... | same | Contrast -100..100, def 0; internal `v/250` | `fabric.filters.Contrast` | A | Yes | No |
| Gamma... | same | Red / Green / Blue each 1..300, def 100; internal `v/100` (0.01..3.00) per channel | `fabric.filters.Gamma({gamma:[r,g,b]})` | A | Yes | No (Levels layer has one gamma) |
| Saturation... | same | Saturation -100..100, def 0; internal `v/100` | `fabric.filters.Saturation` | A | Yes | No (HSL layer covers it) |
| Hue Rotation... | same | Rotation -180..180, def 0; internal `v/180` (Fabric units, 1 = 180 deg) | `fabric.filters.HueRotation` | A | Yes | No (HSL layer covers it) |
| Exposure... | `adjExposure` 30262 / `_doExposure` | Exposure -300..300 def 0, shown `v/100` as "0.0EV" (-3.0..+3.0 EV); Offset -50..50 def 0 (0..255 units); Gamma 10..400 def 100, shown `v/100` (0.10..4.00) | `v = (v*2^ev + offset/255)^(1/gamma)` per channel (worker `exposure` 26613) | JS worker | No | No |
| Shadows / Highlights... | `adjShadowsHighlights` 30281 | Shadows 0..100% def 50; Highlights 0..100% def 0; internal /100 | Rec.601 luma L; if L<0.5: `v += (255-v)*sh*(1-2L)*0.5`; if L>0.5: `v -= v*hl*(2L-1)*0.5`; no radius / tonal width / local contrast (worker 26626) | JS worker | No | No |
| Curves... | `showCurvesDialog` 23740 | Channel buttons RGB / R / G / B; 256x256 graph; default points RGB `[[0,0],[64,64],[128,128],[192,192],[255,255]]`, R/G/B `[[0,0],[255,255]]`; mousedown within 20 px grabs a point, else adds one; drag moves it; preset buttons Reset (`linear`), Brighten `[[0,0],[64,96],[192,230],[255,255]]`, Darken `[[0,0],[64,32],[192,160],[255,255]]`, S-Curve (`contrast`) `[[0,0],[64,32],[192,224],[255,255]]`, Invert `[[0,255],[255,0]]` (presets affect the current channel only) | Piecewise LINEAR interpolation LUT (`_buildCurveLUT` 23810, not a spline); output = `chan[master[v]]` (worker `curves` 26646) | JS worker | **No** (graph only; image changes on Apply) | Yes (simplified, see 5.4) |
| Levels... | `showLevelsDialog` 23953 | Shadow 0..255 def 0; Midtone 10..400 def 100, shown `/100` "1.00"; Highlight 0..255 def 255; Out Black 0..255 def 0; Out White 0..255 def 255 | LUT: `n = clamp((i-shadow)/(high-shadow)); out = oBlack + n^(1/mid)*(oWhite-oBlack)` on R,G,B identically (`_levelsLUT` 23901) | Main thread canvas | Yes, 60 ms debounce on a <= 1.2 MP proxy (`_previewProxyLimit` 1,200,000), full-res on Apply | Yes (black/white/gamma only) |
| Color Balance... | `showColorBalanceDialog` 24001 | Shadows: Cyan-Red, Mag-Green, Yel-Blue each -100..100 def 0; Midtones: same three. **No Highlights group, no Preserve Luminosity** | lum = mean(RGB)/255; shadowW = max(0, 1-3*lum); midW = 1-2*abs(lum-0.5); `c += s*shadowW*0.8 + m*midW*0.8` (`_renderColorBalance` 23934) | Main thread canvas | Yes, same proxy scheme as Levels | No |
| Vibrance... | `adjVibrance` 30245 | Vibrance -100..100 def 30; internal /100 | sat = (max-min)/max; boost = amt*(1-sat)*(sat<0.5 ? 1 : 0.5); `c += (c-avg)*boost` (worker 26603) | JS worker | No | No |
| Channel Mixer... | `showChannelMixer` 25313 | 3x3 matrix: Red/Green/Blue Output x R/G/B source, each -200..200%, defaults identity (100 on diagonal, 0 elsewhere); no Constant, no Monochrome, no presets | `out = M * [r,g,b]` (worker `channelMixer` 26655) | JS worker | No | No |
| Gradient Map... | `showGradientMap` 27222 | Shadow color def #000000; Midtone def #6c8cff; Highlight def #ffffff (exactly 3 fixed stops at 0 / 0.5 / 1); swatch strip updates on change (change-037) | Rec.601 luma -> linear interpolation between the 3 stops (`_applyGradientMap` 27236) | Main thread | Gradient strip only, not the image | No |
| Photo Filter... | `adjPhotoFilter` 30299 | Filter select: Warming (85) [236,138,0] (default), Cooling (80) [0,109,204], Sunset [255,90,20], Underwater [0,180,200], Sepia [162,138,101], Custom Color; Color picker def #ec8a00 (used only for Custom); Density 5..100% def 30. **No Preserve Luminosity** | `c += (color_c - c)*density` (straight lerp toward the color; worker 26639) | JS worker | No | No |
| Selective Color... | `adjSelectiveColor` 30321 | Target: Reds (330-30 deg), Yellows (30-90), Greens (90-150), Cyans (150-210), Blues (210-270), Magentas (270-330); Cyan, Magenta, Yellow, Black each -100..100 def 0. One target per Apply; no Whites / Neutrals / Blacks; no Relative / Absolute | For pixels whose hue is in range and chroma delta >= 0.05: `R -= R*(c+k)*delta`, `G -= G*(m+k)*delta`, `B -= B*(y+k)*delta` (hard hue boundaries, no feathering) (30326) | Main thread | No | No |
| Replace Color... | `adjReplaceColor` 30352 | Source color def #ff0000; Target color def #0000ff; Fuzziness 5..150 def 40 (Euclidean RGB distance). No eyedropper, no HSL sliders, no mask preview | if dist <= fuzz: blend = 1-dist/fuzz; `c += (tgt_c - src_c)*blend` (30357) | Main thread | No | No |
| Grayscale | `applyFilterDirect('Grayscale')` 17979 | none | Rec.601 luma 0.299/0.587/0.114 | Accelerated ladder (5.7) | n/a | No |
| Invert | `applyFilterDirect('Invert')` | none | 255 - c | Ladder (the only op eligible for Photon) | n/a | No |
| Sepia | `applyFilterDirect('Sepia')` | none | standard sepia matrix (0.393/0.769/0.189; 0.349/0.686/0.168; 0.272/0.534/0.131) | Ladder (offscreen / JS) | n/a | No |
| Black & White | `applyFilterDirect('BlackWhite')` | none (fixed threshold 128) | `{op:'threshold', thr:128}`, weighted luma | Ladder (GPU eligible) | n/a | No |
| Properties > Adjustments panel | `liveAdjust` 17715 / `applyAdjustments` 17738 / `resetAdjustments` 17755 | Brightness -100..100 def 0 (`/250`); Contrast -100..100 def 0 (`/250`); Saturation -100..100 def 0 (`/100`); Hue -180..180 def 0 (`/180`); Blur 0..100 def 0 (`/250`); numeric labels beside sliders | Builds a Fabric stack [Brightness, Contrast, Saturation, HueRotation, Blur] (non-zero ones only); records command `image.adjust` | A | Yes (80 ms debounce, capped proxy) | No |

Notes / defects worth not copying:
- Properties-panel **Apply replaces the object's whole Fabric filter stack** (`active.filters = nextFilters`, 17656), silently discarding filters added from the Filter dialogs; **Reset** applies an empty stack, i.e. clears every filter. The panel sliders never re-read the object's current state.
- Levels/Color Balance read `getElement()` (already filtered) and `_swapImageElement` then calls `applyFilters()` again, so an existing Fabric stack is likely applied twice.
- Curves: no point deletion, no numeric Input/Output fields, no histogram underlay, no eyedroppers, no Auto button; the graph code assumes the canvas is displayed at exactly 256 CSS px.
- Levels: composite only (no per-channel), no histogram, no eyedroppers, no Auto / Options.
- Missing compared with Photoshop: Hue/Saturation dialog (per-range, Colorize, Lightness), Black & White mixer dialog, Desaturate, Equalize, Match Color, Color Lookup, HDR Toning, combined Brightness/Contrast dialog.

---

### 5.3 Filters (non-adjustment)

| Menu path / label | Function | Parameters (UI range, default -> internal) | Algorithm (one line) | Engine | Live preview |
|---|---|---|---|---|---|
| Filter > Blur > Blur... | `showFilterDialog('Blur')` | Amount 0..100 def 0 -> `/250` | `fabric.filters.Blur`; the offscreen preview maps it to a box blur of radius `round(blur*8)` (1..3), so preview can differ from Apply | A (Fabric) | Yes |
| Filter > Blur > Sharpen | `applyFilterDirect('Sharpen')` | none | 3x3 kernel [0,-1,0,-1,5,-1,0,-1,0]; 1 px border untouched | Ladder (GPU eligible) | n/a |
| Filter > Blur > Unsharp Mask... | `filterUnsharpMask` 27088 | Amount 10..300% def 100 -> 0.1..3.0; Radius 1..10 px def 2. **No Threshold** | box blur of radius r (interior only; an r-px border is never blurred), `c += amount*(c - blur)` (worker 26515) | JS worker | No |
| Filter > Blur > Tilt Shift... | `filterTiltShift` 27161 | Focus Y 0..100% def 50; Focus Width 5..60% def 20; Blur 1..10 px def 4 | horizontal in-focus band; outside it, per-row box blur radius = `round(blurR*(dist - focusW/2)/(0.5 - focusW/2))` (worker 26564) | JS worker | No |
| Filter > Distort > Pixelate... | `showFilterDialog('Pixelate')` | Block Size 2..40 def 4 | `fabric.filters.Pixelate` (worker `pixelate` 26246, samples the block's top-left pixel, used for offscreen preview) | A | Yes |
| Filter > Distort > Chromatic Aberration... | `filterChromaticAberration` 27176 | Offset 1..15 px def 4 | R sampled from x+off, B from x-off, G unchanged (horizontal only; worker 26586) | JS worker | No |
| Filter > Distort > Lens Correction... | `adjLensCorrection` 30378 | Barrel/Pin -100..100 def 0 -> `/1000` (-0.1..0.1); Vignette 0..100% def 0; CA Fix 0..10 px def 0 | radial `src = c + d*(1 + k*r^2)`, nearest-neighbor, out-of-range -> black; CA fix re-samples red only with `k + k*0.002*ca`; vignette `1 - vig*r^2` darken only (30383) | Main thread | No |
| Filter > Noise > Add Noise... | `showFilterDialog('Noise')` | Noise 0..500 def 0 | `fabric.filters.Noise` (not convertible to an offscreen spec, so preview is always main-thread Fabric) | A | Yes |
| Filter > Noise > Generate Noise... | `filterNoiseGen` 27190 | Type: Uniform (def) / Gaussian / Salt & Pepper; Amount 1..100% def 30; Monochrome checkbox def checked | strength = amt*128; uniform `(rand-0.5)*2*s`; "gaussian" = `(r1+r2+r3-1.5)*s`; salt & pepper sets a pixel to 0/255 with probability amt*0.1; `Math.random`, not seedable (27195) | Main thread | No |
| Filter > Stylize > Emboss | `applyFilterDirect('Emboss')` | none | 3x3 kernel [-2,-1,0,-1,1,1,0,1,2] | Ladder (offscreen / JS) | n/a |
| Filter > Stylize > Edge Detect | `filterEdgeDetect` 27065 | none | Sobel magnitude per channel, alpha kept, 1 px border unchanged (worker 26489) | `_runFilterWithPhoton` ladder (not GPU/Photon eligible -> offscreen / JS) | n/a |
| Filter > Stylize > Solarize | `filterSolarize` 27058 | none (fixed at 128) | if c > 128: c = 255 - c (26598) | JS worker | n/a |
| Filter > Stylize > Oil Paint... | `filterOilPaint` 27103 | Radius 1..6 def 3; Levels 4..32 def 16 | intensity-histogram mode filter: bin the neighborhood by mean intensity, output the average color of the most populous bin (a `radius`-px border is untouched; 26534) | JS worker | No |
| Filter > Stylize > Halftone... | `filterHalftone` 27118 | Dot Size 2..16 px def 6 | grid of black circles on white, radius = `size*(1-avg/255)/2`; output is monochrome and opaque (destroys color and alpha); no angle / shape / CMYK screens (27123) | Main thread | No |
| Filter > Stylize > Duotone... | `filterDuotone` 27145 | Shadow color def #1a1a2e; Highlight color def #e94560 | Rec.601 luma -> lerp(shadow, highlight) (26554) | JS worker | No |
| Filter > Stylize > Vignette... | `filterVignette` 27073 | Amount 10..100% def 50 -> 0.1..1; Softness 10..100% def 60 -> 0.1..1 | `factor = 1 - amt*(max(0, r-(1-soft))/soft)^2`, r normalized to the corner distance; darken only, no color / roundness / midpoint (26502) | JS worker | No |
| Filter > Stylize > Posterize... | `filterPosterize` 27029 | Levels 2..32 def 6 | `round(round(c/step)*step)`, step = 255/(levels-1) (26474) | JS worker | No |
| Filter > Stylize > Threshold... | `filterThreshold` 27044 | Level 0..255 def 128 | `299R + 587G + 114B >= thr*1000 ? 255 : 0` (26481) | `_runFilterWithPhoton` ladder (GPU eligible) | No |
| Filter > Clear All Filters | `clearFilters` 18008 | none | sets `filters = []` on the active image (Pipeline A only; cannot remove destructive results) | Fabric | n/a |
| Image > Add Watermark... | `addWatermark` 25372 / `_applyWatermark` | Text def "WATERMARK"; Size 12..200 px def 48; Opacity 5..100% def 30; Color def #ffffff; Rotation -90..90 deg def -30; Tiled / Repeat checkbox def off (spacing = size*4) | adds `fabric.IText` objects (font DM Sans) to the active layer, centered or tiled; not a pixel filter | Main thread | No |

Worker-only ops with no menu entry (called by tools): `teleaInpaint` (26308; Spot Healing; coverage mask + radius 1..16, caller passes `max(2, healingSize/3)`), `refineEdge` (26411; Select > Modify > Refine Edge; radius 1..32 def 4), and `brightness` / `contrast` / `saturation` / `hueRotation` / `blur` / `pixelate` / `gamma` (26193-26257; used by the offscreen preview pipeline; brightness/contrast/blur are GPU-eligible but no UI path sends them through the GPU ladder).

Missing vs. the Photoshop filter set (no code present): Gaussian / Motion / Radial / Lens / Surface / Smart / Box Blur as named filters, High Pass, Median, Reduce Noise, Despeckle, Dust & Scratches, Twirl / Wave / Ripple / Spherize / Polar Coordinates / Pinch / Displace, Find Edges, Glowing Edges, Wind, Extrude, Tiles, Mosaic, Crystallize, Clouds, Lighting Effects, Fibers, Camera Raw filter, Smart Sharpen, Shake Reduction, Offset, Maximum / Minimum, Custom kernel.

---

### 5.4 Non-destructive adjustment layers

Defined in `_normalizeAdjustment` (8228), rendered by `_applyAdjustmentPixels` (8275) and `_rebuildAdjustmentLayers` (8325). UI: Properties tab "Non-destructive layers" (3838-3844): Type select (Levels / Curves / HSL) + **Add Layer** + **Apply Stack**. Double-clicking an adjustment layer's name opens `showAdjustmentLayerDialog` (8374, wired 14860-14861); Add Layer also opens it immediately.

Layer record (14337): `{id, name, visible:true, locked:false, opacity:100, blend:'source-over', kind:'adjustment', parentId, adjustment:{type, version:1, params, cacheKey:'<type>:v1:<json>'}, objects:[]}`. Inserted above the active layer (or after the last descendant of an active group).

| Type | Params (stored clamp, default) | Edit dialog controls | Math |
|---|---|---|---|
| `levels` | black 0..254 def 0; white black+1..255 def 255; gamma 0.1..4 def 1 | Black 0..254, White 1..255 (min auto-tracks black+1), Gamma 0.1..4 step 0.1 | `((v-black)/(white-black))^(1/gamma)*255` per RGB channel (no output levels) |
| `curves` | points: up to 16 `[x,y]` pairs in 0..255, sorted, deduped by x, endpoints forced at x=0 and x=255; def `[[0,0],[255,255]]` | Only a single **Midpoint** slider -100..100 (shifts points 64/128/192 together; writes 5 points). The full Curves graph is NOT available for layers | piecewise-linear LUT (`_adjustmentLUT`), master only, no per-channel |
| `hsl` | hue -180..180 def 0; saturation -100..100 def 0; lightness -100..100 def 0 | Hue, Saturation, Lightness sliders | RGB->HSL, `h += hue/360`, `s *= 1 + sat/100`, `l += light/200`, back to RGB |

Behavior:
- Scope: affects **every `image` object in every layer below it** (layer index 0 is the bottom; condition `index > layerIndex`). Not clipped to the layer directly beneath; no clipping option; text, shapes and vector paths are never adjusted.
- Layer opacity (0..100) blends the result with the pre-adjustment pixels; visibility toggles it; layer **blend mode is ignored**; no mask on adjustment layers. The dialog's Cancel closes on outside click / Escape; "Update Layer" commits.
- Implementation is a "re-bake": the first time an image is covered, its clean pixels are stored as a PNG data URL in `_openShopAdjustmentBaseSrc`; each rebuild decodes that, applies the visible stack in order on the main thread, swaps the element, and records the covering layer ids in `_openShopAdjustmentLayers`. Rebuild triggers: add, update, visibility toggle (14585), opacity change (14599), reorder (14101), delete (14426), duplicate, project load (8932). No per-layer cache, no worker, no GPU; a full-resolution main-thread loop every time.
- **Apply Stack** (`applyAdjustmentLayers` 14398) bakes all adjustment layers into pixels and deletes them (history "Apply Adjustment Stack"). **Merge Down** on an adjustment layer calls the same (14552).
- Replayable commands: `layer.adjustment.add`, `layer.adjustment.update`, `layer.adjustment.apply` (18287-18313).
- Export: ORA rasterizes adjustment layers with loss code `ora.adjustment-rasterized` (20597; warning at 11369). PSD import does not create adjustment layers (no adjustment mapping found).

Missing: adjustment-layer types for Brightness/Contrast, Exposure, Vibrance, Hue/Saturation per range, Color Balance, Black & White, Photo Filter, Channel Mixer, Color Lookup, Invert, Posterize, Threshold, Gradient Map, Selective Color, Solid/Gradient/Pattern fill; per-channel Curves/Levels; full Curves editor for layers; clipping to one layer; masks and blend modes on adjustment layers.

---

### 5.5 Auto operations

| Label | Location | Function | Algorithm | Engine |
|---|---|---|---|---|
| Auto Levels | Filter menu | `autoLevels` 24050 -> worker 26664 | Per-channel min/max stretch to 0..255 (no clipping percentile, so one outlier pixel defeats it; per-channel stretch also shifts color casts) | JS worker |
| Auto Contrast | Filter menu | `autoContrast` 24057 -> worker 26678 | Rec.601 luma min/max; same linear stretch applied to all three channels (no clip %) | JS worker |
| Auto Enhance | Image menu | `autoEnhance` 24064 -> worker 26689 | autoLevels, then saturation +15% around the channel mean, contrast x1.08 around 128, then a 30% blend of a 4-neighbour sharpen | JS worker |

No Auto Color/Tone options dialog, no clip percentages, no "snap neutral midtones", no AI-based auto. None has parameters or a preview.

---

### 5.6 Presets system

`showPresets` 32451 ("Photo Presets" modal from Filter > Photo Presets...). One button per preset, then **Save Current**, **Import JSON**, **Export All**, Close.

Built-ins (`_builtinPresets` 32441):

| Name | brightness | contrast | saturation | hue | vibrance |
|---|---|---|---|---|---|
| Warm Glow | 10 | 8 | 15 | 10 | 20 |
| Cool Tone | 5 | 10 | -5 | -15 | 10 |
| Vintage | -5 | 15 | -30 | 8 | -10 |
| Vivid | 5 | 20 | 40 | 0 | 35 |
| Dramatic | -10 | 35 | 10 | 0 | 15 |
| Pastel | 20 | -15 | -20 | 0 | -5 |
| B&W High Contrast | 0 | 30 | -100 | 0 | 0 |
| Golden Hour | 10 | 5 | 20 | 15 | 25 |

- Apply (`applyPreset` 32497; main thread; destructive via `_replaceActiveImage`; history "Preset: <name>"): per pixel `c += brightness` (0..255 units); `c = (c-128)*(1 + contrast/100) + 128`; `c = l + (c-l)*(1 + sat/100)` with l = channel mean; if vibrance: `c = l + (c-l)*(1 + vib/100*(1-chroma))`. **`hue` is stored but never applied.**
- **Save Current is broken**: `_doSavePreset` stores a preset with all-zero adjustments regardless of the current state.
- Storage: `localStorage['os_presets']`; also part of the Settings bundle export/import (25706, 25775). Limits: max 200 presets (`_importLimits.maxPresets`), name <= 80 chars, each value clamped -300..300 (`_safeAdjustmentMap` 20706), allowed keys brightness/contrast/saturation/hue/vibrance; JSON import must pass `_assertJsonFileBudget` (maxJsonBytes 10 MB) and accepts one object or an array. Export writes `openshop-presets.json` (built-ins included).
- Missing: delete / rename / reorder custom presets, thumbnails or hover preview, per-filter/per-dialog presets (Curves has only five hard-coded buttons), LUT / .cube / .3dl / ICC-based looks, preset intensity slider.

---

### 5.7 Filter execution architecture

**Worker construction** (`_getFilterWorker` 25990): one source template (a JS string, 25996-26766) is turned into a Blob URL Worker through the Trusted Types policy (`OPENSHOP_TRUSTED_SCRIPT_URL`); the URL is revoked after construction. Three singletons keyed by backend:

| Key | Backend tag | Contents |
|---|---|---|
| `_filterWorker` | `worker` | JS `filterOps` (26192); `backend:'gpu'` jobs also run here (`runAcceleratedFilter` 26185) |
| `_rendererWorker` | `offscreen` | same source; holds a transferred `OffscreenCanvas` and runs `runOffscreenPipeline` (26709) through a 2D context (`willReadFrequently`) |
| `_photonFilterWorker` | `photon` | same source with the Photon JS module prepended (`_prepareClassicPhotonSource` 5383); WASM bytes passed in the first message (`runPhotonFilter` 26017) |

**Message protocol**
- Request: `{op, backend:'worker'|'gpu'|'offscreen'|'photon', data:ArrayBuffer (copy of the ImageData buffer, transferred), width, height, params, runtime:{wasmBytes}|null, _jobId}` (26827). The offscreen backend also accepts `op:'pipeline'` with `params.filters = [{op, params}, ...]` to chain several ops in one pass.
- Response: `{_jobId, data:ArrayBuffer (transferred), width, height, backend:'worker'|'offscreen-worker'|'webgpu'|'webgl2'|'photon', durationMs, error?}` (onmessage 26727).
- Renderer probe: `{_rendererProbeId, canvas:OffscreenCanvas}` -> `{_rendererProbeId, supported, error?}`, 3 s timeout (`_initializeRenderer` 6842).
- Error semantics: for `photon` / `gpu` / `offscreen` an `error` field rejects (so the ladder can fall back); for plain `worker` it only `console.warn`s and resolves with the returned, possibly unmodified buffer. A worker `error` event rejects every pending job of that worker.
- No progress messages (the overlay bar stays at 0%), no tiling or chunking: the whole image is copied (`buffer.slice(0)`) and processed in one message. No SharedArrayBuffer, no multi-worker parallelism.

**Jobs and cancellation** (6925-7010; `_runFilterJob` 26779): each run is a compute job `{id, kind:'Filter: <op>', group:'image-processing', generation, revision, targetId, AbortController, worker}`. Starting a new job in the same group cancels the previous one ("A newer ... operation replaced this one"). Cancel = `worker.terminate()`, null the singleton (recreated lazily), reject with `AbortError`. Results pass `_assertComputeJobCurrent`; a changed document generation/revision throws `StaleJobError`. The progress overlay `#ai-progress` appears after 150 ms (`_showAIProgressDeferred` 31124) with a Cancel button (`#compute-cancel` -> `cancelActiveCompute` 6980). A cancelled/null result closes the panel with toast "Filter cancelled" (`_filterJobEnded`).

**Capability checks**
- `_gpuFilterDisabled` starts `true` on any user agent containing `Firefox/` (OffscreenCanvas WebGL2 can crash Firefox's GPU process) and latches `true` after the first GPU failure in a session.
- WebGPU (`runWebGPUFilter` 26037): needs `navigator.gpu` in the worker; requests an adapter and device per call (device destroyed afterwards); one WGSL compute shader, workgroup size 64, op codes invert 0, grayscale 1, threshold 2, brightness 3, contrast 4, blur 5 (box, radius clamp 1..8), sharpen 6; the whole image in one storage buffer (implicitly bounded by `maxStorageBufferBindingSize`).
- WebGL2 (`runWebGL2Filter` 26126): `OffscreenCanvas` + `webgl2` (`premultipliedAlpha:false`), same 7 op codes in a GLSL ES 3.00 fragment shader using `texelFetch`, `readPixels` back (bounded by MAX_TEXTURE_SIZE; any failure -> fallback).
- Offscreen 2D: probed at startup; on failure `_disableOffscreenRenderer` sets `renderer.paths.preview = 'fabric-main-thread'`, `paths.filter = 'filter-worker'` and records `fallbackReason`.
- Photon: `@silvia-odwyer/photon@0.3.3` (`photon_rs.js` + `photon_rs_bg.wasm`) fetched lazily from jsDelivr with SHA-384 SRI verification (asset table 4518-4527, `_fetchVerifiedRuntimeAsset` 4809), `credentials:'omit'`, cache-then-reload retry; listed as the network capability "GPU-accelerated filters (Photon)" (21427) for offline mode. Exposes edge_detection, threshold, gaussian_blur, sharpen, emboss, grayscale, sepia, invert. `_photonFilterDisabled` latches after one failure.
- Parity gating: `_gpuParityOps = [invert, grayscale, threshold, brightness, contrast, blur, sharpen]` (admitted at a 1-level colour tolerance per comment); `_photonParityOps = ['invert']` (only byte-exact op; Photon's grayscale / sepia / threshold / sharpen / emboss diverge from the JS reference).

**Fallback order** (`_runFilterWithPhoton` 26951; used only by Grayscale, Invert, Sepia, Black & White, Sharpen, Emboss, Threshold, Edge Detect):
1. WebGPU, then WebGL2 (both inside the filter worker) if the op is GPU-parity and GPU is not disabled;
2. Photon WASM worker if the op is Photon-parity (`invert` only);
3. Offscreen-2D worker if `renderer.capabilities.offscreenFilter`;
4. Plain JS worker.

All other worker filters call `_runFilterInWorker` (plain JS worker) directly. Halftone, Generate Noise, Gradient Map, Selective Color, Replace Color, Lens Correction, Presets, Levels, Color Balance, adjustment-layer rebuilds and Liquify run on the main thread.

**Benchmarks / diagnostics**: `_recordFilterBenchmark` (25976) keeps per-op, per-backend `{samples, totalMs, lastMs, fps}`; exposed by `filterBackendReport()` and in `aiBackendReport().filterBackends` together with the `renderer` report.

**Dialog / preview mechanics**
- Floating, draggable, non-modal `.filter-panel` (270-310 px wide) placed at the top-right of the canvas area (`_openFilterPanel` 17783); header with a close x, footer Cancel / Apply; async Apply errors toast "Filter failed: ...".
- Fabric-dialog live preview (`_filterPreviewNow` 17880): 50 ms debounce; a monotonically increasing `_filterPreviewSequence` drops stale renders; stack = saved original stack + the new filter. If the image exceeds `_previewPixelLimit` = 262,144 px (256*1024, line 4710) a downscaled proxy (sqrt scale, high-quality smoothing, cached per object in a WeakMap, `_previewSourceFor` 17611) is used: first choice the offscreen worker `pipeline` (`_applyImageFiltersOffscreen` 26876; only Brightness / Contrast / Saturation / HueRotation / Blur / Pixelate / Gamma via `_offscreenFilterSpecs` 26858), else Fabric `Canvas2dFilterBackend` on the proxy; small images preview at full resolution through Fabric. The proxy is displayed via `_filterScalingX/Y` so on-canvas size is unchanged.
- Apply flushes any pending tick on the main thread (`forceMain`), re-renders the full-resolution stack, saves history "Filter: <name>" and sets `_lastFilter`. Cancel restores the saved stack.
- Levels / Color Balance: 60 ms debounce, proxy <= 1.2 MP, full-resolution render on Apply, snapshot restore on Cancel.
- All other dialogs: sliders only update their value label; nothing renders until Apply.
- Before / After: a separate full-screen overlay (Image > Before / After Compare, `showBeforeAfter` 27471) compares the snapshot taken at document create/open (`_captureBA` 27449, called at 7211, 13685, 20776) with the current composite, via a draggable vertical divider using `clip-path: inset()`. No in-dialog before/after toggle, no split preview inside filter panels, no "Preview" checkbox.
- History: dialog filters record "Filter: <name>"; worker filters record their display name through `_replaceActiveImage` (pixelEdit + dirtyRects). Only `image.adjust` (panel), `filter.apply` (dead path, see below) and `layer.adjustment.*` produce replayable commands, so Curves, Levels and most filters cannot be recorded in Actions/macros (30957+ records only commands).
- Reapply: `_reapplyLastFilter` (19742) re-runs the six direct filters, or re-opens the Fabric dialog (with default values, not the last values) for the others; exposed only in the image right-click menu. Worker filters (Posterize, Curves, etc.) never set `_lastFilter`.
- Dead code: the Fabric branch of `applyFilterDirect` (17985-18005; Convolute kernels and the `filter.apply` command) is unreachable because `_getDirectPhotonFilter` (17947) returns a spec for all six names.
- Plugins cannot add filters or touch pixels: plugin capabilities are only `commands`, `document:read`, `selection:read`, `ui:toast` (6045).

**Max sizes**: document import cap 80 MP and 30,000 px per side (`_importLimits` 6101-6105, plus a runtime canvas-ceiling probe); preview proxies 262,144 px (Fabric dialogs) and 1,200,000 px (Levels / Color Balance); GPU blur radius 1..8; the histogram reads only the top-left 800x800 region of the composite (cropped, not scaled; 25209).

---

### 5.8 Histogram (read-only)

Panel block (3991-3998): channel buttons L / R / G / B (click-189..192 set `_histChannel` to luminance / red / green / blue), 240x80 canvas, stats "Min / Mean / Max". `updateHistogram` (25197) renders the composite at identity viewport, samples `min(W,800) x min(H,800)` from the top-left, Rec.601 luminance. No per-layer / selection histogram, no overlaid RGB view, no cache-level indicator, not shown inside Levels/Curves.

---

### 5.9 Liquify

Edit > Transform > Liquify... (`showLiquify` 30421). Full-screen overlay `#liquify-overlay` (markup 4060-4072) with its own canvas at the image's natural resolution, CSS-fit to 90%.

| Control | Values | Default |
|---|---|---|
| Tool (`#liq-tool`) | Forward Warp (`push`), Bloat, Pucker, Twirl CW, Twirl CCW | Forward Warp |
| Size (`#liq-size`) | 10..200 px (brush diameter) | 60 |
| Pressure (`#liq-pressure`) | 10..100 (%) | 50 |
| Density (`#liq-density`) | 10..100 | 50 (**in the UI but never read**) |
| Buttons | Reset (restore original), Cancel (close, discard), Apply (commit "Liquify") | |

Algorithm (`_liquifyApplyBrush` 30439): on every mousemove while the button is down, read the brush bounding box and, for each pixel inside radius r, compute a source coordinate (inverse mapping, nearest-neighbor, falloff `(1 - d/r)*pressure`): push shifts by `-movement*0.5*falloff`; bloat / pucker scale the offset by `1 +/- falloff*0.1`; twirl rotates by `+/- falloff*0.1` rad. Resampling is cumulative on already-warped pixels, so quality degrades with repeated strokes. Mouse events only (no pointer / touch / pen pressure), no zoom/pan, no brush cursor, no mesh / displacement field, no Reconstruct / Smooth / Freeze / Thaw masks, no Face-Aware, no undo inside the dialog, main thread only. Apply commits via `_replaceActiveImage` and closes only if the commit succeeds (`_liquifyApply` 30481).

### 5.10 Lens correction

See table 5.3: Barrel/Pin -100..100 (k = v/1000), Vignette 0..100%, CA Fix 0..10 px (red channel only). Missing: profile-based correction, vertical/horizontal perspective, rotate, scale / auto-scale, edge-fill options, grid overlay, bilinear sampling, live preview.

### 5.11 Gradient map

See table 5.2: exactly three color stops (Shadow #000000, Midtone #6c8cff, Highlight #ffffff) at fixed 0 / 50 / 100%, Rec.601 luma, main thread, destructive. Missing: a real gradient editor and presets (the gradient-tool presets are not reused), Reverse, Dither, method, adjustment-layer form.

### 5.12 Layer styles (Properties tab)

`previewLayerStyle` (27253) updates live on input/change; Apply (`applyLayerStyle`, click-166) saves history "Layer Style"; Clear (`clearLayerStyle`, click-167) removes shadow and stroke. Works on any Fabric object type (markup 3878-3900).

| Section | Control | Range | Default |
|---|---|---|---|
| Drop Shadow | Offset X | -30..30 | 3 |
| | Offset Y | -30..30 | 3 |
| | Blur | 0..40 | 6 |
| | Color | color | #000000 |
| Outer Glow | Size | 0..40 | 0 |
| | Color | color | #6c8cff |
| Stroke | Width | 0..20 | 0 |
| | Color | color | #ffffff |

Implementation: one `fabric.Shadow` (Drop Shadow wins; Outer Glow is only used when all Drop Shadow values are 0, because both share the single `shadow` slot and Drop Shadow's defaults are non-zero) plus Fabric `stroke` / `strokeWidth` with `paintFirst:'stroke'`. No opacity, spread, angle/distance, inner shadow, inner glow, bevel/emboss, satin, color / gradient / pattern overlay, stacked effects or style presets. A separate Text Effects block (Shadow X/Y -20..20 def 2, Blur 0..30 def 4, Color #000000, Outline W 0..10 def 0, Outline C #000000) is text-only.

### 5.13 Related retouch ops (cross-reference)

Dodge / Burn / Sponge / Smudge brush tools (`_retouchStroke` 30195) apply per-dab main-thread pixel math (strength = exposure*falloff*0.2) and commit on mouseup via `_replaceActiveImage` "Retouch". Spot Healing and Refine Edge use the filter-worker ops `teleaInpaint` and `refineEdge` in job group `image-processing`, so they cancel, and are cancelled by, filter jobs. Covered in the tools/selection sections.


---

# OpenShop v0.31.0 inventory, part C: layers, selection, text/vector, transforms

Source: `Openshop/index.html` (33,801 lines). Line numbers refer to that file. Fabric.js version is `fabric@7.4.0` (line 175) plus `fabric-extensions` (line 4599). "MISSING" marks a feature absent from v0.31.0 that the rewrite has to build from scratch. "BUG" marks behaviour in v0.31.0 that is broken and should not be copied.

---

## 6. Layer system

### 6.1 Architecture: how layers map onto Fabric.js

OpenShop does **not** use one Fabric object (or one canvas) per layer. There is one flat Fabric canvas, and an app-level array `OS.layers` assigns canvas objects to layers.

| Concept | Implementation | Lines |
|---|---|---|
| Layer table | `OS.layers[]`, ordered bottom (index 0) to top. Each entry holds `objects: FabricObject[]`. | 13757-14927 |
| Canvas order | `_syncCanvasStackFromLayers()` reorders `canvas.getObjects()` so it matches the layer order (it walks the layers, then each layer's `objects`), using `canvas.moveObjectTo`. | 13960 |
| Ownership index | `_rebuildLayerOwnership()` builds a `WeakMap<object, layerIndex>`. Any canvas object no layer claims (apart from overlays) goes into the active non-group layer. | 13886 |
| Applying layer props | `_applyLayerInteractionState()` writes onto every object: `visible` = layer visible AND every ancestor group visible; `opacity` = `_openShopBaseOpacity` x layer opacity x the product of ancestor group opacities; `globalCompositeOperation` = `layer.blend`; `selectable`/`evented` come from the tool, lock and visibility. | 13998 |
| Invariant pass | `_enforceLayerInvariants()` runs normalize hierarchy, then sync stack, then interaction state. It runs on every panel update. | 14073 |
| Artboard | A `fabric.Rect` named `__boundary__`, filled with a 16 px checker pattern (`#cdcdcd`/`#a0a0a0`), not selectable. It lives inside a layer's `objects` and is filtered out of most operations. | 7229 |
| Non-document overlays | Objects with `excludeFromExport` or `_wandOverlay` (the selection tint) are skipped by layer logic. | 14009 |
| Persisted custom object props | `name, excludeFromExport, _openShopObjectId, _hasMask, _isArrow, _openShopAdjustmentBaseSrc, _openShopAdjustmentLayers, _openShopLayerMask, _openShopMaskBaseSrc, _openShopSmartObject, _openShopTextFeatures, _openShopOriginalText, _openShopTextOnPath, _openShopTextDirection, _openShopAnimation` (and `globalCompositeOperation`, `_openShopBaseOpacity` in the document list). | 34, 5980 |
| Project serialization | Each layer record is saved as `{id,name,visible,locked,opacity,blend,kind,parentId,collapsed,adjustment,psd,objectIds[]}`. Objects travel in the Fabric JSON and are linked to layers by `_openShopObjectId`. | 8468-8489 |
| Pixel painting | A "pixel" layer gets its raster surface on demand (`_ensureLayerRaster`). That surface is the first `type==='image'` object in the layer, or a new transparent canvas-sized image. Brush strokes are Fabric paths rendered into that image via the inverse object transform, after which the path is thrown away. | 29990-30060 |
| New objects | `_addObjectAsLayer(object, name)` gives every new shape, text, path or trace its **own new layer**, placed above the active one (or inside the active group). Preference `stackNewObjects` (default `false`) pushes into the active layer instead. | 14267 |

Consequences for the rewrite:
- A layer is really a container of N Fabric objects (images, shapes, text, groups). Blend and opacity are set **per object**, so a layer holding overlapping objects is not composited in isolation: objects blend with each other and double up their opacity. BUG-class semantic difference from Photoshop.
- Layer opacity and blend are only "real" when a layer holds one object.

### 6.2 Layer types (`layer.kind`)

`_normalizeLayerHierarchy` (13831) coerces `kind` to one of three values. Anything else becomes `'pixel'`.

| `kind` | Properties | Meaning | Notes |
|---|---|---|---|
| `'pixel'` | `id, name, visible, locked, opacity(0-100), blend, kind, parentId, objects[]`, optional `psd` | The generic content layer. Holds raster images, shapes, text, paths, groups. | The default for every new layer. Names: `Layer N`, a shape name (`Rectangle`, `Rounded Rectangle`, `Ellipse`, `Triangle`, `Line`, `Polygon`, `Star`, `Arrow`, `Custom Shape`, `Path`; 14295), or the first 40 chars of the text (14300). |
| `'group'` | the above plus `collapsed:boolean`; `objects` forced to `[]` | Folder. Children point at it through `parentId`. | See 6.3. |
| `'adjustment'` | the above plus `adjustment:{type,version,params,cacheKey}` | Non-destructive Levels/Curves/HSL. | See 6.5. |

There is no distinct text layer, shape layer, smart-object layer or fill layer. These are flags on objects inside a pixel layer:
- Text objects are Fabric `i-text` (created), `text` or `textbox` (imported).
- Smart object = `object._openShopSmartObject` on an image object.
- Text-on-path = `object._openShopTextOnPath` on a `fabric.Group`.
- Mask = `object._hasMask` / `object._openShopLayerMask`.

The layer row subtitle shows `N obj`, plus `· M` (mask), `· SO` (smart object) or `· Text Path` (14843).

MISSING: dedicated text, shape, solid-color/gradient/pattern fill, smart-object and video layer types; layer-level (rather than object-level) raster storage.

### 6.3 Groups

| Item | Behavior | Lines |
|---|---|---|
| Create | `groupLayers(selection)` with **Ctrl+G** or the panel button (`click-234`). Only layers sharing the first selected layer's parent are grouped. Descendants of selected groups are dropped to avoid cycles. Refuses if any layer is locked. The new group is `{name:'Group', opacity:100, blend:'source-over', collapsed:false}`, inserted at the lowest selected index. | 14150 |
| Ungroup | `ungroupLayers()` with **Ctrl+Shift+G** or `click-235`. Children are re-parented to the group's parent. Refuses when the group is locked. | 14203 |
| Nesting | Unlimited depth through `parentId`. Cycles are detected and cut in `_normalizeLayerHierarchy`. | 13831-13863 |
| Collapse | `toggleGroupCollapsed` (disclosure triangle). This is recorded in history ("Collapse Group"/"Expand Group"). | 14231 |
| Move into group | Drag onto the middle third of a group row gives `_moveLayerIntoGroup`, which puts the layer above the group's last descendant. | 14108, 25853 |
| Group visibility/opacity/lock | Inherited by children through `_getPSDGroupState`: visible = AND, opacity = product, locked = OR. | 13329 |
| Group blend mode | Stored, and editable through the blend dropdown, but **never applied**. Groups own no objects, so `globalCompositeOperation` never sees it. | 14614, 14009 |
| Pass-through | Implicit only. PSD import maps `'pass through'` to `source-over` (12460); export writes groups with `source-over` back as `'pass through'` (20316). Groups are therefore always effectively pass-through and never isolated. | 12460, 20316 |
| Duplicate group | Deep-clones the whole subtree, remapping `parentId`s and offsetting objects by +10,+10. | 14441 |
| Delete group | Deletes the whole subtree, including the objects on the canvas. | 14416 |

MISSING: isolated (non-pass-through) group compositing; working group blend modes; group masks; "Merge Group".

### 6.4 Layer properties

| Property | UI | Range/default | Command id | Lines |
|---|---|---|---|---|
| Visibility | Eye button on each row | `true` | `layer.visibility.set` | 14580 |
| Lock | Lock button on each row. **One boolean only.** | `false` | `layer.lock.set` | 14906 |
| Opacity | `#layer-opacity` range 0-100. Live on `input` (no history); committed on `change` (`commitLayerOpacity`). | 100 | `layer.opacity.set` | 3807-3811, 14592-14613 |
| Blend | `#layer-blend` select | `source-over` | `layer.blend.set` | 3803, 14614 |
| Name | Double-click the name to get an inline `<input>`. Enter or blur commits. Limit 120 chars. | `Layer N` | `layer.rename` | 14627, 14918 |
| Collapsed (groups) | Disclosure button | `false` | (history only) | 14231 |

The lock model is a single `locked` flag that blocks every edit: drawing, transforming, deleting, grouping, merging. Locked layers' objects become non-selectable.

MISSING: Fill opacity (the PSD import reports it as unsupported, 12898); lock transparent pixels, lock image pixels, lock position, lock artboard, lock all as separate flags; layer color labels; Blend If / advanced blending; knockout.

### 6.5 Blend modes (exact strings)

The `<select id="layer-blend">` at line 3803 uses Canvas 2D `globalCompositeOperation` names:

| Value (stored in `layer.blend`) | Label | PSD name mapping (12456 / 12478) |
|---|---|---|
| `source-over` | Normal | `normal` (`pass through` also maps here) |
| `multiply` | Multiply | `multiply` |
| `screen` | Screen | `screen` |
| `overlay` | Overlay | `overlay` |
| `darken` | Darken | `darken` |
| `lighten` | Lighten | `lighten` |
| `color-dodge` | Color Dodge | `color dodge` |
| `color-burn` | Color Burn | `color burn` |
| `hard-light` | Hard Light | `hard light` |
| `soft-light` | Soft Light | `soft light` |
| `difference` | Difference | `difference` |
| `exclusion` | Exclusion | `exclusion` |
| `hue` | Hue | `hue` |
| `saturation` | Saturation | `saturation` |
| `color` | Color | `color` |
| `luminosity` | Luminosity | `luminosity` |

That is 16 modes. Any other PSD mode falls back to `source-over`. A non-Normal blend shows in the row subtitle.

MISSING (Photoshop modes Canvas 2D lacks): Dissolve, Linear Burn, Darker Color, Linear Dodge (Add), Lighter Color, Vivid Light, Linear Light, Pin Light, Hard Mix, Subtract, Divide. A WebGL compositor would need to implement these.

### 6.6 Layer commands

| Command | Trigger | Behavior | Lines |
|---|---|---|---|
| New Layer | Panel `+` (`click-157`), context menu, palette "Add Layer" | Empty pixel layer above the active layer (or inside the active group). | 14308 |
| Delete Layer | Panel trash (`click-160`) | Deletes the active layer and its subtree. Refuses when locked. If no layers remain, creates `Layer 0`. | 14416 |
| Duplicate Layer | Panel (`click-158`) | Clones each object asynchronously with a +10,+10 offset and names the copy `"<name> Copy"`. An adjustment layer is copied without objects. Groups are deep-copied. | 14441 |
| Merge Down | Panel (`click-159`), **Ctrl+E** | Moves the upper layer's object references into the lower layer. **This is not a pixel merge**: the objects stay separate and the upper layer's opacity and blend are lost. Only works on sibling pixel layers. When the upper layer is an adjustment layer it runs `applyAdjustmentLayers()` (the whole stack). | 14545 |
| Merge Visible | **Ctrl+Shift+E** | Calls `flattenImage()`, which drops hidden layers too. It is a flatten, not a merge-visible. BUG. | 29972 |
| Flatten Image | Image menu (`click-048`), context menu | Rasterizes the whole document into one image in a new single-layer document (`_replaceDocumentWithRaster`). Asks first (`_confirmDocumentStateLoss`). | 14694-14718 |
| Group / Ungroup | Ctrl+G / Ctrl+Shift+G, panel buttons | See 6.3. | 14150, 14203 |
| Layer Via Copy / Via Cut | Canvas context menu | Clones the active object into a new layer **pushed at the top of the stack**, with no `id`/`kind`/`parentId` (normalization fills those in later). Via Cut removes the original. Works on objects, not on pixel selections. | 19704, 19719 |
| Arrange object within layer | Context menu: Bring to Front / Bring Forward / Send Backward / Send to Back | Reorders `layer.objects`. | 14239 |
| Reorder layer | Drag rows (HTML5 DnD; drop zones `drop-above`/`drop-below`/`drop-into` by thirds), or **Ctrl+Alt+Up/Down** | `_moveLayer` moves the whole subtree. | 25853-25890, 25893-25910 |
| Select layers | Click; Shift+click extends; Ctrl/Cmd+click toggles. Stored as `_selectedLayerIds`. | 14564 |
| Keyboard listbox | Layers list is an ARIA listbox with arrow-key navigation (`_onPanelListboxKeydown`). | 14729 |
| Auto-select | Move tool option "Auto-select" (`select-auto`, default on). When off, only the active layer's top object is selectable. | 14059, 14047 |

Thumbnails: **MISSING**. The row renders a 32x32 placeholder div (`background:var(--bg-depth-4)`, or a checkerboard for the boundary layer) and never a pixel preview (14855-14857).

There is no Layer menu in the menu bar. Layer commands are reachable only from the panel, the context menu, shortcuts and the command palette (palette labels: Add Layer, Group Layers, Ungroup Layers, Delete Layer, Duplicate Layer, Merge Down).

MISSING: real pixel Merge Down / Merge Visible; Stamp Visible; Merge Layers (multi-select); New Layer via Copy/Cut from a pixel selection; layer properties dialog; layer search/filter; link layers; layer comps; rasterize layer; convert to smart object from the layers panel; layers-panel right-click menu; thumbnail size options.

### 6.7 Layer masks

Masks are per **object** (`image` objects only), not per layer. Code is at 24574-24767.

| Item | Detail |
|---|---|
| Storage | `object._openShopLayerMask = {version:1, enabled, feather(0-100, default 0), density(0-100, default 100), mask:{width,height,encoding:'coverage-v1', data:'data:application/vnd.openshop.selection;base64,...'}}` (24575). The original pixels are kept in `object._openShopMaskBaseSrc` (data URL). |
| Mask resolution | Image size, capped at about 4 MP: `scale = min(1, sqrt(4e6/(w*h)))` (24689). |
| Create | Panel "Mask" button `click-161` runs `addLayerMask()`. The new mask is **a rectangle inset by 10% on every side** (white inside, black border). It is **not** built from the current selection. Then the dialog opens. (24685-24720) |
| Edit dialog | Feather slider 0-100 (%), Density slider 0-100 (%), "Remove Mask", "Update Mask". (24722) |
| Apply algorithm | `_rebuildLayerMasks`: nearest-neighbor resample of the mask to the image, separable box blur with `radius = min(64, round(max(w,h)*feather/100*0.02))`, then `alpha *= coverage/255 * density`. The result is baked into the image element; the base is restored when the mask is disabled. (24597-24683) |
| Button toggle logic | `click-161`: if the object has `_openShopLayerMask`, open the dialog; else if it has `_hasMask` (a `clipPath`), remove it; else add a mask. |
| Enable/disable | The `enabled` flag is honored on load, but **there is no UI to toggle it**. |
| Remove | `removeLayerMask()` restores the base pixels or clears `clipPath`. |
| Vector masks | No authoring. A Fabric `clipPath` survives only when it arrives from an imported project or PSD (`_hasMask = Boolean(clipPath)`, 8844). |

MISSING: painting on a mask with brush/eraser/gradient; mask from selection (Reveal/Hide Selection, Reveal/Hide All); invert mask; link/unlink mask from content; enable/disable toggle (Shift+click); Apply Mask (bake); mask view (Alt+click); mask thumbnail; masks on non-image objects and on groups; vector masks; Properties panel mask refinement.

### 6.8 Clipping masks

MISSING entirely. PSD import reports `clipping` as unsupported and falls back (12897, 13099: "clipping relationships are not supported"). There is no create/release clipping mask command.

### 6.9 Adjustment layers

| Item | Detail | Lines |
|---|---|---|
| Types | `'levels'`, `'curves'`, `'hsl'` (select `#adjustment-layer-kind` in the Properties tab) | 3846, 8228 |
| Levels params | `black` 0-254 (default 0), `white` black+1..255 (default 255), `gamma` 0.1-4 (default 1). Formula `pow((v-black)/(white-black), 1/gamma)` on RGB. | 8236-8242, 8277 |
| Curves params | `points: [[x,y]...]` up to 16 points, endpoints forced, **linear interpolation** to a 256-entry LUT. The dialog exposes only a "Midpoint" slider -100..100 that moves the 128 point. | 8251-8273, 8406 |
| HSL params | `hue` -180..180, `saturation` -100..100 (multiplicative `s*(1+sat/100)`), `lightness` -100..100 (additive `l + light/200`) | 8243-8249, 8289 |
| Opacity | Layer opacity blends adjusted and original pixels linearly. | 8320 |
| Blend mode | Ignored by the adjustment pipeline. | |
| Scope | **Bakes into every `image` object in any layer below** (`index > layerIndex`), regardless of groups. Shapes and text are not adjusted. The original is kept in `_openShopAdjustmentBaseSrc`. | 8325-8369 |
| Edit | Double-click the row name to open `showAdjustmentLayerDialog`. | 8374 |
| Apply Stack | `applyAdjustmentLayers()`: bakes, then deletes every adjustment layer. | 14398 |
| Commands | `layer.adjustment.add`, `.update`, `.apply` | |

MISSING: compositing an adjustment layer over the composite beneath it (all layer types, not image objects only); clipping an adjustment to a single layer; adjustment masks; the other Photoshop adjustment-layer types (Brightness/Contrast, Exposure, Vibrance, Color Balance, Black & White, Photo Filter, Channel Mixer, Color Lookup, Invert, Posterize, Threshold, Gradient Map, Selective Color, Hue/Sat with per-range); per-channel curves and levels in the layer form; a real curve editor in the layer dialog.

### 6.10 Layer styles / effects

These live in the Properties tab, "Layer Styles" section (3879-3901), with code at 27252-27283. They apply to **the active canvas object**, not the layer, and use Fabric's single `shadow` plus `stroke`.

| Effect | Controls (id, range, default) | Implementation |
|---|---|---|
| Drop Shadow | Offset X `ls-ds-x` -30..30 (3); Offset Y `ls-ds-y` -30..30 (3); Blur `ls-ds-blur` 0..40 (6); Color `ls-ds-color` (#000000) | `new fabric.Shadow({color, offsetX, offsetY, blur})` |
| Outer Glow | Size `ls-og-size` 0..40 (0); Color `ls-og-color` (#6c8cff) | The same `fabric.Shadow` with offset 0. **Used only when Drop Shadow is all-zero**, because an object can carry one shadow. Since the DS defaults are non-zero, Outer Glow is unreachable unless the user zeroes the DS sliders. |
| Stroke | Width `ls-st-w` 0..20 (0); Color `ls-st-color` (#ffffff) | `object.stroke/strokeWidth`, `paintFirst:'stroke'`. On images this strokes the bounding rectangle rather than the alpha outline. |

Buttons: Apply (`click-166`, saves the "Layer Style" history entry) and Clear (`click-167`). Sliders preview live with no history (`input-021`, `change-031`).

There is also a separate "Text Effects" block (3867-3877) that applies the same mechanism to text only. See 8.4.

MISSING: Inner Shadow, Inner Glow, Bevel & Emboss (with Contour/Texture), Satin, Color Overlay, Gradient Overlay, Pattern Overlay; multiple instances of one effect; spread/size/choke/noise/opacity/blend per effect; global light angle; effect visibility toggles; copy/paste/clear layer style; styles presets; effects scaling; effects that follow the alpha outline; "Create Layers" from effects.

### 6.11 Smart objects

Code is at 24770-24866, with Properties buttons "Convert" (`convert-smart-object`) and "Edit Source" (`edit-smart-object`).

| Item | Detail |
|---|---|
| Model | `object._openShopSmartObject = {version:1, kind:'image', source:<data URL png/jpeg/webp/gif/bmp>, sourceName, sourceWidth, sourceHeight, revision}` (24771) |
| Convert | `convertToSmartObject()` works on image objects only. It snapshots the current pixels as the embedded source (24818). |
| "Edit" | `showSmartObjectDialog()` shows name, revision and dimensions, and offers **Replace Source** (file picker). There is no in-app editing of the contents. (24837) |
| Replace | `_replaceSmartObjectSource`: decodes the new image, keeps the on-canvas size (`scaleX = oldW/newW`), position, angle, flip, skew and opacity, bumps `revision`, and re-applies the mask. (24790) |
| Transforms | Fabric object transforms are already non-destructive, so scaling a smart object re-samples from source. |
| Open from panel | Double-click a layer containing a SO to open the dialog. (14874) |

MISSING: edit contents in a child document with live round-trip; linked (external file) smart objects; vector/text/group smart objects; rasterize smart object; smart filters; "New Smart Object via Copy"; export contents; replace from the layers panel.

---

## 7. Selection system

### 7.1 Representation

| State | Shape | Lines |
|---|---|---|
| `OS._selectionMask` | `{mask: Uint8Array(w*h) 0-255 coverage, w, h, count}` in **document pixel space** (always canvas size). | 31783-31830 |
| `OS._selectionBounds` | `{x,y,w,h}` document-space bounding box. For the rectangular marquee this is the **only** representation (no mask) until an operation promotes it with `_maskFromMarqueeBounds()`. | 16443 |
| `OS._lastSelection` | A copy of the mask and bounds, captured by `clearSelection()`, used by Reselect. | 16407-16430 |
| Combine mode | `_selectionCombineDefault` (toolbar) and `_selectionCombine` (per gesture; consumed and reset on use). | 31741-31781 |
| Producer normalization | `_setPixelSelectionMask(mask,w,h,{space,coverage,combine})`: binary producers write 1 and get normalized to 255; `space:'screen'` resamples screen to document. Empty results clear the selection. | 31783 |
| File/project encoding | `_encodeSelectionMask`: `{width,height,encoding:'coverage-v1', data:'data:application/vnd.openshop.selection;base64,'+bytes}`. The legacy `bitset-v1` is decoded too. | 7618-7655 |

Selections are raster masks only. There is no path-based selection representation and no conversion between paths and selections (see 8.6).

### 7.2 Rendering ("marching ants")

| Element | Detail | Lines |
|---|---|---|
| `#selection-overlay.selection-rect` | Absolutely positioned DOM div over the canvas, re-placed through the viewport transform (`_placeSelectionBox`). Its border is four 1 px linear-gradient strips (`--mask-black`/`--mask-white`, 8 px period) animated by `@keyframes marchAnts` at 0.4 s. It traces the **bounding box only**. The ellipse marquee gives it `border-radius:50%`. | 599-605, 16925 |
| Mask tint | `_showMaskOverlay`: a Fabric image (`_wandOverlay:true, excludeFromExport:true`) tinted `rgb(80,140,255)` with alpha `50 * coverage/255`. | 16942 |
| Lasso outline | The SVG polygon in `#lasso-overlay` stays visible after closing. | 23380-23440 |

BUG/limitation: the ants never follow the real mask outline of wand, lasso, quick or color-range selections. MISSING: true contour-tracing marching ants.

### 7.3 Selection tools

The static toolbar (3434-3443) is replaced at runtime by a Photoshop-family registry toolbar built from `_toolCatalog()` (18039; builder at 14952-15000), so every implemented catalog tool is reachable.

| Tool (state id) | Catalog id / shortcut | How it works | Options | Lines |
|---|---|---|---|---|
| Rectangular Marquee (`marquee-rect`) | `tool.marquee.rect`, **M** | Drag a DOM rectangle in screen px; on mouse-up it converts to document bounds. Under 3 px clears. | Mode buttons New / Add / Subtract / Intersect (`.selection-mode`, `data-combine`) | 15983, 16141 |
| Elliptical Marquee (`marquee-ellipse`) | `tool.marquee.ellipse`, M | Same as the rectangle with a CSS 50% radius. **BUG: the stored selection is the bounding rectangle.** No ellipse mask is ever rasterized, so delete, copy and fill act on the full rectangle. | same | 15990 |
| Single Row / Single Column Marquee | `marquee-row` / `marquee-column` | **Not implemented** (in `_unimplementedToolStates`, 18019). | | |
| Lasso (`lasso`) | `tool.lasso.free`, **L** | **Click-to-add-points polygon, not freehand drag.** Close with a double-click, Enter is not used, or a click within 12 px of the start (`_closeSnapRadius`). Rasterized with Canvas `fill()` (anti-aliased coverage). | hint text only | 23326-23440 |
| Polygonal Lasso (`lasso-polygonal`) | `tool.lasso.polygonal`, L | **Identical to Lasso** (same `_lassoClick`). | | 16002 |
| Magnetic Lasso (`lasso-magnetic`) | `tool.lasso.magnetic`, L | Press, drag, release. On each move it snaps to the strongest luminance gradient within a **7 px radius** (`score = max(|dx|,|dy|) gradient - 3*distance`) and adds a point when it has moved 3 px or more. It closes on mouse-up. | none (no width/contrast/frequency) | 23443-23484 |
| Quick Selection (`quick-selection`) | `tool.selection.quick`, W | On each mouse-move with the button down, flood-fills from the pointer: RGB per-channel tolerance = `wandTolerance`, limited to a circle of radius `max(radius*2,12)` where `radius = max(5, brushSize)`. Results are OR-accumulated across the stroke, then combined with the pre-stroke selection using the gesture's mode. Uses the wand's Tolerance/Contiguous options. | Tolerance, Contiguous (from wand) | 23485-23569 |
| Magic Wand (`magic-wand`) | `tool.selection.magic-wand`, **W** | Samples the composite (`_readDocumentImageData`, all visible layers). Seed RGB with per-channel `abs(diff) <= tol`. Contiguous = 4-connected stack flood fill capped at 1,000,000 pixels; non-contiguous = global match. Binary result (no anti-alias). | Tolerance `wand-tolerance` 0-100 (default **32**); Contiguous checkbox (default **on**) | 16353, 3624-3629 |
| AI Segment Select (`ai-segment`) | extension tool | Panoptic segmentation (Transformers.js) on the clicked image layer; the chosen segment's mask is projected to document space. | none | 31832-31890 |
| Color Range | Select > Color Range... (`click-031`) | Dialog, see 7.6. | | 16961 |

Combine modes (31741-31800):

| Input | Mode |
|---|---|
| Toolbar New / Add / Subtract / Intersect | sets the default |
| Shift held at gesture start | `add` |
| Alt held at gesture start | `subtract` |
| Shift+Alt | `intersect` |
| Math (`_combineMasks`) | add = `max(a,b)`; subtract = `a ? max(0, a-b) : 0`; intersect = `min(a,b)` |
| With no existing mask | add keeps the new mask; subtract/intersect produce empty |

BUG: the marquee's `mousedown` sets `_selectionMask=null; _selectionBounds=null` before the gesture (15986), so Add with a marquee loses the previous selection, and Subtract/Intersect always produce an empty selection.

BUG: marquee mouse-up computes `x:(parseFloat(el.style.left)||0 - vpt[4])/vpt[0]` (16141). Operator precedence makes this `left || (0 - vpt[4])`, so the pan offset is **not subtracted** and marquee bounds are wrong whenever the canvas is panned. The same applies to `top`.

Constraint modifiers: Shift-square and Alt-from-center are MISSING (Shift and Alt are taken by the combine modes, and there is no "hold Shift after starting" rule).

MISSING marquee options: Feather (pre-feather), Anti-alias toggle, Style (Fixed Ratio / Fixed Size), width/height fields, Select Subject, Select and Mask workspace.

### 7.4 Selection commands (Select menu, 3189-3220)

| Command | Shortcut | Behavior | Lines |
|---|---|---|---|
| All | **Ctrl+A** | **Selects all Fabric objects** (an ActiveSelection), not all pixels, and switches to the Move tool. MISSING: pixel Select All. | 29646 |
| Deselect | **Ctrl+D** | Discards the object selection and clears the pixel selection (stores it for Reselect). Escape also clears. | 29654, 16390 |
| Reselect | **Ctrl+Shift+D** | Restores `_lastSelection` (deep copies). | 16418 |
| Inverse | **Ctrl+Shift+I** | Promotes the marquee to a mask, then `m = m ? 0 : 255`. **Loses soft coverage** (a feathered edge becomes binary). | 16455 |
| Color Range... | | 7.6 | 16961 |
| Modify > Expand... | | Disk dilation of radius px (1-100, default **2**). Brute force O(N r^2). | 16862 |
| Modify > Contract... | | Disk erosion (default **2**). Image edges count as unselected. | 16872 |
| Modify > Feather... | | 3x3 box blur repeated `min(px,10)` times (default **3**). Radius is effectively capped near 10 px. Not Gaussian. | 16884 |
| Modify > Refine Edge... | (menu item `click-234`) | **BUG: unreachable.** The handler table defines `"click-234"` twice (4170 = `showRefineEdge`, 4296 = `groupLayers`). The later key wins, so the menu item **groups layers**. Refine Edge is also missing from the command palette. Implementation: see 7.7. | 3203, 4170, 4296 |
| Modify > Border... | | Keeps only selected pixels within px of the unselected area (an inside-only border, default **2**). Photoshop's border straddles the edge. | 16906 |
| Modify > Smooth | | One 3x3 majority-vote pass (5 of 9 or more). No radius parameter. | 16919 |
| Grow | | **One** 4-neighbour dilation step, adding neighbours within `wandTolerance` (default 32) of the edge pixel's color. Photoshop grows until no change. | 16474 |
| Similar | | Averages the RGB of selected pixels, then selects every document pixel within tolerance of that average. Uses a single average color, not the set of colors. | 16504 |
| Transform Selection... | (`click-230`) | A numeric dialog (X, Y, Width, Height) that nearest-neighbour resamples the mask's bounding region. MISSING: interactive handles, rotation, skew. | 16604-16675 |
| Save Selection... | (`click-231`) | Downloads `<name>.openshop-selection` (MIME `application/vnd.openshop.selection+json`) holding `{kind:'openshop-selection',version:1,name,canvas:{width,height},bounds,mask}`. | 16536-16570 |
| Load Selection... | (`click-232`) | File picker. Requires an exact canvas-size match. Replaces or combines through the current combine mode. | 16571-16602 |

All modify operations that would empty the selection are cancelled with the toast "original kept" (16925). Operations that need a mask promote a rectangle marquee automatically.

Selection persistence: saved in the project (`selection:{bounds,mask}`, 8538), restored on undo/redo snapshots, and kept across tool switches (15405).

MISSING: alpha channels / Channels panel (save/load selection into the document); load selection from layer transparency (Ctrl+click thumbnail); select by layer; Select > Subject / Sky / Focus Area; Grow repeat-until-stable; Quick Mask (see 7.8); path-to-selection and selection-to-path; stroke/fill selection dialogs (Edit > Fill / Stroke, not in this file's Edit menu); Select > Modify Feather with a real Gaussian radius; anti-alias toggle for wand and marquee; Sample All Layers / Current Layer for the wand (it always samples the composite).

### 7.5 Consumers of the selection

| Consumer | Behavior | Lines |
|---|---|---|
| Delete/Backspace | With a selection, `_deleteSelectionPixels()` targets the active image or the topmost image. With a mask it multiplies alpha by `1 - coverage/255`; without one it `clearRect`s the bounding box. Commits to history and clears the selection. | 29880-29940 |
| Ctrl+C / Ctrl+X | With a selection, `_copyPixelSelection()` (29727) puts pixels on `_pixelClipboard`; cut = copy plus delete pixels. | 29750-29773 |
| Ctrl+V | Pastes pixels as a new image object, offset +20,+20, **into the active layer**. MISSING: Paste in Place, Paste Into. | 29774-29805 |
| Refine Edge, Grow, Similar, Inverse | as above | |

### 7.6 Color Range dialog (16961-17171)

| Param | Values / default | Notes |
|---|---|---|
| Select | `sampled` (Sampled Colors, default), `reds`, `yellows`, `greens`, `cyans`, `blues`, `magentas`, `highlights`, `midtones`, `shadows` | Choosing a preset clears the samples. |
| Fuzziness | 0-200, default **80** (slider plus number) | Sampled: L1 RGB distance `<= fuzz*3`. Presets use ad-hoc rules, e.g. reds `r > g+fuzz/3 && r > b+fuzz/3`, highlights `lum > 255-fuzz`, midtones `fuzz < lum < 255-fuzz`, shadows `lum < fuzz`. |
| Eyedroppers | `+` add sample (default), `-` removes the **nearest existing sample** (it is not a subtract range) | Click on the preview canvas. |
| Invert | checkbox | |
| Preview | Selection (B/W mask) or Image (unselected dimmed to 20%) | Debounced 60 ms. |
| Result | **Binary** mask (no soft fuzziness falloff), passed through `_setPixelSelectionMask` with the current combine mode. | |

MISSING: soft falloff, Localized Color Clusters / Range, Skin Tones / Detect Faces, Out of Gamut, eyedropper on the main canvas, Load/Save presets, Selection Preview modes on the main canvas (Grayscale/Black Matte/White Matte/Quick Mask).

### 7.7 Refine Edge (16677-16810; worker op `refineEdge` at 26411)

| Param | Range / default |
|---|---|
| Edge radius | 1-32 px, default **4** (slider, 90 ms debounced preview) |

Algorithm (filter worker): treat `mask >= 128` as foreground; compute the global mean foreground and background RGB; BFS distance from the hard boundary up to the radius; inside the band, `alpha = 0.65 * positionalRamp + 0.35 * colorLineProjection`; outside the band the original coverage is kept. Preview is the matte on a checkerboard. Apply replaces the selection (`combine:'replace'`).

MISSING (and the dialog is unreachable, see 7.4): Smooth, Feather, Contrast, Shift Edge, Smart Radius, Decontaminate Colors, Refine Edge brush, output-to options (selection / layer mask / new layer), view modes, an AI matting model.

### 7.8 Quick Mask

`mode.quick-mask` exists in the catalog (18099). `toggleQuickMaskMode()` (18222) only flips `_quickMaskMode` and announces it. **No overlay, no painting into the selection, no conversion.** `setTool('quick-mask')` is refused. MISSING: the whole feature (red overlay, paint with brush/eraser to edit the selection, the Q shortcut).

---

## 8. Text and vector features

### 8.1 Text objects

| Item | Detail | Lines |
|---|---|---|
| Creation | Text tool (**T**): a click creates `new fabric.IText('Type here', {left, top, fontFamily, fontSize, fill, fontWeight, fontStyle, underline, overline, linethrough, textDecorationColor, textDecorationThickness, direction})` on a **new layer**, then enters editing. | 16018-16021 |
| Types handled | `i-text` (created), `text` and `textbox` (import/project) | 24250 |
| Point vs paragraph | Point text only. MISSING: click-drag area text (Textbox with wrapping), text frames, overflow. | |
| Direction | `#text-direction`: `ltr` / `rtl`. Sets `direction` and `_openShopTextDirection`. | 3594, 24425-24460 |
| Vertical text | `vertical-text` is unimplemented (18022). | |
| Type mask tools | `horizontal-text-mask` and `vertical-text-mask` are unimplemented. | |

Text tool options bar (3588-3609):

| Control | id | Range / default |
|---|---|---|
| Font | `text-font` | `DM Sans` (first), `Arial`, `Georgia`, `Courier New`, `Verdana`, `Times New Roman`, `JetBrains Mono`, `Impact` |
| Size | `text-size` | 8-200, default **24** (range styles allow 1-2000) |
| Color | `text-color` | `#ffffff` |
| Direction | `text-direction` | `ltr` |
| B / I | `text-bold`, `text-italic` | off. Bold maps to `fontWeight:'bold'`, italic to `fontStyle:'italic'`. |
| U / O / S | `text-underline`, `text-overline`, `text-linethrough` | off. These apply immediately to the selected text objects. |
| Decoration color ("Stroke" label) | `text-decoration-color` | `#ffffff` |
| Decoration width ("Width" label) | `text-decoration-thickness` | 10-500 % of font size, step 10, default **100** |
| Range status | `text-range-status` | "Characters a-b of n" |
| Apply to range / Clear range | `apply-text-range`, `clear-text-range` | |

Font handling: a fixed list of 8 families with no font loading at all. There is no `FontFace`, no Google Fonts, no `queryLocalFonts` and no upload. MISSING: system font enumeration (Local Font Access API), web font loading, font upload, a font preview menu, missing-font substitution, weight/style variants beyond bold/italic, variable font axes.

### 8.2 Per-range (character) styling

`applySelectedTextRange({clear})` (24356-24390) uses the IText selection (`selectionStart/End`). It goes through `setSelectionStyles`, or a manual fallback that writes the `styles[line][char]` map.

| Range style keys (normalized whitelist, 24263) |
|---|
| `fontFamily, fontSize, fill, stroke, strokeWidth, fontWeight, fontStyle, underline, overline, linethrough, textDecorationColor, textDecorationThickness, backgroundColor, textBackgroundColor, deltaY, charSpacing` |

The range UI sets only family, size, fill, bold, italic, the three decorations, decoration color and thickness (`_textRangeStyleFromControls`, 24318). `stroke`, `charSpacing`, `deltaY` (baseline shift) and background colors are preserved if present but have no UI.

MISSING: Character panel (tracking, kerning, leading/line height, baseline shift, horizontal/vertical scale, all caps, superscript/subscript, language); Paragraph panel (alignment left/center/right/justify, indents, space before/after, hyphenation). `textAlign`, `lineHeight` and `charSpacing` have no UI anywhere.

### 8.3 OpenType-like features

Properties > "Text & Type" (3857-3865) with `applySelectedTextFeatures()` (25045):

| Feature | Implementation |
|---|---|
| Ligatures | **String substitution** of `ffi`, `ffl`, `fi`, `fl` to Unicode ligature code points (`_formatTextFeatures`, 25038). The original is kept in `_openShopOriginalText`. |
| Small caps | `text.toUpperCase()` plus `fontVariant:'small-caps'` |
| Tabular numbers | `fontFeatureSettings:'"tnum" 1'` |

MISSING: real OpenType feature application (`font-feature-settings` for liga/dlig/swsh/frac/ordn/salt/ss01-20), stylistic sets, glyphs panel.

### 8.4 Text effects (Properties tab, 3867-3877; code 24505-24525)

| Control | id | Range / default |
|---|---|---|
| Shadow X | `tfx-sx` | -20..20, **2** |
| Shadow Y | `tfx-sy` | -20..20, **2** |
| Blur | `tfx-blur` | 0..30, **4** |
| Color | `tfx-color` | `#000000` |
| Outline W | `tfx-stroke` | 0..10, **0** |
| Outline C | `tfx-stroke-color` | `#000000` |

Effects go to `fabric.Shadow` plus `stroke`/`strokeWidth` with `paintFirst:'stroke'`. They are applied live on input. BUG: **Apply (`click-164`) never calls `saveHistory`**, so text effects are not undoable (only "Clear Text FX" records history; `applyTextFx` at 24506).

### 8.5 Curved text and text on path

**Curved Text** (Edit > Transform > Curved Text..., `showCurvedText`, 30497-30565):

| Param | id | Range / default |
|---|---|---|
| Text | `ct-text` | "Curved Text" |
| Radius | `ct-radius` | 50-500 px, **150** |
| Start Angle | `ct-angle` | -180..180 deg, **-90** |
| Size | `ct-size` | 10-80 px, **24** |
| Color | `ct-color` | `#ffffff` |

Each glyph is placed at `startAngle + (i - n/2) * size*0.8/radius`, rotated tangent to the circle. The font is **hard-coded `DM Sans`** and per-glyph advance is a fixed `size*0.8`. The output is **rasterized into an image**, which is not editable, and is pushed into the active layer at the canvas center. MISSING: editable arc text, inside/outside placement, spacing control, font choice.

**Text on Path** (Properties "Text on Path" / "Edit Text on Path"; 25018-25143):
- `attachSelectedTextToPath()` attaches the selected text to **the first `type==='path'` object found on the canvas**. The user cannot choose the path.
- The path is flattened to a polyline (cubic curves 16 steps, quadratic 12). Glyph widths are measured with probe `IText`s. Text is **centered** along the path length and each glyph becomes its own `IText` (center origin, rotated to the tangent) inside a `fabric.Group` named "Text on Path".
- Metadata: `_openShopTextOnPath = {version, text, features, pathObjectId, style:{fontFamily,fontSize,fill,stroke,strokeWidth,fontWeight,fontStyle,charSpacing}}`.
- Edit dialog: text plus the three feature checkboxes. It regenerates the group, but the path link is by ID only; moving the path does **not** update the text.

MISSING: start/end offset handles, flip side, alignment along the path, live link to path edits, text inside closed shapes.

### 8.6 Warp text

MISSING. There are no warp styles (Arc, Arch, Bulge, Flag, Wave, Fish, Rise, Fisheye, Inflate, Squeeze, Twist) and no bend/distortion parameters.

### 8.7 Vector shapes

Shape tools (16053-16084, finalized 16182-16232). Options bar `opt-shape` (3580-3587): Fill `shape-fill` (#6c8cff), Stroke `shape-stroke` (#ffffff), Width `shape-stroke-w` 0-50 (**2**), Filled checkbox (on), Dash select.

| Tool state | Shortcut | Fabric object produced | Notes |
|---|---|---|---|
| `rect` | **R**, **U** | `fabric.Rect` | |
| `rounded-rect` | (registry) | `fabric.Rect` with `rx = ry = min(24, w/2, h/2)` | Corner radius is fixed at 24, with no UI. |
| `circle` (Ellipse) | **O** | `fabric.Ellipse` | |
| `triangle` | (no catalog entry) | `fabric.Triangle` | Not in the registry toolbar, and has no key, so it is reachable only through the old toolbar markup that the registry replaces. Effectively unreachable. |
| `line` | **L** | `fabric.Line` | Note: L is mapped to the Line tool, not Lasso. |
| `arrow` | **A** | `fabric.Group[Line, Polygon head]` with head length 12 and 30 deg half-angle | `_isArrow`. Not in the catalog toolbar. |
| `polygon` | **K** | `fabric.Polygon`, regular, sides from `poly-sides` 3-20 (**5**), radius = drag distance, first vertex at the top | |
| `star` | (no key) | `fabric.Polygon`, points from `star-points` 3-20 (**5**), inner radius `star-inner` 10-90 % (**40**) | Not in the catalog toolbar. |
| `custom-shape` | (registry) | `fabric.Path` heart from 4 cubic curves | The only custom shape. There is no shape library. |
| Dash patterns | | `strokeDashArray`: Solid `""`, Dashed `8,4`, Dotted `2,4`, Dash-Dot `12,4,2,4`, Long Dash `16,8` | 3585 |

Drag constraints: none. MISSING: Shift for square/circle/45 deg line, Alt for draw-from-center, numeric shape dialog on click, live shape properties (corner radii per corner, stroke alignment inside/center/outside, caps, joins, miter), custom shape library and defined shapes.

### 8.8 Pen tool and paths

| Item | Detail | Lines |
|---|---|---|
| Pen (`pen`, **P**) | Click to add **straight-segment** anchors (`L`). There is no click-drag to create Bezier handles. Finish with a double-click or Enter. Clicking within 12 px of the start closes with `Z` and forces fill. | 25145-25195 |
| Pen options | Stroke `pen-stroke` (#ffffff), Width `pen-width` 1-20 (**2**), Fill checkbox `pen-filled` (off; fill uses `shapeFill`) | 3637-3642 |
| Output | `fabric.Path` on a new layer named "Path" | |
| Convert to Path | `convertSelectedVectorToPath()` (Properties "Convert to Path"): Rect, Triangle, Line, Circle/Ellipse (**2 cubic segments only**, a poor approximation; BUG), Polygon/Polyline become `fabric.Path`. Transform, fill and stroke are kept. | 24868-24940 |
| Path Selection (`path-selection`, **A** in the catalog) | Click to select a vector object. | 24900-24916 |
| Direct Selection (`direct-selection`) | Converts to a path if needed, then opens the anchor/handle editor. | 24916 |
| Path edit overlay | `editSelectedVectorPath()`: a full-screen SVG with anchor circles (r 6) and control circles (r 4) for each `M/L/Q/C` point. Points can be dragged. Toggle off with the "Edit Path" button again (history "Edit Vector Path"). | 24942-24998 |
| Freeform Pen, Add/Delete Anchor, Convert Point | Unimplemented (18022-18024). | |

MISSING: Bezier handle creation while drawing; smooth/corner point conversion; add/delete anchors; Paths panel (work path, saved paths, clipping path); stroke path with a brush; fill path; make selection from path; make path from selection; vector masks; path operations; snapping to path anchors.

### 8.9 Boolean operations

MISSING entirely. There is no unite, subtract, intersect or exclude for shapes or paths, and no Pathfinder.

### 8.10 Raster to vector (Image > Trace to Vector..., 32087-32200)

Library: **imagetracerjs 1.2.6** (`https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js`, line 4594), loaded through the verified-runtime loader `_loadImageTracer` (4921).

| Dialog param | Range / default | Maps to ImageTracer option |
|---|---|---|
| Colors | 2-64, **16** | `numberofcolors` |
| Smoothing | 0-5, **0** | `blurradius` (and `linefilter: smoothing > 0`) |
| Detail | 0-64, **8** | `pathomit`. Note: **a higher "Detail" omits more paths**, so the label is inverted. |

Fixed options: `blurdelta:20, ltres:1, qtres:1, strokewidth:0, roundcoords:2, scale:1`.

Pipeline: the active image is downscaled to at most 1600x1600 px, traced to SVG, parsed with `fabric.parseSVGDocument`, and refused above 4000 paths. Shapes are scaled back by `1/scale * target.scale` and offset by `target.left/top`. They are grouped as "Traced", put on a new layer named `Traced (N colors)`, and **the source layer is hidden**. BUG: the target's `angle`, flips, skew and origin are ignored when the result is positioned.

MISSING: presets (posterized, detailed, artistic, black and white), centerline tracing, live preview, ignore-white option, potrace-style smoothing controls.

---

## 9. Transform features

### 9.1 Object (layer) transforms

| Feature | Trigger | Implementation | Lines |
|---|---|---|---|
| On-canvas transform handles | Move tool (**V**). Option "Show transform controls" (`select-transform`, default on). | Fabric 7 default controls: 8 scale handles plus rotate (`mtr`). Fabric defaults apply: proportional scaling by default, Shift toggles; Shift on a side handle skews. | 14066, 14050 |
| Free Transform (handles) | **Ctrl+T** (`freeTransform`) | Only re-enables controls with circle corners in the accent color. No bounding box, no commit/cancel. | 29964 |
| Free Transform... dialog | Edit > Transform > Free Transform... (`click-021`) | Sliders: Scale X 10-300 %, Scale Y 10-300 %, Rotation -180..180 deg, Skew X -60..60 deg, Skew Y -60..60 deg. Defaults are the current values. Has no live preview. | 24528-24551 |
| Skew... | Edit > Transform > Skew... (`click-022`) | Skew X/Y -60..60 deg | 24552-24572 |
| Perspective... | Edit > Transform > Perspective... (`click-023`) | **Fake**: the same Skew X/Y plus Scale X/Y sliders ("Use skew + scale to simulate perspective"). No 4-corner projective transform for objects. | 25346-25370 |
| Distort | | MISSING (no free 4-corner distort). | |
| Warp | | MISSING (no mesh/grid warp, no warp presets, no Puppet Warp). Liquify is the only deformation tool (see 9.11). | |
| Flip Horizontal / Vertical (object) | Image > Image Rotation (`click-040/041`), context menu | Toggles `flipX`/`flipY`. Command `object.flip`. | 19763-19784 |
| Rotate 90 CW / CCW (object) | Image > Image Rotation (`click-042/043`) | `active.rotate(angle +/- 90)`. Command `object.rotate`. | 19785-19797 |
| Nudge | Arrow keys = 1 px, Shift+Arrow = 10 px. **Alt+Arrow resizes** by changing scale. History coalesced. | | 25893-25950 |
| Numeric transform | Command `object.transform.set` exists in the registry (palette/macro). | | 18240+ |

MISSING: reference-point selector; numeric X/Y/W/H/angle fields in the options bar; Transform Again; interpolation choice; Content-Aware Scale; Puppet Warp; Perspective Warp; transforming pixel selections of a layer (Free Transform on selected pixels); maintain aspect toggle.

### 9.2 Canvas (document) transforms

All of these **flatten the document**: `_captureCanvasRaster()` is followed by `_replaceDocumentWithRaster()`, which calls `createNewDocument` and adds a single image, so every layer, text object, vector, mask and adjustment layer is lost. The user is warned first by `_confirmDocumentStateLoss` (8983).

| Feature | Trigger | Detail | Lines |
|---|---|---|---|
| Rotate Canvas 90 CW / CCW | Image > Canvas Rotation (`click-044/045`) | Command `canvas.rotate`. Flattens. | 27527-27555 |
| Flip Canvas H / V | `click-046/047` | Command `canvas.flip`. Flattens. | 27556-27581 |
| Arbitrary canvas rotation | | MISSING | |
| Crop | see 9.3 | Flattens. | |
| Perspective Crop | see 9.4 | Flattens. | |
| Flatten Image | | | 14711 |

MISSING: non-destructive canvas rotate/flip/crop that transforms every layer and keeps the layer structure.

### 9.3 Crop tool (`crop`, **C**; 17277-17431)

| Item | Detail |
|---|---|
| Initial box | Document bounds inset by 20 screen px. |
| Interaction | DOM overlay: 4 dimming panes, a box with 8 handles (`nw, ne, sw, se, n, s, w, e`), move by dragging inside. Minimum 20 px. |
| Ratio select `crop-ratio` | `free` (Freeform, default), `original` (Original Ratio), `1:1` (Square), `4:3`, `3:2`, `16:9`, `9:16` (Portrait), `5:4`, `2:3`, `custom` (behaves as free) |
| W / H fields | `crop-w`, `crop-h` (document px). On change, `setCropSize()` sets the box size. |
| Swap | `click-147` swaps the ratio and the box W/H. |
| Overlay | Rule of thirds only (lines at 33.33 % and 66.66 %). |
| Size label | `W x H` in document px. |
| Apply | Enter or the Apply button (`click-148`). Clamps to document bounds and runs command `canvas.crop {x,y,width,height}`, which rasterizes the region and **replaces the document (flatten)**. |
| Cancel | Escape or Cancel (`click-149`). |

MISSING: overlays (grid, diagonal, triangle, golden ratio, golden spiral, cycling with O); Straighten (draw-a-line level); rotate the crop box; Delete Cropped Pixels toggle (crop is always destructive and flattening); Content-Aware Fill for extended areas; crop presets with resolution; Shift-constrain; crop beyond the canvas (canvas extend); "Front Image" ratio; clamping while dragging (the box can leave the document and is clamped only at apply).

### 9.4 Perspective Crop (`perspective-crop`; 17465-17590)

| Item | Detail |
|---|---|
| UI | An SVG polygon with 4 draggable corner circles (r 7). The label shows the averaged output size. |
| Initial | Document bounds inset by `min(20, max(4, min(w,h)/10))`. |
| Output size | Average of opposite edge lengths in document px. |
| Math | 8-unknown homography solved by Gauss-Jordan with partial pivoting (`_solvePerspectiveSystem`); inverse mapping with **bilinear** sampling (`_perspectiveWarpCanvas`). |
| Apply | Enter. Command `canvas.perspective-crop {corners, width, height}`. **Flattens.** |

MISSING: grid overlay inside the quad, specifying output W/H/resolution, show-grid toggle.

### 9.5 Resize image and canvas

| Feature | Detail | Lines |
|---|---|---|
| Image > Resize Canvas | Dialog with Width and Height (1-8000; capped by the import limit). `_resizeCanvasDocumentRaw` **only changes the `__boundary__` rect and `canvasW/H`**. There is no anchor (content stays top-left aligned), no relative mode and no extension color. Command `canvas.resize`. | 19798-19830 |
| Image Size (resample) | **MISSING.** There is no document-wide image resize with resampling. | |
| Enlarge 2x / 4x (resample) | Image menu (`click-099/100`) runs `aiUpscale(factor)`. **Active image object only**: stepped 2x passes with `imageSmoothingQuality:'high'`, then an unsharp mask (blur 1 px, strength 0.5). Limit 16 MP. Document size is unchanged. | 32343-32437 |
| Enlarge 2x / 4x (AI model) | `aiSuperResolve` (Transformers.js). Active image only. | (AI section) |
| Resampling methods | None selectable. The only methods used are the browser's high-quality smoothing (upscale), bilinear (perspective crop) and nearest-neighbour (masks). | |

MISSING: Image Size dialog (W/H/%, resolution, constrain, resample method: Nearest, Bilinear, Bicubic, Bicubic Smoother/Sharper, Preserve Details/Lanczos); Canvas Size anchor grid, relative mode and canvas extension color; Trim (by transparent / top-left / bottom-right color); Reveal All; Content-Aware Fill / Scale / Move (the `content-aware-move` tool is unimplemented, 18022); Fit Image.

### 9.6 Align and distribute (24157-24200)

Align tab buttons (`click-168..173`) are mirrored in the Move tool options bar.

| Command | Arg | Behavior |
|---|---|---|
| Align Left / Center / Right | `left`, `centerH`, `right` | Uses `getBoundingRect()` of each active object. Needs **2 or more objects**. |
| Align Top / Middle / Bottom | `top`, `centerV`, `bottom` | same |
| Distribute H / V | `horizontal`, `vertical` | Equal **gaps** between the outer objects. Needs **3 or more**. |

Works on Fabric objects in the ActiveSelection, not on layers. MISSING: align to canvas/selection/key object; distribute by centers/edges; distribute spacing value; align layers (as opposed to objects); a single object aligned to the canvas.

### 9.7 Guides, rulers, grid, snapping

| Feature | Detail | Lines |
|---|---|---|
| Rulers | **Ctrl+R**. Two 20 px canvas strips. Step from `[1,2,5,10,20,50,100,200,500,1000,2000,5000]` with a 50 px or wider spacing. Units are document px only. Hidden under 1024 px width and in the mobile workspace. The preference `rulersVisible` (default true) persists. | 20925-20991 |
| Guides | View > Guides > Add Horizontal / Vertical (`click-114/115`), Clear All (`click-116`). **There is no drag-from-ruler.** A new guide appears at the middle of the viewport. Drag it to move; double-click it to delete. Saved in the project and history. | 24202-24247 |
| Guide coordinates | **BUG: guides are stored and positioned in screen px of `#canvas-area`** (`guide.pos`), so they do not follow zoom or pan. Snapping ignores guides. | 24203 |
| Grid | View > Show > Toggle Grid. Overlay canvas with spacing `gridSize` (preference, default **20**, 1-500) and major lines every 5 cells. Hidden when cells are under 4 screen px. | 20886-20923 |
| Pixel Grid | View > Show > Pixel Grid. Drawn only at zoom 8x or more. | 30567-30587 |
| Snap | View > Show > Toggle Snap to Grid (`snapEnabled`, default **off**). On `object:moving`: smart alignment first, then grid rounding. **Alt** suppresses snapping for that drag. Moving only; scaling and rotating never snap. | 6775-6789, 20993 |
| Smart guides | `_snapToAlignment`: targets are canvas edges and center plus every other visible object's left/center/right and top/middle/bottom. Tolerance = preference `snapTolerance` (default **5**, 0-100) / zoom. Draws `.smart-guide` DOM lines. Active **only when Snap is on**. | 23263-23324 |

MISSING: drag guides out of rulers; guides in document coordinates; lock/clear/new guide layout dialog; snap to guides, to layer bounds of pixel content, and to selection; snapping while resizing; distance/spacing (measurement) smart guides; ruler units (in/cm/mm/pt/%) and origin change; Show Extras toggle.

### 9.8 Measure tool (`measure`, catalog "Ruler Tool", **I** family; 23715-23737)

Click a first point, then a second. The result shows `"<dist>px / <angle>deg"` in the options bar (`measure-result`) and an on-canvas line with a label. Distance is in document px; the angle is `atan2(dy,dx)` in degrees. The overlay is in screen coordinates, so it does not follow pan or zoom.

MISSING: drag-to-measure, protractor (second leg), Straighten Layer from the measured line, measurement log, unit conversion, persistent measurements.

### 9.9 Symmetry (29978-30112)

View > Show > Symmetry: `off`, `horizontal`, `vertical`, `both`, `radial` (Radial = **6-fold**, fixed). Implementation: `_mirrorPath` clones each finished brush stroke path and reflects it about the canvas center (flipX/flipY plus mirrored left/top), or rotates copies by 60 deg steps around the center. The clones are then committed into the layer raster with the stroke.

MISSING: movable or rotatable symmetry axis; configurable radial segment count; mandala/mirror-radial; symmetry for shapes, clone and other tools; a live mirror preview while the stroke is in progress (the mirrors appear only after the stroke ends).

### 9.10 Transform Selection

Numeric only. See 7.4 (16604-16675).

### 9.11 Liquify (closest thing to warp; 30420-30495, markup 4059-4071)

A full-screen overlay works on the active image only. Tools (`liq-tool`): `push` (Forward Warp), `bloat`, `pucker`, `twirl-cw`, `twirl-ccw`. Size 10-200 (**60**), Pressure 10-100 (**50**), Density 10-100 (**50**). Reset, Cancel and Apply buttons.

MISSING: Reconstruct, Smooth, Freeze/Thaw mask, Face-Aware Liquify, mesh view, brush pressure from stylus.

### 9.12 Content-aware features

None for transforms. Content-Aware Move, Patch and Content-Aware Fill are not implemented (18021-18022). Spot Healing uses Telea fast-marching inpainting (26304), which belongs to retouching and is out of scope here.

---

## Appendix: bugs found in this scope (do not port)

| # | Bug | Lines |
|---|---|---|
| 1 | Duplicate handler key `"click-234"`: Select > Modify > Refine Edge... runs `groupLayers()`, so Refine Edge is unreachable from the UI. | 3203, 4170, 4296 |
| 2 | The ellipse marquee stores a rectangular selection (the ellipse is CSS only). | 15990, 16443 |
| 3 | Marquee bounds operator-precedence error (`left \|\| 0 - vpt[4]`) ignores pan. | 16141-16144 |
| 4 | Marquee mousedown wipes the existing selection, which breaks Add/Subtract/Intersect for marquees. | 15986 |
| 5 | Marching ants show only the bounding box (or an ellipse CSS radius), never the mask contour. | 599, 16925 |
| 6 | Group blend mode is stored but never rendered; group opacity is multiplied per child instead of compositing in isolation. | 13329, 14009 |
| 7 | Merge Down only moves object references (no pixel merge; the upper layer's blend and opacity are lost). Merge Visible flattens everything, hidden layers included. | 14545, 29972 |
| 8 | Crop, perspective crop, canvas rotate and canvas flip all flatten the document. | 14694, 17410, 27527 |
| 9 | Resize Canvas has no anchor and no resampling (it only changes the artboard size). | 19806 |
| 10 | Guides and the measure overlay are in screen px and do not track zoom or pan. | 24203, 23715 |
| 11 | Text effects Apply never records history. | 24506 |
| 12 | Layer Style: Outer Glow is ignored unless every Drop Shadow value is zero (single `fabric.Shadow`). | 27261-27266 |
| 13 | Inverse selection binarizes soft masks. | 16461 |
| 14 | Ellipse-to-path uses 2 cubic segments (a distorted ellipse). | 24881-24887 |
| 15 | Trace to Vector ignores the source angle, flips and skew; the "Detail" slider is inverted (it is `pathomit`). | 32140-32150 |
| 16 | Layer Via Copy/Cut pushes the new layer to the top of the stack, outside the group and without an id or kind. | 19704-19740 |
| 17 | Text on Path binds to the first path on the canvas, not a chosen path. | 25113-25117 |
| 18 | Triangle, Arrow and Star shape tools are absent from the runtime registry toolbar (only reachable by key: A for arrow; triangle and star have none). | 18039-18100, 29620 |
| 19 | Layer thumbnails are placeholders and never render content. | 14855 |


---

## 10. History, undo, snapshots, branches, recovery, dirty state

Source: `index.html` HISTORY section (18018-19325), SNAPSHOTS & BRANCHES (19325-19567), DOCUMENT section (6914-7365), AUTO-SAVE / RECOVERY (OPFS) (22200-23263), session object (5877-5886), blank workspace (6598-6662). Tests: `tests/session-model.test.js`.

### 10.1 Configuration constants

| Name | Value | Line | Notes |
|---|---|---|---|
| `maxHistory` | 120 | 6011 | Step ring size. User preference "History States" (Preferences > Performance, `#pref-hist`, min 10, max 200, clamp at 25495). Lowering it does not trim until the next push. |
| `maxHistoryBytes` | 192 MB | 6015 | Byte budget across all entries; oldest entries are evicted but at least 1 entry is always kept (19063). |
| `_historySchemaVersion` | 2 | 6016 | Stamped on each entry (`kind:'openshop-history-entry'`). |
| `_historyTileSize` | 64 | 6017 | Raster history is stored as 64x64 RGBA tiles. |
| `_historyCheckpointInterval` | 16 | 6022 | Every 16th entry (`(index+1) % 16 === 0`) stores a full pixel-state checkpoint. |
| `_historyTileDebug` | false | 6018 | When true, keeps `fullSnapshot` and asserts tile reconstruction after every restore. |
| `_commandSchemaVersion` | 1 | 6030 | Command objects `{schemaVersion:1, id, args}`. |
| `_maxSnapshots` | 30 | 19332 | Named states. |
| `_maxHistoryBranches` | 10 | 19333 | Auto-archived branches. |
| `_snapshotByteBudget` | 96 MB | 19336 | Shared by snapshots + branches; branches are evicted first, then oldest snapshots (keeps at least 1 snapshot). |
| Stale comment | "The 60-step ring" | 19326 | Comment is out of date (ring is 120). |

### 10.2 History entry model

Every history entry is a whole-document JSON snapshot (from `_captureDocumentState()`, see 13b) plus an optional raster delta. It is not a command/inverse-command undo stack.

| Field | Type | Meaning |
|---|---|---|
| `kind` | `'openshop-history-entry'` | Constant. |
| `schemaVersion` | 2 | `_historySchemaVersion`. |
| `action` | string (max 100) | Label shown in the History panel (for example "Open Image", "Object Modified", "Layer Opacity", "Play Action (N steps)"). Falls back to the command label. |
| `command` | normalized command or null | Present when the edit came through the command registry; used for macro recording. |
| `coalesceKey` | string (max 80) or null | Consecutive pushes with the same key replace the tip entry instead of appending (used by keyboard nudges: `nudge-move:<objectId>`, `nudge-resize:<objectId>`, lines 25941-25948). |
| `beforeSnapshot` | string or null | Document state before the edit, only stored when it differs from the previous entry's `snapshot` (transactions). Undo prefers it. |
| `snapshot` | string | Packed document JSON. When `pixelEdit` is true, every `image` object's `src` is set to `null` (pixels live in tiles). |
| `pixelEdit` | boolean | Caller opted into raster capture. `saveHistory()` defaults this to false; `_pushHistoryEntry()` defaults to true. |
| `pixelDelta` | `{version:1, tileSize:64, changes:[{id, width, height, tiles:[{x,y,width,height,data(base64 RGBA),hash}]} or {id, remove:true}]}` or null | Changed tiles vs previous pixel state, keyed by `_openShopObjectId`. |
| `fullSnapshot` | string or null | Only in tile debug mode. |
| `pixelCheckpoint` | map `objectId -> {width,height,tiles{"x:y":{width,height,hash,data}}}` or null | Full pixel state every 16th entry. |
| `byteSize` | number | Approximation: string lengths of snapshots + JSON length of delta + checkpoint key overhead (19048). |

Pixel capture (`_captureHistoryPixelSurfaces`, 18701): for each Fabric `image` object, reads the element into tiles with `getImageData`, hashes each tile with FNV-1a 32-bit (`_historyTileHash`, 18606), reuses unchanged tiles by hash, and supports a `dirtyRects` plan (`{objectId:[{x,y,width,height}]}`) so only tiles intersecting the dirty rectangles are re-read; unmentioned objects with unchanged dimensions reuse their previous tiles. Metrics in `_historyCaptureMetrics` (`mode`, `images`, `tilesRead`, `tilesReused`, `tilesEncoded`, `durationMs`). Helpers: `_historyDirtyRectForObject` (maps a canvas-space rect into image pixel space via inverse transform, padding 2 px), `_historyDirtyRectsForImage`, `_historyDirtyRectForObjects`.

Reconstruction (`_historyPixelsForIndex`, 18863): start from the nearest earlier checkpoint (or `_historyBasePixelState`), apply deltas forward. `_materializeHistorySnapshot` rebuilds each `src:null` image as a PNG data URL from tiles; throws "History tile data is missing for an image layer" if absent.

Baseline: `_initializeHistory(label)` (18920) clears the ring and captures a baseline snapshot + full pixel state. Baseline labels used: "Document Baseline" (default), "New Document", "Open Project", "Open OpenRaster", "Import PSD", "Recovered Project", "Opened Recovery Copy". The baseline appears as the first row of the History panel (index -1).

Eviction (`_evictOldestHistoryEntry`, 19047): shifts the oldest entry, folds its delta into the base pixel state, new baseline snapshot = next entry's `beforeSnapshot` or the dropped entry's `snapshot`, baseline label = dropped entry's action.

### 10.3 Write paths

| API | Line | Behavior |
|---|---|---|
| `saveHistory(action, {markDirty=true, command=null, coalesceKey=null, pixelEdit=false, dirtyRects=null})` | 19092 | No-op while a transaction is open or no document. Captures state, pushes, schedules collaboration broadcast. |
| `_pushHistoryEntry(...)` | 18975 | Skips if snapshot identical to cursor snapshot. If cursor is not at the tip, archives the future entries as a branch (10.6) then truncates. Applies coalescing, checkpoint, `maxHistory`, byte budget. Marks dirty, refreshes panel/status, records macro step if a command is present, schedules minimap/histogram refresh in one animation frame. |
| `_beginHistoryTransaction(command, {label, markDirty, recordMacro})` | 19099 | Saves full rollback state (history array copy, cursor, base state, dirty flags, persistence state, `beforeSnapshot`). Only one transaction may be open ("A document transaction is already active"). |
| `_commitHistoryTransaction()` | 19126 | Pushes one entry with `beforeSnapshot`. `pixelEdit` = `_commandTouchesPixels(command)`. |
| `_rollbackHistoryTransaction(error)` | 19139 | Reloads `beforeSnapshot`, restores every saved field, logs "Command rolled back". |
| `_executeCommand(command, {label, markDirty, recordMacro})` | 19170 | Normalize, begin transaction, invoke; sync or async. Result `false` = abandon transaction silently. Exception = rollback + toast "Could not <label>: <message>". If another transaction is active: toast "Another edit is still finishing - try again in a moment". |

### 10.4 Undo / redo / restore

| Item | Detail |
|---|---|
| Undo | `undo()` (19224). Target = `historyIdx-1`, snapshot = `entry.beforeSnapshot` or previous entry's `snapshot` or baseline. Toast "Nothing to undo". |
| Redo | `redo()` (19236). Target = `historyIdx+1`. Toast "Nothing to redo". |
| Jump | `_restoreHistory(index, snapshotOverride)` (19245), used by History panel rows. |
| Queue | `_enqueueRestore` (19215) chains restores on `_restoreChain` so key-repeat Ctrl+Z walks history instead of interleaving async `loadFromJSON` calls; each step resolves its target when it runs. |
| Restore | `_restoreHistoryNow` (19248): materialize tiles, `_loadDocumentState(json, {trusted:true})` (full canvas rebuild every time), set cursor, recompute pixel state, then `_restorePersistenceForSnapshot` (clean if equal to `_savedSnapshot`, which also clears autosave). Error toast "History restore failed: <msg>". |
| Shortcuts | Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo, Ctrl/Cmd+Y redo (29505-29512). Ignored when focus is in INPUT/TEXTAREA/SELECT. Edit menu Undo (`click-015`), Redo (`click-016`); command palette entries. |

### 10.5 History panel UI

`updateHistoryPanel()` (19270), container `#history-list` (`role="listbox"`, `aria-label="Undo history"`) inside panel group ptg3, tab "History" (default active tab of ptg3).

| State | Rendering |
|---|---|
| Blank workspace | One disabled option: "History begins after you open a document." (`data-state="blank"`). |
| Document | Row 0 = baseline label (`data-history-index="-1"`), then one row per entry with text = `action`. Classes: `history-item`, `current` (cursor), `future` (after cursor, also `aria-disabled="true"`). ARIA posinset/setsize, active descendant management via `_initPanelListbox` / `_setPanelListboxActive`. Click = jump. Auto-scrolls to bottom. |
| Not present | No thumbnails, no per-step delete, no "history brush", no step merge, no snapshot rows inside the panel (snapshots live in a separate dialog). |

Image Info dialog shows "History States: n / maxHistory" and "History Memory: x MB of 192 MB" (25437-25438).

### 10.6 Snapshots (named states) and branches

Both are session-only (memory). They are not saved into the project file, recovery, or preferences, and are not cleared when a different document is opened or the document is closed (`_initializeBlankWorkspace` and `createNewDocument` never reset `_snapshots` / `_historyBranches`), so a snapshot taken in one document can be restored into another. Treat as a defect.

| Feature | API / line | Detail |
|---|---|---|
| Name current state | `promptNameCurrentState()` 19451 | Modal "Name This State", intro "Snapshots are kept for this session and are not limited by the undo step count.", text input `#snap-name` maxlength 80 prefilled with last action (max 60 chars). Buttons Cancel / Save. |
| Create | `nameCurrentState(name)` 19389 | Empty name: toast "Give the snapshot a name". Entry `{id:'snapshot-<seq>', name, createdAt, action, thumbnail, snapshot}`; `snapshot` is a full (unpacked) `_captureDocumentState()` JSON. Thumbnail: PNG via `_captureExportRaster` scaled to fit 160 px, matte `#0d1117`. Toast "Saved snapshot \"X\"" or "...; N older entries were released to stay within the memory budget". |
| Rename | `renameSnapshot(id, name)` 19408 | API only; no UI button. Named snapshots only. |
| Delete | `deleteSnapshot(id)` 19415 | Removes from snapshots or branches. |
| Restore | `restoreSnapshot(id)` 19428 | Loads snapshot, then pushes a normal history entry "Restore \"name\"" (so it is undoable). Toast "Restored \"name\"". |
| Branch | `restoreSnapshot(id, {branch:true})` | First archives the current future (entries after cursor) as a branch, truncates, loads, pushes "Branch from \"name\"". |
| Automatic branch | `_archiveHistoryBranch(entries, reason)` 19373 | Called whenever an edit is made after undo (the redo future would otherwise be lost). Branch `{id:'branch-<seq>', name:'N step(s) after "<lastAction>"', reason, createdAt, entries (the raw history entries), snapshot (tip entry snapshot), tipLabel}`. |
| Budget | `_enforceSnapshotBudget` 19358 | Max 10 branches, 30 snapshots, 96 MB (string lengths only; tile deltas inside archived entries are not counted). |
| Manager dialog | `showSnapshotManager()` 19468; Edit > "Snapshots & Branches..." (`click-225`), palette "Name This State...", "Snapshots & Branches..." | Title "Snapshots & Branches"; intro "Named states you kept, and every line of work an edit-after-undo moved aside. Both are held for this session only." Two sections "Named states" (empty: "No named states yet.") and "Branches" (empty: "No branches - nothing has been undone and then edited over."), newest first. Row: 48 px thumbnail (snapshots only), name, "<tipLabel or action> . <age>" (age "Ns ago"/"Nm ago"/"Nh ago"), buttons Restore / Branch / Delete. Footer: "Name This State", "Close". |

Defect to avoid in the rewrite: a branch's `snapshot` is the tip history entry's packed snapshot; when that entry was a pixel edit its images have `src:null`, and `restoreSnapshot` loads it without `_materializeHistorySnapshot`, so restoring such a branch loses the raster content. Branch restore also cannot replay the intermediate archived entries; only the tip state is restorable.

### 10.7 Dirty state, persistence state, save gating

| Field | Meaning |
|---|---|
| `_isDirty` | User-visible unsaved flag; drives `beforeunload`, title "* ", discard prompts. |
| `_autoSaveDirty` | Recovery generation is stale. |
| `_documentRevision` | Incremented on every `_markDocumentDirty()` and every history restore; used to detect edits during an async save. |
| `_documentGeneration` | Incremented when the document is replaced (`_advanceDocumentGeneration`), cancelling compute jobs and discarding stale async imports ("...discarded because the document changed"). |
| `_savedSnapshot` | JSON string of the last saved state; history restore to an identical state marks clean and clears autosave. |
| `_persistenceState` | `clean` / `dirty` / `saving` / `saved` / `error`; labels "All changes saved", "Unsaved changes", "Saving...", "All changes saved", "Save failed" (7049). Shown in status bar `#persistence-state[data-state]` + `#persistence-state-label`; error message in its title. |
| Document title | `${dirty ? '* ' : ''}${docName or 'Untitled'}${' (Saving)' or ' (Save failed)'} | OpenShop v0.31.0`. |
| `beforeunload` | 6743: prevents unload when `_isDirty` (unless offline runtime replacement is in progress). A second listener (22250) broadcasts recovery `release`. |
| Discard prompt | `_confirmDiscardUnsaved(action, {title, message, saveLabel, onSave, onDiscard})` (9023). Title "Discard unsaved changes?", message "<action> will discard edits you have not saved. This cannot be undone.", buttons Cancel / "Save first" (runs `saveProject()`, only proceeds if save returned true) / Discard (danger). Used by New, Templates, Open Image/Place-to-open, Open Project, Open PSD, PDF, SVG, ORA, RAW (via open path), launched/shared files, dropping PSD/project, `closeDocument`. |
| Structural loss prompt | `_confirmDocumentStateLoss(action)` (8983) for crop/flatten/rotate/flip: "<action> discards part of this document" listing guides, animation frames, "PSD group metadata used by PSD export". |
| Runtime replacement | `_confirmOfflineRuntimeReplacement` (9122): Save writes and verifies an acknowledged recovery generation (two passes if edits landed), Discard clears the lineage's recovery. |

### 10.8 Save Project (explicit save)

`saveProject()` (12243), menu File > "Save Project (.openshop)" (`click-013`), Ctrl/Cmd+S, palette "Save Project", Export Settings "Save Project" button, discard prompt "Save first".

1. Serializes with `_captureDocumentState()`; failure sets state `error`.
2. If a `FileSystemFileHandle` is held (`_projectFileHandle`, from a previous save or a launched `.openshop` file) it overwrites it silently. On write error the handle is dropped.
3. Else `showSaveFilePicker` with suggested name `<docName>.openshop`, types `application/vnd.openshop+json: .openshop`, `application/json: .json`. Cancel restores prior state.
4. Else downloads a Blob named `openshop-project.openshop` (ignores doc name).
5. If edits happened during the write: toast "Saved snapshot; newer edits remain unsaved" and stays dirty. Otherwise clears this lineage's recovery generations, marks clean with state `saved`, toast "Project saved".

Missing: no "Save As" / "Save a Copy" command (once a handle exists, there is no way to choose a new file), no "Revert", no "Close" UI (`closeDocument({force})` exists, 7216, API only).

### 10.9 Recovery storage (OPFS auto-save)

Storage is the Origin Private File System only. There is no IndexedDB or localStorage fallback; if `navigator.storage.getDirectory` is missing, autosave is disabled entirely.

| Item | Value |
|---|---|
| Directory | OPFS `openshop-recovery-v1/` (`_recoveryDirectoryName`) |
| Index file | `index.json`: `{kind:'openshop-recovery-index', schemaVersion:1, updatedAt, snapshots:[entry]}`; entry = `{filename, generationId, documentId, ownerId, leaseExpiresAt, name, label, revision, createdAt, checksumAlgorithm, checksum, size}` |
| Generation file | `recovery-<documentId>-<generationId>.json` |
| Envelope | `{kind:'openshop-recovery', schemaVersion:1, generationId:'generation-<24 hex>', documentId, ownerId:'tab-<24 hex>', leaseExpiresAt:now+65000, name, label, revision, createdAt (ISO), checksumAlgorithm:'sha256' (or 'fnv1a-32' without SubtleCrypto), checksum, payload:<document JSON string>}` |
| Legacy | OPFS root `openshop-autosave.json` (bare document JSON); migrated on startup into a generation labelled "Migrated legacy autosave" with ownerId `legacy`, then deleted. |
| Interval | `setInterval(_autoSave, 30000)` (22324). Also flushed immediately after a document load completes if dirty (8821). No flush on `visibilitychange`/`pagehide` (up to 30 s of work can be lost). |
| Preconditions | Skipped mid-load (`_documentLoadDepth`), when not dirty, or while an explicit save is in flight. |
| Retention | 5 generations per document, 30 total (newest kept). |
| Atomic write | Write `.tmp-write-<token>.json`, read back and compare, `move()` to final name (or rewrite), read back final and compare, delete temp. Then rewrite index the same way, then delete pruned files (22375, 22658). |
| Worker fallback | If main-thread write fails, a Blob worker using `createSyncAccessHandle` repeats the staged write; acknowledgement timeout 30 s (23098-23172). |
| Lock | `navigator.locks.request('openshop-recovery-index-v1', {mode:'exclusive'})` around list+write, rename, clear. |
| Multi-tab | `BroadcastChannel('openshop-recovery-v1')` messages `{type:'claim'|'saved'|'release', tabId, documentId, name}`; claims re-sent every 20 s; owner lease 65 s. If another live tab owns the document id, this tab adopts a new id (old one kept as alias) and toasts "Another tab owns that recovery stream; this tab will save a separate copy". |
| Lineage | `_documentId` plus `_documentIdAliases` (max 20). `_clearAutoSave({documentIds, recoveryFilename})` deletes generations of the lineage owned by this tab or matching the active recovery source file, plus the legacy file. |
| Validation on read | Envelope kind/schema, checksum match, `JSON.parse(payload)`, `_sanitizeProjectJSON`. Failures become `corrupt` records (still listed, exportable). |
| Startup check | `_checkAutoSaveRecovery()` during init (6816): offers the newest valid generation (any document, any tab). If only corrupt ones exist: toast "Only corrupt recovery generations were found. Open Recovery Storage to export or discard them." |

Startup prompt `_offerRecovery` (22967): title "Recover Unsaved Work?", message "A verified recovery generation is available." or (fallback) "The newest generation is corrupt. This is the newest verified older generation.", meta "<label or name> . <local time>", buttons Discard (deletes that generation) / "Open as Copy" / Restore.

Restore (`_restoreRecoveryText`, 23017): waits for in-flight autosave, captures rollback, loads with `fitToViewport`, history re-initialized ("Recovered Project" or "Opened Recovery Copy"), file handle cleared, marked dirty. "Open as Copy" adopts a new document id and appends " Copy" to the name. On failure: previous document restored, toast "Recovery failed: <msg> - previous document restored". History, snapshots, and branches are not recoverable (payload is the document only).

Recovery Storage manager (`showRecoveryManager`, 22752; command palette "Recovery Storage" only, no menu item):

| Element | Content |
|---|---|
| Summary `dl` | Storage (Available/Unavailable), Durability (Durable / Best effort / Unknown), Generations, Restorable, Other active tabs, Storage Used (`usage / quota`). |
| Durability note | Persisted: "This origin is persisted, so the browser will not evict recovery data to reclaim space."; Safari: "Safari deletes this data after seven days without a visit. Keep recovery data, or install OpenShop to your Home Screen or Dock, to stop that."; else "The browser may delete recovery data when it needs space. Keep recovery data to ask it not to."; unknown: "This browser does not report whether recovery data is protected from eviction." Button "Keep recovery data" (calls `navigator.storage.persist()`). |
| Per generation card | Name (label or name), status Corrupt / Legacy / Verified, meta "<age> . <time> . <size> . <W x H . N layers . schema S>", hidden details (Document ID, Generation, Revision, Checksum first 16 chars, Owner), rename input (max 100) + "Save Name" (rewrites as a new generation), buttons Preview (toggle details), Export (`<label>.openshop`, or `<label>-corrupt-envelope.json` for corrupt raw text), Discard, "Open as Copy", Restore. |
| Footer | "Request Durable Storage" (if not persisted), "Discard All", Close. |

### 10.10 Session model (workspace vs document)

`OS.session` (5877) separates application/workspace state from the document scene; `_captureDocumentState()` never includes it (tested in `session-model.test.js`), and older project `workspace` keys are ignored on load.

| Key | Default | Synced by |
|---|---|---|
| `application` | `{id:'openshop', version:'0.31.0', ready:false}` | boot |
| `workspace` | `{layout:'default', mode:'standard'}`; modes `standard`, `essentials`, `motion`, `mobile`; persisted in localStorage `os_workspace_mode` | `setWorkspaceMode` |
| `tool` | `{selectedId:'select'}` | `_syncSessionWorkspace` (6203) |
| `document` | `{activeId:null, openIds:[], name:null}`; single-document only (openIds max 1) | `_syncSessionDocument` |
| `viewport` | `{zoom:1, transform:[1,0,0,1,0,0]}` | `_syncSessionWorkspace` |
| `panels` | `{visible:true, activeTabs:{ptg1:'ptg1-layers', ptg2:'ptg2-color', ptg3:'ptg3-history'}}` | `togglePanels` |
| `preferences` | `{language:'en', theme:'default'}` | `_syncSessionWorkspace` |
| `persistence` | `{state:'clean', dirty:false}` | `_setPersistenceState` |

Blank workspace (`_initializeBlankWorkspace`, 6598): no document, history panel shows the blank message, `_captureDocumentState()` throws "No active document". `closeDocument({force})` keeps tool, language, theme, zoom and viewport, waits for in-flight autosave, and clears only the closed lineage's recovery generations. Only one document per window; no tabs/multi-document.

Document ids: `_newDocumentId(prefix)` = `<prefix>-<12 hex from randomUUID>` (fallback base36 time + sequence); `_coerceDocumentId` strips to `[A-Za-z0-9_-]`, max 100.

---

## 11. Automation

Source: command registry `_getCommandRegistry()` (18228-18573), `_normalizeCommand` (18574), ACTION / MACRO RECORDING (30957-31071), batch processing (11515-11821). There is no scripting language or script console (the separate plugin system, 32594+, is out of scope here).

### 11.1 Command object

`{schemaVersion:1, id:string, args:object}`. `_normalizeCommand(command, {allowSequence})` rejects wrong schemaVersion ("Unsupported command schema"), unknown ids ("Unknown command: <id>"), nested `macro.sequence` when `allowSequence:false` ("Nested action sequences are not supported"), and runs the definition's `validate(args)` which returns a cleaned args object (ids reduced to `[A-Za-z0-9_-]` max 100; numbers range-checked "<name> is out of range"; commands without args reject any args "Command does not accept arguments").

### 11.2 Registered commands (recordable)

| id | Label | Args (validation) | touchesPixels | Emitted by UI (line) |
|---|---|---|---|---|
| `layer.add` | New Layer | `layerId` req, `name` (max 120, default "Layer") | no | 14333 |
| `layer.group` | Group Layers | `groupId`, `layerIds[]` (1..512, unique), `parentId?`, `name` | no | 14194 |
| `layer.ungroup` | Ungroup Layers | `groupId`, `childIds[]`, `parentId?` | no | 14227 |
| `layer.adjustment.add` | Add Adjustment Layer | `layerId`, `afterLayerId?`, `adjustment` (levels/curves/hsl normalized) | yes | 14365 |
| `layer.adjustment.update` | Update Adjustment Layer | `layerId`, `adjustment` | yes | 14387 |
| `layer.adjustment.apply` | Apply Adjustment Stack | none | yes | 14412 |
| `layer.delete` | Delete Layer | `layerId` | no | 14437 |
| `layer.rename` | Rename Layer | `layerId`, `name` | no | 14639 |
| `layer.opacity.set` | Layer Opacity | `layerId`, `opacity` 0..100 | no | 14602 |
| `layer.blend.set` | Layer Blend | `layerId`, `blend` in source-over, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity | no | 14623 |
| `layer.visibility.set` | Layer Visibility | `layerId`, `visible` | no | 14588 |
| `layer.lock.set` | Layer Lock | `layerId`, `locked` | no | 14913 |
| `layer.move` | Reorder Layers | `layerId`, `toIndex` 0..512, `parentId?` | no | 14104, 14137 |
| `object.transform.set` | Transform Object | `objectId`, `left`/`top` (+-300000), `scaleX`/`scaleY` (+-1000), `angle` (+-36000), `flipX`, `flipY` | no | canvas `object:modified` (6690) |
| `object.rotate` | Rotate Object | `objectId`, `degrees` +-3600 | no | 19794 |
| `object.flip` | Flip Object | `objectId`, `axis` h/v | no | 19770, 19781 |
| `filter.apply` | Apply Filter | `objectId`, `name` in Grayscale, Invert, Sepia, BlackWhite, Sharpen, Emboss | yes | 18000 |
| `image.adjust` | Adjust Image | `objectId`, brightness/contrast/saturation -100..100, hue -180..180, blur 0..100 | yes | 17750 |
| `canvas.resize` | Resize Canvas | `width`, `height` 1..30000 + canvas ceiling | no | 19821 |
| `canvas.flatten` | Flatten | none | yes | 14713 |
| `canvas.crop` | Crop | `x`,`y` +-30000, `width`,`height` 1..30000 | yes | 17442 |
| `canvas.perspective-crop` | Perspective Crop | `corners[4]{x,y}`, `width`, `height` | yes | 17583 |
| `canvas.rotate` | Rotate Canvas | `degrees` in 90, -90, 180, -180 | yes | 27548 |
| `canvas.flip` | Flip Canvas | `axis` h/v | yes | 27576 |
| `frame.add` / `frame.duplicate` | Add / Duplicate Frame | none | no | 30692, 30710 |
| `frame.remove` / `frame.select` | Remove / Select Frame | `index` 0..9999 | no | 30749, 30760 |
| `macro.sequence` | Play Action | `commands[1..200]`, each normalized with `allowSequence:false` | if any child does | playMacro, batch |
| tool ids from `_toolCatalog()` | tool labels | no args | no | Registered (`_toolCommandDefinitions`, 18123) for the command palette; never recorded because tool switches do not push history. |

Not recordable (missing): brush/pencil/eraser strokes, shapes, text creation/edits, selections, gradients, fills, most filter dialogs with parameters (only the six fixed filters), Curves/Levels dialogs (except via adjustment layers), transforms other than object transform, AI operations, imports, exports. Recorded steps target concrete object/layer ids from the recording document.

### 11.3 Recording

| Item | Detail |
|---|---|
| Panel | `#macro-panel` (floating, toggled by View > Actions/Macros `click-118` and palette "Actions / Macros"). Header "Actions" + red recording indicator. List `#macro-list` rows "N. <command label>". Buttons Record/Stop (`click-204`), Play (`click-205`), Clear (`click-206`), Save (`click-207`), Load (`click-208`). |
| Toggle | `toggleMacroRec()`: toast "Recording actions..."; on stop "Recorded N steps". |
| Capture rule | `recordMacroStep(command)` (30976) is called from `_pushHistoryEntry` only when an entry was actually pushed (no-op edits are not recorded), recording is on, playback is not running, and the command normalizes with `allowSequence:false`. Commands inside a transaction are recorded once at commit. |
| Clear | Toast with Undo (9 s) "Cleared N recorded action(s)". |
| Edit | No step reorder, delete, enable/disable, parameter edit, or "insert stop"; no multiple named actions/sets. |

### 11.4 Action file schema: `openshop-command-sequence`

Written by `saveMacro()` (31028) as pretty JSON (2-space) download `openshop-action.json`, MIME `application/json`:

```json
{
  "kind": "openshop-command-sequence",
  "schemaVersion": 1,
  "appVersion": "0.31.0",
  "commands": [ { "schemaVersion": 1, "id": "layer.opacity.set", "args": { "layerId": "layer-...", "opacity": 50 } } ]
}
```

Reader `_parseMacroPayload` (31045) accepts either that envelope (kind and schemaVersion must match) or a bare array of commands; max 200 commands; each normalized (`allowSequence:false`); errors "Unsupported action file" or the validation message. `loadMacro()` accepts `.json`, 10 MB limit ("Action file exceeds 10 MB limit"), replaces the current list, toast "Loaded N actions" or "Invalid action file: <msg>".

### 11.5 Replay (atomic)

`playMacro()` (31002): refuses if empty ("No actions recorded") or already playing. Wraps the steps in one `macro.sequence` command executed via `_executeCommand` with label "Play Action (N steps)" and `recordMacro:false`. Each child runs through `_invokeCommand`; nested `saveHistory` calls are suppressed by the open transaction, so the whole playback is one history entry. A child returning `false` throws "Command <id> could not be applied"; any error rolls back the entire document and history to the pre-playback state and toasts "Could not play action: <msg>". Success toast "Action complete". Replay targets the recorded ids, so playing on a different document usually fails with "Command target layer/object no longer exists" (only batch remaps ids).

### 11.6 Batch processing

Entry: File > "Batch Export..." (`click-010`) opens dialog "Batch Processor" (`batchExport()`, 11515).

| Control | Detail |
|---|---|
| Intro | "Drop a folder of images, apply a saved action recipe, and download one ZIP." (no actual drop target; it is a file input) |
| Images | `#batch-files` file input, `accept="image/*"`, `multiple`, `webkitdirectory` (folder picker) |
| Action recipe | `#batch-recipe`, `.json` (an `openshop-command-sequence` file), required |
| Output | `#batch-format`: PNG / JPEG / WebP |
| Help | "Raster inputs only: SVG, AVIF, RAW, and project files are rejected. PNG keeps transparency; relative folder paths are preserved in the ZIP." |
| Buttons | Cancel, "Export current canvas formats...", "Process folder" (toasts "Choose an image folder first", "Choose an action recipe JSON file first") |

`runBatch(files, recipe, {format='png', quality=0.92, onProgress})` (11767):

| Rule | Value / message |
|---|---|
| Concurrency | One batch at a time ("A batch is already running"). |
| Max files | 500 (`maxBatchFiles`) "Batch exceeds the 500-file limit" |
| Max input | 1 GB total "Batch inputs exceed the 1 GB size limit" |
| Max output | 2 GB cumulative "Batch output exceeds the 2 GB size limit" (fails that file) |
| Formats | png, jpeg, webp only ("Batch output must be PNG, JPEG, or WebP"); quality fixed 0.92 (no UI); JPEG matte `#ffffff`; no scale/resize/metadata options |
| Recipe | `_parseBatchRecipe` = `_parseMacroPayload` + non-empty ("Batch recipe is empty") |
| Input refusal | Non-`image/*` type: "Batch input is not an image"; SVG/AVIF/RAW: "Batch processor currently accepts raster images only"; 100 MB per image; canvas limits |
| Per file | Creates a fresh document (`createNewDocument(..., {resetProject:true})`), adds the image, history "Batch Image", remaps commands (`_remapBatchCommands`: every `objectId` -> the target image, `layerId`/`afterLayerId` -> active layer, `layer.add` ids replaced with fresh ids and later references mapped), executes one `macro.sequence` labelled "Batch recipe (N steps)", captures raster via `_captureExportRaster` (ICC embedded, metadata policy default strip-location). |
| Failure | Per-file errors collected in `result.failed[{name, error}]`; batch continues. Status `completed`, `completed-with-failures`, or `cancelled`. Toast "Processed N image(s) into a ZIP (M failed)" (warning when failures). |
| Cancellation | Progress dialog "Processing batch" with `<progress>` and status "i/total: <file> - N failed", button "Cancel batch" -> "Cancelling...", "Finishing the current file and restoring the open document...". Checked between stages (`_batchCheckCancelled`) and per ZIP entry. If cancelled, no ZIP is produced ("Batch cancelled; no partial files were ready"). Cancelling during ZIP assembly surfaces as "Batch processing failed: Batch cancelled". |
| Restore | The previously open document is restored from `_captureRollbackState()` in `finally`. |
| Result object | `{blob, processed[], failed[], format, recipeCommands, cancelled, status}` |

ZIP structure (`_zipBatchEntries`, 11703; also used for ORA export): stored (method 0, no compression), UTF-8 flag 0x0800, CRC-32, DOS timestamp = now, no ZIP64 (so effectively limited to 4 GB and 65535 entries), yields every 8 entries. Entry names from `webkitRelativePath` (backslashes to `/`, each segment sanitized to `[A-Za-z0-9._-]`), extension replaced by `.png` / `.jpg` / `.webp`, collisions suffixed `-2`, `-3`. Download name `<recipe file base>.zip` (fallback `openshop-batch.zip`). No manifest or error report is written inside the ZIP.

Defects to avoid in the rewrite: each batch file calls `createNewDocument({resetProject:true})`, which clears the open document's recovery generations (7180-7185); the rollback reloads the document but not its history (history panel ends up showing the last batch file's entries); with a blank workspace the rollback state is null and the last batch image stays open.

Multi-format export of the current canvas (`_batchExportFormats` / `doBatchExport`, 11560-11626): dialog "Export Current Canvas" with checkboxes PNG, JPEG, WebP, AVIF, SVG, PDF (all checked). Runs `saveFile(fmt)` / `exportPDF()` sequentially with default options, one download per format; toast "Exported N formats" or "Exported N of M formats - see console for failures". PSD, ORA, GIF are not offered.

---

## 13. Import / export

Source: FILE I/O section (7365-12426), PSD IMPORT (12426-13757), PDF EXPORT incl. PSD/ORA export (20031-20694), EXPORT SETTINGS (27285-27447), animation timeline GIF export (30864-30955), palettes/assets (28907-29449), portable decoders (5180-5385), runtime asset manifest (170-190, 4512-4670), `docs/FORMATS.md`.

### 13.1 Global import limits (`_importLimits`, 6101-6134)

| Key | Value | Key | Value |
|---|---|---|---|
| maxJsonBytes | 10 MB (projects, actions, SVG, recipes) | maxImageBytes | 100 MB |
| maxImagePixels | 80,000,000 | maxImageDimension | 30000 px (also limited by a measured browser canvas ceiling, `_canvasDimensionFailure`) |
| maxProjectObjects | 5000 | maxProjectLayers | 512 |
| maxORAEntries | 640 | maxORALayerBytes | 64 MB |
| maxORATotalBytes | 100 MB | maxORADecodedBytes | 512 MB |
| maxPaletteColors | 256 | maxPresets | 200 |
| maxAssetBytes | 64 MB | maxABRTipBytes / Pixels | 512 KB / 128x128 |
| maxABRStrokePixels | 2048x2048 | maxGradientStops | 256 |
| maxTextLength | 10000 | maxGifFrames | 300 |
| maxDecodedGifBytes | 512 MB | maxAnimationFrames | 300 |
| maxDecodedAnimationBytes | 512 MB | maxPdfPages | 512 (also <= maxProjectLayers-1 = 511) |
| maxDecodedPdfBytes | 512 MB | maxColorProfileBytes | 4 MB |
| maxMetadataBytes | 1 MB | maxAIMasks | 32 |
| maxLayerMaskBytes | 8 MB | maxSmartObjectBytes | 8 MB |
| maxBatchFiles | 500 | maxBatchInputBytes / OutputBytes | 1 GB / 2 GB |

### 13.2 Third-party libraries (pinned, SRI sha384, fetched from cdn.jsdelivr.net and verified before use)

| Purpose | Package@version | Load |
|---|---|---|
| Canvas/scene, SVG parse/serialize | fabric@7.4.0 | boot |
| PSD read/write | ag-psd@31.0.2 | boot + verified worker copy (`psdDecoder`) |
| PDF export | jspdf@4.2.1 (boot), svg2pdf.js@2.7.0 (lazy, vector pages) | |
| PDF import | pdfjs-dist@6.2.108 (module + worker) | lazy |
| RAW | libraw-wasm@1.6.0 | lazy |
| GIF decode/encode | modern-gif@2.1.0 (+ worker) | lazy |
| AVIF decode/encode | @jsquash/avif@2.1.1 | lazy (~3.5 MB) |
| JPEG XL decode | @jsquash/jxl@1.3.0 | lazy fallback |
| HEIC decode | @discourse/heic@1.0.0 | lazy fallback |
| C2PA verify | @contentauth/c2pa-web@0.13.4, c2pa-wasm@0.11.2, highgain@0.1.0, ts-deepmerge@8.0.0 | lazy, only when a marker is detected |
| Raster-to-vector | imagetracerjs@1.2.6 | lazy (not I/O) |

### 13.3 Import routing

`_describeImportFormat(file)` (9884) classifies by MIME and extension, in order: ora, psd, project (`application/vnd.openshop+json`, `.openshop`, `.json`), raw, pdf, gif, apng, webp, avif, jxl, heic, svg, else raster. Placeable formats: raster, gif, apng, webp, avif, jxl, heic, svg. Non-placeable formats (psd, ora, project, pdf, raw) always open as a new document.

Intents (`_resolveImportIntent`, 9913): `open`, `place`, `paste`, `drop`. `drop` -> `place` if placeable and a document is open, else `open`. `place`/`paste` with no document -> `open`.

| Entry point | Detail |
|---|---|
| File > New (`click-001`) | New Image dialog (13.13). |
| File > Open Image (`click-002`) | `showOpenFilePicker` with description "Images, OpenRaster, PDF, and RAW", accept `image/*` (png, jpg, jpeg, webp, gif, apng, avif, jxl, heic, heif, bmp, svg), `image/openraster .ora`, `application/pdf .pdf`, RAW `.cr2 .cr3 .nef .arw .dng .raf .rw2 .orf .srw .pef .raw`; fallback hidden `#file-input` (4122). Embedding host with `overrideOpen` gets `openshop:open-requested` instead. |
| File > Place Image (`click-237`) | Same picker with intent `place` ("Place an image"). Placed raster is scaled to 80% of canvas width if wider, positioned at (50,50), added to the active layer (or a new layer if the active layer is an adjustment layer). History "Place Image". |
| File > Open PSD (`click-003`) | Discard prompt, then `#psd-input` (`accept=".psd"`). |
| File > Open Project (`click-014`) | Discard prompt, then `#project-input` (`.openshop,.json,application/vnd.openshop+json,application/json`). |
| Drag and drop | Window-level dropzone (`initDropzone`, 28737) shows `#dropzone-overlay` while dragging Files; `handleDrop` opens only the first file (toast "Opening X; N other file(s) ignored"). History labels "Drop Image"/"Drop SVG". PSD/project drops show the discard prompt. |
| Clipboard paste | `paste` listener (28760): first `image/*` clipboard item is loaded with intent `paste` (history "Paste Image", toast "Image pasted from clipboard"). Text/SVG markup/HTML pastes are ignored. Ctrl+V uses the internal clipboard first if it holds content. Copy writes `image/png` to the system clipboard via `ClipboardItem` (29734). |
| PWA file handlers | Manifest `file_handlers` for png, jpg/jpeg, webp, gif, apng, avif, jxl, heic, heif, svg, bmp, ora, psd, pdf, many RAW extensions; `launchQueue` consumer opens the first file (toast "OpenShop opens one launched document per window; using the first file"). A launched `.openshop` keeps its file handle for Ctrl+S. |
| PWA share target | POST `./?share=target` multipart `files`; service worker stores up to 8 files (128 MB each, 256 MB total, 30 min TTL) in IndexedDB `openshop-share-v1`/`payloads`; page reads `?share=ready&share_id=share-...`, opens only the first file. |
| Manifest shortcuts | `./?action=new`, `./?action=open` are declared but no code reads `action` (missing). |
| Embed bridge | postMessage protocol `openshop:hello/ready/configure/configured/open/opened/export/exported/error` (21241-21415). |
| Recent files | 13.14 (display only, cannot reopen). |
| Missing | "Open as Layers" (multi-file into layers), multi-file open, TIFF/TGA/ICO/EXR/HDR/DDS/QOI import, URL import. |

### 13.4 Per-format import

| Format | Detect | Decoder / path (line) | Limits and behavior |
|---|---|---|---|
| PNG, JPEG, BMP, static WebP, static GIF | MIME `image/*` or extension | `_loadRasterFile` (10031): FileReader data URL -> `fabric.FabricImage.fromURL` | 100 MB file, 80 MP, 30000 px. EXIF orientation (JPEG) is read (`_readExif`), neutralized in a copy, and baked into pixels (toast "Rotated to match the photo's EXIF orientation"). Embedded ICC profile (JPEG APP2, PNG iCCP (zlib inflate), WebP ICCP, AVIF colr) parsed; matrix/TRC profiles converted to sRGB or Display P3 (`_colorManagedImageFromSource`), toast "<profile> converted to sRGB for editing"; on failure conversion = `profile-unconverted`. EXIF/XMP read from JPEG APP1, PNG `eXIf`/`iTXt XML:com.adobe.xmp`, WebP `EXIF`/`XMP `. C2PA marker check. Open: new document sized to image, layers Background + "Layer 1" (image goes into Layer 1), history "Open Image". |
| APNG, animated WebP | `image/apng`/`.apng`, `image/webp`/`.webp` | `_importImageDecoderFrames` (10396) using WebCodecs `ImageDecoder` | Fallback to static first frame if `ImageDecoder` missing (toast for APNG) or any error ("Animated import unavailable - <msg>. Loading the first frame instead."). Max 300 frames, 512 MB decoded, consistent frame size required. Delays from frame duration clamped 10..60000 ms (default 83 ms = 12 fps). ICC conversion per frame. Open: frames go to the animation timeline and the timeline panel opens; toast "Imported N <fmt> frames with timing". Place: first frame becomes the object; frames/delays retained as `_openShopAnimation {format, policy:'first-frame-static', frames, delays}`. |
| Animated GIF | `image/gif`/`.gif` | `_importGifFrames` (10490) with modern-gif decode + verified worker | Max 300 frames, 512 MB decoded. Delays from GIF (default 83). Same open/place behavior. Single-frame GIF uses static path. |
| AVIF | `image/avif`/`.avif` | `_loadAvifFile` (10314): always the pinned WASM decoder (`_decodeAvif`, 8-bit), dimension cross-checked against `ispe` box | ICC conversion; EXIF/XMP not read for AVIF (metadata = C2PA only). No native decode attempt. Animated AVIF not supported (first image). |
| JPEG XL | `image/jxl`/`.jxl` | `_loadPortableImageFile` (5319): native `ImageDecoder`/`createImageBitmap` first, fallback WASM `@jsquash/jxl` | `_lastPortableDecodePath` = native or wasm. 100 MB. |
| HEIC/HEIF | `image/heic`, `image/heif`, `*-sequence`, `.heic/.heif` | Same: native then `@discourse/heic` WASM | First image only of a sequence. 100 MB. |
| SVG | `image/svg+xml`/`.svg` | `_loadSVGFile` (9984): 10 MB limit, sanitized (`_sanitizeSVG`: strips `<script>`, `on*` attributes, any `href` not `#`/relative/`http(s):`/`blob:`/`data:image/`), `fabric.parseSVGDocument` | Max 5000 shapes; "That SVG contains no drawable shapes". Open: document sized to SVG width/height if 1..30000, else current/none. All shapes are wrapped in one `fabric.Group` named "SVG" added as a new layer named after the file. Unsupported constructs are dropped silently by Fabric (no structured SVG loss report). |
| Camera RAW | `.3fr .arw .cr2 .cr3 .dcr .dng .erf .gpr .iiq .kdc .mef .mos .mrw .nef .nrw .orf .pef .raf .raw .r3d .rw2 .rwl .sr2 .srf .srw .x3f` | `_loadRAWFile` (9711) LibRaw WASM: `halfSize:false, useCameraWb:true, useCameraMatrix:3, outputColor:1 (sRGB), outputBps:8, userQual:3, useFujiRotate:-1` | 100 MB. 16-bit output scaled to 8-bit. Stores `_lastImportRaw {make, model, width, height, iso, timestamp}`. Always opens a new document ("Opening a RAW photo"). No develop/raw settings dialog (missing). |
| PDF | `application/pdf`/`.pdf` | `_loadPDFFile` (9786) pdf.js with `isEvalSupported:false, useWorkerFetch:false, stopAtErrors:true, maxImageSize:80 MP` | 100 MB; pages 1..511; document size = page 1 at scale 1 (72 dpi points as px); every page rasterized to PNG, fit (downscale only) and centered on page-1 size; page 1 goes into "Layer 1" renamed "Page 1", other pages each become a new layer "Page N". Decoded budget W*H*4*pages <= 512 MB. History "Open PDF". Toast "Opened N PDF page(s) as layers". Loss `pdf.rasterized-page` (fixture). No page-range picker, no resolution choice, no vector/text import (missing). |
| PSD | `.psd`, `image/vnd.adobe.photoshop` | 13.5 | |
| OpenRaster | `.ora`, `image/openraster`, `application/openraster`, `application/x-openraster`, `application/ora` | `_loadORAFile` (10113) | 13.7 |
| OpenShop project | `.openshop`, `.json`, `application/vnd.openshop+json` | `_loadProjectFile` (12359) | 10 MB JSON limit (applies to the whole project file, which embeds all image data; large projects cannot be reopened - defect). See 13b. |

Color profile import context (`_colorProfileImportContext`, 9694): Open targets sRGB (or Display P3 when the profile is P3 and the canvas supports `colorSpace:'display-p3'`); Place/paste converts into the document's current working space.

C2PA (8026-8100): marker sniff (JPEG APP11 0xEB segment, or ASCII "c2pa", "jumbf", "cabx" anywhere). If found, lazily loads the verifier, reads manifest store and active label, stores `{detected, status: valid|invalid|error, ...validation_status}` in image metadata, summarized as "Content Credentials: valid / validation failed / validation unavailable". Read-only; exports never sign.

### 13.5 PSD import (worker)

Limits `_psdLimits` (12427):

| Limit | Value |
|---|---|
| maxFileBytes | 256 MB ("PSD exceeds 256 MB import limit") |
| maxPixels / maxDimension | 80 MP / 30000 px (plus canvas ceiling) |
| maxLayers | 256 (including groups; nesting depth <= 80) |
| maxLayerPixels | 80 MP per layer |
| maxDecodedBytes | 256 MB aggregate decoded/transferred pixels |
| totalMemoryLimit | 256 MB (passed to ag-psd, which defaults to 2 GB) |
| supportedDepths | 8, 16 (16-bit downconverted) |
| supportedColorModes | 3 (RGB only). Others rejected with structured loss `psd.unsupported-color-mode` (path `document.colorMode`, feature e.g. "CMYK", fallback "Import requires an 8-bit RGB document."). Bit depth outside 8/16: `psd.unsupported-bit-depth`. Channels 1..8. |

Pipeline (`_loadPSDFile`, 13688): compute job group `psd-import` (a newer import cancels an older one); modal "Importing PSD" with file name, status line and "Cancel Import" (danger) button. Header read/validated on the main thread; verified ag-psd bundle loaded into a Blob Worker; worker parses structure only (`skipLayerImageData`-style lazy decode), pre-sums planned layer pixel bytes and rejects before allocating, then decodes layer bitmaps on demand ("Decoding pixels off the UI thread..."), transfers ArrayBuffers. Progress messages: "Reading file...", "Verifying PSD decoder...", "Initializing verified PSD decoder...", "Checking layer budget...", "Decoding pixels off the UI thread...", "Validating decoded memory...", "Committing document...". No timeout; cancel terminates the worker.

Per-node unsupported features detected in the worker: layer effects, layer mask, adjustment layer, smart object, vector content (vectorMask/vectorFill), clipping, fill opacity != 1, rich text styles. If any of layer effects / layer mask / adjustment layer / clipping / fill opacity occurs anywhere, the whole document is imported as one flattened composite layer (`psd.flattened-composite`); if no composite exists, `psd.missing-composite`. Smart objects / vector content / rich text use their decoded per-layer pixels. Simple single-style horizontal text becomes editable Fabric text. Groups become live OpenShop groups; group data also kept in `interchange.psd` for export. Blend modes mapped (`_psdBlendToCanvas`): normal/pass through -> source-over, darken, multiply, color burn, lighten, screen, color dodge, overlay, soft light, hard light, difference, exclusion, hue, saturation, color, luminosity; others (e.g. linear dodge) preview as Normal and keep the original mode for re-export (`psd.blend-mode`). Embedded ICC (image resource 1039) parsed and converted (`psd.icc-managed` / `psd.icc-unparsed`). Commit (`_commitPSDImport`, 13551) is transactional with full rollback of the previous document on failure; history baseline "Import PSD"; toast "PSD imported: N layers"; compatibility report "PSD import compatibility" shown. Image resolution resource is not read on import (the document stays at 96 PPI).

Loss codes (`_analyzePSDImport`, 13084): `psd.group-opacity`, `psd.group-blend`, `psd.unsupported-<reason>` (e.g. `psd.unsupported-layer-mask`, `psd.unsupported-smart-object`), `psd.blend-mode`, `psd.flattened-composite`, `psd.missing-composite`, `psd.icc-managed`, `psd.icc-unparsed`, `psd.unsupported-color-mode`, `psd.unsupported-bit-depth`.

### 13.6 Compatibility report (structure and UI)

Report object: `{format:'openshop'|'psd'|'ora', direction:'import'|'export', accepted:boolean, warnings:[string], losses:[{code, path, feature, fallback, message}], ...}` (PSD also `flattenWholeDocument`, `iccProfile*`; ORA also `width`, `height`, `layerCount`; OpenShop also `sourceVersion`, `targetVersion`, `steps`). Capped at 100 warnings / 100 losses, de-duplicated by path+code+message.

Examples of loss wording:

| code | path | feature | fallback |
|---|---|---|---|
| psd.unsupported-layer-mask | `Effects / Masked photo` | layer mask | the document composite is the safe fallback |
| psd.blend-mode | `Effects / Masked photo` | linear-dodge blending | The editor previews the layer as Normal and preserves the original mode for PSD export. |
| psd.flattened-composite | document | document-wide compositing | Imported composite appearance is preserved as one editable raster layer. |
| psd.export-compatibility | `Photo` | masks were baked into pixels | parsed from the export warning text after `;`, else "The layer was rasterized or omitted according to the export warning." |
| ora.group-flattened | `layer[Group]` | Layer group | OpenRaster has no portable group hierarchy in this baseline; child layers were written at the stack root. |
| openshop.invalid-document | document | document validation | The active document remains unchanged. |

Dialog `_showFormatCompatibilityReport` (13274): shown only if there are warnings or losses. Title (e.g. "PSD import compatibility", "PSD export compatibility", "OpenRaster compatibility"). Intro: rejected -> "The file was not opened; the current document was left unchanged."; flattened -> "Appearance was prioritized through a flattened fallback."; ORA -> "OpenRaster layers remain editable; the exceptions below were flattened or mapped to a supported baseline."; else "Supported layers remain editable; the exceptions below use explicit pixel fallbacks." Summary "N structured compatibility loss(es) recorded." Then a bullet list of the warning strings only (path/feature/fallback columns are not shown as a table). One button "Continue". No export of the report, no "do not show again". OpenShop project imports never show this dialog (only a toast). Raster/SVG/PDF exports have no report dialog; their warnings appear only in the Export Settings impact list.

### 13.7 OpenRaster import / export

Import (10113): file <= 100 MB; custom ZIP reader (10574): rejects multi-disk, ZIP64, encryption, non-UTF-8 names, unsafe paths, duplicates, methods other than 0/8 (deflate via `DecompressionStream('deflate-raw')`), CRC mismatch; `mimetype` must be the first stored entry with content `image/openraster`; <= 640 entries, <= 64 MB per entry, <= 100 MB aggregate, <= 512 MB decoded pixels; `stack.xml` UTF-8, DOCTYPE/ENTITY rejected, root `image` with integer `w`/`h`. Layers: PNG `src` under `data/` only; `x`,`y`, `opacity`, `visibility`, `composite-op` (svg:src-over, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, hue, saturation, color, luminosity, plus, dst-in, dst-out, src-atop, dst-atop). Nested stacks are flattened into individual layers with inherited opacity/visibility (`ora.group-flattened`); text elements, non-PNG sources, unknown elements/attributes are recorded as losses (`ora.text-unsupported`, `ora.vector-unsupported`, `ora.unsupported-element`, `ora.unsupported-*-attribute`, `ora.blend-fallback`, `ora.invalid-opacity`, `ora.invalid-visibility`, `ora.group-blend-fallback`, `ora.group-isolation-fallback`); if no layers, `mergedimage.png` is imported (`ora.merged-fallback`). Max 511 layers. New document with locked Background + imported layers; history "Open OpenRaster"; report always shown. Resolution (`xres`) not imported.

Export (`_exportORA`, 20561; File > Export As > "OpenRaster (.ora)", `click-233`): stored ZIP with `mimetype`, `stack.xml` (version 0.0.6, `w`, `h`, `xres`/`yres` from document resolution), `data/layer<N>.png` cropped to layer bounds with x/y offsets, `mergedimage.png`, `Thumbnails/thumbnail.png` (max 256 px). Groups flattened; text/vector rasterized; masks and filters baked; adjustment layers rasterized; empty "Background" layer skipped. Defect: the blend-support check passes the canvas blend name to the ORA-op parser, so every non-normal blend produces a spurious `ora.blend-fallback` loss even though `stack.xml` writes the correct `svg:` op; `exclusion` is actually written as `svg:src-over`.

### 13.8 Export formats

| Menu (File > Export As) | Handler | Output | Options / notes |
|---|---|---|---|
| PNG (`click-004`) | `saveFile('png')` | `<docName>.png` | Defaults: scale 1, transparent, ICC embedded (iCCP), no EXIF/XMP. |
| JPEG (`click-005`) | `saveFile('jpeg')` | `<docName>.jpg` | Quality 0.92, matte `#ffffff`, ICC APP2, metadata policy strip-location (EXIF with GPS IFD pointer zeroed, XMP location elements removed). |
| WebP (`click-006`) | `saveFile('webp')` | `.webp` | Quality 0.92, alpha, ICC via ICCP/VP8X; EXIF/XMP stripped. Still image only. |
| AVIF (`click-219`) | `_exportAVIF` (11420) | `.avif` | Pinned WASM encoder (`_encodeAvifImageData`), quality 0.92, attempts ICC `colr` box insertion (`_embedAVIFICCProfile`); EXIF/XMP stripped. |
| SVG (`click-007`) | `_exportSVG` (11502) | `.svg` | `canvas.toSVG` at document size, sanitized. Raster objects embedded as data URIs. No layer/group semantics, no options. |
| PDF (`click-008`) | `exportPDF({matte, vector, deliver})` (20065) | `.pdf` | Single page sized `px * 72 / documentResolution` points. Vector (svg2pdf) when `_documentIsVector()` (no image objects, no pattern fills, at least one visible object); else one PNG image (matte white, FlateDecode "SLOW"). Properties title/creator "OpenShop"/subject "WxH px at N DPI", language from `<html lang>`. No options dialog, no multi-page (PDF-imported page layers export as one flattened page), no CMYK/PDF-X. |
| PSD (`click-009`) | `exportPSD()` (20653) | `.psd` | ag-psd `writePsd(structure, {trimImageData:true, noBackground:true})`; resolution resource from document PPI; layer tree reconstructed from live groups and `interchange.psd`; single-style text in a single-object layer stays editable; ranged/mixed text, vectors rasterized; masks/filters baked; smart object / PSD vector stay raster; original PSD blend preserved if unchanged; ICC embedded (image resource) or loss `psd.icc-embed-failed`; orphaned layers omitted with warning; report dialog "PSD export compatibility". |
| OpenRaster (`click-233`) | `_exportORA` | `.ora` | 13.7 |
| GIF | `exportGIF()` (30895), Animation timeline button (`click-203`) | `<docName>.gif` | Requires >= 2 timeline frames ("Add at least 2 frames"). Per-frame delays (fallback from fps input `#tl-fps` 1..60, default 12). modern-gif encoder, `maxColors:255`, frame size from frame 1. On encoder failure falls back to a PNG spritesheet `openshop-spritesheet-<cols>x<rows>-<fps>fps.png`. No loop count, dither, palette, or optimization options. |
| Project | `saveProject()` | `.openshop` | 10.8, 13b |
| Missing | | | Animated WebP / APNG export (FORMATS.md implies WebP animation export; none exists), TIFF, BMP, ICO, HEIC, JXL export, export of selection/layer/artboard slices, "Export layers to files", "Quick Export", per-format presets, multi-page PDF. |

File naming `_exportFileName(format)` (10569): `docName` with characters outside `[A-Za-z0-9_-]` replaced by `_`, default `openshop-export`; `jpeg` -> `.jpg`. Delivery via `<a download>` data URL, or `deliver(blob, name)` callback, or embed host `openshop:save-requested` when `overrideSave` is set.

Raster capture (`_captureExportRaster`, 10749): normalizes options (`_normalizeExportOptions`, 10673): format png/jpeg/webp/avif; quality 0.01..1 (default 1 for PNG, 0.92 others); scale 0.01..4; width/height checked against canvas ceiling; matte must be `#rrggbb`; `metadataPolicy` in preserve/strip/strip-location (default strip-location). Renders with identity viewport, hides selection overlays (`_hideNonExportableObjects`), the checkerboard boundary is hidden (transparent) or filled with matte. Records `_lastRasterExportReport {format, profileEmbedded, profileName, profileBytes, metadataPolicy, metadataAction, metadataFields, metadataWarnings}`.

### 13.9 Export Settings dialog

File > "Export Settings..." (`click-011`), palette "Export Settings"; `showExportSettings(initialFormat='png')` (27286).

| Control | id | Default | Behavior |
|---|---|---|---|
| Format buttons | `#es-png`, `#es-jpeg`, `#es-webp`, `#es-avif` | PNG (or `initialFormat`) | Only these four formats. |
| Quality | `#es-quality` range 1..100 + "%" | 92 | Hidden for PNG. |
| Scale | `#es-scale` select | 1x (Original) | Options 1x (Original), 0.5x (Half), 2x (Double), 0.25x (Quarter). No custom size/DPI/resample method. |
| Preserve transparent pixels | `#es-transparent` checkbox | checked | JPEG: forced off and disabled, help text "JPEG always uses a matte"; previous choice remembered when switching back. Others: "PNG, WebP, and AVIF can preserve alpha". |
| Matte | `#es-matte` color | `#ffffff` | Row shown when transparency is off; note "Fills transparent pixels". |
| Metadata | `#es-metadata` | "Strip location only (recommended)" (`strip-location`) | Options: `preserve` "Preserve imported EXIF/XMP", `strip` "Strip all metadata". |
| Size estimate | `#es-size` | | `<w>x<h> - Est. ~<KB/MB>` using bytes-per-pixel 3 or 4 times ratio PNG 0.5, JPEG 0.1, AVIF 0.06, WebP 0.08 (heuristic, not a real encode). |
| Preview | `#es-preview` | | Debounced 60 ms; thumbnail fit to 300x100; AVIF previews as PNG proxy; label "<FMT> . alpha preview" or "<FMT> . matte #xxxxxx"; error "Preview unavailable: <msg>". |
| Export impact | `#es-impact` `role="status"` | | Heading "Export impact" + bullet list from `_getExportImpact` (below). |
| Project state | `#es-project-state` | hidden unless dirty | "Unsaved editable project changes remain after export." + "Save Project" button. |
| Buttons | | | Cancel, Export (disabled while running; dialog closes on success). |

Defect: `_doExportSettings` passes `metadataPolicy` to `saveFile`, but `saveFile` (11398) and `_exportAVIF` do not forward it to `_captureExportRaster` / `_metadataExportPlan`, so every export uses `strip-location`; "Preserve" and "Strip all metadata" are ignored (privacy-relevant: "Strip all" still writes non-location EXIF/XMP). The rewrite must honor the selection.

Export impact warnings (`_getExportImpact`, 11332), exact templates:

| Condition | Text |
|---|---|
| Raster/PDF, >1 content layer | "N editable layers will be flattened into one image." |
| Raster/PDF, text | "N text object(s) will no longer be editable." |
| Raster/PDF, vectors | "N vector object(s) will be rasterized." |
| Raster/PDF, masks | "N mask(s) will be baked into pixels." |
| SVG, >1 layer | "OpenShop layer names, order metadata, locks, and blend settings are not stored as editable project layers in SVG." |
| SVG, filters | "N filtered image object(s) may be embedded as raster content." |
| PSD | "N single-style text layer(s) will remain editable in PSD.", "N text object(s) with per-range formatting will be rasterized in PSD because PSD text layers support one style.", "N text object(s) will be rasterized because its layer contains mixed content.", "N vector object(s) will be rasterized by the current PSD exporter.", "N OpenShop mask(s) will be baked into layer pixels.", "N imported PSD group(s) will be reconstructed." |
| ORA | text/vector/mask/filter/adjustment rasterization lines and "N imported PSD group(s) will be flattened because OpenRaster groups are not retained by this exporter." |
| Animation | "Only the current canvas is exported; N animation frames remain in the project." |
| JPEG | "JPEG has no alpha channel; transparent pixels will use the selected matte color." |
| Alpha off | "Transparency is disabled; transparent pixels will use the selected matte color." |
| ICC unparsable | "The embedded ICC profile could not be parsed; pixels remain in the browser fallback colour space and the original bytes are retained." |
| ICC converted | "Pixels were converted from <profile> to sRGB/Display P3 (<conversion>)." |
| AVIF + ICC | "The verified AVIF encoder cannot embed ICC payloads; the export is tagged by the report as unprofiled." (contradicts `_exportAVIF`, which does try to embed; reconcile in the rewrite) |
| C2PA | "Imported Content Credentials are read-only provenance; OpenShop does not sign or re-sign exports." |
| Metadata | preserve + non-JPEG: "<FMT> cannot carry imported EXIF/XMP APP1 metadata; it will be stripped."; preserve + JPEG: "Imported EXIF/XMP metadata will be preserved in the JPEG export, including location fields."; strip: "All imported EXIF/XMP metadata will be stripped from this export."; strip-location: "Imported EXIF/XMP metadata will be exported with GPS and location fields removed." |
| Always | "History, selections, guides, and other project-only editing state are not included in this export." |
| Dirty | "This export does not save the editable project; unsaved project changes will remain." |

### 13.10 Metadata and ICC on export

| Topic | Behavior |
|---|---|
| Metadata storage | `_imageMetadata {version:1, sourceFormat: jpeg|png|webp|avif|null, exif{orientation, make, model, dateTime, software, artist, description, lensModel, hasGps, gps{latitude, longitude, altitude}}, xmp{title, description, creator, createDate, modifyDate, hasLocation}, exifSegment, xmpSegment, c2pa}`; raw segments kept as data URLs (<= 1 MB each). Set only on Open (not Place). |
| Plan | `_metadataExportPlan(format, policy)` (10875): `strip` -> `stripped-all`; no source -> `no-source-metadata`; non-JPEG -> `stripped-unsupported-format` with warning; JPEG -> `preserved-selected`, fields `['EXIF','XMP']`, rebuilt APP1 segments inserted after SOI after removing existing APP1 (`metadata-injection-failed` on error). Location stripping: EXIF GPS IFD pointer (tag 0x8825) set to 0; XMP elements/attributes GPSLatitude/Longitude/Altitude, Location, City, State, Country, CountryCode, Address removed by regex. |
| ICC | Every PNG/JPEG/WebP export embeds an ICC profile: the document's imported profile when it matches the working space, otherwise a generated matrix sRGB or Display P3 profile (`_makeMatrixICCProfile`). AVIF and PSD attempt embedding. No user option to omit or choose a profile, no soft-proofing, no CMYK. |
| Orientation | Pixels are pre-rotated on import; exported EXIF keeps the original orientation tag when preserved (risk of double rotation in viewers; the rewrite should reset orientation to 1). |

### 13.11 Asset imports (Color > Swatches > Import)

`importPalette()` (29435, `click-184`): accept `.json,.gpl,.ase,.abr,.grd`, 64 MB limit; errors "Could not read that asset - <msg>".

| Format | Parser | Result / limits |
|---|---|---|
| GPL (GIMP) | `_parseGimpPalette` | Header "GIMP Palette", RGB lines; max 256 colors; appended to saved palette (`os_palette`, max 256). |
| ASE (Adobe) | `_parseAsePalette` | Signature ASEF; color entries 0x0001 in RGB, CMYK, Gray, LAB; groups ignored. |
| JSON palette | `readPaletteFile` | Array of hex or `{colors:[...]}`; only `#rrggbb` accepted. Export palette: `openshop-palette.json` `{name:'OpenShop Palette', colors}` (`click-183`). |
| ABR brushes | `_parseAbrBrushes` | Signature 8BPS, versions 1, 2, 6 only; up to 200 brushes, tip <= 128x128 grayscale alpha; name "<file> N"; spacing 25, opacity 100, pressureSize true; always reports unsupported "native ABR descriptors, native ABR sample compression, native ABR dynamics" in the toast. Stored in localStorage `os_brushes`. |
| GRD gradients | `_parseGrdGradients` | Signature 8BGR; v3 full parse (color models RGB, HSB, CMYK, Lab, Gray; transparency stops approximated into rgba); v5 heuristic scan of RGBC descriptors (max 16 colors, one gradient); max 200 presets, 256 stops; all imported as linear; stored `os_gradients`; first gradient auto-selected. |
| Presets (adjustment) | `importPreset` / `exportPresets` (32567-32593) | JSON, sanitized by `_safePreset` (brightness/contrast/saturation/hue/vibrance clamped +-300), max 200; `os_presets`. |
| Settings bundle | Preferences Export/Import (25607-25608) | `openshop-settings.json` `{kind:'openshop-settings', version:1, ...}` covering prefs, palette, brushes, gradients, presets, theme, language. |
| Missing | | ACO, ACT, Procreate/Krita brushes, PAT patterns, ASL styles, CUBE LUTs, fonts. |

### 13.12 Place / Open semantics summary

| Case | Result |
|---|---|
| Open raster with document open | Discard prompt, then a new document replaces the current one (single-document app). |
| Place raster | Added to active layer at (50,50), scaled to 80% width if larger than canvas; color converted to working space; metadata of placed file is not stored. |
| Place animated | First frame + embedded animation payload (`_openShopAnimation`). |
| Place SVG | New layer containing an editable Group. |
| Place PSD/ORA/PDF/RAW/project | Not supported; routed to Open (replaces document). |
| Smart-object placement / linked files | Not via Place (smart objects exist only via "Convert to Smart Object"). |

### 13.13 New document and templates

New Image dialog (`newImage()`, 7255):

| Control | Default | Detail |
|---|---|---|
| Presets | | 1920x1080, 1280x720, 1080x1080, 800x600, 4K (3840x2160), A4 300dpi (210x297 mm), Letter 300dpi (216x279 mm), 6x4in photo (6x4 in @300) |
| Units `#ni-unit` | Pixels | px / mm / in; switching converts the typed values. |
| Resolution `#ni-dpi` | 96 PPI | 1..2400. Stored as `_documentResolution` (used by PSD resolution resource, PDF page size, ORA xres). Not saved in the project file (defect: reopening resets to 96). |
| Width / Height | 1920 / 1080 | max = `maxImageDimension` (30000). |
| Pixel size readout | | "W x H px" or "... - exceeds measured ceiling". |
| Browser ceiling | | `_canvasLimitSummary()`. |
| Background `#ni-bg-mode` | Transparent | Transparent / White / Custom colour (`#ni-bg`, default `#ffffff`). |
| Buttons | | Cancel / Create. Success toast "Created W x H canvas (Wmm x Hmm at N PPI)". |

Every new document has layers "Background" (locked; holds the checkerboard boundary object `__boundary__` and an optional "Background Fill" rect) and "Layer 1" (active). No color mode, bit depth, or color profile choice (missing).

Templates (`templates`, 6138; File > "Templates..." `click-012` and the welcome screen grid). Template creation does not set resolution (stays at the previous value).

| Category | Name | Size | Icon |
|---|---|---|---|
| Video | HD 1080p | 1920x1080 | 16:9 |
| Video | 4K UHD | 3840x2160 | 4K |
| Social | Instagram Post | 1080x1080 | IG |
| Social | Instagram Story | 1080x1920 | IS |
| Social | Facebook Cover | 820x312 | FB |
| Social | Twitter Header | 1500x500 | X |
| Social | YouTube Thumb | 1280x720 | YT |
| Social | LinkedIn Banner | 1584x396 | LI |
| Print | A4 Portrait | 2480x3508 | A4 |
| Print | A4 Landscape | 3508x2480 | A4L |
| Print | Letter | 2550x3300 | LTR |
| Print | Business Card | 1050x600 | BC |
| Web | Web Banner | 728x90 | AD |
| Web | Favicon | 512x512 | ICO |
| Web | Open Graph | 1200x630 | OG |
| Display | Wallpaper QHD | 2560x1440 | QHD |

Template cards are buttons with aria-label "<name>, W by H pixels". Missing: user-defined templates/presets, template content (only blank sizes).

### 13.14 Recent files

`populateRecentFiles()` / `trackRecentFile(name, w, h)` (20848-20884): localStorage `openshop_recent`, array of `{name, dims:'WxH', date:toLocaleDateString()}`, newest first, 10 stored, 5 shown on the welcome screen under "Recently opened" as a plain list (a record, not reopenable; no file handles stored). Tracked on New Image, Open Image (open intent, including RAW, AVIF, JXL, HEIC, GIF), PDF, ORA, PSD, project load. Not tracked for templates, Place, paste, or recovery. Missing: reopen via persisted `FileSystemFileHandle` (IndexedDB), clear list, pin.

---

## 13b. OpenShop project file format

Extension `.openshop` (`.json` also accepted). MIME `application/vnd.openshop+json`. Encoding: UTF-8 JSON, single line (no indentation), all binary data embedded as data URLs. Current `schemaVersion` 3 (`_documentSchemaVersion`, 5921). The fixtures in `tests/fixtures` are v1 and v2 and are migrated to v3 on load.

### 13b.1 Top-level keys (writer `_captureDocumentState`, 8446)

| Key | Type | Content |
|---|---|---|
| `kind` | `"openshop-document"` | Required discriminator; anything else is treated as a legacy Fabric envelope. |
| `schemaVersion` | integer | 3 on write; 1..3 accepted. |
| `appVersion` | string | `OS.version` ("0.31.0"). Informational only. |
| `migratedFrom` | string | Only on documents converted from the legacy envelope. |
| `document` | `{id, name}` | `id` `[A-Za-z0-9_-]` max 100 (e.g. `document-<12 hex>`); `name` max 100. |
| `canvas` | `{width, height, fabric}` | Integers within canvas ceiling; `fabric` = Fabric.js 7.4.0 `canvas.toJSON(_fabricDocumentProperties)` output `{version, objects:[...]}`; must contain an `objects` array. Objects with `excludeFromExport` (overlays) are not in the layer mapping; the checkerboard `__boundary__` rect is serialized. |
| `layers` | array (1..512) | Bottom-to-top order. See 13b.2. |
| `active` | `{layerId, objectIds[]}` | Active layer and selected object ids. |
| `guides` | `[{orientation:'horizontal'|'vertical', position:number}]` | |
| `selection` | `{bounds:{x,y,w,h}|null, mask:EncodedMask|null}` | Pixel selection. |
| `animation` | `{frames:[data:image/... strings], delays:[ms], activeFrameIndex}` | Timeline frames as full PNG data URLs; delays clamped 10..60000, default 83. |
| `metadata` | `{colorProfile, image, aiMasks}` | `colorProfile` = `{name, sourceKind, iccData:'data:application/vnd.openshop.icc;base64,...'|null, colorSpace:'srgb'|'display-p3'|'icc-rgb', workingSpace, conversion, description, matrix, curves, valid}` (ICC <= 4 MB); `image` = image metadata (13.10); `aiMasks` = `[{id, label, sourceKind, mask:EncodedMask}]` max 32. |
| `interchange` | `{psd: {schemaVersion:1, groups:[{id, parentId, order, name, hidden, opacity 0..1, blendMode, opened}], warnings[]} | null}` | PSD group metadata for faithful PSD re-export; parent cycles are detached with a warning. |
| `compatibility` | report object | Export-direction compatibility report written at save time (informational). |
| `workspace` | (legacy only) | Ignored on load. |

Not stored (missing vs. FORMATS.md claim that the project preserves "history-related state"): undo history, snapshots, branches, recorded actions, document resolution (PPI), view/zoom, export settings, last-used tool.

### 13b.2 Layer object

| Field | v1 | v2/v3 | Notes |
|---|---|---|---|
| `id` | yes | yes | De-duplicated on load. |
| `name` | yes | yes | Max 120. |
| `visible` | yes | yes | Default true. |
| `locked` | yes | yes | Locked layers make their objects non-selectable. |
| `opacity` | yes | yes | 0..100. |
| `blend` | yes | yes | Canvas composite name (`source-over`, `multiply`, `screen`, ...), max 40 chars. |
| `kind` | optional (`group`) | `pixel` / `group` / `adjustment` | Migration 1->2 fills `pixel`. |
| `parentId` | optional | string or null | Group parent. |
| `collapsed` | optional | boolean | Groups only. |
| `adjustment` | | `{type:'levels'|'curves'|'hsl', version:1, params, cacheKey}` | Levels `{black 0..254, white, gamma 0.1..4}`, HSL `{hue +-180, saturation +-100, lightness +-100}`, Curves `{points: up to 16 [x,y]}`. |
| `psd` | | `{sourceId, parentId, order, sourceKind:'bitmap'|'text'|'adjustment'|'smart-object'|'vector'|'empty', originalBlendMode, importedCanvasBlend, text:{content, fontFamily, fontSize 1..2000, fillColor, transform[6], simple}}` or null | PSD round-trip metadata. |
| `objectIds` | yes | yes | References `_openShopObjectId` values in `canvas.fabric.objects`; groups always `[]`. Each object is claimed by at most one layer; unclaimed objects go to the active (or first non-group) layer. |

### 13b.3 Fabric object extensions (`_fabricDocumentProperties`, 5980)

Serialized custom properties: `name`, `excludeFromExport`, `globalCompositeOperation`, `_openShopObjectId`, `_openShopBaseOpacity`, `_hasMask`, `_isArrow`, `_openShopAdjustmentBaseSrc`, `_openShopAdjustmentLayers`, `_openShopLayerMask`, `_openShopMaskBaseSrc`, `_openShopSmartObject`, `_openShopTextFeatures`, `_openShopOriginalText`, `_openShopTextOnPath`, `_openShopTextDirection`, `_openShopAnimation`.

| Extension | Shape |
|---|---|
| `_openShopLayerMask` | `{version:1, enabled, feather 0..100, density 0..100, mask:EncodedMask}`; encoded string <= 8 MB. |
| `_openShopSmartObject` | `{version:1, kind:'image', source:'data:image/(png|jpeg|webp|gif|bmp);base64,...' (<= 8 MB), sourceName, sourceWidth, sourceHeight, revision}` |
| `_openShopTextOnPath` | `{version:1, text, features, pathObjectId, style:{fontFamily, fontSize, fill, stroke, strokeWidth, fontWeight, fontStyle, opacity, charSpacing}}` |
| `_openShopTextFeatures` | `{ligatures, smallCaps, tabularNumbers}` |
| `_openShopTextDirection` | `ltr` / `rtl` |
| `_openShopAnimation` | `{format, policy:'first-frame-static', frames[2..300 data:image], delays[]}` |
| Text `styles` | Per-range styles, normalized by `_normalizeTextRangeStyles` (migration 2->3). |
| Image `src` | Must be `data:` or `blob:` on untrusted load ("Project references a non-embedded asset URL"). |

EncodedMask: `{width, height, encoding:'coverage-v1', data:'data:application/vnd.openshop.selection;base64,<w*h bytes, 0..255 coverage>'}`. Legacy `bitset-v1` (1 bit per pixel, LSB first) is still decoded. Byte length must equal exactly w*h (or ceil(w*h/8)) else "Project selection data is truncated"; pixel count <= 80 MP.

Embedded data URL MIME types: `data:image/png|jpeg|webp|gif|bmp;base64` (pixels, frames, smart sources), `application/vnd.openshop.icc`, `application/vnd.openshop.exif`, `application/vnd.openshop.xmp`, `application/vnd.openshop.selection`.

### 13b.4 Versions and migration

Registry `_documentMigrationRegistry` (5925), keyed by source version, applied sequentially; each step sets `schemaVersion = version+1` and records `schema-<n>-to-<n+1>`:

| Step | Change |
|---|---|
| legacy -> 1 | `_migrateLegacyProject` (8558): bare Fabric JSON with optional `_openShop {w, h, version, name, layers, activeLayerIdx, activeObjectIds, guides, selection, animation, metadata, colorProfile, aiMasks, workspace}`. Assigns object ids; maps objects to layers by `_openShopLayerIndex`/`layerIndex`, then `__boundary__` -> background layer, then name match, then one-to-one into empty layers, else into the active layer. Report steps `['legacy-envelope-to-schema-1','schema-1-to-2','schema-2-to-3']`, `sourceVersion:'legacy'`, loss `openshop.legacy-envelope` (path `root`). |
| 1 -> 2 | Every layer gets `kind` (`group`/`adjustment`/`pixel`), `parentId` (string or null), `collapsed` (boolean). |
| 2 -> 3 | Text objects (`i-text`, `text`, `textbox`) with `styles` are normalized through `_normalizeTextRangeStyles`. |
| 3 | Identity (registered, unused). |

Fixture differences: v1 (`appVersion 0.18.13`) has layers without `kind` on non-groups, `metadata.image` with basic EXIF; v2 (`0.31.0`) adds `_openShopLayerMask` on an image, an `i-text`, EXIF GPS + XMP + raw segments, `interchange.psd` (non-conforming `{version, layers}` which normalizes to null).

Migration report (`_lastDocumentMigrationReport`): `{format:'openshop', direction:'import', accepted:true, sourceVersion, targetVersion:3, steps, warnings, losses}`.

### 13b.5 Validation and malformed handling

Order: `_normalizeDocumentState(project, {trusted})` (8734) deep-clones the input (input object never mutated), migrates, then `_sanitizeProjectJSON` (7563):

| Check | Error |
|---|---|
| Not an object | "Project data is invalid" |
| Clone fails | code `openshop.malformed-document` |
| schemaVersion < 1 or > 3 / non-integer | code `openshop.unsupported-schema`, "Unsupported OpenShop document schema N" (future schemas rejected before touching the active document) |
| No migration for a version | `openshop.missing-migration` |
| Migration returned non-object | `openshop.invalid-migration` |
| Nesting depth > 80 | "Project nesting exceeds import limits" |
| Any array > 5000 items / > 5000 objects total | "Project array exceeds import limits" / "Project object count exceeds import limits" |
| Total layers > 512 | "Project layer count exceeds import limits" |
| Canvas size fails ceiling | canvas limit message |
| Missing `canvas.fabric.objects` | "Project canvas data is missing" |
| `layers` empty or > 512 | "Project layer data is invalid" (the malformed fixture fails here; its 2x2 mask with 1 byte also fails "truncated") |
| Untrusted string sanitizing | `src`/`source` must be `data:`/`blob:`; `text` keeps newlines/tabs, control chars removed, max 10000; every other string has control chars and `javascript:` removed and is truncated to 500 chars (risk: legitimate long strings such as font lists or SVG path strings are silently cut); `id` values lose `< > " ' &`. Trusted mode (history, rollback) skips string sanitizing. |
| Post-load | Layer masks, smart objects, text-on-path validated with `validate:true` during `_applyDocumentState`; failures throw after the canvas was replaced, so callers keep a rollback snapshot. |

Errors not carrying a report get `lossReport` `{accepted:false, losses:[{code:'openshop.invalid-document', path:'document', feature:'document validation', fallback:'The active document remains unchanged.', message}]}`. The user sees only a toast "Invalid project: <msg> - previous document restored" (or without the suffix if rollback failed); the structured report is not displayed.

On successful open (`_loadProjectFile`): file handle retained if launched, history baseline "Open Project", state clean, recovery generations of the previous and current lineage cleared, recent-file entry added, toast "Project loaded".

### 13b.6 Rewrite notes for the format

- Remove the 10 MB JSON ceiling for projects or switch to a container (ZIP with `document.json` plus binary PNG/ICC/mask entries) so pixel data is not base64 inside JSON; keep the 10 MB limit for actions/recipes only.
- Persist document resolution, and optionally history/snapshots if the claim in FORMATS.md is to be kept.
- Keep the explicit migration registry, the clone-then-validate-then-commit order, and the rollback-on-late-failure behavior; surface the structured report in the UI.


---

## 18. Half-done, stubbed, or declared-but-unimplemented

This section is deliberately blunt. A rewrite should decide, item by item, whether to implement or to drop these, rather than copying the original's half-states.

### 18.1 Tools declared in the catalog but refused at runtime

The tool catalog (`_toolCatalog()`, ~line 18040) lists 60 Photoshop CS6-style entries (58 tools + 2 modes). `_unimplementedToolStates` (line 18019) marks 22 of them unimplemented. Their flyout buttons are rendered `disabled` with `data-unimplemented="true"` (line 15012), and `setTool()` (line 15371) routes them, plus `quick-mask` and `screen-mode`, to `_refuseUnimplementedTool()`. That function shows the toast "<Label> is not implemented" and logs a diagnostic.

| Catalog id | Label | Shortcut family |
|---|---|---|
| tool.marquee.single-row | Single Row Marquee Tool | M |
| tool.marquee.single-column | Single Column Marquee Tool | M |
| tool.crop.slice | Slice Tool | C |
| tool.crop.slice-select | Slice Select Tool | C |
| tool.sampling.color-sampler | Color Sampler Tool | I |
| tool.healing.patch | Patch Tool | J |
| tool.healing.content-aware-move | Content-Aware Move Tool | J |
| tool.healing.red-eye | Red Eye Tool | J |
| tool.clone.pattern | Pattern Stamp Tool | S |
| tool.history.brush | History Brush Tool | Y |
| tool.history.art | Art History Brush Tool | Y |
| tool.eraser.background | Background Eraser Tool | E |
| tool.eraser.magic | Magic Eraser Tool | E |
| tool.blur | Blur Tool | R |
| tool.blur.sharpen | Sharpen Tool | R |
| tool.pen.freeform | Freeform Pen Tool | P |
| tool.pen.add-anchor | Add Anchor Point Tool | P |
| tool.pen.delete-anchor | Delete Anchor Point Tool | P |
| tool.pen.convert-point | Convert Point Tool | P |
| tool.type.vertical | Vertical Type Tool | T |
| tool.type.horizontal-mask | Horizontal Type Mask Tool | T |
| tool.type.vertical-mask | Vertical Type Mask Tool | T |
| tool.navigation.rotate | Rotate View Tool | R |
| mode.quick-mask | Quick Mask Mode | (none) |
| mode.screen | Screen Mode | (none) |

60 catalog rows minus these 24 refused entries leaves 36 catalog tool states. The README says "34 editing tools". Separately, `_toolExtensionStates` (`brush`, `pencil`, `spray`, `ai-segment`) are accepted by `setTool` even though they are not catalog rows, so the count depends on what you include. See Section 2 for the reconciled list.

### 18.2 Limits on replay and automation

- The action recorder (`filter.apply` command, ~line 18436) can replay only six filters: `Grayscale`, `Invert`, `Sepia`, `BlackWhite`, `Sharpen`, `Emboss`. Every other filter or adjustment fails validation with "Unsupported replayable filter", so it cannot be recorded or batched.
- Nested action sequences are refused ("Nested action sequences are not supported", line 18578). Action files are capped at 200 commands (line 31051).
- There is no scripting language. Automation means recorded command sequences only.

### 18.3 Format boundaries the code refuses (thrown errors)

- **PSD.** Import accepts only 8-bit RGB (`psd.unsupported-bit-depth` and `psd.unsupported-color-mode` at 12618-12625; channels must be 1-8). Layer effects, layer masks, adjustment layers, smart objects, vector content, clipping, fill opacity, and rich text styles are all flagged unsupported (12891-12899). They fall back to decoded pixels or to a single flattened composite layer (`psd.flattened-composite`, 13158-13160). PSD group opacity and group blending are "approximated in the editor", and some blend modes "preview as Normal but are preserved when re-exported" (13125-13151).
- **OpenRaster.** No ZIP64, multi-disk, or encrypted entries. Only compression methods 0 and 8 are accepted (10596-10630). Text elements and non-PNG layer sources are omitted, and unknown attributes and elements are reported (10156-10231).
- **ABR brushes.** Versions 1, 2, and 6 only. Native ABR descriptors, sample compression, and dynamics are not supported and are reported as `unsupportedFeatures` (29275-29308).
- **GRD gradients.** Version 3 only (29369).
- **Export.** The worker's raster encoder accepts only `png`, `jpeg`, `webp`, and `avif` (10675). HEIC, JXL, BMP, APNG, and RAW are import-only. Animated GIF, APNG, or WebP imports fall back to the first frame when the decoder is unavailable (10401, 10483, 10551).
- **C2PA.** Content Credentials are read and verified only. Exports are never signed and are not re-signed.

### 18.4 Architecture debt the project itself records

- **Fabric.js shim.** Fabric 7.4.0 runs through a v5-shaped compatibility shim in the first inline script (~lines 30-70, per the CHANGELOG roadmap archive). The CHANGELOG lists it as P2 debt.
- **GPU acceleration.** GPU kernels exist only for a parity-gated allow-list: invert, grayscale, threshold, brightness, contrast, blur, and sharpen (v0.30.0 notes). Every other filter runs in the CPU worker or on the main thread.
- **Photoshop parity ledger.** `PHOTOSHOP_PARITY_ROADMAP.md` has 53 entries: 8 VERIFIED (PS-001 to PS-004 and PS-010 to PS-013, which cover architecture and the shell, toolbox, and options bar), 42 PLANNED, and 3 BLOCKED (PS-048 automation/scripting/print, PS-050 PSD fixtures, PS-073 interoperability matrix). PLANNED work includes the right dock and workspace menu, screen modes, selection as a document primitive, paths and type semantics, transaction-aware history (history is currently snapshot-based), a typed non-destructive operation stack, tile-based history, a tiered render pipeline, complete localization, and all tool families. The ledger calls itself historical rather than an active queue.
- **Localization.** It is partial. The roadmap archive cites "365 toast call sites, essentially none translated". A pseudo-locale and RTL checks exist, but there is no reviewed non-English copy.
- **Physical-device validation.** None. The README says mobile, iOS, Android, and pen hardware were tested by emulation only, "not release claims yet".

### 18.5 Known open bug (ROADMAP.md, P1, issue #10)

On iOS Safari the canvas-ceiling probe measures 1 px, so every image import is rejected with "New image dimensions exceed the measured browser canvas ceiling". The planned fix is to fall back to 4096 px per side and 16.7 MP when the probe returns an implausibly small value. A rewrite needs a sane probe floor from day one.

### 18.6 Other soft spots found by grep

- **Placeholder-then-replace shapes.** Polygon, star, and custom shapes are first drawn as zero-radius `fabric.Circle` placeholders (`_polyPlaceholder`, `_starPlaceholder`, `_customShapePlaceholder`, 16063-16071) and swapped for real geometry on mouse-up (16179-16209).
- **Smart objects in PSD export.** An imported smart object "remains a raster fallback; its embedded source was not available" (20383).
- **Vector PDF fallback.** If the vector writer fails, the page silently degrades to an embedded raster image, with only a console warning (20076).
- **Durable storage.** `navigator.storage.persist` may be unsupported. The app then toasts "Durable storage requests are not supported by this browser" (22733).
- **Offline status strings.** The PWA panel can show "Hosted shell is not yet cached" or "Offline unavailable" (21227-21237).
- **Standalone file and strict offline.** Strict Offline Mode cannot work on a cold start of the standalone `file://` lane, because the three pinned core libraries must still be fetched (21571).
- **`windows-app-audit/`.** This folder holds Photoshop CS6 audit evidence (screenshots and CSVs) that the parity roadmap was built from. It is reference material, not OpenShop features.
