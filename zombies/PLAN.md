# Cx Zombies — build plan

Working title: **Cx Zombies**
Live URL (planned): **bookhockeys.com/zombies/**
Repo location: subfolder of `itsavibecode/book` at `T:\ClaudeCodeRepo\book\zombies\`
(Sibling to `/greenline/`. Same pattern: independently versioned subproject
under the BookHockeys umbrella, deployed via the parent repo's GitHub Pages.)

---

## 1. Concept locked

- **Genre:** auto-scrolling 2D side-scroller shooter (Metal Slug / Broforce
  cousin, but stripped down).
- **Player:** chosen from a roster of 3-5 characters at the start of each
  run (loadout screen). Faces right, shoots right (and maybe diagonal
  up/down later). Different characters can have different stats and/or
  starting weapons — see Section 5g.
- **Scrolls:** auto-forward at a base speed; player can move slightly within
  a screen "box" (forward/back to dodge, up to jump).
- **Enemies:** zombies — multiple types — walk/run toward player, die from
  bullets, drain hearts on contact.
- **Win condition:** survive as long as possible, kill as many as possible.
  Endless waves with rising difficulty. Leaderboard-driven (like Run).
- **Tone:** match BookHockeys neon vibe (`#39ff14` green accents) +
  arcade-cartoony zombies, not horror-realistic.

### Working name — LOCKED

**Cx Zombies.** Title locked. The "Cx" coin pickups are a deliberate
crossover with EmpireX — Ice Poseidon (a side-kick character in the
EmpireX `/run/` game) returns here as the **main playable character**.
Cx Zombies is a BookHockeys-hosted spinoff that lives in the same
fictional universe as the Run game.

---

## 2. Tech stack — locked from the Run pattern

- Single repo, modular JS this time:
  - `index.html` — scaffold, HUD, overlays
  - `js/main.js` — game loop, entities, input
  - `js/render.js` — canvas draw + sprite atlas
  - `js/audio.js` — channel mixer (lifted from Run, lightly cleaned)
  - `js/leaderboard.js` — Firebase module (lifted from Run, repathed)
  - `js/levels.js` — wave generator, enemy spawn tables
  - `css/style.css` — overlays + HUD
- HTML5 `<canvas>` 2D context (not WebGL — Run proves 2D is fast enough at
  60 fps with hundreds of sprites).
- Vanilla JS, no framework, no build step. Cache-bust via `?v=X.Y.Z`
  query strings on every release (Run learned this the hard way — see
  Run's HTML comment about v0.18.61 stale-JS bug).
- Firebase v12 modular SDK loaded as ES module from gstatic CDN.
- Google Analytics: reuse Book Hockeys' shared `G-DYME377V2S` measurement
  ID (same pattern as `/greenline/`). Same EU consent banner, reads the
  same `greenline-consent` localStorage key.

---

## 3. What we lift from `empire/run/` (and how to adapt)

| System | Source | Adaptation needed |
|---|---|---|
| HUD scaffold (lives, score, time, settings, pause) | `empire/run/index.html` | Swap "m" + "Cx ×N" for "kills", "wave", "ammo" |
| Audio panel (Music/SFX/Voice channels, master mute, autoplay-unlock) | `empire/run/css/style.css` + audio block in `index.js` | Drop unused tracks; rename channels stay the same |
| Pause overlay + "PAUSED" tap-to-resume + cheat-sheet pattern | Run pause overlay | New cheat sheet content (zombies, weapons, pickups) |
| Game-over screen + share-as-PNG button | Run gameover overlay | New title art + final-score lines |
| Start screen with global stats panel (top score + total runs) | Run title overlay | Reuse layout, repaint to neon green |
| Kick-username modal → auto-submit on death | Run username flow | Identical, just point at zombies leaderboard path |
| Firebase leaderboard module | `empire/run/js/leaderboard.js` | **Repath** — see Section 4 below |
| OG/Twitter card + share PNG generator | Run share PNG | New title-art layout |
| Mobile touch zones + keyboard parity | Run input layer | Add a "shoot" button + (maybe) virtual joystick |
| Canvas resize-to-viewport + asset preloader | Run boot sequence | Drop in unchanged |
| Version pill bottom-of-screen + cache-bust pattern | Run footer | Drop in unchanged |

That's a lot of free progress.

---

## 4. Leaderboard reuse — answer to your question

**Yes we can reuse the same Firebase project, and no it won't bleed over.**

Run's leaderboard pushes to two RTDB paths:
- `/scores` — score entries
- `/stats/attempts` + `/stats/attemptsByDay/{utc-date}` — counters

For Cx Zombies we'd reuse the **same Firebase project** (`onbabygame-dbb77`)
but write to **different paths**:
- `/zombies/scores`
- `/zombies/stats/attempts`
- `/zombies/stats/attemptsByDay/{utc-date}`

Two leaderboards, totally independent, share the same project quota +
the same JS SDK init. Saves a Firebase project setup (~30 min) and one
extra `initializeApp` call on the page.

**Schema differences** for zombies entries (vs Run's `distance / coins / multiplier`):
```js
{
  identity: "kickusername",
  identityType: "kick",     // or "twitch"
  kills: 47,
  wave: 6,
  durationSec: 184,
  score: 4700 + 60*100,     // kills*100 + wave*1000 (TBD)
  createdAt: 1714530000000
}
```

The `submit()` function in the lifted leaderboard.js needs ~20 lines
changed to swap field names. Everything else (anti-spam, sanity caps,
top-N fetch, render) drops in unchanged.

**Heads-up:** Firebase RTDB security rules need to allow `/zombies/*`
reads + writes. Currently Run has rules for `/scores` and `/stats`. Need
to add a `/zombies` block to the rules JSON. Five-minute job.

---

## 5. New systems (no equivalent in Run)

### 5a. Player controller
- Sprite states: `idle`, `walk` (4-8 frames), `shoot` (3-4 frames),
  `jump`, `hurt` (1-2 frames flash), `die` (4-6 frames).
- Auto-scroll means "moving" is more like "stepping forward in the
  player box." Walking animation plays continuously when not idle.
- Jump = single-tap `SPACE` / `↑` / on-screen up button.
- Shoot = hold or tap. Tap-fire feels better for handgun; hold-fire
  for SMG/auto pickups. Recommend holding `SPACE` or `Z`.

### 5b. Bullet system
- Pool of ~50 bullet objects, recycled (avoid GC churn).
- Per-bullet: `x, y, vx, vy, damage, ownerId, alive`.
- Collision: AABB vs zombie rects each frame. O(bullets × zombies),
  fine at the scales we'll have (~50 bullets, ~30 zombies on screen).

### 5c. Zombie roster (proposed v0.1 set — 3 types is enough to ship)

| Type | Speed | HP | Behavior | Spawn rate |
|---|---|---|---|---|
| **Shambler** | 0.4× | 1 | Walks straight at player. Bread + butter. | 60% of spawns |
| **Runner** | 1.4× | 1 | Sprints. Forces fast aim. | 25% |
| **Heavy** | 0.3× | 4 | Tanky. Walks through bullets. Big sprite. | 15% |

Add later (v0.2+):
- **Spitter** — ranged, lobs goo from offscreen.
- **Crawler** — low-profile, easy to miss with high-aimed shots.
- **Boss** at every Nth wave.

### 5c-bis. Mini-bosses — Xena the Siren — LOCKED

**Xena** carries over from the EmpireX `/run/` universe (where she was
the player's cellmate in the jail mechanic). In Cx Zombies she's
re-cast as a **Siren** — she **leads the zombies**.

**Behavior — mini-boss pattern (Option A):**

- **Spawn:** at the start of selected waves (likely waves 3, 5, 7).
  Walks in from the right edge of the screen.
- **Combat:** stands at a distance and **summons additional zombies**
  on a timer (e.g., 3 zombies every 4 seconds while she's alive).
  Doesn't approach the player directly — she's a backline support.
- **HP:** ~50 HP (5x a Shambler). Player can shoot her down.
- **Death:** when killed, the wave's zombie spawn rate drops to zero
  for the rest of that wave (the wave ends faster). Visual flair on
  death — collapse + dissipating glow particle effect.
- **Sprite size:** 120×168 (taller than wide — slim figure in a
  dress). Bigger than zombies (96×96 / 144×144) but not bulky.
- **Reference art:** `art/xena-run-reference.png` (copy of Run's
  `xena-pose-01.png` — front-facing standing portrait for character
  recognizability). Will be re-styled into the locked Cx Zombies
  pixel-art style via ChatGPT (see prompt block below).

**Sprite atlas needed (~24 frames):**

| State | Frames | Notes |
|---|---|---|
| Idle | 4 | gentle sway, hair drifting |
| Walk | 8 | enters from right, walks toward summon position |
| Summon | 4 | arms raise, glow build, zombies "erupt" from ground |
| Hurt | 2 | red flash on bullet impact |
| Die | 6 | collapse + dissipating glow |

**ChatGPT prompt for the atlas (paste into the Cx Zombies Art project):**

> CRITICAL STYLE: Match the chunky 16-bit pixel-art style of the
> FIRST attached image (sprite sheet — soldier + zombie + UI items).
> Hard 1px outlines, NO anti-aliasing, ~32-color limited palette,
> visible pixel grid. NOT painterly. The SECOND attached image is a
> reference of the character Xena from a sister game — long dark
> hair, black off-shoulder dress, gold necklace, tattoos visible at
> the shoulder. Re-render her as a sprite atlas in the locked Cx
> Zombies pixel-art style above, but keep her recognizably Xena
> (same hair, same dress, same body type, same vibe). She is a
> SIREN-style mini-boss that leads zombies. Output a single sprite
> atlas PNG with transparent background, 24 frames total, each frame
> 120 pixels wide by 168 pixels tall. Layout: 8 frames per row, 3
> rows. Row 1: 4 IDLE frames (gentle sway, hair drifting), then 4
> WALK frames part 1 (facing left, entering scene). Row 2: 4 WALK
> frames part 2, then 4 SUMMON frames (arms raised, building energy
> glow around her hands, zombies erupting from ground at her feet
> on the last frame). Row 3: 2 HURT frames (red flash, recoiling),
> then 6 DIE frames (collapse to knees, fall sideways, dissipating
> green-glow particle effect on final frame). All frames face left
> (toward the player who is on the right side of screen). Total
> output dimension: 960 wide by 504 tall.

### 5d. Wave / difficulty system + level architecture — LOCKED

**The level is ONE CONTINUOUS SEAMLESS WALK** through 7 zones, not
discrete fade-cut scenes. The player walks west from Ice Poseidon's
home in Bouldin Creek out to South Lamar Boulevard, ending at the
Alamo Drafthouse boss arena.

Zones (each is a 2048×768 wide-letterbox pixel-art background, all
in `book/zombies/art/`, all edge-matched to flow seamlessly into the
next):

| # | File | Zone | Vibe |
|---|---|---|---|
| 0 | `bg-00-final.png` | Ice's home (904 Jessie modern garage + fountain + barred windows) | Spawn — pre-dawn purple sky, calm before the storm |
| 1 | `bg-01-final.png` | Yellow-green Craftsman with porch | Walking out the front yard |
| 2 | `bg-02-final.png` | Wood fence + Honda Civic, door open + headlight on | Departing the neighborhood |
| 3 | `bg-03-final.png` | Treadwell crossing (residential left → Lamar Union right) | Approach to the action zone, sky shifts purple → dawn-gray |
| 4 | `bg-04-final.png` | Lamar Union plaza w/ rainbow pinwheel mural | First Lamar landmark, action begins |
| 5 | `bg-05-final.png` | Lamar corridor — crashed Mercedes, fire hydrant spraying, multiple zombies, colorful storefronts | Peak combat zone, overcast afternoon |
| 6 | `bg-06-final.png` | Alamo Drafthouse with "BUSTED IN AUSTIN" marquee + HighBall neon + emergency vehicle + zombie horde | Boss arena, sunset |

**How they chain:** each scene's left edge was generated to match the
right edge of the previous scene (using ChatGPT image gen with
edge-match prompts and the prior `bg-XX-final.png` attached as
reference). The transitions aren't pixel-perfect but the
architecture, ground level, sky color, and atmosphere flow naturally
from one to the next so the player reads it as "walking down a single
street" not "scene 1 / fade / scene 2."

**Time-of-day progression** is the secondary visual storytelling:
- bg-00, bg-01, bg-02 — pre-dawn purple-magenta sky
- bg-03 — transitional, dawn breaking
- bg-04, bg-05 — overcast afternoon
- bg-06 — sunset (level-end)

So the player's journey through the level also takes them across an
entire day, reinforcing the apocalypse-in-progress narrative.

### 5d-bis. Wave system inside the seamless level

Even though the visuals scroll continuously, the **gameplay is still
wave-based** for difficulty pacing. Waves trigger at zone boundaries
(or at fixed scroll-distance thresholds):

| Wave | Triggers entering | Difficulty |
|---|---|---|
| 1 | bg-00 → bg-01 | 5 Shamblers, intro |
| 2 | bg-01 → bg-02 | 10 Shamblers + 2 Runners |
| 3 | bg-02 → bg-03 | 15 mixed, first Heavy |
| 4 | bg-03 → bg-04 | 25 mixed, faster spawn rate |
| 5 | bg-04 → bg-05 | 40 mixed, peak chaos |
| 6 | bg-05 → bg-06 | Boss intro |
| 7 | bg-06 (boss arena) | Boss + adds, level finale |

Each wave shows a small "WAVE N" banner at the top of the HUD
(non-blocking — the world keeps moving). Optional pickups (health
packs, special weapons) drop at wave-end as a reward.

### 5e. Pickups (v0.1) — LOCKED

Default weapon is **infinite ammo** (no reload pressure). Pickups grant
**temporary special weapons** that pack more punch but run out:

- **Cx coin** — score multiplier (mirrors Run, dropped by zombie kills + spawned mid-level).
- **Health pack** — refills HP bar (see §5h).
- **Rocket Launcher** — 5 rockets, AoE explosion damage. Heavy splash.
- **Shotgun** — 12 wide-spread shells, great for clusters.
- **Flamethrower** — 8-second burst stream, cone damage, ignites zombies (DoT).
- **Mini-gun** — 6-second hold-fire blast at 20 rounds/sec, tears through hordes.

Pickups drop randomly from defeated zombies (~3% rate) and at fixed
score milestones. Picking up a new special replaces whatever special
you were holding (don't stack). The default pistol always returns
when the special runs dry.

### 5f. Health system — LOCKED

**HP bar** at top-left of HUD. 100 HP max. Doom/Metal-Slug style:
horizontal bar with numerical readout, segments turn red as it drains.
Each character has a different `maxHealth` stat (see §5g) — Heavy gets
a longer bar, Scout gets a shorter one. Health pack pickups restore +25
HP, capped at the character's max.

(Decision change from earlier draft: hearts → HP bar so we can
balance per-character health more granularly than 3/5 hearts allows.)

### 5g. Character select / loadout — LOCKED for v0.1

New screen between the start screen and gameplay. v0.1 roster: **3
characters**, with **Ice Poseidon as the main / default-selected
character**. The other two slots are placeholder archetypes whose
names + designs change in later versions.

`ice-poseidon-walk.png` (in `art/`) is **already a complete walk
cycle** in a style very close to the locked reference — saves the
walk-cycle work for the main character entirely. We just need to
generate the missing states (idle, shoot, jump, hurt, die) using
that walk as the reference.

**Per-character data shape:**
```js
{
  id: "scout",
  name: "Scout",
  bio: "Fast and fragile. Pistol with quick fire rate.",
  sprite: "scout-atlas.png",
  stats: {
    maxHearts: 2,
    moveSpeed: 1.2,    // multiplier vs base
    jumpHeight: 1.1,
    fireRate: 6,       // shots per second cap
    bulletDamage: 1,
    bulletSpeed: 1.0
  },
  startingWeapon: "pistol"
}
```

**Locked v0.1 roster (3 archetypes — keeps art load to 3× not 5×):**

| # | Character (v0.1) | Future name | maxHP | Speed | Fire rate | Damage | Vibe |
|---|---|---|---|---|---|---|---|
| 1 | **Ice Poseidon** | (stays) | 100 | 1.0× | 4/s | 1 | Balanced default — main character |
| 2 | **Scout** | TBD | 75 | 1.2× | 6/s | 1 | Glass cannon, dodgy |
| 3 | **Heavy** | TBD | 150 | 0.8× | 2/s | 3 | Tank, slow but punchy |

Ice is the default-selected character on the loadout screen. Scout and
Heavy are placeholders — names + visual designs will change in v0.2+
once you settle on which streamers / personalities to feature.

### 5g-bis. Companion characters — LOCKED

Beyond the 3 playable characters, there are **2 NPC companions** in
the EmpireX universe that appear during gameplay or cutscenes:

#### Zeus — tank sidekick (combat companion)

Zeus is **larger than Ice** and serves as a **defensive companion**.
He follows the player at a slight offset and absorbs zombie hits that
would otherwise hit Ice. Think of him as the "tank" of a duo — the
player's bodyguard.

- **Sprite size:** 144×144 (1.5× the size of Ice's 96×96 — explicitly
  bigger to read as imposing)
- **Behavior:** trails the player at ~50px lag distance. Zombies that
  enter Zeus's hit-box take swing damage from him. Zombies that hit
  Zeus deal damage to him instead of Ice.
- **HP:** Zeus has his own HP bar (smaller bar below the player's
  main HP bar). Regenerates between waves.
- **Death:** if Zeus's HP hits 0, he kneels (incapacitated for the
  rest of the wave); recovers at next wave.
- **Reference art:** `art/zues-sidekick.png` (note: filename has
  user's typo "zues"; we'll keep that spelling on disk).
- **Unlock:** unlocked from start of run for Ice as the main
  character. Other characters (Scout / Heavy) don't get Zeus by
  default — gives Ice a mechanical advantage to match his story role.

#### Snorlax — dialogue NPC (cutscene partner)

Snorlax is a **non-combat NPC** that appears at scripted points in
the level for **cutscene dialogue exchanges with Ice**. Pattern
matches Run's cutscene system (Ice + Mike Smalls Jr dialogue panels).

- **Role:** spawns between waves to deliver lore, comic relief, or
  level-end commentary. Pauses gameplay during dialogue.
- **Appearance:** large, rotund, sleepy — clearly a Pokémon-Snorlax
  riff in pixel-art form.
- **Reference art:** `art/abz_snorlax.jpg` (small reference image
  user provided).
- **Cutscene moments (suggested):**
  - bg-02 (wood fence) — first encounter, Snorlax is asleep on the
    sidewalk, Ice nudges him awake
  - bg-04 (Lamar Union mural) — Snorlax warns about the horde ahead
  - bg-06 (boss arena, post-victory) — Snorlax shows up for the
    closing line
- **Tech:** reuse Run's cutscene overlay pattern from `empire/run/`
  (the `.cutscene-canvas` + dialogue panel + click-to-continue
  buttons). Each cutscene is ~3-5 dialogue panels.

Both Zeus and Snorlax are **part of the EmpireX universe** alongside
Ice — reinforces the Cx Zombies / Run shared-fiction crossover.

UI: 3 portrait cards on the loadout screen, click to select, "PLAY"
button to start. Show stat bars (HP / SPD / DMG / RATE) under each
portrait. Last-picked character persists in localStorage.

**Leaderboard impact:** add `character: "scout"` to the score entry.
Lets us add a per-character filter dropdown later ("Top Scouts of all
time"). Negligible code cost now, big payoff for replayability.

**Asset impact:** multiplies the player sprite workload. Each character
needs the full state set (idle/walk/shoot/jump/hurt/die). Single AI prompt
per character if we keep silhouettes distinct enough that one prompt =
one full sprite atlas.

**Future expansion (v0.5+):** unlock characters by hitting kill milestones,
co-op picks, weekly rotating "free" character.

### 5h. Particles + juice
- Muzzle flash on shot (1-frame sprite).
- Blood spray on hit (3-4 small sprites scattered).
- Screen shake (2-3 px) on player hit.
- Hit-flash (zombie tints red for 1 frame on bullet impact).
- Slow-mo final kill (optional, polish phase).

---

## 6. Asset specs

### 6a. Image dimensions

Game viewport target: **1280×720 base** (scales up to 1920×1080 fullscreen
on desktop, down to ~360×640 on mobile portrait via CSS scaling).

| Asset | Frame size | Frame count | Notes |
|---|---|---|---|
| Player (×3 characters) | 96×96 | walk×8, idle×4, shoot×4, jump×4, hurt×2, die×6 | Transparent PNG, sprite atlas per character. Multiply count by roster size. |
| Shambler | 96×96 | walk×6, attack×4, die×6 | |
| Runner | 96×96 | walk×8, attack×4, die×6 | Slimmer silhouette |
| Heavy | 144×144 | walk×6, attack×4, die×8 | Bigger frame |
| Bullet | 16×8 | static or 2-frame | |
| Muzzle flash | 32×32 | 2 frames | |
| Blood splat | 32×32 | 4 random variants (static) | |
| Cx coin | 32×32 | 8-frame spin | Reuse Run's `cx-coin-01.png` direct? |
| Heart pickup | 48×48 | 4-frame pulse | |
| Ammo crate | 48×48 | static | |
| BG layer 1 (sky) | 1920×720 | 1, tileable | Slowest parallax |
| BG layer 2 (mid) | 1920×400 | 1, tileable | Medium parallax |
| BG layer 3 (foreground) | 1920×200 | 1, tileable | Fastest parallax |
| Ground tile | 128×64 | 4 variants | Tiled along x |
| Title card | 1200×630 | 1 | OG image |

Total minimum sprite count for v0.1: ~80 frames for 1 player + 3 zombies +
particles + UI. With **3 playable characters** (loadout system) the player
sprite count alone goes from ~28 frames to ~84, so total v0.1 sprite count
becomes ~140 frames. AI-generated this is ~2-3 sessions of iteration
(was 1-2 with single player).

### 6b. Free asset packs (verified URLs)

If you want to skip art generation entirely for the MVP:

- [Urban Zombie Pixel Art Pack — Free Game Assets](https://free-game-assets.itch.io/free-urban-zombie-sprite-sheet-pixel-art-pack) — single zombie type, walk/attack/die animations
- [Free 3 Zombies Pixelated Pack — Free Game Assets](https://free-game-assets.itch.io/free-zombie-sprite-sheet-pack-pixel-art) — three zombie variants in one pack (this is the one to grab)
- [itch.io free zombie+sprites tag](https://itch.io/game-assets/free/tag-sprites/tag-zombies) — broader catalog if those don't fit
- [Kenney.nl zombie assets](https://www.kenney.nl/assets?t=zombie) — CC0 (no attribution required), cleaner cartoon style

Check each pack's license — most itch.io free packs allow commercial use
without attribution, but a few require credit. The Kenney ones are CC0
(do whatever).

### 6c. AI prompts for generating sprites + backgrounds from real photos

**The trick: lock the art style first, then reference it in every other
prompt.** AI image models drift between calls — if you generate a player
sprite Monday and a zombie Wednesday with separate prompts, they won't
look like the same game. Workflow:

1. **Step 1 (one time):** generate a "style sheet" reference image. Pick
   the one you like best out of 3-5 attempts. Save it as
   `art/style-reference.png`.
2. **Step 2 (every later prompt):** attach `style-reference.png` AND
   your subject photo, and tell the model "match the art style of the
   first attached image."

Both ChatGPT (GPT-4o image gen) and Gemini support multi-image input.
This pattern is what keeps everything looking like the same game.

#### Step 1 — lock the art style (do this once)

Paste this into ChatGPT or Gemini with **no** attached images:

> Generate a single reference sheet showing the established art style
> for a 2D side-scrolling zombie shooter. Style: 16-bit pixel art,
> hard 1px outlines, no anti-aliasing, ~32-color limited palette
> dominated by neon green (#39ff14), warm sunset oranges, and deep
> charcoal shadows. On one 1024x1024 canvas with transparent
> background, show: a generic male soldier character in a 4-frame
> walk cycle (top row), a generic shambling zombie in a 4-frame walk
> cycle (middle row), and three small UI items — a heart, a coin, an
> ammo crate — in a row at the bottom. All sprites face right except
> the zombie which faces left. Each character ~96px tall, items
> ~48px. The look should be arcade-cartoony, slightly menacing but
> not horror-realistic.

Generate 3-5 variants, pick your favorite, save it. **This is now your
visual contract** for every subsequent prompt.

#### Step 2A — turn a real photo of a person into a character sprite

Attach two images: (1) `style-reference.png`, (2) a clear photo of the
person you want as the character. Then:

> The first attached image is the locked art style for our 2D
> side-scroller game. The second image is a photo of the real person
> I want as a playable character. Convert this person into a sprite
> matching the locked art style exactly. Output a single horizontal
> sprite-sheet row, 768x96 pixels (8 frames at 96x96), transparent
> background, character facing right, walking cycle (two contact,
> two passing, two recoil poses, then two transition frames).
> Preserve the person's hair color, skin tone, and clothing colors
> from the photo, but redraw at the locked pixel-art resolution. No
> shadow, no background, character centered in each frame.

After you accept that walk cycle, run follow-up prompts in the same
chat session (so the model remembers the character):

> Same character, same style. Now generate a 4-frame shoot animation,
> 384x96, holding a pistol, facing right, transparent background.

> Same character. Now generate a 4-frame jump (crouch / takeoff /
> apex / land), 384x96, transparent background.

> Same character. Now generate a 6-frame death animation, 576x96,
> transparent background.

> Same character. Now generate a 4-frame idle (subtle breathing /
> weight shift), 384x96, transparent background.

Repeat the whole block for each of the 3 characters.

#### Step 2B — turn a real photo of a location into a background layer

This is the one you specifically asked about. Backgrounds in an
auto-scrolling side-scroller use **3 parallax layers** at different
sizes and scroll speeds:

| Layer | Pixel size | Scroll speed | What it is |
|---|---|---|---|
| **Sky / far** | 1920×720 | 0.1× | Sky, mountains, distant skyline. Tiles slowly. |
| **Mid** | 1920×400 | 0.4× | Buildings, trees, distant fences. Top half transparent. |
| **Foreground** | 1920×200 | 1.0× (matches scroll) | Bushes, debris, foreground grass. Top + middle transparent. |
| **Ground tile** | 128×64 each | 1.0× | Repeating ground strip the player walks on. 4 variants. |

**Why those sizes:** 1920px wide = one full screen plus a buffer so we
can scroll horizontally and tile seamlessly. Each layer's height is
sized so it can stack in the lower portion of a 720px viewport without
overlapping the sky.

**Sky / far layer prompt (attach style-reference + photo of skyline):**

> The first attached image is the locked art style for our 2D
> side-scroller. The second image is a real photo of [LOCATION,
> e.g., 'the downtown Chicago skyline at sunset']. Convert this
> location into a tileable far-distance parallax background layer
> matching the locked pixel-art style. Output exactly 1920x720
> pixels, transparent background. Distant silhouettes of buildings
> and mountains in the lower 60%, sky gradient and clouds in the
> upper 40%. Must tile seamlessly horizontally — the rightmost
> column of pixels must visually match the leftmost column. Muted
> palette, no high-contrast detail (this layer sits behind everything
> else and shouldn't compete with the action).

**Mid layer prompt (closer buildings / structures):**

> Using the same locked art style and the same source location photo,
> generate the mid-distance parallax layer. 1920x400 pixels,
> transparent background. The TOP HALF must be fully transparent
> (sky shows through from the far layer). The BOTTOM HALF should
> contain medium-detail buildings, fences, streetlights, and
> recognizable structures from the source photo — stylized into
> pixel art, slightly more vivid than the far layer. Must tile
> seamlessly horizontally.

**Foreground layer prompt (bushes / debris):**

> Same locked art style, same source location. Generate the foreground
> parallax layer. 1920x200 pixels, transparent background. Only the
> bottom 100px should contain content: bushes, broken concrete,
> overturned trash cans, debris consistent with the source location.
> Top 100px transparent. High-contrast and vivid colors (this layer
> scrolls fastest and reads as "close to the camera"). Must tile
> seamlessly horizontally.

**Ground tile prompt (4 variants):**

> Same locked art style. Generate a ground tile strip for the
> walkable surface based on the source location. 512x64 pixels
> total, divided into FOUR adjacent 128x64 tile variants in a single
> row. Each tile must be independently tileable left-and-right (so
> any tile can connect to any other). Surface should match the
> source location (asphalt / dirt / cobblestone / etc.). No
> transparency — solid ground. Slight detail variation across the
> four (a crack, a manhole cover, a puddle, a clean tile).

Then in code we pick a random tile variant for each ground segment so
the ground doesn't look obviously repeated.

#### Step 2B-Worked — example using South Lamar, Austin TX

This is the concrete version of Step 2B for a real location.

**Heads up on what the AI can actually see:** ChatGPT and Gemini do NOT
have live access to Google Street View. They only see images you attach
to the message. Both models know South Lamar from their training data,
so they can produce a "Texas-flavored strip" from name-drop alone, but
real Street View screenshots get you something actually recognizable
(Alamo Drafthouse marquee, the funky food-truck lots, etc.).

##### Already-captured reference photos (in `art/` folder)

Four reference images are pre-saved at `book/zombies/art/`:

| File | What it is | Use as |
|---|---|---|
| `streetview-jessie-st-start.jpg` | Google Street View, 908 Jessie St looking north on Jessie | **Starting-location reference** — opening scene |
| `streetview-alamo-drafthouse.jpg` | Google Street View, Alamo Drafthouse marquee head-on | Mid-layer landmark |
| `userphoto-south-lamar-sidewalk.jpg` | User photo by Jacob Perkins (Jul 2025), 1953 S Lamar Blvd street-level | Sidewalk-level / foreground reference |
| `userphoto-srv-statue-skyline.jpg` | User photo by Victor (Apr 2018), Stevie Ray Vaughan statue with downtown Austin skyline behind | Skyline / far-layer reference |

Two are direct Google Street View pano captures (no copyright concern
for personal art reference). Two are user-uploaded photos with a
"Images may be subject to copyright" notice — fine for art-style
reference / inspiration, but don't republish them as-is.

##### If you need additional locations later

Open Google Street View on the area you want and grab screenshots
matching the three parallax layers:

1. **Sky / far layer source:** wide pull-back showing distant skyline.
2. **Mid layer source:** head-on shot of a recognizable landmark.
3. **Foreground layer source:** street-level shot showing sidewalk,
   poles, signs, bushes, parking meters.

Save them under `book/zombies/art/` with descriptive names.

##### Prompts (paste into ChatGPT or Gemini)

**Starting-location opening scene** — attach `style-reference.png` +
`streetview-jessie-st-start.jpg`:

> The first attached image is the locked art style for our 2D
> side-scrolling zombie shooter. The second is a Google Street View
> photo of Jessie Street in the Bouldin Creek neighborhood of Austin,
> Texas — this is the **player's starting location** in the game.
> The character begins on this quiet residential side street and
> walks west toward South Lamar Boulevard where the action begins.
> Convert into the **opening-scene background**: 1920x720 pixels,
> transparent background. Wide leafy residential street with old
> Austin bungalows and 1960s-era duplexes on both sides, mature
> live oaks creating a canopy, telephone poles with sagging wires,
> parked cars in driveways. Apocalyptic touches consistent with our
> zombie theme — abandoned cars, an open garage door, a few visible
> zombies shambling in the distance, but mostly empty and eerie.
> Early morning light, pre-dawn or just-after-dawn. Must tile
> seamlessly horizontally so it can scroll. This scene should feel
> calmer than the South Lamar combat scenes — the calm before the
> storm.

This is the level's **first 30-60 seconds of gameplay** before the
camera pans onto the brighter, denser South Lamar combat sections.

**Sky / far layer** — attach `style-reference.png` + `userphoto-srv-statue-skyline.jpg`:

> The first attached image is the locked art style for our 2D
> side-scrolling zombie shooter. The second is a photo taken from
> the Stevie Ray Vaughan statue at Auditorium Shores in Austin,
> Texas, showing the downtown Austin skyline across Lady Bird Lake
> (just north of the South Lamar neighborhood where our game is
> set). Convert this scene into the far-distance parallax background
> layer for our game. 1920x720
> pixels, transparent background. Distant silhouette of the Austin
> skyline (Frost Bank Tower's distinctive crown, the Independent
> "Jenga" tower, lower mid-rises) in the lower 60% of the canvas.
> Sky gradient with sunset orange-to-purple in the upper 40%, with
> a few stylized clouds. Include subtle apocalyptic touches
> consistent with our zombie theme — distant smoke columns,
> a flickering streetlight or two. Muted palette so this layer sits
> behind the action without competing. Must tile seamlessly
> horizontally — the rightmost column of pixels must visually match
> the leftmost.

**Mid layer** — attach `style-reference.png` + `streetview-alamo-drafthouse.jpg`:

> Same locked art style as before. The second image is a Google
> Street View photo of the Alamo Drafthouse Cinema South Lamar
> marquee on South Lamar Blvd in Austin. Convert
> into the mid-distance parallax layer. 1920x400 pixels, transparent
> background. The TOP HALF must be fully transparent (sky shows
> through from the far layer). The BOTTOM HALF should contain the
> landmark redrawn in our pixel-art style, plus adjacent
> South-Lamar-style strip-mall storefronts, food trucks, and tall
> Texas live oak trees stretching across the layer width. Slightly
> apocalyptic — broken neon signs, boarded windows, but still
> recognizable as the source location. Must tile seamlessly
> horizontally.

**Foreground layer** — attach `style-reference.png` + `userphoto-south-lamar-sidewalk.jpg`:

> Same locked art style. The second image is a street-level photo
> from 1953 S Lamar Blvd in Austin, Texas — showing power lines,
> telephone poles, a construction crane, traffic, and a CapMetro bus
> on the boulevard. Generate the
> foreground parallax layer. 1920x200 pixels, transparent background.
> Only the bottom 100px should contain content: cracked Texas
> sidewalk, overturned food-truck menu boards, scattered paper trash,
> an "OPEN" sign on its side, scrubby Austin landscaping (yucca,
> agave, dried bluebonnet patches), telephone poles with stapled
> flyers. Top 100px transparent. High-contrast and vivid — this
> layer scrolls fastest and reads as "close to the camera." Must
> tile seamlessly horizontally.

**Ground tile** — attach `style-reference.png` only (ground is more abstract):

> Locked art style attached. Generate a ground tile strip representing
> a cracked Austin asphalt road with faded yellow lane markings.
> 512x64 pixels total, divided into four adjacent 128x64 tile variants
> in a single row. Each tile must be independently tileable
> left-and-right (any tile can connect to any other). Variants:
> (1) clean asphalt with faded yellow stripe, (2) asphalt with a
> small crack, (3) asphalt with a manhole cover, (4) asphalt with
> a small puddle reflecting orange sunset. No transparency — solid
> ground.

##### Fallback (no Street View screenshots, training data only)

If you don't want to grab screenshots, attach only `style-reference.png`
and use this for the mid layer:

> Locked art style attached. Generate a mid-distance parallax layer
> for a 2D side-scroller, depicting South Lamar Boulevard in Austin,
> Texas at dusk during a zombie outbreak. Include recognizable
> elements you know from this neighborhood: low-rise strip-mall
> retail, food trucks, the Alamo Drafthouse marquee silhouette,
> Broken Spoke dance hall, tall Texas live oaks, a few telephone
> poles with stapled flyers. 1920x400 pixels, top half transparent,
> bottom half opaque. Must tile seamlessly horizontally. Slightly
> apocalyptic — broken signs, boarded windows — but still clearly
> South Lamar.

The fallback gets you ~70% there; attached Street View shots get you
~95% with actual recognizable storefronts.

##### Per-image prompts for the level-1 journey (`bg-01` through `bg-06`)

You provided 6 sequential photos that walk the player from 904 Jessie
St to S Lamar Blvd. They've been renamed in `art/` to make the order
clear:

| # | File | What it shows | Game zone |
|---|---|---|---|
| 1 | `bg-01-jessie-house.png` | The yellow-green Craftsman house at 904 Jessie St | **Spawn** — first 5-10 sec |
| 2 | `bg-02-jessie-fence.png` | White Honda parked at wood fence on Jessie | Walking out the gate |
| 3 | `bg-03-treadwell-east.png` | Treadwell St heading east toward Lamar | Crossing the neighborhood |
| 4 | `bg-04-lamar-union-mural.png` | Lamar Union plaza with the rainbow pinwheel mural | First Lamar contact |
| 5 | `bg-05-lamar-union-corridor.png` | Lamar Union car corridor with red/magenta storefronts | Mid-Lamar combat |
| 6 | `bg-06-alamo-drafthouse.png` | Alamo Drafthouse marquee + HighBall sign | Boss / level-end |

Each one becomes a **full 1920×720 background** for its level zone
(simpler than 3-layer parallax — we can split into parallax later in
v0.6). Prompts below — for each, attach `style-reference.png` + the
named source photo, then paste the prompt.

**Prompt 1 — `bg-01-jessie-house.png` (Spawn point):**

> First image is the locked art style. Second image is the player's
> spawn point: the yellow-green two-story Craftsman house at 904
> Jessie St in the Bouldin Creek neighborhood of Austin. Convert to
> a 1920x720 single-layer side-scroller background. Pre-dawn lighting,
> sky gradient muted purple-to-orange in the upper third. Stylized
> Craftsman house centered, with the front door swung open ominously
> (the player just left). Mature live oak trees on both sides framing
> the scene. Apocalyptic touches: an overturned trash can in the
> driveway, a single shambling zombie silhouette in the far
> background. Tile seamlessly horizontally. Calm, eerie — first
> 5-10 seconds of gameplay before action starts.

**Prompt 2 — `bg-02-jessie-fence.png` (Walking out):**

> Locked art style attached. Second image is a Jessie St view with a
> wood fence and a parked white Honda Civic. Convert to 1920x720
> background, single layer, tileable horizontally. Wood-plank
> privacy fence stretches across the background, residential houses
> visible above the fence line on the left, scrubby front yards in
> foreground. Apocalyptic: a few zombies clawing at the fence from
> behind, the parked Civic with its driver-side door open and one
> headlight on. Same pre-dawn lighting as Prompt 1.

**Prompt 3 — `bg-03-treadwell-east.png` (Crossing the neighborhood):**

> Locked art style attached. Second image is Treadwell St looking
> east toward S Lamar Blvd, with a wood fence on the left and a
> modern apartment building (Lamar Union) visible on the right.
> 1920x720 single-layer background, tileable horizontally. The
> contrast between old residential (left) and new mixed-use (right)
> is the narrative — player is leaving the neighborhood. Light is
> shifting from pre-dawn to early-morning gray. Apocalyptic: a
> sedan crashed into the curb mid-frame, scattered groceries on the
> asphalt, a small zombie cluster in the middle distance.

**Prompt 4 — `bg-04-lamar-union-mural.png` (First Lamar contact):**

> Locked art style attached. Second image is the Lamar Union plaza —
> sleek modern apartment building above retail, with an iconic
> rainbow pinwheel/sunburst mural painted on a side wall, and an
> outdoor patio with metal cafe chairs and tables. Convert to
> 1920x720 single-layer background, tileable. KEEP the rainbow
> pinwheel mural prominent — it's a real Austin landmark. Patio
> chairs scattered/overturned. Apocalyptic: a few zombies
> approaching from the patio, broken glass on the sidewalk, leaves
> scattered. Morning light, slightly more saturated than prior
> scenes — the action zone is beginning.

**Prompt 5 — `bg-05-lamar-union-corridor.png` (Mid-Lamar combat):**

> Locked art style attached. Second image is the Lamar Union car
> corridor — colorful storefronts in red, magenta, and yellow trim
> on a concrete plaza, restaurants with patio shades, string lights
> overhead, and a Mercedes mid-intersection. Convert to 1920x720
> background, tileable. KEEP the colorful storefront facades — they
> read as "modern Austin." String lights still hung but flickering /
> some bulbs out. Apocalyptic: the abandoned Mercedes sits in the
> intersection, restaurant patio shades torn, a fire hydrant
> spraying water in the foreground, multiple zombies emerging from
> different storefronts. Overcast sky, dramatic afternoon light.
> This is peak combat zone.

**Prompt 6 — `bg-06-alamo-drafthouse.png` (Boss / level-end):**

> Locked art style attached. Second image is the Alamo Drafthouse
> Cinema South Lamar — red/maroon corrugated metal facade, the iconic
> ALAMO DRAFTHOUSE CINEMA marquee sign, the HighBall bar's vertical
> "HighBall" sign next door, and a planted bed of grasses + bushes
> in front. Convert to 1920x720 single-layer background, tileable.
> KEEP the marquee + HighBall sign clearly recognizable — this is
> the level-end boss arena. Marquee text changes from movie
> showtimes to "BUSTED IN AUSTIN" in pixel-art neon. Boarded-up
> doors. Bushes mostly intact (texture interest). Sunset lighting
> with deeper purple sky. Apocalyptic: large zombie horde gathered
> in front, a flickering neon sign, smoke rising from behind the
> building. Cinematic boss vibe.

##### Per-level location swaps

Each new level/area in the game can use this same recipe with a
different real location:
- Level 1: South Lamar, Austin TX (you, above)
- Level 2: e.g., Bourbon Street, New Orleans
- Level 3: e.g., Venice Beach boardwalk
- Boss level: a single iconic landmark

Just swap the location name + Street View screenshots. The locked art
style keeps everything consistent across levels.

##### Note on the BookHockeys "no location" rule

The hard rule from `book/` says "no Chicago or any other location" —
that's about the **streamer's** real-world location (privacy). Using
Austin TX as the **fictional game-level setting** is a different thing
and is fine. The location appears in level art and possibly a "WELCOME
TO SOUTH LAMAR" banner in-game, not as anything that ties the streamer
themselves to a place. Worth confirming once before we ship just so
there's no ambiguity.

#### Step 2C — zombie sprites

Attach the style reference and (optionally) a costume/character photo:

> First image is the locked art style. [Second image is a photo of a
> zombie costume / movie still / reference for body type.] Generate
> a "Shambler" zombie sprite matching the locked style. 96x96 pixels,
> single static idle frame, transparent background, facing left
> (toward the player on the right). Ragged civilian clothing, pale
> green-gray skin, slightly hunched posture, arms outstretched.

Then in the same chat:

> Same zombie, same style. Generate a 6-frame walk cycle, 576x96,
> single row, transparent background, facing left.

> Same zombie. Generate a 4-frame attack animation (lunging forward
> with arms), 384x96.

> Same zombie. Generate a 6-frame death animation (collapsing
> backwards), 576x96.

Repeat for the Runner (slimmer, faster posture) and Heavy (larger
frame, 144x144 instead of 96x96).

#### Step 2D — OG / title card

> Locked art style attached. Create a 1200x630 social-share card
> titled "CX ZOMBIES" in massive neon green (#39ff14) text using a
> chunky display font with a thick black outline. Background:
> silhouettes of three player characters (Scout, Soldier, Heavy)
> standing on the right firing pistols at a horde of approaching
> zombies on the left, dramatic sunset sky behind. Bottom right
> corner: the URL "bookhockeys.com/zombies" in small white text
> with a subtle drop shadow.

### 6d. Audio

For v0.1 we need ~10 SFX + 1-2 looping background tracks:

- Gunshot (handgun "pop")
- Empty click (if we add ammo)
- Zombie groan (3 variants — randomize)
- Zombie hit (wet thud)
- Zombie death
- Player hurt grunt
- Player death
- Heart pickup chime
- Cx coin pickup (reuse Run's `coin-pickup.wav`)
- Wave-start fanfare
- Ambient BG track (looping, ~2 min, dark synthwave or driving rock)
- Boss theme later

Sources: freesound.org, pixabay.com/sound-effects, opengameart.org.
Run already has ~30 free SFX collected — the explosions/blip packs in
`empire/run/audio/` may have stuff we can reuse directly (gunshots,
hits).

---

## 7. Phased build — Claude Max session estimate

Each session = ~4 hours of focused Opus 4.7 work. These are realistic,
not stretch-best-case.

### Phase 0 — scaffold (1 session)
- Create `book/zombies/` skeleton: index.html, css/style.css, js/main.js
- Lift HUD + overlays + audio panel + pause/start/gameover from `/run/`
- Wire GA4 + consent banner
- Empty canvas with resize-to-viewport
- Basic boot sequence with version pill
- README.md + this PLAN.md committed
- **Ship:** v0.1.0 placeholder (just the shell, "coming soon")

### Phase 1 — player + camera + loadout shell (2 sessions)
- Player sprite (placeholder square OK)
- Auto-scroll camera, ground rendering
- Move/jump controls (keyboard + mobile touch)
- Player animation states wired (even with placeholder art)
- **Loadout screen** with 3 placeholder character cards, selection
  persists to localStorage, selected character's stats drive runtime
  (even if all 3 share the same placeholder sprite for now)
- **Ship:** v0.2.0 — playable empty world with character-select shell

### Phase 1.5 — v0.2.1 + v0.2.2 polish (1-2 sessions)

**v0.2.1 (shipped):** feedback patch — bigger Ice sprite, color-key
transparency on walk atlas, per-scene ground-line interpolation,
soft shadow band at scene seams, animated FX overlay system (bg-06
neon flicker + ambulance lights).

**v0.2.2 — bridge images for true seamless transitions:**

The locked approach (Option B from the design discussion):

- Keep all 7 `bg-XX-final.png` anchor scenes untouched.
- Generate **6 NEW transition bridge images** that explicitly
  match adjacent edges:
  - `bridge-00-01.png` — connects bg-00 right edge → bg-01 left edge
  - `bridge-01-02.png` — connects bg-01 → bg-02
  - ... through `bridge-05-06.png`
- Each bridge: **512×768 px** (a quarter of a hero scene's width).
  Left half visually continues bg-N's right edge; right half
  transitions into bg-(N+1)'s left edge; center is a smooth
  gradient — stretching ground texture, fading building heights,
  no new major architectural elements (it's a transitional
  alley/passage, not a new scene).

**ChatGPT prompt template per bridge** (paste into Cx Zombies Art
project, attach `style-reference.png` + `bg-N-final.png` +
`bg-(N+1)-final.png`):

> Generate a 512×768 pixel transition strip in chunky 16-bit
> pixel-art style matching the FIRST attached image (style
> reference). The SECOND attached image is the LEFT-side anchor
> scene; the THIRD is the RIGHT-side anchor scene. Your output
> must serve as a SEAMLESS BRIDGE between them: the LEFT edge of
> your output (first ~80 pixels) must visually continue from the
> RIGHT edge of the second attached image (same ground level,
> same sky color, same atmospheric lighting, same tree silhouette
> heights, same architectural style). The RIGHT edge of your
> output (last ~80 pixels) must transition into the LEFT edge of
> the third attached image. The middle should be a smooth gradient
> — a transitional alley, walkway, or passage with no new major
> architectural elements. Same time-of-day lighting as the two
> anchors. Apocalyptic touches OK (debris, distant zombie
> silhouette) but understated. Output dimensions: 512 wide × 768
> tall. Transparent background NOT needed — fill the full
> dimensions.

**Code changes in `main.js`:**

- World layout becomes interleaved: scene[0] → bridge[0] →
  scene[1] → bridge[1] → ... → scene[6]. 7 anchors + 6 bridges = 13
  segments.
- New `WORLD_LAYOUT` array: `[{type:'scene',idx:0,w:2048},
  {type:'bridge',idx:0,w:512}, ...]`.
- Camera/render iterates this layout instead of pure scene math.
- World width: 7×2048 + 6×512 = **17408 px** (was 14336).
- `SCENE_GROUND_LINES` becomes `SEGMENT_GROUND_LINES` with 13
  entries; bridge ground lines tuned to interpolate cleanly between
  their two neighbors.
- The seam shadow-band hack from v0.2.1 gets removed — bridges
  replace it.

**Effort:** ~6 ChatGPT chats (one per bridge), ~1-2 refinement
messages each, plus the code change. ~1 session.

**Ship:** v0.2.2 — true seamless transitions through the entire
level. Then we move to Phase 2.

### Phase 2 — shooting + first zombie (2 sessions)
- Bullet pool + collision system
- Shambler entity: spawn, walk, contact damage, death
- Muzzle flash + blood particle
- Score counter starts working
- **Ship:** v0.3.0 — minimum viable game

### Phase 3 — enemy variety (1-2 sessions)
- Add Runner + Heavy
- Wave system + difficulty ramp
- Wave banner UI
- **Ship:** v0.4.0 — endless waves

### Phase 4 — leaderboard + polish (1-2 sessions)
- Lift leaderboard.js, repath to `/zombies/*` in Firebase
- Kick-username modal + auto-submit
- Add `character` field to score entries
- Title-screen stats (top score + total runs)
- Game-over screen polish + share PNG (shows which character was used)
- **Ship:** v0.5.0 — competitive release

### Phase 5 — art pass (4-5 sessions, was 3-4 pre-loadout)
- Generate or download all real sprites:
  - **3 character atlases** (full state set per character)
  - 3 zombies, bullets, particles, 3 BG layers, ground tiles
- Replace placeholders, tweak hitboxes per character (Heavy is bigger)
- Loadout screen portraits (cropped + framed from each atlas)
- Title card / OG image (silhouette of all 3 chars + zombie horde)
- **Ship:** v0.6.0 — looks-like-a-game release

### Phase 6 — audio pass (1-2 sessions)
- Source + wire all SFX, wire BG music
- Volume balance, mute persistence
- **Ship:** v0.7.0 — sounds-like-a-game release

### Phase 7 — juice + balance (2-3 sessions)
- Screen shake, hit flash, death slow-mo
- Difficulty tuning, spawn-rate balance
- Mobile UX QA
- Pickups (heart, ammo crate, Cx coin)
- **Ship:** v1.0.0 — proud-to-share release

**Realistic total: 13-18 sessions to v1.0** (was 12-16 pre-loadout — the
+1-2 covers the loadout UI in phase 1 and the extra character art in
phase 5).
- Bare-minimum playable demo: 5 sessions (phases 0-2)
- Leaderboard-ready: 7-9 sessions (phases 0-4)
- Looks + sounds polished: 13-18 sessions (all phases)

For comparison, Run reached its current v0.18.62 (with cutscenes, jail,
side-kick AI, story arc) in roughly 40-60 sessions. Cx Zombies at
12-16 sessions would be roughly equivalent to **Run circa v0.5** —
solid, polished MVP.

---

## 8. Decisions — answered

All locked as of 2026-05-01:

1. ~~Title?~~ → **Cx Zombies** ✅
2. ~~Subfolder of `book` or own repo?~~ → **Subfolder** ✅ (`book/zombies/`)
3. ~~Ammo limited or infinite?~~ → **Infinite default + temporary special-weapon pickups** ✅ (rocket / shotgun / flamethrower / mini-gun — see §5e)
4. ~~Hearts or HP bar?~~ → **HP bar**, Doom-style, 100 max ✅ (per-character maxHP — see §5f)
5. ~~AI sprites or free pack?~~ → **Mix**: free zombie pack for placeholder MVP, AI-generated final art ✅
6. ~~Reuse `/run/` audio?~~ → **Yes for v0.1 placeholder**, replace before v1.0 ✅
7. ~~Roster size?~~ → **3 characters**, names change in later versions ✅ (Ice Poseidon / Scout / Heavy — Ice is main)
8. ~~Stat-only differentiation, or unique starting weapons per character?~~ → **Stat-only for v0.1** ✅ (all 3 chars hold the same default pistol on screen, differ via maxHP / move speed / fire rate / per-shot damage). v0.5+ can give each character a distinct visible starting weapon if it adds replay value.

### What "stat-only vs unique starting weapons" meant (re-explained)

This was the question you weren't sure about. Two ways to make characters
feel different mechanically:

**Stat-only** (what we're going with for v0.1):
- All 3 characters hold the same pistol sprite on screen
- Bullet looks identical regardless of who fires
- They differ only in NUMBERS — Scout fires faster, Heavy hits 3× as
  hard, Ice is balanced
- Cheap art-wise: 1 gun sprite + 1 bullet sprite for the whole roster

**Unique starting weapons** (deferred to v0.5+):
- Scout spawns with a small handgun (visually drawn)
- Soldier/Ice spawns with an assault rifle
- Heavy spawns with a shotgun (visually drawn, with wider bullet spread)
- Picking up a temporary special (e.g., rocket launcher) replaces the
  visible weapon for its duration, then reverts to your character's unique
  starter
- More art + code work, but characters feel more distinct on screen

For v0.1 stat-only is the right call — ships faster, the temporary
special-weapon pickups (rockets / shotgun / etc.) already give you
visible weapon variety mid-run.

Once those are answered, Phase 0 is ready to start.

---

## 9. Hard rules carried over from `book/`

These come from existing memory and apply to anything under bookhockeys.com:

- **No real name** of the streamer in code, copy, or commits.
- No location references ("Chicago" etc.).
- BookHockeys is just the handle — don't theme the broader site around
  literal books or hockey, but Cx Zombies as a self-contained subproject
  is free to have its own theme (zombies, neon green, arcade).
- Logo PNG (`/logo.png`) is transparent — keep it on the neon green
  background, not on a black/white card.
- Shared GA4 (`G-DYME377V2S`) and shared `greenline-consent` localStorage
  key — both `/` and `/greenline/` and `/zombies/` should treat these
  three as one site for consent purposes.
