# ChordSwarm — design doc

> A collaborative "Guitar Hero for Kick chat": emoji chords scroll down toward a
> strike line, and chat has to *swarm* the matching emoji in time to hit the
> note. Lives as a transparent OBS browser-source overlay reacting to real Kick
> chat.

**Locked decisions:** name = **ChordSwarm** · **single lane** in v1 · build the
channel-name **resolver Worker up front** (streamer types a channel name from
day one).

Status: **planning** — no code yet. This doc is the source of truth; keep it in
sync as decisions land.

---

## 1. Elevator pitch

Guitar Hero's single-player skill becomes a *crowd* mechanic. Notes (emoji
"chords") fall toward a strike line. When a chord reaches the line, chat has a
short timing window to spam that exact emoji. Enough people hit it in the window
= the note lands, the band's combo grows, the crowd cheers. Miss it = combo
breaks. It's chaotic, communal, and reads instantly on stream because the input
*is* the chat the audience is already looking at.

## 2. Core gameplay loop

1. A **song** = a timed sequence of chords (emoji + spawn time). Chords scroll
   from the top of the overlay toward a fixed **strike line** near the bottom.
2. Each chord has a **hit window** centered on the moment it crosses the strike
   line (e.g. +/- 400 ms, tunable).
3. During the window, the overlay counts how many *distinct* chatters typed the
   chord's emoji.
4. Resolve the note when the window closes (or early if the target is smashed):
   - **Hit** if distinct matchers >= the dynamic threshold (see scoring).
   - **Miss** otherwise. Wrong-emoji spam doesn't count and doesn't penalize.
5. Hits feed the shared band combo + each matcher's individual score. The track
   advances; repeat until the song ends, then show results (band stats + MVP).

## 3. Scoring — hybrid (collective band + individual MVP)

Decided: chat both **cooperates** (one shared band) and **competes** (per-user
credit). Two layers running at once:

### Band layer (the shared game)
- **Combo / streak**: consecutive hits. Drives a multiplier and the on-screen
  "crowd hype" meter. A missed note resets combo to 0.
- **Star Power-style hype**: sustained combo fills a meter; when full, a short
  bonus phase (e.g. double points, or "everyone counts double") can trigger.
- **Band score**: running total = sum of note values * combo multiplier.

### Individual layer (the leaderboard)
- Each chatter who lands inside a note's hit window earns points for that note.
- Track per-user: notes hit, best personal streak, total contribution.
- End-of-song **MVP** = top contributor; show a top-5 leaderboard.
- Optional persistence across songs/sessions later (see open questions).

### Dynamic hit threshold (works at 5 viewers and 5,000)
A fixed "10 people" threshold breaks at both ends. Instead scale to *recent
participation*:
- Track a rolling count of **active chatters** (unique users seen in the last N
  seconds).
- Threshold = `clamp(ceil(activeChatters * P), minHit, maxHit)` where `P` is a
  difficulty knob (e.g. 0.15), `minHit` keeps tiny chats playable (e.g. 1-2),
  `maxHit` caps huge chats so it stays achievable.
- Difficulty presets (Easy/Normal/Hard) just change `P`, the hit window, and
  chord density.

## 4. Hit detection details

- **Distinct users only** — one user spamming the emoji 20x counts once per note
  (prevents a single fast typer from carrying). Track `Set<userId>` per active
  note.
- **Emoji extraction** from a message: a message "counts" for a note if it
  contains that note's target emoji anywhere (lenient) — start lenient, can
  tighten to "message is *only* the emoji" as a Hard mode later.
- **Single lane (v1, locked)**: one active note at a time. Reads cleanest on
  stream, simplest to resolve, easiest for chat to follow. Multi-lane (2-4
  parallel emoji, like real Guitar Hero frets) is a Phase 3+ stretch.
- **Latency**: chat has inherent delay (typing + Kick + Pusher). The hit window
  must be generous enough to absorb it. Make window size a tunable and
  playtest. Consider showing the note *before* the strike line with lead time so
  chat can react.

## 5. Kick chat integration (real chat, client-side)

Verified approach for an overlay: read chat over Kick's **Pusher websocket**,
entirely client-side — no backend, no OAuth, works as a pure OBS browser source.

> **Reuse note:** a complete, battle-tested version of this whole stack already
> exists in the **kekw** repo (`T:\ClaudeCodeRepo\kekw\index.html`,
> KEKWClips). Its connection / resolution / parsing code can be lifted almost
> verbatim into `KickPusherSource`. Details below reflect what kekw actually
> does in production — they correct my earlier guesses.

