# Stumble v0.1.0 - Kick Discovery: roll a random live streamer

Hit Roll and land on a random live Kick stream. A countdown ring around the button moves
you on unless you pause, stretch or lock it. Filters decide what the roll may land on, an
Underdogs bias leans it toward small streams nobody else is finding, and you can keep your
own note and tags on every streamer, shown the next time they come up.

Live at **https://bookhockeys.com/stumble/** (not linked from the home page yet).

Not affiliated with Kick. Video and chat are Kick's own embeds; the live list comes from
Kick's public pages, fetched straight from your browser. Everything works without an
account. Sign in with Kick (once the Kick app exists, see "Setting up sign-in") keeps
saved, hidden, notes, tags, filters, timer, theme and history on every device, through
the small `stumble-worker` next to this repo.

---

## Using it

- **Roll** (Space) picks a random live stream that passes your filters. The first roll
  happens by itself as soon as the scan has found one match, so you are watching within
  a second or two while the rest of Kick is still being read.
- **The timer.** Every roll starts a countdown at your default length (Filters > Timer:
  Off, 15 s, 30 s, 1 m, 2 m, 5 m, 10 m or any custom length from 10 s to an hour; 1 minute
  out of the box). The ring around Roll drains clockwise and turns red for the last 5 s.
  - Pause / Resume (T), -30 s / +30 s (`[` / `]`, never below 5 s).
  - Set: type seconds and press Set to change the time for this stream only.
  - Lock (L): the stream stays until you unlock or roll by hand. The ring goes solid.
  - Make this the default: appears once you have changed a stream's length.
  - It pauses on its own while you type (any box, or Kick's chat), while the tab is
    hidden, for 2 s after Mute, and while the pointer is on the buttons, so nothing moves
    under you. A small "paused: typing" line says why. Each rule can be switched off.
  - "Tick in the last 5 s" plays a soft tick each second before a roll (off by default).
- **Save** (S, heart) keeps the streamer in the Saved tab. **Hide** (B) rolls away and
  never shows them again; the toast has Undo, and More > Hidden streamers can unhide.
  **Note** (N) opens the Notes tab. **Open** (O) opens the channel on Kick. **Share**
  copies `bookhockeys.com/stumble/#name`; opening that link shows that streamer and does
  not roll until you ask. **Mute** (M) is on the card.
- **Notes and tags** belong to the streamer and save themselves 0.8 s after you stop
  typing. Tags autocomplete from your own tag set (Enter or comma adds, Backspace on an
  empty box removes the last one) and get a colour from their name, the same everywhere.
  When a streamer you know comes up again, the card shows your tags, the start of your
  note, and "Seen 3 times before . last 2 days ago . saved 10 Oct".
- **Filters**: viewers min / max (10 to 2,000 by default, so the roll stays out of the
  top 50 you already know), live for at least N minutes, don't repeat for N hours (1 by
  default), include 18+, streamer tier (Any / Affiliate / Non-affiliate, plus Verified
  only), languages with live counts, categories (click: include, exclude, off), title
  contains / excludes (comma lists), your tags (only these / never these), and the bias:
  Fair, Underdogs (default, weight 1/sqrt(viewers+10)) or Popular (weight
  log(viewers+10)). The "match" count updates as you change anything.
- **Verified only** checks Kick's `verified` flag, which is only in the channel lookup,
  not in the live list. So the roll draws a candidate, looks it up, and redraws if it is
  not verified (up to 12 tries, then "No verified stream matched; loosen the filters").
  Answers are cached per channel for 24 hours. Kick has no "partner" field; verified is
  the closest thing.
- **When you have seen everything** the card says "You've seen all N matching streams in
  the last H hours" with buttons to lower the don't-repeat window or clear history.
- **Saved** is a table: sortable headers (asc, desc, back to newest saved), a Columns
  menu (show / hide, drag or arrow to reorder, reset), and drag a header's right edge to
  resize. Your layout is remembered (and synced). "Live now" is checked when you open the
  tab (up to 20 lookups at a time, or one bulk call through the Worker when signed in).
  Under 640 px of width the table turns into cards.
- **History** keeps your last 500 rolls, saves, hides, locks and shares, grouped by day,
  with Roll again. Clear history also clears the don't-repeat memory; saved, hidden,
  notes and tags stay.
- **More**: account, hidden streamers, theme (Neon Ink, Kick Green, Ember), panels (show
  my chat, show the key legend), about.
