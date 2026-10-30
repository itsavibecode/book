# Fortress Watch

Live at https://bookhockeys.com/fortress/ . Version 0.3.0.

One page that answers "what is actually confirmed about FORTRESS and the 90-day / 30-day
warnings, and what is just going around". Every claim carries a status label. Every outlet
carries a trust rating with a written reason. It is a claim tracker, not a prepper site and
not a news blog.

The page is `index.html` + `styles.css` + `app.js`, no build step. `app.js` fetches the
files in `data/` and renders every section; each section loads on its own, so one bad file
shows that section's error and leaves the rest working.

## Labels

| Label | When we use it |
| --- | --- |
| FACT | A primary source exists: an official release, transcript, government page, court or budget document. |
| CONFIRMED | Two or more independent outlets rated 4 or higher report it with consistent details. |
| REPORTED | One outlet rated 3 or higher reports it. No second source yet. |
| RUMOR | Only social posts, forums, or blogs rated 1 or 2. |
| SPECULATION | A theory about why, not a claim of what happened. Always tagged with its theory. |
| DEBUNKED | An official denial or a fact-checker contradicts it. |

Flags next to a stamp: DEVELOPING means the claim is dated or changed in the last 48 hours.
UPDATED means its label or details changed in the last 7 days, with a one-line note.
CORRECTION means we downgraded a label we got wrong; the old label stays in the claim's
history. SIMPSONS marks a claim people tie to a Simpsons episode: a tag, never a status.
DATE marks a scheduled event, with a countdown when it is less than 30 days away.

## Outlet trust, 1 to 5

| Trust | Who lands here |
| --- | --- |
| 5 | Primary documents and official statements (Department of War, gov.uk, European Commission, FEMA, FCC) and wire services. |
| 4 | Papers of record, major broadcasters and specialist outlets with corrections policies, and fact-checkers that publish their sources. |
| 3 | Aggregating magazines and local TV. Also an outlet that is the only source for its own claim. |
| 2 | Tabloids, opinion sites, partisan outlets and re-reporters. |
| 1 | Anonymous blogs, social posts on Facebook, Instagram, X or YouTube, Reddit threads, Telegram. |

Rating an outlet is not rating the claim. A trust-5 outlet can carry a REPORTED claim that
has only one source, and a trust-1 post can point at a FACT once we find the primary source.

These two tables are the same text as the methodology section of the page. Change both in
the same commit.

## Data files (`data/`)

| File | Written by | What it holds |
| --- | --- | --- |
| `items.json` | a Claude session or you | The claims: `id, date, headline, summary, status, theory, region, sourceIds, urls, quote?, simpsons?, eventDate?, history?` |
| `sources.json` | a Claude session or you | The outlets: `id, name, domain, type, trust, trustReason, url` |
| `analysis.json` | a Claude session only | "What would have to be true": intro, one entry per theory, the Nov 17 note and the verdict |
| `guidance.json` | a Claude session or you | Rows of the "What officials actually recommend" table, each linked to board items |
| `faq.json` | a Claude session or you | "Questions people are asking", each answered from board items |
| `kit.json` | a Claude session or you | The blackout starter kit: `updated, affiliateTag, disclosureNoTag, disclosureWithTag, sources[{id,label,url}], items[{id,name,quantity,why,priority,amazonQuery,officialSources}]` |
| `meta.json` | `refresh.py`, plus you for three fields | `statusConfirmed` and `statusNotTrue` (the two status sentences, edit them here, not in the HTML), `version`; the rest is written by the refresh |
| `feed.json` | `refresh.py` only | The Incoming wire: last 48 hours of matching headlines |

Notes for editors:

- `history` is a list of `{ date, status, note }`. A step down (FACT to CONFIRMED to
  REPORTED to RUMOR to DEBUNKED) puts the claim in the corrections log automatically.
  Moves into or out of SPECULATION are not counted as downgrades.
- `eventDate` (YYYY-MM-DD) adds the DATE tag and, within 30 days, a countdown in the row
  and in the status line.
- `geo` (`{ lat, lng, place, kind }`) pins the claim on the map page; `geoAlso`
  (`[{ lat, lng, place }]`) adds smaller dashed pins for other places it names.
- `simpsons` can be `true`, or `{ "episode", "aired", "shows" }` to show the episode in the
  tooltip and the expanded row.