- **Websocket**: `wss://ws-us2.pusher.com/app/<KEY>?protocol=7&client=js&version=8.3.0&flash=false`
  - **Two** public Pusher app keys with failover — `32cbd69e4b950bf97679` and
    `eb1d5f283081a78b932c`. Try key[0]; on 7s connect-timeout or error, advance
    to key[1]. Pin both in config; Kick can rotate them.
- **Subscribe**: send `{event:'pusher:subscribe', data:{auth:'', channel:'chatrooms.<chatroomId>.v2'}}`
  on open. Keepalive: `pusher:ping` every 30s. Watch for `pusher:connection_established`.
- **Chat events** (note: TWO variants): `App\\Events\\ChatMessageEvent` **and**
  `App\\Events\\ChatMessageSentEvent`. The `data` field may be a JSON string or
  object. Extract: `content = d.content || d.message?.content || d.message?.message`,
  `sender = d.sender || d.user`, `username = sender.username`, badges at
  `sender.identity.badges` (verified/partner/staff) — useful if we ever weight
  or filter by user type.

### username -> chatroomId — already solved client-side
`https://kick.com/api/v2/channels/<slug>` returns `chatroom.id`, but it's behind
Cloudflare and not CORS-friendly from a browser. kekw solves this **today with
no backend** by racing a shuffled list of public CORS proxies (allorigins,
codetabs, thingproxy, proxy.cors.sh, corsproxy.io), parsing `chatroom.id` from
the first that responds. So we have a known-working fast path *and* the Worker
becomes a robustness upgrade rather than a prerequisite. Options:

1. **Resolver Worker (most robust, the locked choice).** A Cloudflare Worker on
   the existing `sevendwarfs` account exposes `GET /resolve?channel=<name>` ->
   `{chatroomId, ...}`, handling Cloudflare/CORS server-side with caching. No
   dependence on flaky third-party proxies that rate-limit or disappear. Matches
   the existing worker setup (see [[cf_account_routing]]).
2. **kekw's CORS-proxy race (proven fallback).** Lift `getChannelInfo()` verbatim
   — zero infra, works now. Good as the Worker's fallback and for dev.
3. **Manual entry.** `?chatroom=<id>` — zero infra, no lookup at all. Final
   fallback.
4. **Official Kick API (OAuth 2.1 + webhooks).** Robust but needs a public
   webhook URL + server + token refresh — overkill for an overlay, can't run
   purely client-side. Not for v1.

**Plan (locked): build the resolver Worker up front** (`?channel=<name>`), but
wire the kekw CORS-proxy race in as its automatic fallback and keep
`?chatroom=<id>` as the last resort — so a Worker hiccup never bricks the
overlay. A built-in **simulated chat generator** (`?sim=1`) drives development
and tuning without a live stream.

## 6. Emoji vocabulary

Kick messages mix **Unicode emoji** and **Kick/channel emotes** (token form like
`[emote:37226:emojiName]`).
- **v1**: Unicode emoji only — a curated chord set (e.g. fire, skull, laughing,
  heart, clap, etc.). Easy to match, universally typable, reads well on screen.
- **v2**: parse Kick emote tokens so channel-specific emotes can be chords —
  great for community flavor, and renders the actual emote image on the falling
  note.
- A **song editor / chord palette** picks which emoji are in play per song.
- **Reuse:** kekw already strips Kick emote tokens and `:shortcode:` forms with
  `content.replace(/\[emote:[^\]]+\]/gi,'').replace(/:[a-zA-Z0-9_]+:/g,'')` and
  does emoji-aware word filtering — directly reusable for chord matching.

## 6b. Music sync — audio-reactive (chosen direction)

Two hard constraints drive the whole approach:

1. **The overlay can't hear the streamer's audio.** An OBS browser source is a
   sandboxed page with no access to Spotify, desktop audio, or the OBS bus. The
   only audio a page can analyze is audio playing *inside the page itself*
   (Web Audio API). **Therefore audio-reactive mode REQUIRES the overlay to own
   and play the music.** A streamer who insists on their existing Spotify/desktop
   setup can't use it — they'd fall back to tap-tempo/pace presets instead. This
   is the central adoption tradeoff.
2. **Chat is too slow to play on the beat.** Type + Kick + Pusher latency is
   ~1–3s, so notes can only arrive about every ~1.5s for the swarm to react —
   ~40 notes/min vs 90–140 beats/min in music. So **notes land on a slow musical
   subdivision (every Nth beat / on downbeats), not every beat.** Beat alignment
   is for *feel* (chords drop on the beat); the scoring window stays generous
   because chat still reacts late.