- **N chatting** next to the viewer count is how many different people sent a chat
  message in the last five minutes (counted from the moment the stream came up, so give
  it a minute), with messages per minute in brackets once there is enough to say. Kick
  never shows this number; the page reads the public chat feed through `stumble-worker`,
  which relays it (Kick's chat socket refuses any browser origin but its own) and only
  counts, it never posts. Viewers is everyone watching; this is who talks.
- **Chat** shows the streamer's Kick chat (you can sign in to Kick inside it and type).
  Signed in to Stumble, "Show my chat" adds your own channel's chat underneath. Each
  section has a caret to collapse it (the other takes the space) and Open on Kick.
- **Layouts**: three columns from 1100 px; below that the panels become a bottom sheet
  opened from a tab bar, and on phones Roll is full width. No sideways scrolling at any
  width down to 320 px.

## Keys

`Space` roll, `S` save, `B` hide, `N` note, `O` open, `T` pause / resume, `[` / `]` 30 s
less / more, `L` lock, `M` mute, `C` chat tab, `F` filters tab, `?` the full list. Keys
do nothing while you type in a box or while Kick's player or chat has focus.

## Files

```
index.html            meta / site kit, analytics bootstrap, app shell, icon sprite
styles.css            Neon Ink tokens + Kick Green + Ember, layout, components
app.js                the page: scan + roll loop, card, timer wiring, panels, keys, modals, toasts
kick.js               every kick.com URL: list scan, channel lookup, categories, player/chat URLs,
                      normalisers, and the pure roll maths (filters, bias, don't-repeat)
timer.js              the countdown (default / per roll / lock / auto-pause) and the ring
store.js              localStorage, Worker sync queue, merge rules
auth.js               Sign in with Kick: PKCE, redirect handling, Worker base URL
favicon.svg           hand-drawn ring + die-dot mark
favicon-*.png         16 / 32 / 192
apple-touch-icon.png  180x180
og-card.png           1200x630 share card
tools/make-assets.py  regenerates every PNG above (Pillow)
tools/selftest.mjs    Node self-test: kick.js / timer.js / store.js against live Kick data
```

No build step, no dependencies. ES modules, so serve it over HTTP:

```
python -m http.server 3460 --bind 127.0.0.1 --directory T:/ClaudeCodeRepo/book
# then http://127.0.0.1:3460/stumble/
node tools/selftest.mjs      # from this folder; needs network
```

## How it talks to Kick

- **Live list**: `GET https://kick.com/stream/livestreams/en?page=N&limit=32&sort=desc`,
  straight from the browser (Kick echoes the page's Origin). 32 per page is Kick's cap
  (asking for 50 or 100 still returns 32). Sorted by viewers, high to low, so a scan stops
  at the first page that ends under your minimum viewers. Three pages in flight. On a 429
  or 5xx a page waits 2 s, 4 s, 8 s and is then skipped; the header says "Kick is
  rate-limiting, scan paused" meanwhile. There is no language parameter, so language,
  18+, viewers, uptime, title, tier and excluded categories are filtered in the browser.
  Each included category is its own scan (`&subcategory=<slug>`). The pool is re-read
  every 10 minutes, and at once when included categories change or the viewer floor drops.
- **Header**: "N live" is the count from the last scan; a plus sign means the scan
  stopped at your floor, so there are more below it. The scan percentage is an estimate
  from how far viewer counts have fallen toward the floor (Kick's list has no total).
- **Channel lookup**: `GET https://kick.com/api/v2/channels/<slug>` refreshes the viewers
  on the card every 60 s, answers "verified", checks Saved streamers, and loads deep links.
- **Categories**: `kick.com/api/search` answered 400 "Please enter at least 3 characters"
  to every spelling we tried on 2026-10-16 (searchTerm, query, q; POST is 405), so the
  category search box matches against the first five pages of
  `kick.com/api/v1/subcategories` (Kick's 160 busiest categories) plus every category in
  the scanned pool, by substring, after a 300 ms pause in typing.
- **Fallback**: only if the live list itself fails to load (network or CORS, not an empty
  page), the page asks the Worker's `/live`, which proxies Kick's official API (top 100
  only; the header says so).
- **Player**: `https://player.kick.com/<slug>?autoplay=true&muted=false`; mute re-creates
  the iframe. **Chat**: `https://kick.com/popout/<slug>/chat`.

## How sign-in is wired (for the owner)

Kick allows two developer apps per account and one redirect URL per app, and both slots
were already taken. So Stumble shares the **Moddeck** app: its Client ID is in `app.js`,
Kick always redirects to `https://moddeck.bookhockeys.com/auth/kick`, and that page hands
any login whose state starts with `stumble.` straight back to this page (live, or the
`127.0.0.1:3460` dev server), code and state untouched. The PKCE verifier never leaves
this tab, and stumble-worker exchanges the code with the Moddeck app's secret. The Kick
consent screen therefore says "Moddeck" with only the `user:read` scope ticked. Rotating
that secret means updating both Workers.

The Worker needs `KICK_CLIENT_SECRET` (the Moddeck app's) and `SESSION_SECRET` via
`wrangler secret put` (see `stumble-worker/README.md`), then a deploy. Until the Worker is
up, Sign in fails with a plain message and everything works signed out. On `127.0.0.1` the More tab also shows "Dev sign-in (local Worker)", which signs in a
fake user through `wrangler dev` with `DEV_FAKE_LOGIN=1`, for testing sync.

The first sign-in on a device that already has data asks "Keep what's on this device?":
Merge (saved and hidden combined, both notes kept with a divider, tags and history joined;
the account's settings win if it has any) or Use cloud only. After that every change is
written through about a second later; the dot in the header is green when synced, amber
while saving and red if it failed (click it to retry). Unsent changes survive a reload.

## Stored in your browser

| Key | What |
|---|---|
| `stumble.prefs` | filters, timer settings, theme, panels, Saved table layout |
| `stumble.streamers` | per streamer: saved, hidden, note, tags, seen count, first / last seen, last viewers / category / title |
| `stumble.history` | last 500 entries |
| `stumble.verified` | verified answers per channel, 24 h |
| `stumble.ui` | which tab was open |
| `stumble.session`, `stumble.user`, `stumble.pending`, `stumble.mergedFor` | only when signed in: session token, name / picture, unsent changes, which account this device merged into |
| `greenline-consent` | the site-wide analytics consent choice |
| `bookhockeys_ga_optout`, `ga-optout` | set by visiting `?ga=off` once; `?ga=on` clears them |

## Analytics

GA4 `G-DYME377V2S`, shared with the rest of bookhockeys.com, with the same consent logic
as Green Line (European timezones get a banner and analytics stays off until they
accept). Events: `stumble_roll` (with how the roll started), `stumble_save`,
`stumble_hide`, `stumble_signin`; never names, notes or tags. Visiting `/stumble/?ga=off`
once switches analytics off on that device for good (the script is not even loaded);
`?ga=on` undoes it.

## Known limits

- Kick's embed shows its own "Visit KICK for HD" badge and has no volume control from
  outside, so Mute reloads the player.
- Keys cannot reach the page while Kick's player or chat iframe has focus. Click anywhere
  on the page first.
- "Show my chat" needs your channel name, which comes from looking up your Kick username;
  accounts whose channel name differs from the username will not get it.
- Sign in with Kick needs the live ModDeck callback page, so it only works once the
  ModDeck site and stumble-worker are deployed; the local dev server can still complete a
  login because that callback knows the dev address.

---

## Changelog

### v0.1.0 - 2026-10-16

First release. Most "random stream" tools pick from the top of a viewer-sorted list, so
they keep landing on the same big channels, and their auto-roll is a hidden setting you
cannot see coming. Stumble makes the roll button the product: one big button with the
countdown drawn around it, a timer you can pause, stretch or lock, and a bias that leans
toward small streams.

- Roll a random live Kick stream; the first roll happens as soon as anything matches.
- Countdown ring with pause, +/-30 s, set-for-this-stream, lock, make-default, and
  auto-pause while you type, hover the buttons or leave the tab.
- Filters: viewers, uptime, don't-repeat window, 18+, tier and verified-only, languages,
  categories, title words, your own tags, and Fair / Underdogs / Popular bias.
- Save, hide with undo, notes and tags per streamer, shown when they come up again.
- Saved table you can sort, resize and rearrange; History grouped by day; hidden list.
- Streamer chat beside the player, plus your own chat when signed in.
- Three themes: Neon Ink, Kick Green, Ember.
- Sign in with Kick and sync through stumble-worker, with a merge step for data that was
  already on the device (sign-in waits for the Kick app to be created).
