# Kick Translate v0.5.0 - read any Kick chat in your language

A single page that shows a Kick channel's live chat with a translation under every line
that is not in your language. Type a channel, pick the language you read, and keep it
open beside the stream (or beside Stacked), the way a subtitle track sits under a video.

Live at **https://bookhockeys.com/translate/** (not linked from the home page until
v1.0.0).

Not affiliated with Kick. Channel info comes from Kick's public channel API, fetched
straight from your browser; the chat itself arrives through a small read-only relay
(see "How it talks to Kick").

It is always obvious whether chat text stays on your machine or goes to a cloud service,
and the default keeps it on the machine wherever the browser allows.

---

## Using it

- **Channel** - type a channel name, or paste a `kick.com/name` link, then Enter or
  **Go**. The channel is checked against Kick first, so a typo gets a clear error. Your
  last 8 channels show as one-click chips under the field (and on the start page).
- **Links** - the address is the channel: `bookhockeys.com/translate/#korekore_ch` opens
  that chat straight away, so a link can be shared or bookmarked.
- **Your language** - the select in the header. It starts empty and glows amber until
  you pick one, with your browser's language listed first. The choice is remembered.
  Changing it re-translates the last 30 lines.
- **Provider pill** - the most important control on the page. Green "On this device":
  nothing leaves the browser. Amber "Cloud: Google" (or whichever service answered): the
  text of chat lines (never names, badges or the channel) is being sent there, and an
  amber banner says so under the header. Grey: not translating (no language picked,
  paused, or nothing allowed). Click it to open **Who translates**.
- **Who translates** (the Providers sheet; from the bottom on phones) - the order: *On
  this device first* (default), *Cloud first*, or *On this device only* (nothing is ever
  sent). The cloud list - Google, our server, MyMemory, Lingva - with an on/off box each and
  up/down buttons to change the order, plus what each one is resting from right now. The
  on-device status with its download button, your own Lingva instance, and Clear cache
  (asks first). Closes with Done or Esc.
- **The one-time question** - the first time a line needs the cloud, a dialog asks
  "Translate through Google?" (the first service in your list) with "Use Google" or "Keep
  it on this device only". It only closes through those buttons, and the answer is
  remembered; the sheet has the same switch.
- **On demand** - nothing is translated by itself; foreign lines get a **Translate** chip
  (on phones the whole line is the tap target) and the status bar offers "Translate the
  last 20". It switches itself on, with a note at the top, when more than 200 lines a
  minute are going to the cloud, when a phone sits in a chat busier than 40 lines a
  minute, or when no translator is answering. Turning it off yourself keeps it off for
  five minutes.
- **Translations** - under each foreign line, with a two-letter tag for the language it
  came from (hover for the full name) and a small dot: green = translated on this device,
  amber = sent to a cloud service, grey = from the cache (seen before, nothing sent).
  Three pulsing dots mean it is on its way.
- **Lines that are not translated** - hover a line to see why: repeat (same person, same
  text within a minute), too short, emotes only, laughter (jajaja, kkkk, wwww, 555,
  ㅋㅋㅋ, хаха...), noise (keyboard smash), slang only (gg, pog, kekw, w...), already in your
  language, or too long (over 800 characters). The status bar counts translated, skipped
  and cache hits; hover it for the breakdown by reason.
- **Download (one time)** - on desktop Chrome and Edge, when a language pair could run on
  the device, a green bar offers to download it. It needs your click (the browser
  requires one); progress shows in the status bar. After that those lines never leave the
  machine.
- **Languages** - every language seen in this chat, with a line count. Turn one off and
  its lines stay on screen untranslated (useful when you read it anyway, and it saves
  budget in mixed chats). Presets: "Only <the most common one>", "Skip English", "All
  on". Remembered across channels.
