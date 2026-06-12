# BigText

**Live:** https://bookhockeys.com/bigtext/

Display anything, big. A single-file fullscreen large-text tool with a theme picker, screenshot export, copy-to-clipboard / share, line-break support, and an ALL CAPS toggle. Inspired by [bigtext.vercel.app](https://bigtext.vercel.app/).

## Features

- Auto-sizing fullscreen text — fills the viewport regardless of length, on desktop and mobile portrait
- Tap anywhere to edit; `Enter` for line breaks, `Ctrl/Cmd+Enter` to display
- ALL CAPS toggle in the editor (persists across opens)
- 8 background and 8 text colors with live theme switching
- Save button — downloads a clean 2x PNG of the current display
- Copy / Share button — copies the screenshot to clipboard on desktop, opens the native share sheet on iOS / Android
- Mobile screenshots render to an offscreen 4:3 canvas so the exported image is always landscape and shareable
- Auto-hiding toolbar (move the mouse / tap the screen to bring it back)
- Fullscreen toggle

## Stack

- Single static `index.html`, no build step
- [html2canvas 1.4.1](https://html2canvas.hertzen.com/) via cdnjs for screenshot capture
- DM Sans + Instrument Sans via Google Fonts
- Hosted on GitHub Pages

## Changelog

### v0.2.0 — 2026-06-12
- **localStorage persistence** — saves text, background color, text color, and ALL CAPS state on every change under the `bigtext:state` key. Reload the page and you land on your last setup, no flash of defaults. Wrapped in try/catch so private-mode Safari and storage-disabled browsers fail silently.
- **Keyboard shortcuts in display mode**
  - `E` or `Enter` — open editor
  - `T` — toggle theme picker
  - `S` — save screenshot
  - `C` — copy / share screenshot
  - `F` — toggle fullscreen
  - `Esc` — close theme picker (display mode) / cancel edit (editor mode)
  - Skip when typing in any input, when modifier keys are held, or when the editor is open (so the textarea owns every key)
- Toolbar tooltips now show the shortcut letter in parens
- Editor hint now mentions `Esc to cancel`
- Refactored `applyText` so the DOM-build step is reusable from init (no double work to restore saved state)

### v0.1.5 — 2026-06-12
- **Moved home** from `itsavibecode.github.io/bigtext/` to `bookhockeys.com/bigtext/`, joining the same subfolder pattern as Green Line and Shoovlator
- Updated all canonical / OG / Twitter URLs to the new origin
- The original `itsavibecode/bigtext` repo now serves a redirect stub pointing here so any existing links keep working
- Bump APP_VERSION to 0.1.5

### v0.1.4 — 2026-04-29
- v0.1.3 only got mobile a11y to 100 — desktop PSI still flunked color-contrast because at desktop sizes the placeholder renders at ~255px, and 0.3 opacity (#4D4D4D vs #000) computes to 2.48:1, just below WCAG's 3:1 large-text threshold
- Bump placeholder opacity to 0.4 → ~3.6:1 contrast, comfortably passing
- Bump APP_VERSION to 0.1.4

### v0.1.3 — 2026-04-29
- Accessibility pass driven by Lighthouse audit results
- **Fix `color-contrast`** — bump "Tap to edit" placeholder opacity from 0.15 to 0.3 so the text on black computes to ~4.2:1 contrast (passes WCAG AA for large text). Still reads as a placeholder visually.
- **Fix `meta-viewport`** — drop `maximum-scale=1.0` and `user-scalable=no` so users with low vision can pinch-zoom. Textarea font-size is already 16px so iOS won't auto-zoom on focus.
- Bump APP_VERSION to 0.1.3.

### v0.1.2 — 2026-04-29
- Performance pass — kill render-blocking and trim wasted bytes on initial load
- **Lazy-load html2canvas (~50 KB) on first capture click** instead of on page load. Removes a render-blocking external script from the critical path. After idle, the lib is opportunistically prefetched via `requestIdleCallback` so the first Save / Copy still feels instant.
- **Make Google Fonts CSS non-blocking** with the `media="print" onload` swap pattern + `<noscript>` fallback. First paint no longer waits on Google's CDN.
- Add `preconnect` to `fonts.gstatic.com` (with `crossorigin`) so the font-file handshake starts in parallel with the CSS fetch.
- Drop unused `Instrument Sans wght@400` from the Google Fonts request — only weight 700 is used for the display text.
- Bump APP_VERSION to 0.1.2.

### v0.1.1 — 2026-04-29
- Full classic favicon coverage so older browsers, embed scrapers, and the default `GET /favicon.ico` request all hit a real file instead of a 404
- Add multi-resolution `favicon.ico` (16/32/48), standalone `favicon-16x16.png` and `favicon-32x32.png`
- Add PWA web manifest (`site.webmanifest`) with 192px + 512px icons and a maskable variant — Android users can now "Install" BigText to their home screen as a standalone app
- Bump APP_VERSION to 0.1.1 (source constant + meta tag)

### v0.1.0 — 2026-04-29
- Bring repo into local workflow and tag the first versioned release
- Add Open Graph and Twitter Card meta tags so links render previews in Slack, iMessage, Discord, Twitter, etc.
- Add 1200×630 `og-image.png`, 180×180 `apple-touch-icon.png`, and SVG favicon
- Add canonical URL, theme-color, and meta description
- Add `APP_VERSION` constant in source for future bumps
- Add this README and changelog

### Pre-release — 2026-04-09
- Initial clone of bigtext.vercel.app with screenshot save and copy buttons
- Mobile fixes: 4:3 offscreen capture, Web Share API fallback for iOS, line-break support, offscreen-probe binary search for auto-sizing (fixes `width:100% + word-break` measurement bug)
- ALL CAPS toggle in editor