### Why audio-reactive is stronger than it looks
Because the overlay owns the file, we **analyze the whole track offline up front**
(we have the full decoded PCM) instead of doing fragile real-time detection. That
removes the hardest part of beat tracking.

### Pipeline
1. **Load** a track into the overlay (source TBD — see open question below).
2. **Decode**: `audioCtx.decodeAudioData(arrayBuffer)` -> full `AudioBuffer`.
3. **Analyze offline**: downmix to mono -> energy/onset envelope (~10ms frames)
   -> peak-pick onsets -> estimate BPM via inter-onset-interval histogram /
   autocorrelation -> derive beat grid + phase, optionally downbeats. Clamp BPM
   to ~70–180 and expose ÷2/×2 + tap-tempo nudges (octave errors are the common
   failure). Self-contained detector to keep the single-file pattern.
4. **Choose subdivision** S so note interval >= ~1.5s: `S = ceil(1500 / beatMs)`.
   e.g. 128 BPM (469ms/beat) -> S=4 -> a note every ~1.9s on each downbeat.
5. **Schedule**: a chord spawns at `beatTime - DIFF.lead` so it *crosses the
   strike line exactly on the beat*. Master clock = the `<audio>`/buffer source's
   playback time, not `performance.now()`.
6. **Stream audio**: OBS captures browser-source audio automatically, so music the
   overlay plays is heard on stream. **DMCA/licensing is the streamer's call** —
   surface a one-line warning.

### Robustness
- Analysis fails or BPM implausible -> fall back to the fixed-spacing chart so the
  game never dies.
- Manual BPM override + ÷2/×2 + tap-tempo double as the correction UI *and* the
  no-audio fallback (the rejected "streamer-set pace" option lives on here).
- Transport controls (play/pause/skip), current-track label, volume/duck.

### MVP vs full
- **MVP**: file load -> decode -> BPM detect (assume constant tempo) -> notes on
  every Nth beat. Prove it feels musical.
- **Full**: downbeat detection, variable-tempo handling, playlist/queue,
  per-song chord choreography.

### Audio source = playlist of hosted URLs (decided)
Overlay is configured with a playlist and auto-plays through it — no in-OBS
clicking. Config:
- `?playlist=<url-to-json>` where the JSON is `[{url,title?}, ...]` or
  `{tracks:[...]}`; or `?playlist=url1,url2,...` for a quick inline list.
- **CORS:** `decodeAudioData` needs the audio fetched with CORS allowed. The
  zero-friction path is **hosting tracks same-origin** (in the repo / next to the
  overlay on GitHub Pages) — then no CORS headers are needed. Cross-origin hosts
  must send `Access-Control-Allow-Origin`.
- Auto-play works in an OBS browser source (autoplay-with-sound is permitted
  there). In a normal browser tab it needs a user gesture, so the dev harness
  gets Play/Skip buttons; production relies on OBS autoplay.
- **`?audio=test:<bpm>`**: built-in synthetic click-track generator
  (OfflineAudioContext). Drives the *same* analyzer + scheduler off the game
  clock (no hosting, no autoplay needed) so the beat-aligned note drop is
  demoable and the detector is verifiable. [DONE v0.2.0]

### YouTube & other unreachable sources
Streamers asked about YouTube (cf. powerchat.live / tts.fish media overlays).
Reality: those sites just **embed and play** YouTube via the IFrame Player API —
they don't analyze it. A browser **cannot get raw PCM out of a YouTube embed**
(cross-origin iframe; no `MediaElementSource` access; no fetchable media URL;
ripping breaks ToS). So our offline detector can't run on YouTube. YouTube can
still be a **playback source** (IFrame API + `getCurrentTime()` as the clock) and
a **chat/donor song-request jukebox** — but its beat grid must come from
elsewhere (mic, tap, or a pre-authored chart), not auto-detection.

### Music input strategy (source-agnostic): mic-auto + tap fallback
The unifying answer to "match whatever the streamer plays": **listen
acoustically with a microphone.** A mic hears whatever comes out of the speakers
(YouTube, Spotify, desktop, vinyl…), and mic input *is* reachable by Web Audio
(`getUserMedia` -> `AnalyserNode`), so we sidestep every locked-source problem at
once. Tiers, in order of preference per situation:
1. **Hosted file** (`?playlist=`) -> offline analysis. Most accurate. [DONE]
2. **Mic auto-detect** (`?mic=1`) -> real-time rolling onset + autocorrelation
   tempo lock, with **confidence gating** (only drive notes on a strong lock).
   Works for ANY audible source incl. YouTube. Caveats: the mic also hears the
   streamer's **voice/noise** (pollutes onsets — best on loud, beat-driven music,
   weak under constant talking); needs a ~8–10s calibrate; OBS browser-source mic
   permission is finicky (verify; companion page is the fallback). Latency (~100ms
   acoustic+detect) is negligible vs chat's 1–3s. [PLANNED]