- **Settings** (gear) - text size, compact rows, the language tag and provider dot on or
  off; filters: do not translate known chat bots (BotRix, Fossabot, KickBot, Sery_Bot,
  Kicklet, StreamElements, Nightbot, Moobot; on by default), muted people (their lines
  are not shown at all, on this browser only), and words that hide a line; a glossary
  ("what the translator wrote = what you want", whole words, any case) for names and
  in-jokes the engines mangle; the analytics switch for this browser; About.
- **Keys** - `/` channel field, `Space` pause, `o` originals, `d` on demand, `t` translate
  the last 20, `Esc` closes a sheet. Never while you are typing, and never over a
  question that needs an answer.
- **Originals** - shows the original line above each translation. Off = translations
  only, with the original on hover; the name always stays.
- **Channel strip** - avatar, name, LIVE or OFFLINE, viewers (refreshed every minute),
  the language Kick says the stream is in, and a link to open the channel on Kick.
  Offline channels still connect: their chat works, it is just quieter.
- **Chat lines** - badges as Kick draws them, the name in the colour its owner picked
  (lifted toward white when it would be unreadable on black), Kick emotes as images,
  links you can open, @mentions in bold, and "Replying to @name: ..." above replies.
  Lines a moderator deletes, and every line from someone banned or timed out, stay on
  screen struck through, so the conversation around them still reads. The last 400 lines
  are kept.
- **Following live** - the chat sticks to the newest line until you scroll up; then new
  lines are counted in a "N new, jump to live" pill instead of yanking the view away.
- **Pause** - freezes the view and stops all translating; nothing is sent while paused.
  Lines keep arriving underneath and are counted. On Resume only the last 30 waiting
  lines are translated; older ones get a **Translate** chip, so a long pause never turns
  into hundreds of lines sent at once.
- **Status bar** - the chat connection (connecting / live / reconnecting / failed, with
  Retry), lines per minute, the counters, and who is translating.
- **Phones** - the header folds into rows (name, channel field, language and pill), every
  row wraps, and nothing scrolls sideways at 375 px. Phones have no on-device translator,
  so the question about the cloud comes up on the first foreign line.

## Files

```
index.html            markup, meta/site kit, analytics bootstrap
styles.css            design A "Neon Splat" tokens + layout
app.js                the page: connect flow, chat buffer, per-line translation, pill, modal
chat.js               the relay socket (reconnect rules), event parsing, the line renderer
kick.js               everything that knows a kick.com URL (channel lookup, relay URL)
translate.js          languages, cleaning, skip rules, detection, cache, providers, batching
favicon.svg           hand-drawn two-bubble mark
favicon-*.png         16 / 32 / 192
apple-touch-icon.png  180x180
og-card.png           1200x630 share card
tools/make-assets.py  regenerates every PNG above (Pillow)
tools/selftest.mjs    checks the pure parts under Node (see "Self-test")
tools/fixture.mjs     200 real-looking chat lines with the expected skip reason and script
```

No build step, no runtime dependencies. Serve the folder over HTTP and open it (ES
modules do not load from `file://`).

## Self-test

```
node tools/selftest.mjs
```

No browser and no network: cleaning, every skip rule and the laughter table, the script
detector against the 200-line fixture, the Latin word vote, language codes, filters and
glossary, provider order and cooldowns, the chat frame parser (messages, replies,
deletions, bans, clears) and the name-colour floor. Exits 1 on any failure.

## How it talks to Kick

- **Channel lookup:** `GET https://kick.com/api/v2/channels/{slug}`, direct from the
  browser (Kick serves it with open CORS). It gives the channel id, the chat room id, the
  avatar, live state, viewers and the declared stream language.
- **Chat:** Kick's chat is a Centrifugo websocket that only accepts kick.com as the page
  origin, so the page reads it through `stumble-worker`'s `/chat-ws` relay (the same one
  Stumble uses for its chatter count). The relay is read-only: it forwards Kick's public
  chat frames and never sends anything to Kick on your behalf. If the socket drops, the
  page retries four times with a growing pause, then shows "failed" with a Retry button
  and keeps the lines it already has.
