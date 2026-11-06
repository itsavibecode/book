# GIF Clipper (install page)

Live at **https://bookhockeys.com/gifclipper/**, linked from the home page's small
links row (home v0.1.18).

The home of the Kick GIF Clipper Tampermonkey add-on: what it does, how to set it
up, shortcuts and questions, and a big **Install GIF Clipper** button.

## Files

```
index.html                 the page (single file; Graphite Calm look, same as the add-on)
kick-gif-clipper.user.js   the add-on itself - Install points here, and so does its @updateURL
favicon.svg / favicon-*.png, apple-touch-icon.png   lime GIF badge
og-card.png                1200x630 share card
img/editor.webp            the real editor, captured on a drawn test scene (no real stream)
img/pill.webp              the real launcher with the rewind buffer full
img/snapshot.webp          a PNG exactly as the add-on saved it (info bar included)
```

The three `img/` captures come from the real add-on running in headless Chrome on a
temporary local page that plays a drawn stand-in scene into a `<video>` (channel shown
as `your-channel`). Never use footage from a real stream for these. To refresh them
after a UI change, rebuild that harness page, re-run the capture, and convert to WebP.

## The script copy

`kick-gif-clipper.user.js` here is **not** edited in this repo. The source lives in
the userscripts repo (`kick-gif-clipper/kick-gif-clipper.user.js`). Every release:

1. bump the version and finish the change in the userscripts repo,
2. copy the file here byte-for-byte (compare hashes),
3. bump the page's version (`<meta name="version">`, the `VERSION` const, the
   `<title>`, the badge) to match the script,
4. commit and push both repos.

Tampermonkey checks `https://bookhockeys.com/gifclipper/kick-gif-clipper.user.js`
for updates, so a push here is what ships an update to everyone.

## Analytics

GA4 (`G-DYME377V2S`) with the site-wide consent banner (`greenline-consent`) and the
per-device opt-out: visit `/gifclipper/?ga=off` once (`?ga=on` undoes it). The
Install button also sends a `gifclipper_install_click` event.

## Changelog

### 0.6.0 page refresh (2026-11-06)
- The page now shows the real product: the editor, the launcher and an actual saved
  PNG, all captured from the add-on on a drawn test scene, instead of a hand-drawn
  mock that no longer matched the launcher.
- Features are grouped the way you use them (catch it, shape it, save it) instead of
  ten identical cards, and the opening line now mentions WebM and PNG.
- "New in 0.6" listed changes from 0.2 to 0.5 as new; it is now a short version list.
- Dropped the size claims we had no measurement for ("10 to 20 times smaller",
  "well under 1 MB").
- Added an "Already have it? Click Install again to update" line, and 44 px tap
  targets for the header and footer links and the Cookies button.

### 0.6.0
- Serves add-on v0.6.0 (runs inside Kick's embed player too, so it works on bookhockeys.com/stumble).

### 0.5.1
- Serves add-on v0.5.1 (steady launcher width while recording).

### 0.5.0
- Serves add-on v0.5.0 (PNG info bar: time, date, stream title). Feature card and "New in 0.5" box updated.

### 0.4.1
- Serves add-on v0.4.1 (live snapshots stamped 5:00:03 / 8:00:02 from Kick's seek bar; time no longer missing when the player controls are hidden).

### 0.4.0
- Serves add-on v0.4.0 (PNG snapshots stamped with the VOD time or live uptime).
  Feature card and "New in 0.4" box updated.

### 0.3.0
- Serves add-on v0.3.0 (one-click PNG frame snapshots). Added a "Save a frame as
  PNG" feature card, the Alt + Shift + S shortcut row, and a "New in 0.3" box.

### 0.2.1
- First release of the page, serving add-on v0.2.1. Installs and updates now come
  from bookhockeys.com instead of a GitHub link.
