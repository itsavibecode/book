# Stacked v0.2.0 - watch several Kick streams at once

A single-page, no-backend multi-stream viewer for Kick. Add up to eight channels and lay
them out as a grid, a row, a stack or one big with a strip; drag the bars between tiles
to size them by hand; click a tile to move the sound to it. The channel list and the
layout live in the address, so the address bar is always the share link.

Live at **https://bookhockeys.com/stacked/** (not linked from the home page yet).

Not affiliated with Kick. Video is Kick's own embed player; channel info comes from
Kick's public channel API, fetched straight from your browser.

---

## Using it

- **Add stream** - type a channel name, or paste a `kick.com/name` link. The channel is
  checked against Kick first, so a typo gets an error instead of a dead tile.
- **Sessions are links** - `bookhockeys.com/stacked/#name1/name2/name3`. Adding or
  removing a stream rewrites the part after `#`; opening such a link rebuilds the wall.
  A layout other than Auto grid rides along after the names, e.g. `#a/b?l=stack` (see
  "Layout strings" below). With no `#`, you get the start page (with a one-click
  "Resume last session" that brings back the layout too).
- **Layouts** - the four buttons in the header:
  - *Auto grid* packs 16:9 tiles into the space (2 side by side, 3 as two plus one...).
  - *Side by side* puts every stream in one row.
  - *Stack* puts them one above the other in full-width rows, even with two streams.
  - *Focus* shows the audible stream big on top and the rest in a strip below; giving a
    strip tile the sound (its "Click to unmute" button, or its number key) swaps it into
    the big slot.
- **Sizing by hand** - drag any bar between tiles (it turns magenta) to make one side
  bigger. Tiles never get narrower or shorter than 120 px from a drag, and every player
  keeps its 16:9 shape inside its space. Once you have dragged, adding a stream gives it
  an equal share of the outer row or column (in Focus, of the strip) and removing one
  closes the gap; picking a preset again starts that preset fresh.
- **Reordering** - grab the dotted handle at the left of a tile's name and drop it on
  another tile to swap the two.
- **Sound** - every tile starts muted. "Click to unmute" moves the sound to that tile and
  mutes the rest, so only one stream talks at a time.
- **Tile controls** (hover, or always on touch screens): mute/unmute, reload, open on
  Kick, remove.
- **Offline channels** stay in the grid as a card with their banner and bio, and switch
  to the player on their own when they go live (status is re-checked every 60 s, which
  also keeps the viewer counts fresh).
- **Keys** - `1`-`9` move the sound to that tile, `m` mutes everything, `c` hides or
  shows the chat column, `f` switches Focus on for the audible tile (press again to get
  your previous layout back, hand-made sizes included), `g` goes back to Auto grid.
- **Phones** (narrower than 700 px) always show one column of full-width tiles with the
  page scrolling; the layout buttons are greyed out and a shared layout waits for a
  wider screen.
- Up to 8 streams; from 5 on you get a heads-up, because every tile is a full video
  player and laptops notice.

## Files

```
index.html            markup, meta/site kit, analytics bootstrap
styles.css            design C "Neon Splat" tokens + layout
app.js                the page: tiles, layout rendering + drags, hash sessions, polling, modal
layout.js             the split tree: presets, edits, layout string (pure, no DOM)
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

## Layout strings

The layout is a tree of splits (like tmux): a split runs left-to-right (`h`) or
top-to-bottom (`v`) and holds tiles or further splits, each with a share of the space.
It is written after the channel list as `?l=...`:

```
layout := preset | [ "focus:" ] node
preset := grid | side | stack | focus
node   := index | ( "h" | "v" ) "(" item ( "," item )+ ")"
item   := node [ ":" ratio ]
```

- `index` is the tile's position in the channel list, starting at 0 (so the string stays
  short no matter how long the channel names are).
- `ratio` is that part's share of its split, two decimals, leading zero dropped (`.6`).
  A split lists a ratio for every part or for none (none = equal shares).
- An untouched preset is written as just its name (`?l=stack`); Auto grid is the default
  and is left out. `focus:` in front of a tree means a Focus layout that has been
  resized by hand, so swapping the sound still swaps the big tile.
- Example: `#a/b/c?l=h(v(0,1):.6,2:.4)` - a and b stacked in a column taking 60% of the
  width, c in the other 40%.
- A string that does not parse, or does not use every channel exactly once, is ignored
  and the wall opens as Auto grid.

## Stored in your browser

| Key | What |
|---|---|
| `stacked:last` | the last non-empty session, for "Resume last session" |
| `stacked:layout` | the layout string that goes with `stacked:last` |
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
- **Letterboxing** - a tile only grows until it hits the edge of its space in one
  direction, so a very wide row or tall column shows empty bands beside the player.
  That is the price of never stretching the video.

## Roadmap

- v0.3.0 - read-only merged chat.
- v0.4.0 - live directory picker, Favorites, Share.
- v0.5.0 - settings, export/import, polish.

---

## Changelog

### v0.2.0 - 2026-09-25

The wall is now yours to arrange. v0.1 could only pack tiles into a grid, which is the
wrong shape for the most common wish: two streams one above the other, both as wide as
the screen. It also could not make the stream you care about bigger.

- Four layouts in the header: Auto grid, Side by side, Stack and Focus. Stack gives
  full-width rows even with two streams; Focus puts the stream you are listening to big
  on top, and moving the sound to a strip tile swaps it in.
- Drag the bars between tiles to size things by hand. The players keep their 16:9 shape
  whatever you do, and nothing shrinks below 120 px.
- Drag a tile by the handle next to its name onto another tile to swap them.
- The layout travels in the link and comes back with "Resume last session", so a shared
  wall opens exactly as it was arranged, custom sizes included.
- `f` toggles Focus and `g` returns to Auto grid.
- Phones keep the simple scrolling column; layouts wait for a wider screen.

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