- **Local testing:** the deployed relay allows the `book` dev server's origin
  (`http://127.0.0.1:3460`), so no Worker needs to run locally. `?worker=local` points the
  page at `wrangler dev` on port 8787 instead.

## How it translates

Per line: show the original at once, then **clean** it (emotes, links, @mentions and emoji
come out; "holaaaa" becomes "hola"; only what is left could ever be sent), check the
**skip rules**, look in the **cache**, **detect** the language, and if it is not yours,
queue it.

- **Detection:** the browser's own language detector when it has one (desktop Chrome and
  Edge); otherwise the script (kana = Japanese, Hangul = Korean, Cyrillic, Arabic, Thai...)
  and, for Latin-script lines, a small common-word vote, then the channel's declared
  language. When the on-device detector is unsure about a short Latin line, the word vote
  and the channel's language win.
- **On this device first:** Chrome's built-in Translator. Every call to it is raced
  against a 3-second timeout, because in some Chromium shells it never answers; a hang
  falls through to the cloud instead of freezing the chat. A language pair is never
  downloaded without your click.
- **Batching:** lines that arrive within 120 ms of each other go out together (up to 40),
  with at most four batches in flight.
- **Google** (cloud): the unofficial `translate.googleapis.com/translate_a/t` endpoint,
  straight from your browser, so it spends your own connection's allowance. One request
  per batch. Google also names the language it saw, which corrects the tag; a line it
  says is already in your language is dropped.
- **Our server** (cloud): `POST /translate` on `stumble-worker` (Workers AI m2m100). It
  needs the source language, so lines the detector could not place skip it. Capped at
  the free daily allowance for everyone together; when it is used up it says so and the
  next service takes over.
- **MyMemory** and **Lingva** (cloud, last resort): one request per line, slow, and weaker
  on chat, there so a line is never left blank. Lingva rotates through public instances
  (yours first if you set one) and ignores answers that just repeat the input.
- **Cooldowns:** a service that fails rests for 10 seconds, doubling up to 5 minutes (a
  used-up budget rests 5 minutes at once). A language a service does not support is not
  a failure; it just skips that line. The last service that answered goes first until it
  fails, so a batch does not keep knocking on a door that is closed.
- **Cache:** 2,000 entries for 24 hours, in memory and in IndexedDB, keyed by the cleaned
  text and your language. Chat repeats itself a lot, so this saves real requests.

## Stored in your browser

| Key | What |
|---|---|
| `kt:target` | the language you read |
| `kt:cloud` | your answer to the cloud question (`yes` / `no`) |
| `kt:originals` | whether original lines are shown |
| `kt:mode` | on this device first / cloud first / on this device only |
| `kt:order`, `kt:enabled` | your cloud list: order and which are on |
| `kt:lingva` | your own Lingva instance, if any |
| `kt:settings` | look, filters (bots, muted people, hidden words) and glossary |
| `kt:srcoff` | languages you turned off |
| `kt:recent` | your last 8 channels |
| IndexedDB `kct-cache` | recent translations (24 h, 2,000 at most) |
| `greenline-consent` | the site-wide analytics consent choice (shared with other bookhockeys.com pages) |
| `bookhockeys_ga_optout` | set by visiting `?ga=off` once; `?ga=on` clears it |

## Analytics

GA4 `G-DYME377V2S`, shared with the rest of bookhockeys.com. Visitors in European
timezones get a consent banner and analytics stays off until they accept; everyone else
is counted anonymously with no banner. Visiting `/translate/?ga=off` once turns analytics
off for that browser for good (the script is not even loaded); `?ga=on` undoes it.
Analytics events never carry chat text, user names or the channel.

## Roadmap

- v1.0.0 - a row on the bookhockeys.com home page, sitemap, llms.txt, release.
- v2.0.0 - Sign in with Kick and reply in the channel's language (previewed as you type),
  7TV emotes, maybe several channels in tabs.

---

## Changelog

### v0.5.0 - 2026-10-20

The page now fits how people actually read a chat for hours: you choose what is worth
translating, and the noise you never want to see stays out of the way. It is the last
step before the public release.

