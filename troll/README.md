# Baited — troll video maker

A single-page, no-backend troll video generator. You give it a **bait** (an image or a
clip), pick a **sound or clip**, set a **duration**, and it renders an 854x480 MP4
entirely in the browser with ffmpeg.wasm. Nothing is ever uploaded.

Live at **https://bookhockeys.com/troll/**

Two ways a video can come out, decided by what you attach as the preset:

| Preset is | What you get |
|---|---|
| **audio** | The bait holds (a still image, or your clip with its own sound stripped) while the sound loops for the whole duration. |
| **video** | The bait shows for exactly **5 frames** (0.2083 s at 24 fps), then hard-cuts to the clip, which supplies the audio. |

Every output is 854x480 letterboxed on black, 24 fps, H.264 `ultrafast` CRF 28,
AAC 96k, `+faststart`, downloaded under a random 8-character name.

---

## Files

```
index.html            the whole app — markup, CSS custom properties, vanilla JS
vendor/ffmpeg.js      @ffmpeg/ffmpeg 0.12.10 UMD build, vendored verbatim (MIT)
vendor/814.ffmpeg.js  its worker chunk — must be same-origin, which is why it is vendored
favicon.svg           inline-drawn hook mark
favicon-*.png         16 / 32 / 192
apple-touch-icon.png  180x180
og-card.png           1200x630 share card
watermark.png         the optional burn-in badge (also inlined as base64 in index.html)
tools/make-assets.py  regenerates every image above, and the base64 blob
```

There is no build step. Open `index.html` over HTTP and it runs. (Over `file://` it
will not — Workers and WebCrypto both need a real origin.)

## Pinned dependencies

Exactly two, both pinned, nothing else at runtime:

| Package | Version | Where it lives |
|---|---|---|
| `@ffmpeg/ffmpeg` | 0.12.10 (UMD) | vendored in `vendor/` — the worker must be same-origin |
| `@ffmpeg/core` | 0.12.10 (single-thread UMD) | R2, because the wasm is 32 MB |

```
CORE_BASE = https://pub-516bf519bcaf4ebba2d1e3006fafce78.r2.dev/ffmpeg/0.12.10
  ffmpeg-core.js     112,059 B   sha256 b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21
  ffmpeg-core.wasm 32,232,419 B  sha256 9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7
```

Both files are fetched, **checked against those hashes**, and only then wrapped in blob
URLs and handed to `ffmpeg.load()`. A mismatch refuses to run and says so in the red
banner. Objects on R2 are immutable per version, so bumping the core means uploading a
new `0.12.x/` prefix and changing `CORE_BASE` — old paths stay put so cached pages keep
working. Re-upload with `bash r2/setup.sh` in the plan folder.

The core is **single-threaded on purpose**: no `SharedArrayBuffer`, so the page needs no
COOP/COEP headers and runs on plain static hosting.

## The four recipes

`buildArgs()` in `index.html` produces one argument array per combination of
bait kind and preset kind. A self-check compares all six documented variants against
the reference arrays token for token on every page load; it is silent when they match
and shouts in the console when they do not. To see them all:

```
https://bookhockeys.com/troll/?selftest=1
```

or call `baitedSelfTest()` from the console.

## Adding presets

`PRESETS` near the top of the script is the whole registry:

```js
var PRESETS = [
  { id: 'custom', name: 'Custom sound or clip (upload)', kind: 'custom' }
];
```

v0.1.0 ships with only the custom-upload entry — no clips are bundled. To add a real
preset, drop the media on the R2 bucket next to the core and add
`{ id, name, kind: 'audio' | 'video', url }`. Nothing else needs to change. Keep preset
media off this public repo if it features anyone's face or voice.

## Known limits

- **URL input needs a CORS-friendly host.** The browser does the fetching, so plenty of
  image hosts will refuse. Uploading always works; the tooltip says so.
- **Volume boost only affects sound presets.** A clip preset keeps its own audio, so the
  switch disables itself and explains why rather than pretending to do something.
- **iOS memory.** A long render plus a 32 MB wasm can run a phone out of memory. Duration
  is capped at 60 s and long renders warn on iOS.
- **First load is ~32 MB.** Cached immutably after that.

## What this is not

A clean-room rebuild of a page layout and an ffmpeg recipe. None of the original site's
code, branding, watermark or preset media is used here — the mark, the wordmark, the
art and all the code are ours.

---

## Changelog

### v0.1.0 — 2026-09-19

First release. The point of building it was to have a troll-video maker that works on
day one with nothing bundled and nothing uploaded, so the whole tool is one static file
plus a pinned ffmpeg.

- Bait by URL, file picker, drag-and-drop or paste, with a thumbnail so you can see it
  parsed before spending a render on it.
- Custom sound/clip upload as the shipped preset, with a data-driven registry ready for
  hosted presets later.
- Duration 1–60 s, starting on a random 9–23 each visit; change it once and it is
  remembered, along with your preset and switch positions.
- Optional burn-in "baited" badge, off by default, bottom-right from frame 10.
- Cancel during a render, and pipeline failures land in a red banner with the real
  reason instead of quietly replacing the progress text.
- The ffmpeg core is checksum-verified before it is allowed to run.