- Theories: nuclear, iran, midterms, false-flag, cyberattack, ai-cyber, grid, solar, russia,
  china, other. A SPECULATION item gets a card in the theories rail; its "points against"
  comes from the matching `analysis.json` entry (`ai-cyber` maps to `cyberattack`).
- After editing, run `python -I tools/build-seo.py` so the JSON-LD and the static status
  line follow (the refresh also does this every 6 hours).

## Map page (`map.html`, `map.js`)

"Where the FORTRESS claims come from": a Leaflet 1.9.4 map (from unpkg) with one pin per
claim that has `geo`, filled with its stamp colour and sized by recency (last 48 hours
largest, then 7 days, 30 days, older). Chips filter by Last 48 hours / 7 days / 30 days /
All (default 7 days, or All when fewer than 3 claims are that recent) and by label. Popups
show the date, stamp, headline, place and an "Open on the board" link. A plain list of the
same claims sits under the map for keyboard and screen-reader users; `tools/build-seo.py`
also writes it into `map.html` so the page works without JavaScript. The theme toggle
shares `fortress-theme` with the board.

Tiles: the plan named CARTO Voyager and Dark Matter, but `basemaps.cartocdn.com` now
answers every tile with "API KEY REQUIRED", so the page uses Esri's keyless Light Gray and
Dark Gray Canvas. Switching back to CARTO with a key is two URLs and the attribution at the
top of `map.js`.

## Blackout starter kit (`kit.js`, `kit.html`, `kit-icons.svg`)