3. **Tap-tempo / typed BPM** -> always-reliable manual grid for any source incl.
   a YouTube embed. The fallback when the mic can't lock. [PLANNED]
The clock is the file/playback position (or game clock for mic/tap).

## 7. Tech stack

Matches the established single-file static-site pattern used across these
projects (vanilla HTML/CSS/JS, GitHub Pages hosting), plus optional Worker.

- **Overlay**: single-file `index.html` — Canvas render loop for falling chords,
  strike line, combo/hype meters, leaderboard. Transparent for OBS. Config via
  URL params: `?pos=left|center|right` (position, default left), `?sim=1`,
  `?dev=1`, `?difficulty=easy|normal|hard`, and (Phase 1) `?channel=`/`?chatroom=`.
- **Websocket client**: raw Pusher protocol over `WebSocket` (no SDK needed —
  subscribe message + parse both `App\\Events\\ChatMessageEvent` and
  `App\\Events\\ChatMessageSentEvent`; see §5).
- **Songs**: JSON files (`songs/*.json`) — `{ name, bpm?, chords: [{emoji, t}] }`.
  (Phase 0 uses an in-code looping chart; JSON songs are Phase 4.)
- **Resolver Worker** (built up front, Phase 1): small CF Worker, `sevendwarfs`
  account, pinned `account_id`, auto-routed via the existing wrangler wrapper.
- **Hosting**: lives in the `itsavibecode/book` repo as the `chordswarm/`
  subfolder -> **bookhockeys.com/chordswarm** (custom-domain Pages), alongside the
  other book projects (greenline, shoovlator, zombies, hantavirus, letterplex).
  OBS points a browser source at that URL.

## 8. Architecture / components

```
index.html
  - GameLoop        requestAnimationFrame; spawns/moves chords, resolves notes
  - ChartPlayer     loads a song JSON, schedules chord spawns vs. song clock
  - ChatSource      interface: { onMessage(cb) }
      - KickPusherSource   real websocket — LIFT FROM kekw (connect, 2-key
                           failover, ping, both ChatMessage event variants,
                           CORS-proxy resolution fallback)
      - SimSource          fake chatters for dev (?sim=1)
  - NoteResolver    per active note: Set<userId> of matchers, threshold check
  - ScoreModel      band combo/multiplier/hype + per-user tallies + MVP
  - Renderer        Canvas draw: falling chords, strike line, meters, leaderboard
  - Config          URL params -> difficulty knobs, chatroom id, song, sim flag
songs/*.json
worker/ (Phase 3)   resolve username -> chatroomId
```

## 9. Visual / overlay design

- Transparent background (OBS browser source over webcam/gameplay).
- **Positionable, off-center.** The lane is a narrow vertical rail that hugs one
  side (`?pos=left` default, also `right`/`center`) so the streamer's cam and
  gameplay stay visible and unobstructed. HUD (score/combo/hype + leaderboard)
  re-anchors to the same side as the lane; the dev chat feed sits on the opposite
  side. Center mode is mainly for full-screen demos.
- **3D perspective highway [v0.5.0]:** the lane is a trapezoid receding to a
  vanishing point at the top; notes start tiny in the distance and rush AT the
  viewer (growing + accelerating, screen-pos + size scale by 1/depth) through and
  past the strike line. Receding fret rungs bunch toward the top. Tunables:
  `PERSP_RATIO` (far/near depth), `HW_TOP_FRAC` (far width).
- Big readable falling emoji; strike line with a "hit zone" glow.
- On a note: burst of the emoji + combo count popup; on miss: brief fade.
- HUD: band combo + multiplier, hype meter, small live leaderboard (top 5).
- Keep it legible at stream bitrate; high contrast, no tiny text.

### Dev test harness (`?sim=1` / `?dev=1`)
Because we can't yet coordinate a real streamer's chat to validate the mechanic,
sim mode is a hands-on testbed, not just a self-playing demo:
- **Visible chat feed** (opposite side from the lane) showing every simulated
  message; matches flash green so the chat-input -> note link is legible.
- **Control strip**: bots ON/OFF (OFF = play solo against the chart), chatter-count
  and eagerness sliders (feel a 5- vs 500-viewer chat), one-tap emoji buttons
  (each tap = a fresh distinct chatter, so you build or miss a note's swarm by
  hand), a "Swarm this note" one-click hit, and a type-as-YOU input.
