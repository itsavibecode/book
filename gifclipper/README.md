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
```

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

### 0.3.0
- Serves add-on v0.3.0 (one-click PNG frame snapshots). Added a "Save a frame as
  PNG" feature card, the Alt + Shift + S shortcut row, and a "New in 0.3" box.

### 0.2.1
- First release of the page, serving add-on v0.2.1. Installs and updates now come
  from bookhockeys.com instead of a GitHub link.
