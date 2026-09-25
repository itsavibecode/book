# Stacked - watch several Kick streams at once

A single-page, no-backend multi-stream viewer for Kick. Add up to eight channels and
they tile into a 16:9 grid; click a tile to move the sound to it. The channel list lives
in the address, so the address bar is always the share link.

Live at **https://bookhockeys.com/stacked/** (not linked from the home page yet).

Not affiliated with Kick. Video is Kick's own embed player; channel info comes from
Kick's public channel API, fetched straight from your browser.

---

## Using it

- **Add stream** - type a channel name, or paste a `kick.com/name` link. The channel is
  checked against Kick first, so a typo gets an error instead of a dead tile.
- **Sessions are links** - `bookhockeys.com/stacked/#name1/name2/name3`. Adding or
  removing a stream rewrites the part after `#`; opening such a link rebuilds the wall.
  With no `#`, you get the start page (with a one-click "Resume last session").
- **Sound** - every tile starts muted. "Click to unmute" moves the sound to that tile and
  mutes the rest, so only one stream talks at a time.
- **Tile controls** (hover, or always on touch screens): mute/unmute, reload, open on
  Kick, remove.
- **Offline channels** stay in the grid as a card with their banner and bio, and switch
  to the player on their own when they go live (status is re-checked every 60 s, which
  also keeps the viewer counts fresh).
- **Keys** - `1`-`9` move the sound to that tile, `m` mutes everything, `c` hides or
  shows the chat column.
- Up to 8 streams; from 5 on you get a heads-up, because every tile is a full video
  player and laptops notice.

## Files

```
index.html            markup, meta/site kit, analytics bootstrap
styles.css            design C "Neon Splat" tokens + layout
app.js                the page: tiles, auto grid, hash sessions, polling, modal
kick.js               everything that knows a kick.com URL (API, player, links)
favicon.svg           hand-drawn stacked-tiles mark
favicon-*.png         16 / 32 / 192
apple-touch-icon.png  180x180
og-card.png           1200x630 share card
tools/make-assets.py  regenerates every PNG above (Pillow)
```

No build step, no runtime dependencies. Serve the folder over HTTP and open it.

## How it talks to Kick

- **Channel lookup:** `GET https://kick.com/api/v2/channels/{slug}`, direct from the
  browser (Kick serves it with open CORS). A 404 means "no such channel". Only if the
  request itself fails (network or CORS) does `kick.js` retry through a short list of
  public CORS proxies.
- **Video:** `https://player.kick.com/{slug}?autoplay=true&muted=true` in an iframe. The
  embed has no volume API, so muting and unmuting re-create the iframe with a new URL.
  The URL is built in exactly one function, `playerUrl()` in `kick.js`, so if Kick changes
  it the fix is one line.

## Stored in your browser

| Key | What |
|---|---|
| `stacked:last` | the last non-empty session, for "Resume last session" |
| `stacked:chatHidden` | whether you hid the chat column |
| `stacked:recent` | channels you added recently, shown as one-tap chips in Add stream |
| `greenline-consent` | the site-wide analytics consent choice (shared with other bookhockeys.com pages) |
| `bookhockeys_ga_optout` | set by visiting `?ga=off` once; `?ga=on` clears it |

## Analytics

GA4 `G-DYME377V2S`, shared with the rest of bookhockeys.com. Visitors in European
timezones get a consent banner and analytics stays off until they accept; everyone else
is counted anonymously with no banner. Visiting `/stacked/?ga=off` once turns analytics
off for that browser for good (the script is not even loaded); `?ga=on` undoes it.

## Known limits

- **Embed quality.** Kick's embed shows a "Visit KICK for HD" badge and there is no
  quality or volume control from outside the player.
- **Kick's own player controls** sit in the tile's bottom corners. The Stacked controls
  are a small pill at the bottom centre so they do not cover Kick's fullscreen button.
- **Chat** is a placeholder column in this version.

## Roadmap

- v0.2.0 - drag-to-resize layout engine, Side by side / Stack / Focus presets,
  drag-to-reorder, layout in the link.
- v0.3.0 - read-only merged chat.
- v0.4.0 - live directory picker, Favorites, Share.
- v0.5.0 - settings, export/import, polish.

---

## Changelog

### v0.1.0 - 2026-09-25

First release: the smallest version that is actually useful on a stream night. You can
put several Kick streams on one screen, hear exactly one of them, and send the whole
wall to someone as a link.

- Add streams by name or kick.com link; each one is checked with Kick first, so a typo
  shows an error instead of an empty tile.
- Auto grid that keeps every player 16:9 and re-packs from 1 to 8 tiles (2 side by
  side, 3 as two plus one centred, 4 as 2x2, then 3x2 and 4x2).
- One audible tile at a time, so audio never piles up.
- The address is the session: adding or removing rewrites it, opening it restores it.
- Offline channels wait as a card and flip to the player when they go live; viewer
  counts refresh every minute.
- Chat column placeholder you can hide (remembered), in the layout it will have when
  chat lands, so the grid does not jump later.
- Works at phone width: tiles stack full width, header shrinks to icons.
