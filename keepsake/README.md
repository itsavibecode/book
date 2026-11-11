# Keepsake - Instagram, Snapchat and X downloader, and a GIF maker

Paste a public Instagram, Snapchat or X link (or type a Snapchat username),
see every photo and video uncropped at the size it was posted, and save one
item or all of them. The YouTube GIF tab turns part of a video file into a
GIF, between a start and a stop marker. Phone first: the save button sits in
a bar at the bottom, and on iPhone it goes through the share sheet so files
land in Photos.

Will live at **https://bookhockeys.com/keepsake/**, terms at
**https://bookhockeys.com/keepsake/terms.html**. Not linked from the home page
yet: the iPhone save path needs a check on a real device first (PLAN 11).

Not affiliated with Instagram, Meta, Snap, X or YouTube. The plan and the decisions behind it are
in `T:\ClaudeCodeRepo\future\instagram-downloader\PLAN.md`.

---

## How a link becomes a file

```
link -> KeepsakeIG.parseLink()          instagram.com, www., m.; /p/ /reel/ /reels/ /tv/ /<user>/p/;
                                        /share/ links go to the Worker, which finds the post they open
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

## Tabs (0.4.0)

A row of tabs under the wordmark: **Instagram | Snapchat | X | YouTube GIF**
(PLAN 12). Each tab re-colours the whole page from its own token set
(`:root[data-platform=...]` in index.html, light and dark), keeps Keepsake's
layout, and swaps the line under the wordmark, the field's hint and the guide.
Pasting a link from another site switches the tab on its own. The tab is
remembered on the device and shows in the address as `?p=`, so a home-screen
icon or a shared link opens on the right one. Arrow keys move between tabs.

Colours (light / dark accent; every text pair at least 5.6:1, every border
and selection line at least 3.3:1, both themes):

| Tab | Accent | Note |
|---|---|---|
| Instagram | #b4246f / #f06fae | pink-paper page |
| Snapchat | #fffc00 / #fffc00 | yellow only fills the save button (ink text, ink edge on light); ink marks the selected frame |
| X | #0f1419 / #e7e9ea | black and white, cool grey paper |
| YouTube GIF | #cc0000 / #ff6b63 | warm paper |

- **Snapchat:** a username or profile link brings back the profile's current
  story (when there is one), every highlight and its Spotlight videos, shown
  as a row of choices above the viewer; picking one shows its snaps on the
  usual strip. Snapchat gives no size or length up front, so the page reads
  them off each file as it loads. File names use the set:
  `nasa_2026-04-10_highlight-moon-joy_3.mp4`.
- **X:** a post link brings back its photos at their original size (up to
  8192 px seen) and videos at the highest bitrate X keeps (up to 3840 x 2160
  seen), with sound. GIFs are saved as the MP4 X stores them as.
- **YouTube GIF:** YouTube does not let other sites read its videos, so this
  tab works on a video file on the device (PLAN 12.5); nothing is uploaded.
  Pick or drop a file, then set the part: a **start marker and a stop marker
  on a film-strip timeline** with the part between them shaded and their
  times written above them, which can be dragged, nudged with the arrow keys
  (Shift for whole seconds), typed, or set with "Start here" / "Stop here" at
  the playing frame. "Play the GIF part" loops only that part. Width 320 to
  800 px, 10 to 20 frames a second, plays over and over or once; up to 30 s
  and 600 frames. Encoded in the browser with gifenc (`vendor/gifenc.js`,
  loaded on the first Make GIF). Recordings without a length in their header
  (browser WebM) are measured by seeking to the end first.

## Phone extras (0.3.0)

- **Android Share menu.** `manifest.webmanifest` has a `share_target`
  (GET to `/keepsake/` with `title`, `text`, `url`). Once Keepsake is on the
  home screen, Instagram's Share menu lists it; Instagram usually puts the link
  inside `text`, which the page reads like `?url=`. iPhone has no share target
  for web apps, and the guide says so.
- **Recent.** The last 20 posts fetched, in `localStorage` under
  `keepsake-recent`: shortcode, link, username, date, type, item count, video
  length and a 96 px JPEG of the first item (the proxied thumbnail link would
  expire after 90 minutes). Shown on the idle page, five at a time; tap one to
  fetch it again. Clear asks first, in a dialog. Nothing leaves the device,
  and the list stays hidden when storage is blocked.
- **Status line.** Under the guide, one sentence from the Worker's `/health`
  (`working` or `failing`, and how long ago). Hidden when the Worker cannot be
  reached or has no record yet.
- **Offline shell.** `sw.js` keeps the page's own files (network first, cache
  as the fallback) so the installed app opens without a connection. It only
  answers same-origin requests inside `/keepsake/`: the Worker, Instagram and
  analytics never touch it. It registers on https only, so local edits are
  never served stale; add `?sw=1` to test it locally. Bump `VERSION` in sw.js
  with every release so old caches are dropped.

## Files

```
index.html             page + CSS + app JS (views, viewer, film strip, details, saving, theme)
ig.js                  link parsing for all three sites, /resolve client, error copy per site, file names (no DOM)
gifmaker.js            YouTube GIF tab: file in, start/stop markers, preview loop, GIF encode
save.js                iOS detection, share-sheet save, blob download, store-only zip (no DOM state)
mux.js                 joins the best video file and its sound file into one MP4 (ES module, lazy)
sw.js                  app-shell cache for the installed app (page files only)
vendor/mediabunny.min.mjs        mediabunny 1.61.0, unmodified (MPL-2.0; licence beside it)
vendor/mediabunny.LICENSE.txt    sha256 of the .mjs: fa696c53494b6b09a8b310ec51e3c44a59e79513234fb832255a38c686162009
vendor/gifenc.js       gifenc 1.0.3 (MIT, licence in the file), copied from Kick GIF Clipper
terms.html             terms of use
manifest.webmanifest   add to home screen + Android share target
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
`keepsake_resolve` (`method`: which route answered, `platform`),
`keepsake_save` (`method`: download, download-best, share, share-best, zip, gif, gif-share),
`keepsake_error` (`cause`, `platform`).

## Changelog

- **0.4.0** (2026-11-11): Keepsake grows from an Instagram tool into four
  tabs, each in its own colours. Snapchat: type a username to save someone's
  public story, highlights and Spotlight videos. X: paste a post to save its
  photos at full size and its video at the best quality X keeps, with sound.
  YouTube GIF: pick a video file, set a start and a stop marker on the
  timeline, watch that part loop, and turn it into a GIF on your device.
  A YouTube link itself cannot be used, because YouTube does not let other
  sites read its videos.
- **0.3.1** (2026-11-06): opened from the iPhone home screen, the top of the
  page, the full-screen photo bar and the "copied" message could sit under
  the clock and notch, because the page asks to fill the whole screen. Every
  edge-pinned part now keeps clear of them (nothing changes on desktop or in
  the browser). The iPhone guide also says how to add Keepsake to the home
  screen.
- **0.3.0** (2026-10-31): made for the phone. On Android, Keepsake now shows
  up in Instagram's Share menu once it is on the home screen, so saving a post
  no longer needs a copy and paste. `instagram.com/share/...` links work. The
  idle page keeps a short list of recent posts on the device so a post can be
  fetched again with one tap, and a status line says whether Instagram
  lookups are working right now. The installed app opens without a
  connection.
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
