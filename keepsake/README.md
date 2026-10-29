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
          iPhone / iPad   fetch /media into a File -> navigator.share({files}) -> Save Image / Save Video
          everything else <a download href="/media?...&dl=1&n=<name>"> (the Worker sends
                          Content-Disposition: attachment)
     -> Save all          fetch each item, build a store-only zip in the browser, download it
                          (iPhone: share sheet, Save to Files). Capped at 300 MB.
```

The Worker is a resolver and a pipe and stores nothing; see
`T:\ClaudeCodeRepo\keepsake-worker\README.md` for its endpoints, the ladder
and the post shape. Instagram's CDN does not let a page fetch its files
directly in a way we can rely on, so every byte goes through `/media`.

Video: the preview and the saved file are Instagram's progressive MP4 (short
side 720, with sound when the post has any). When the post also has a taller
version, the details say "1080p available"; saving it is version 0.3.0. A
video with no audio track says "No sound on this video" rather than promising
sound.

File names: `<username>_<YYYY-MM-DD>_<shortcode>[_<n>].<ext>`, so a folder of
saves sorts by account, then date. The date is the post's local calendar day.

## Files

```
index.html             page + CSS + app JS (views, viewer, film strip, details, saving, theme)
ig.js                  link parsing, /resolve client, error copy, file names (no DOM)
save.js                iOS detection, share-sheet save, blob download, store-only zip (no DOM state)
terms.html             terms of use
manifest.webmanifest   add to home screen (no share target yet; that is 0.2.0)
favicon.svg            ink frame with a K on paper
favicon-*.png          16 / 32 / 192 / 512
apple-touch-icon.png   180x180
og-card.png            1200x630 share card
tools/make-assets.py   regenerates every PNG above (Python + Pillow)
```

No build step, no dependencies. Locally: run the `book` server (port 3460)
and the `keepsake-worker` entry (port 8799) from `T:\ClaudeCodeRepo\.claude\launch.json`;
on localhost the page talks to the local Worker.

## Analytics

GA4 as on Clip Yoink, with the `?ga=off` / `?ga=on` per-device opt-out and the
site-wide consent key (visitors in Europe are asked first). Three events, each
with one label and never a link, shortcode, username or caption:
`keepsake_resolve` (`method`: which Instagram route answered),
`keepsake_save` (`method`: download, share, zip), `keepsake_error` (`cause`).

## Changelog

- **0.1.0** (2026-10-29): first version. Paste a post, reel or carousel link
  and see it uncropped in a numbered frame, with every carousel item on a
  film strip under it. Photos save at the largest size Instagram returns
  (4096 px wide where the poster uploaded that), videos as the MP4 with sound,
  and Save all builds one zip. On iPhone the save goes through the share sheet
  because that is the only way a web page can put a file in Photos. Light by
  default, follows the device, with a dark switch in the footer.
