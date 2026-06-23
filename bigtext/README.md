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

### v0.2.9 — 2026-06-21
- **Clear button in the editor** — sits between ALL CAPS and the spacer on the left side of the actions row. Same ghost-button style as Cancel. Empties the textarea without closing the modal and keeps focus on the input so the user can immediately retype. Doesn't commit anything — Display is still required to push the cleared (or new) value to the big display.

### v0.2.8 — 2026-06-21
- **Helpful tip in the editor modal** explaining that line breaks scale each line up. Added between the keybind hint and the textarea, styled in accent green so it reads as guidance rather than just controls reference. Copy: *"Tip: line breaks make each line appear larger — try a few short lines instead of one long one."*

### v0.2.7 — 2026-06-19
- **Caption is now ON by default for new visitors** — the REACT WITH ⭐ caption is the more useful default for the streamer-screenshot use case. Users who explicitly toggled it off keep their preference (localStorage wins).
- **First-visit hint** on the Caption button — green tooltip with a downward arrow, "REACT WITH ⭐ is on by default — tap here to turn it off." Appears 800 ms after first paint, auto-dismisses after 8 s. Also dismisses immediately when the user opens the Caption popup or flips the toggle (either of those means they found the feature it was pointing at). Persisted as `bigtext:seenCaptionHint` in localStorage so it never reappears.
- **Text is no longer persisted across sessions** — only theme + caps + caption preferences are saved under `bigtext:state`. Every visit starts with a fresh "Tap to edit" placeholder so users aren't greeted by stale words from a prior session.
- Toolbar auto-hide pauses while the hint is showing so the anchor stays visible.

### v0.2.6 — 2026-06-19
- **Semver in the tab title** — `document.title` is now `BigText v{APP_VERSION} — Large Text Display`. Set dynamically from the `APP_VERSION` constant so future releases self-update by bumping that one source line. OG / Twitter / SEO titles intentionally stay version-free so social embeds and search results don't show stale numbers.

### v0.2.5 — 2026-06-19
- **Caption sits closer to the bottom edge** so it stops crowding the main text. `padBottom` dropped from 4% to 1.5% of canvas height (~73 px → ~28 px on a mobile capture); the main text's auto-size still fills the same viewport area, so the net effect is more breathing room between caption and main text.

### v0.2.4 — 2026-06-19
- **Analytics** — drops the same GA4 setup (`G-DYME377V2S`) used on `/` and `/greenline/` so visits, sessions, and engagement on `/bigtext/` now show up in the same property.
- **Shared consent decision** — reads / writes the same `greenline-consent` localStorage key as the home and greenline pages. Accept once anywhere on bookhockeys.com and it carries here automatically. EU/EEA/UK/CH visitors (detected by timezone) stay denied by default until they accept on `/` — no consent banner on this page by design (kept the minimalist look).
- **Custom events** for the actions worth knowing about:
  - `text_displayed` — fires on Display, with `length`, `has_newlines`, `all_caps`
  - `screenshot_saved` — fires on successful Save, with `method` (download / share) and `caption` (true / false)
  - `screenshot_shared` — fires on successful Copy / Share, with `method` (clipboard / share) and `caption`
- Bump APP_VERSION to 0.2.4.

### v0.2.3 — 2026-06-12
- **Regenerate `og-image.png`** — the URL footer was still rendering the old standalone-repo subdomain. Now reads `bookhockeys.com/bigtext` to match the actual home. Social scrapers that already cached the old image will need a re-scrape (FB debugger / Twitter validator) to pick up the new one.
- **Editor modal no longer closes when clicking outside the card** — the previous behavior would drop whatever the user typed if they tapped the backdrop. Now the only ways to close the modal are: X button (new, top right), Cancel button, Display button, or Esc.
- **Add X button to the top-right of the editor card** with hover state and `aria-label="Close"`.
- Bump APP_VERSION to 0.2.3.

### v0.2.2 — 2026-06-12
- **Caption gets its own toolbar button + popup** instead of being tucked into the Theme picker. Star icon, sits between Theme and Save, hotkey `R`. Theme and Caption popups are mutually exclusive (opening one closes the other).
- Caption button highlights in accent green when the toggle is on, so it's obvious at a glance that screenshots will get the caption.

### v0.2.1 — 2026-06-12
- **"REACT WITH ⭐" caption toggle on save / share** — new checkbox in the Theme picker under an "On save" section. When checked, the saved or shared screenshot gets a small "REACT WITH ⭐" caption centered at the bottom, rendered in the active text color at 70% alpha so it reads as a caption, not a primary line. Font size scales with canvas height so it looks consistent on both the desktop viewport capture and the offscreen mobile 4:3 render.
- State persists in localStorage under the existing `bigtext:state` key as `caption: true|false`
- Implementation note: `html2canvas` leaves its `scale: 2` transform on the returned context, so the stamp helper resets to identity before drawing — otherwise coordinates double and the text lands off-canvas

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
- **Moved home** to `bookhockeys.com/bigtext/`, joining the same subfolder pattern as Green Line and Shoovlator
- Updated all canonical / OG / Twitter URLs to the new origin
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
