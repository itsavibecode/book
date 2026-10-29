# Keepsake - Instagram post downloader

Paste a public Instagram link, see every photo and video uncropped at the size
Instagram stores it, and save one item or all of them. Phone first: the save
button sits in a bar at the bottom, and on iPhone it goes through the share
sheet so files land in Photos.

Will live at **https://bookhockeys.com/keepsake/**, terms at
**https://bookhockeys.com/keepsake/terms.html**. Not linked from the home page
yet: the iPhone save path needs a check on a real device first (PLAN 11).

Not affiliated with Instagram or Meta. The plan and the decisions behind it are
in `T:\ClaudeCodeRepo\future\instagram-downloader\PLAN.md`.

---

## How a link becomes a file

```
link -> KeepsakeIG.parseLink()          instagram.com, www., m.; /p/ /reel/ /reels/ /tv/ /<user>/p/
     -> POST keepsake-worker /resolve   the Worker asks Instagram (api/graphql first, then three
                                        fallbacks) and answers with the post and signed /media links
     -> viewer                          <img> / <video> straight from /media (Range works, so seeking works)
     -> Save
          photo, or a video at "plays everywhere"
            iPhone / iPad   fetch /media into a File -> navigator.share({files}) -> Save Image / Save Video
            everything else <a download href="/media?...&dl=1&n=<name>"> (the Worker sends
                            Content-Disposition: attachment)
          video at "best" (the default, except on iPhone)
            fetch the best video-only file and its sound file through /media, side by side
            -> mux.js (mediabunny, loaded on first use) copies both into one MP4, no re-encode
            -> download the blob, or the share sheet on iPhone
     -> Save all          fetch each item, build a store-only zip in the browser, download it
                          (iPhone: share sheet, Save to Files). Capped at 300 MB.
```

The Worker is a resolver and a pipe and stores nothing; see
`T:\ClaudeCodeRepo\keepsake-worker\README.md` for its endpoints, the ladder
and the post shape. Instagram's CDN does not let a page fetch its files
directly in a way we can rely on, so every byte goes through `/media`.

Video: the preview plays Instagram's ready-made MP4 (short side 720, H.264,
with sound when the post has any). When Instagram also keeps a larger
version, the details show a Quality choice and the save takes the best one by
default: Instagram stores it as a video-only VP9 file plus a separate AAC
sound file, which mux.js joins into one MP4 in the browser in about a second.
On iPhone the default stays the ready-made file, because iPhone Photos may not
play VP9; one tap on "best" switches. If a browser cannot join the files, the
page says so and offers the ready-made file. A video with no audio track says
"No sound on this video" rather than promising sound.

File names: `<username>_<YYYY-MM-DD>_<shortcode>[_<n>].<ext>`, so a folder of
saves sorts by account, then date. The date is the post's local calendar day.

## Files

```
index.html             page + CSS + app JS (views, viewer, film strip, details, saving, theme)
ig.js                  link parsing, /resolve client, error copy, file names (no DOM)
save.js                iOS detection, share-sheet save, blob download, store-only zip (no DOM state)
mux.js                 joins the best video file and its sound file into one MP4 (ES module, lazy)
vendor/mediabunny.min.mjs        mediabunny 1.61.0, unmodified (MPL-2.0; licence beside it)
vendor/mediabunny.LICENSE.txt    sha256 of the .mjs: fa696c53494b6b09a8b310ec51e3c44a59e79513234fb832255a38c686162009
terms.html             terms of use
manifest.webmanifest   add to home screen (no share target yet; that is 0.2.0)
favicon.svg            ink frame with a K on paper
favicon-*.png          16 / 32 / 192 / 512
apple-touch-icon.png   180x180
og-card.png            1200x630 share card
tools/make-assets.py   regenerates every PNG above (Python + Pillow)
```

No build step; the one dependency is vendored. Locally: run the `book` server (port 3460)
and the `keepsake-worker` entry (port 8799) from `T:\ClaudeCodeRepo\.claude\launch.json`;
on localhost the page talks to the local Worker.

## Analytics

GA4 as on Clip Yoink, with the `?ga=off` / `?ga=on` per-device opt-out and the
site-wide consent key (visitors in Europe are asked first). Three events, each
with one label and never a link, shortcode, username or caption:
`keepsake_resolve` (`method`: which Instagram route answered),
`keepsake_save` (`method`: download, download-best, share, share-best, zip),
`keepsake_error` (`cause`).

## Changelog

- **0.2.0** (2026-10-29): videos now save at the best quality Instagram keeps
  (1080p where it has it) instead of its 720p copy, with the sound joined back
  in by the page, because a saved copy should be the best one there is. A
  Quality choice under the details switches to the 720p file that plays
  everywhere, and stays the default on iPhone, where Photos may not play the
  1080p (VP9) file. Save all uses the same choice. Video length now counts
  like a video player (59.8 s shows 0:59, not 1:00).
- **0.1.0** (2026-10-29): first version. Paste a post, reel or carousel link
  and see it uncropped in a numbered frame, with every carousel item on a
  film strip under it. Photos save at the largest size Instagram returns
  (4096 px wide where the poster uploaded that), videos as the MP4 with sound,
  and Save all builds one zip. On iPhone the save goes through the share sheet
  because that is the only way a web page can put a file in Photos. Light by
  default, follows the device, with a dark switch in the footer.