- **Languages**: see which languages the chat is in and switch any of them off, or keep
  only the main one.
- **Filters**: bots are not translated, muted people and lines with words you pick are
  not shown at all.
- **Glossary**: fix names and in-jokes the translators get wrong, once, for every line.
- **Settings**: text size, compact rows, and the tag and dot under each line on or off.
- **Keys** for everything you do often, a list of recent channels, and links that open a
  channel directly (`/translate/#name`).
- A self-test with 200 real-looking chat lines guards the skip rules and language
  detection against regressions.

### v0.4.0 - 2026-10-20

One cloud service is a single point of failure: Google's endpoint is unofficial and
rate-limits busy connections, and phones have nothing else. This version makes the page
keep working, worse but never blank, whatever fails, and puts you in charge of who sees
the text.

- Three more translators behind Google: our own server (capped at a free daily budget so
  it never runs up a bill), then MyMemory and Lingva as a last resort.
- A service that fails rests and the next one takes over; the one that answered last goes
  first, so lines do not wait on a service that is down.
- **Who translates** (click the pill): on-device first, cloud first or on-device only;
  turn each cloud service on or off and change their order; download a language pack;
  point Lingva at your own instance; clear the cache (it asks first).
- **On demand**: translate only the lines you tap, with "Translate the last 20". It turns
  itself on when the cloud would be flooded (over 200 lines a minute, a busy chat on a
  phone, or no service answering) and says so.

### v0.3.0 - 2026-10-20

Translation is here. The point of the page is reading a chat you could not read before,
without quietly shipping everyone's messages off to a server, so the privacy state is
built into every step rather than added later.

- Every foreign line gets its translation underneath, tagged with the language it came
  from and a dot that says whether it was translated on your device, in the cloud, or
  from the cache.
- On desktop Chrome and Edge it translates on your own computer when the language pack
  is there, and offers a one-click download when it is not. Nothing is downloaded
  without that click.
- Anything that would leave the browser is asked about once, in a dialog with a clear
  "keep it on this device only" choice. While the cloud is in use the pill turns amber
  and a banner says so.
- Lines not worth translating (repeats, laughter, emotes, "gg") are skipped, and hovering
  a line says why. That keeps the chat calm and the cloud requests few.
- Translations are cached for a day, so the same "what game is this" is never sent twice.
- Pause now also stops translating; resuming translates only the newest lines.
- An Originals switch shows translations only, with the original on hover.

### v0.2.0 - 2026-10-20

The chat now looks like a chat. A translation is only useful if you can tell who said
what, what they were answering and what a moderator removed, so the lines needed to be
right before anything gets added under them.

- Badges, name colours and Kick emotes, as on kick.com. Names picked in near-black are
  lifted so they stay readable on the dark page.
- Replies show the line they answer; links open in a new tab; @mentions stand out.
- Deleted lines and lines from banned or timed-out users are struck through, not
  removed, so the replies around them still make sense.
- Scrolling up to read no longer gets interrupted: new lines are counted in a "jump to
  live" pill instead.
- Pause freezes the view while the chat keeps arriving underneath.
- The page keeps the newest 400 lines, so a busy chat left open for hours stays light.

### v0.1.0 - 2026-10-20

First release: the frame everything else hangs on. Before any translating can be
trusted, the chat itself has to arrive reliably and look right at every width, so this
version does only that.

- Type a channel (or paste a kick.com link) and its live chat starts flowing, read-only,
  through the same relay Stumble already uses. Nothing is installed and nothing is
  posted to Kick.
- The header holds the language you read (empty and glowing until you choose, so the
  page never guesses silently) and the provider pill that will say, from v0.3.0, whether
  chat text stays on your machine.
- The status bar says whether the chat is live, reconnecting or lost, with a Retry, and
  how busy the chat is.
- Works at phone width with no sideways scrolling.
- Favicon, share card and the usual bookhockeys.com analytics with the `?ga=off`
  opt-out, from day one.
