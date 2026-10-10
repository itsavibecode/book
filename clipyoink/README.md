# Clip Yoink - Kick clip downloader

Paste a Kick clip link, get the MP4. A single page with no backend: your browser talks
to Kick directly, and nothing is uploaded, stored, cached or proxied by us.

Live at **https://bookhockeys.com/clipyoink/** - terms at
**https://bookhockeys.com/clipyoink/terms.html**

Not affiliated with Kick.

---

## How a clip becomes an MP4

```
link -> parseClipInput()                         clip_ + 26 chars, from any link shape
     -> GET kick.com/api/v2/clips/{id}           15 s timeout; 404 or privacy != public = "doesn't exist"
     -> HEAD clips.kick.com/tmp/{id}.mp4
          200  -> GET it                          "Saved Kick's own MP4 directly"     method: direct
          else -> GET the clip's playlist.m3u8, read every #EXT-X-BYTERANGE
               -> fetch the byte ranges, 4 at a time, in order, 3 retries each
               -> ffmpeg.wasm stream copy (no re-encode)                         method: remux
                  -i in.ts -map 0:v -map 0:a -c copy -bsf:a aac_adtstoasc -movflags +faststart out.mp4
               -> if the converter cannot load or run: offer the raw .ts         method: ts
```

Kick keeps a ready-made MP4 at `tmp/{id}.mp4` for some clips (mostly recent ones). When it
is there it is one download and zero processing. When it is not, the answer is a 403,
not a 404, so anything but a 200 counts as a miss. The rebuild is the main path, not the
exception: a stream copy of the 26 s test clip comes out at exactly the same 28,673,674
bytes as Kick's own file, in a few seconds.

The ffmpeg core (32 MB) is only fetched on the rebuild path, starts downloading alongside
the segments, and is cached by the browser after the first time. Baited uses the same
pinned copy from the same URL, so anyone who has used Baited already has it.

Cancel (the button or Esc) aborts every request in flight and, if the converter is
running, stops its worker. The next run starts a fresh converter from the copy already
in memory.

## Files

```
index.html            page + CSS + app JS (state machine, result card, analytics events)
terms.html            terms of use
kick.js               link parsing, Kick API, fast-path check, m3u8 parser, byte-range fetcher (no DOM)
remux.js              lazy ffmpeg.wasm loader (sha256-checked) + the stream-copy remux
vendor/ffmpeg.js      @ffmpeg/ffmpeg 0.12.10 UMD build, copied verbatim from ../troll/vendor (MIT)
vendor/814.ffmpeg.js  its worker chunk - must be same-origin, which is why it is vendored
favicon.svg           orange tile, black Y
favicon-*.png         16 / 32 / 192
apple-touch-icon.png  180x180
og-card.png           1200x630 share card
tools/make-assets.py  regenerates every PNG above (Python + Pillow)
```

The home page's mini-button icon is `../links/clipyoink.svg` (the same Y, orange on black).

No build step. Serve the folder over HTTP and open it; over `file://` it will not work
(the worker and WebCrypto need a real origin).

## Pinned dependencies

| Package | Version | Where it lives |
|---|---|---|
| `@ffmpeg/ffmpeg` | 0.12.10 (UMD) | vendored in `vendor/` |
| `@ffmpeg/core` | 0.12.10 (single-thread UMD) | Baited's R2 bucket |

```
CORE_BASE = https://pub-516bf519bcaf4ebba2d1e3006fafce78.r2.dev/ffmpeg/0.12.10
  ffmpeg-core.js     112,059 B   sha256 b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21
  ffmpeg-core.wasm 32,232,419 B  sha256 9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7
```

Single-threaded on purpose: no `SharedArrayBuffer`, so no COOP/COEP headers, so it runs on
GitHub Pages.

## Accepted links

`kick.com/<channel>/clips/clip_...`, `kick.com/<channel>?clip=clip_...` (any query order),
`kick.com/clips/clip_...`, the `www.` / `m.` / `player.` variants, a bare `clip_...` id,
and any text that contains a clip id. Only the id is used, so tracking params do not
matter. Pasting a link runs it straight away; typed text needs Enter. `/` jumps to the
link box from anywhere on the page.

## Analytics

GA4 `G-DYME377V2S` with the site-wide `greenline-consent` banner (Europe asks first),
`?ga=off` / `?ga=on` per-device opt-out, and a Cookies link in the footer. Three events,
labels only - **never a clip link, id, title or channel**:

| Event | Param | Values |
|---|---|---|
| `clipyoink_resolve` | `result` | `ok`, `bad_url`, `not_found`, `network` |
| `clipyoink_download` | `method`, `duration_bucket` | `direct` / `remux` / `ts`; `0-30s`, `31-60s`, `61-120s`, `121s+` |
| `clipyoink_error` | `stage` | `playlist`, `segments`, `core`, `remux`, `unexpected` |

`clipyoink_download` fires when Save (or Download .ts) is pressed, not when the result
appears.

## Known limits

- **All of this is unofficial on Kick's side.** The open `api/v2`, the `*` CORS on
  `clips.kick.com` and the `tmp/` MP4s can change at any time. The rebuild path survives
  `tmp/` going away; the other two would need a proxy Worker (not built until needed).
- **Some networks get a Cloudflare check from kick.com.** The "Couldn't reach Kick" message
  says to open kick.com once in a tab and retry.
- **Big clips on phones.** Clips run up to 180 s; at 1080p60 that is ~145 MB of stream plus
  the MP4. The expected size shows before the segments start, so you can cancel.
- **A miss shows a 403 in the browser console.** That is the fast-path check doing its job.
- **Frame rate is only known on the rebuild path** (read from ffmpeg's log). A fast-path
  result shows `1080p` rather than `1080p60`.

---

## Changelog

### v0.1.0 - 2026-10-10

First release. People who want a clip off Kick either use Kick's own download button,
which needs an account, or a third-party site that sends the clip through its own server
or re-encodes it slowly in the browser. Clip Yoink does neither: it asks Kick for the
clip's ready-made MP4, and when Kick does not have one it stitches the clip's stream
pieces back together without re-encoding, so the result is the same file Kick would have
given you, in seconds, and nothing ever passes through us.

- Paste a link and it starts on its own. Works with every Kick clip link shape.
- Shows what it is doing as it goes: reading the clip, fetching the video (with segment
  count and megabytes), building the MP4, ready. Cancel or Esc stops it at any point.
- The result card plays the clip and lists the channel, clipper, title, duration, views,
  likes, date, file size and resolution, with Save MP4, Copy clip link and Open on Kick.
  Mature clips get an 18+ chip.
- If the converter cannot run in your browser, you can still save the raw `.ts` stream,
  which VLC and most players open.
- A plain-language terms page: not affiliated with Kick, we own no clips, nothing is
  hosted here, takedowns go to Kick. The link box carries a one-line disclaimer, the
  footer links to the terms, and the first successful download shows a one-time note.