- `?sim=1` runs auto-bots + harness; `?dev=1` shows the harness with bots off
  for pure manual testing. Neither renders in a clean OBS load (no `sim`/`dev`).

## 10. Phases

- **Phase 0 — scaffold + sim test harness. [DONE, v0.1.2]** Single-lane Canvas
  game loop, falling chords, strike line, distinct-matcher counting, dynamic
  threshold, hybrid band+MVP scoring. `SimSource` fake chat + hands-on dev
  harness (chat feed, bots toggle, sliders, emoji quick-fire, swarm button,
  type-as-YOU). Positionable overlay (`?pos`). Chat-rate readout (msgs/min +
  unique/min). Tunes feel with no live stream.
- **Phase 1 — resolver Worker + real Kick chat.** Lift `KickPusherSource` from
  kekw (connect, 2-key failover, ping, both ChatMessage variants). CF resolver
  Worker (`/resolve?channel=`) on the sevendwarfs account, with kekw's CORS-proxy
  race as fallback and `?chatroom=<id>` as last resort. Distinct matchers,
  dynamic threshold, hit/miss resolution. Playtest live via `?channel=<name>`.
- **Phase 2 — full scoring + polish.** Hybrid band + individual layers, hype/star
  power, end-of-song results + MVP, sounds, juice.
- **Phase A — audio-reactive music sync (see §6b).** Independent of the Kick-chat
  phases. **MVP DONE [v0.2.0]**: hosted-file offline decode + BPM detect -> notes
  on every Nth beat aligned to the strike line; synthetic `?audio=test:<bpm>`.
  Remaining: tap-tempo / typed BPM (manual grid, any source incl. YouTube embed);
  downbeats; variable tempo; ÷2/×2 correction.
- **Phase B — mic auto-detect (see §6b).** `?mic=1`: real-time rolling tempo lock
  off `getUserMedia` with confidence gating + tap fallback. Source-agnostic
  (works over YouTube/Spotify/anything audible). Testable via a synthetic stream;
  real-mic + OBS-permission test is live-only.
- **Phase C — YouTube + auto-tempo via song-ID + BPM database (chosen).**
  Decided over mic/tap because it's automatic and needs no per-song tapping.
  Pipeline: play the YouTube embed (IFrame API, `getCurrentTime()` = clock) ->
  `chordswarm-worker` `/bpm?v=<id>` resolves the title via YouTube oEmbed, parses
  "Artist - Song", and looks up BPM via **GetSongBPM** (key server-side, requires
  a visible backlink to getsongbpm.com) -> overlay sets the beat grid at that BPM.
  **Tempo only — no beat phase** (approximated; add a ÷2/×2 + optional one-time
  phase nudge if it feels off). Best-effort: fails on DJ mixes / lofi / nightcore
  / obscure / odd titles -> graceful fallback to a default tempo or the fixed
  chart. Honest coverage limit, logged for the operator.
  - **Worker DEPLOYED + WORKING** at chordswarm-worker.sevendwarfs.workers.dev:
    oEmbed + `parseTitle`/`extractVideoId`/`songKey` (18 node tests) + GetSongBPM
    proxy + CORS. Live-verified Rick Astley NGGYU -> 112 BPM. Key learnings:
    GetSongBPM base = api.getsong.co; correct lookup is `type=song&lookup=<title>`
    with **no `song:` prefix**; title-only returns all covers so we artist-match;
    strip whole `(...)`/`[...]` title groups. **Durable KV cache LIVE** (namespace
    BPM_CACHE, keyed by video id AND `songKey`) — verified `"cache":"video"` on
    repeat. `?debug=1` returns compact lookup diagnostics.
  - **Overlay wiring DONE:** `?yt=<id|url>` -> IFrame embed + fetch worker BPM +
    schedule on `getCurrentTime()` + fallback + getsongbpm.com attribution link.
- **Phase 3 — emotes + stretch.** Parse Kick emote tokens as chords; explore
  multi-lane chords.
- **Phase 4 — authoring + persistence (stretch).** Song editor, cross-session
  leaderboards, difficulty presets, more songs.

## 11. Open questions

Resolved: name = ChordSwarm · single lane in v1 · resolver Worker up front.
Still open:

- **Win condition.** Pure score, a star rating per song, or survival (combo can
  fully drop the song)?
- **Leaderboard persistence.** Per-session only (no backend), or Firebase like
  the other projects for cross-stream MVP history?
- **Latency tuning.** Real chat delay is unknown until playtested — hit window
  size and note lead time need a live channel to calibrate.
```
