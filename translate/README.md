# Kick Translate v0.2.0 - read any Kick chat in your language

A single page that shows a Kick channel's live chat with a translation under every line
that is not in your language. Type a channel, pick the language you read, and keep it
open beside the stream (or beside Stacked), the way a subtitle track sits under a video.

Live at **https://bookhockeys.com/translate/** (not linked from the home page until
v1.0.0).

Not affiliated with Kick. Channel info comes from Kick's public channel API, fetched
straight from your browser; the chat itself arrives through a small read-only relay
(see "How it talks to Kick").

This version renders the chat properly (badges, name colours, emotes, replies,
moderation) and lets you pause it. Translation arrives in v0.3.0.

---

## Using it

- **Channel** - type a channel name, or paste a `kick.com/name` link, then Enter or
  **Go**. The channel is checked against Kick first, so a typo gets a clear error.
- **Your language** - the select in the header. It starts empty and glows amber until
  you pick one, with your browser's language listed first. The choice is remembered.
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
- **Pause** - freezes the view so you can read. Lines keep arriving underneath and are
  counted; Resume (or the pill) jumps back to live.
- **Status bar** - the chat connection (connecting / live / reconnecting / failed, with
  Retry) and lines per minute.
- **Phones** - the header folds into rows (name, channel field, language), every row
  wraps, and nothing scrolls sideways at 375 px.

## Files

```
index.html            markup, meta/site kit, analytics bootstrap
styles.css            design A "Neon Splat" tokens + layout
app.js                the page: connect flow, chat buffer, status bar, toasts
chat.js               the relay socket (reconnect rules) and the line renderer
kick.js               everything that knows a kick.com URL (channel lookup, relay URL)
translate.js          reading languages; the translation pipeline from v0.3.0
favicon.svg           hand-drawn two-bubble mark
favicon-*.png         16 / 32 / 192
apple-touch-icon.png  180x180
og-card.png           1200x630 share card
tools/make-assets.py  regenerates every PNG above (Pillow)
```

No build step, no runtime dependencies. Serve the folder over HTTP and open it (ES
modules do not load from `file://`).

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

## Stored in your browser

| Key | What |
|---|---|
| `kt:target` | the language you read |
| `greenline-consent` | the site-wide analytics consent choice (shared with other bookhockeys.com pages) |
| `bookhockeys_ga_optout` | set by visiting `?ga=off` once; `?ga=on` clears it |

## Analytics

GA4 `G-DYME377V2S`, shared with the rest of bookhockeys.com. Visitors in European
timezones get a consent banner and analytics stays off until they accept; everyone else
is counted anonymously with no banner. Visiting `/translate/?ga=off` once turns analytics
off for that browser for good (the script is not even loaded); `?ga=on` undoes it.
Analytics events never carry chat text, user names or the channel.

## Roadmap

- v0.3.0 - translation: on-device first (desktop Chrome and Edge), Google as the cloud
  fallback after a one-time question, skip rules, cache.
- v0.4.0 - more providers (our own Worker, MyMemory, Lingva), the Providers sheet,
  translate-on-demand.
- v0.5.0 - language and user filters, glossary, settings, keyboard, recent channels,
  shareable `#channel` links, a self-test.

---

## Changelog

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
