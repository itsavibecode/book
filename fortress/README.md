# Fortress Watch

Live at https://bookhockeys.com/fortress/ . Version 0.1.0.

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
- `simpsons` can be `true`, or `{ "episode", "aired", "shows" }` to show the episode in the
  tooltip and the expanded row.
- Theories: nuclear, iran, midterms, false-flag, cyberattack, ai-cyber, grid, solar, russia,
  china, other. A SPECULATION item gets a card in the theories rail; its "points against"
  comes from the matching `analysis.json` entry (`ai-cyber` maps to `cyberattack`).
- After editing, run `python -I tools/build-seo.py` so the JSON-LD and the static status
  line follow (the refresh also does this every 6 hours).

## Blackout starter kit

The section after "What officials actually recommend" lists only items that are on the
official checklists in `kit.json` `sources` (Ready.gov and the UK's Be Ready), with the
quantity in their wording. `priority: "core"` items (on both lists) lead as the main list;
`"recommended"` items (on one list) follow in a lighter list. Each row has an
"Add to my list" checkbox (kept on the device under `fortress-kit`), a "Copy my list" button,
and a "Find on Amazon" button that opens `https://www.amazon.com/s?k=<amazonQuery>` in a new
tab with `rel="noopener nofollow sponsored"`. `&tag=<affiliateTag>` is added only when
`affiliateTag` is not empty, and the matching disclosure (`disclosureWithTag` or
`disclosureNoTag`) shows under the list. The methodology section says the kit is the
official lists, not our advice. Never add an item that is not on a linked official list.

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

`favicon.svg`, `favicon-16/32/192/512.png`, `apple-touch-icon.png`, `favicon.ico` and
`og-card.png` are drawn by `tools/make-kit.py` (Pillow, Barlow Condensed Bold when
installed). Re-run it when the status line changes so the share card matches.
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