The kit lists only items that are on the official checklists in `kit.json` `sources`
(Ready.gov and the UK's Be Ready), with the quantity in their wording. `kit.js` renders it
on the board (after "What officials actually recommend") and on the standalone share page
`kit.html`; on `kit.html` it also runs the theme toggle and the consent banner.

- **Hero band.** The kit section opens with the page's one full-bleed, inverted band: ink
  ground with paper type in light, paper ground with ink type in dark. Reason (RHYTHM 3): the
  kit is the one thing readers act on and the part they screenshot, so it gets the one
  inverted section. It carries the headline, "Every item is on the Ready.gov or UK Be Ready
  list. Nothing else.", an OFFICIAL LISTS ONLY stamp, the item count computed from
  `kit.json`, and a flat lay of eight pictograms on a paper card (turned up to 2 degrees so
  it reads as a laid-out kit). No hazard stripe: that stays unique to the status line.
- **Pictograms.** `kit-icons.svg` holds one `<symbol id="ki-<item id>">` per kit item,
  drawn for this site: 24 x 24, 2 px stroke in currentColor, square caps, fills only where a
  solid shape reads better. R-04 reason: pictograms let people identify an item in a
  checklist they screenshot. The power bank carries the set's only lightning bolt, because
  the bolt marks stored charge. `tools/build-seo.py` inlines the sprite into `index.html` and
  `kit.html` so `<use href="#ki-<id>">` works from the server and from file:// (an external
  `kit-icons.svg#id` reference is blocked on file://). A new kit item needs a new symbol.
- **List.** Core items (`priority: "core"`) are full rows in two columns (one under 640 px):
  pictogram, name, quantity, why, source chips, "Add to my list" (kept on the device under
  `fortress-kit`) and "Find on Amazon". Recommended items sit as one row of chips that open
  to the same details. R-14 reason: core items are the base kit (`priority: "core"`), so
  they get the weight; the extras are optional and stay out of the way until asked.
- **Amazon.** "Find on Amazon" opens `https://www.amazon.com/s?k=<amazonQuery>` in a new tab
  with `rel="noopener nofollow sponsored"`. `&tag=<affiliateTag>` is added only when
  `affiliateTag` is not empty, and the matching disclosure shows under the list.
- **Kit page.** `kit.html` has the same hero and list, its own title and description, a
  JSON-LD ItemList of the item names (written by `tools/build-seo.py`; no offers, no prices)
  and its own share card `og-kit.png` (drawn by `tools/make-kit.py og-kit` from the same
  sprite). The methodology note says the kit is the official lists, not our advice. Never add
  an item that is not on a linked official list.

## Refresh

`refresh.py` (Python 3.12, standard library only) runs every 6 hours from
`.github/workflows/fortress-refresh.yml` (cron `17 */6 * * *`, plus a manual run button).
It pulls Google News RSS for six fixed queries, keeps on-topic headlines from the last 48
hours, dedupes them, maps each outlet's domain to `sources.json` for trust, writes
`feed.json` and `meta.json`, bumps the sitemap lastmod, and runs `tools/build-seo.py`. A
failing query is skipped with a notice; if every query fails, `feed.json` is left alone and
the page says the wire is stale. The workflow commits only when a file changed, as
`fortress: feed refresh <date>`.

The script never changes a label. A script cannot know if something is true.

Run it by hand from this folder: `python -I refresh.py`.

### IndexNow (off for now)

The workflow has an IndexNow ping step, commented out, because the book repo has no IndexNow
key file yet. To turn it on: generate a key
(`python -c "import secrets; print(secrets.token_hex(16))"`), commit `<key>.txt` holding
only the key to the root of the book repo, put the key in the step, and uncomment it.

## Inbox

Drop screenshots and photos into `inbox/` (git-ignored, nothing in it ever ships). In a
Claude session run from `book/`, say "triage the fortress inbox": each image is read, the
claim extracted, the source found, a label proposed, and the item appended to `items.json`.
Processed files move to `inbox/done/`. Inbox images are research only and are never
published.

## Site kit

`favicon.svg`, `favicon-16/32/192/512.png`, `apple-touch-icon.png`, `favicon.ico`,
`og-card.png` and `og-kit.png` are drawn by `tools/make-kit.py` (Pillow, Barlow Condensed Bold
when installed, Georgia for the kit card's sentence). Re-run it when the status line or the
kit changes so the share cards match.
`manifest.webmanifest` makes the page installable. `privacy.html` and `llms.txt` sit beside
the page. Analytics: GA4 `G-DYME377V2S` with Consent Mode v2; `?ga=off` turns analytics off
on one device, `?ga=on` turns it back on.

## Design decisions (design C, "Civil defense")

- Colour: paper and ink for credibility; one alert red only on DEBUNKED and the "Not true"
  line, because the site's job is to say what is not confirmed; amber for RUMOR and SPECULATION.
- Layout: a ranked list, not cards, because the content is a list of claims; the theories
  rail is the one card section and its widths follow how much of the board links to each theory.
- Type: Barlow Condensed for headlines and stamps (stamp energy, fits long headlines on a
  phone), Source Serif 4 for reading summaries, system sans for controls and dates.
- Motif: the rubber stamp, rotated 1 to 2 degrees with an inset ink edge, on every claim, the
  share card and the favicon. The hazard stripe appears once, under the status line.
- Spacing: tight rows on the board, generous space around the status line so it is the focal point.
- Motion: none beyond hover and focus states. No illustrations: the sources are the evidence.
- Light by default with a dark toggle, remembered on the device. Both themes pass WCAG AA
  (checked with the antislop `contrast-check.py`).

## Changelog

### v0.3.0 (2026-10-30)

- The kit is the part people screenshot and share, so it got a poster treatment and its
  own page. It now opens with a full-width band: the headline, an OFFICIAL LISTS ONLY stamp,
  the item count and eight pictograms laid out like a packed kit.
- Every kit item has its own pictogram, drawn for this site, so an item is recognizable in a
  screenshot of the checklist.
- Core items sit in two columns; the five optional extras fold into chips you open when
  you want them.
- New page `kit.html` with the same kit, its own share card and a link from the board, the
  map and every footer.

### v0.2.0 (2026-10-30)

- Readers kept asking two things the board did not answer: what should I actually buy,
  and where are these claims coming from.
- Blackout starter kit: a tick-off list built only from the official checklists
  (Ready.gov and UK Be Ready), with their quantities, a "Find on Amazon" search per item,
  and a "Copy my list" button. It is the governments' advice, not ours, and the page says so.
- Map page: every located claim as a pin in its label colour, newest biggest, with filters
  by date and label and a plain list underneath. Linked from the header, the status line
  and the footer.

### v0.1.0 (2026-10-29)

- First release. People are sharing "the UK said stock 30 days" and "bases must go 90 days
  off-grid" without knowing which parts are real, so the page leads with one plain status
  line and puts a label on every claim.
- The board: filters by label, region, theory, Simpsons links, last 48 hours and minimum
  outlet trust; sort by newest, oldest or trust; sources, quote, outlet reasons and label
  history on each claim; share any claim as a link with its label in the text.
- Theories rail, the signed analysis of what would have to be true for each theory, the
  official guidance table, real search questions answered from the board, and the
  automatic wire so the page stays current between hand reviews.
- Methodology and a corrections log, so downgrades are visible instead of silent.
