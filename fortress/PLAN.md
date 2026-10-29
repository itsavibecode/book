# FORTRESS tracker (working title: Fortress Watch) - PLAN v0.1

Planned by Fable 5.1 on 2026-10-29. Opus builds from this plan after sign-off.
Folder: `T:\ClaudeCodeRepo\book\fortress\` -> live at `https://bookhockeys.com/fortress/`.
Your drop folder: `T:\ClaudeCodeRepo\book\fortress\inbox\` (git-ignored, nothing in it ever ships).

antislop active: after (session override). Read from "with the plugin anti-slop to
refine it": the core rules are applied while designing, and the full audit runs on
Opus's build before release.

## 1. What the site is

One page that answers, at a glance, "what is actually confirmed about FORTRESS and
the 90-day / 30-day warnings, and what is just going around". Every claim carries a
status label. Every outlet carries a trust rating with a written reason. The page
refreshes itself from news feeds and from items we add by hand.

It is a claim tracker, not a prepper site and not a news blog. The visitor's one
decision is: "do I believe this, and do I need to do anything". The layout serves
that decision.

### What is true vs not (research completed 2026-10-29, see section 12)

- FACT: Hegseth signed the FORTRESS America memo on 2026-09-30 (hosted on
  media.defense.gov) and announced it at Quantico. Five pillars, a program office
  within 30 days. The public memo contains no 90-day figure.
- REPORTED, not confirmed: the 90-day off-grid standard. Fox News Digital reported it
  from internal documents on 2026-10-25; Snopes rates the story Mostly True but calls
  the 90 days unconfirmed. About 500 bases under review (official, 2026-10-20).
- FACT: UK Defence Secretary Wes Streeting (moved from Health in 2026-07) launched
  "Be Ready" on 2026-10-22: THREE days of water and food, a radio, cash.
- DEBUNKED: "the UK told people to prepare for 30 days". The 30-day line comes from
  Dan Bongino, former FBI deputy director, on his podcast (2026-10-26/27), then spread
  as "the UK said 30 days". No government anywhere has issued a 30-day figure.
- FACT: the FEMA / FCC nationwide Emergency Alert System test on 2026-11-17 is real
  (FEMA release HQ-26-137, FCC DA 26-989), 2:20 to 2:50 pm ET, radio / TV / cable
  only, no phone alerts, backup date 2026-12-03, routine under a law requiring a test
  at least every three years (prior: 2011, 2017, 2018, 2023). No official links it to
  FORTRESS.
- RUMOR: "The Simpsons predicted a November 17 blackout". The cited episode is
  "It's a Blunderful Life" (S35E07, aired 2023-11-19); Mr. Burns overloads an outlet,
  no date is shown. The same claim circulated in November 2025.
- CONFIRMED context: AI tools (not Anthropic) helped find two critical PHP flaws
  (PHP2Shell, disclosed 2026-10-21); CISA confirmed active exploitation 2026-10-27.
  No official connects this to the preparedness warnings; it stays SPECULATION.
- SPECULATION: Iran war after the midterms, China / Taiwan, Russia, false flag on the
  grid, "something revealed after November 3". Solar storm: nobody notable is pushing
  it, so it appears only in the analysis section as a reference scenario.

Seed data: `data/sources.json` (39 outlets rated) and `data/items.json` (40 items:
7 fact, 14 confirmed, 6 reported, 6 speculation, 5 rumor, 2 debunked).

## 2. Naming (D1)

Folder stays `fortress`. Candidate site names:

1. **Fortress Watch** (working title; plain, searchable, matches the program name)
2. **Ninety** (the number everyone is quoting; short, brandable, weaker for search)
3. **Rumor Board: FORTRESS** (says what it does; long)

Recommendation: Fortress Watch. "FORTRESS" is the term people search.

## 3. Status labels (the core feature)

| Label | Rule for assigning it | Visual |
| --- | --- | --- |
| FACT | A primary source exists: official release, transcript, government page, court or budget document | Solid ink stamp |
| CONFIRMED | Two or more independent outlets rated 4+ report it, consistent details | Solid ink stamp, lighter |
| REPORTED | One outlet rated 3+ reports it; no second source yet | Outlined stamp |
| RUMOR | Only social posts, forums, or blogs rated 1-2 | Amber stamp |
| SPECULATION | A theory about WHY, not a claim of what happened. Always tagged with its theory | Amber outlined stamp |
| DEBUNKED | An official denial or a fact-checker contradicts it | Red stamp with strike |

Extra flags: `DEVELOPING` (changed in last 48 h), `UPDATED <date>` with a one-line
change note, and `CORRECTION` when we downgrade something we got wrong (shown, never
silently removed). Each item keeps a status history so downgrades are visible.

Theories vocabulary: nuclear, iran, midterms, false-flag, cyberattack, ai-cyber (AI
finding web and PHP vulnerabilities at scale), grid, solar (Carrington-class storm),
russia, china, other. Each theory section lists: who is pushing it, what points toward
it, what points against it, and the best-rated source on each side.

Cross-tag `SIMPSONS`: any item that people are linking to a Simpsons episode gets a
small yellow tag next to its stamp, with the episode name and air date in the tooltip
and what the episode actually shows in the expanded row. It is a tag, not a status:
a SIMPSONS-tagged item is still RUMOR or SPECULATION on its own merits. A filter chip
"Simpsons links" shows them together, because that is a question people are asking.

Dated events get a `DATE` tag (for example the FEMA / FCC nationwide Emergency Alert
System test on 2026-11-17, if the research confirms it) and a countdown in the status
line when the date is within 30 days. The row explains whether the event is routine
(prior national tests and their dates) so the date itself is not read as a signal.

## 4. Source trust rating 1-5

Shown as five filled blocks plus text "Trust 4 of 5" (screen readers get the text).
Hovering or tapping shows the one-sentence reason. A `#methodology` section
explains the scale:

| Score | Who lands here |
| --- | --- |
| 5 | Primary documents and official statements: DoD, DVIDS, gov.uk, EU Commission, FEMA, Congress.gov; wire services (AP, Reuters, AFP) |
| 4 | Papers of record and major broadcasters with corrections policies: NYT, WaPo, WSJ, BBC, Guardian, Independent, Fox News Digital for its own document reporting, Fortune |
| 3 | Aggregating magazines and local TV: Newsweek, local ABC/CBS/NBC affiliates (WTKR, KATU), Times Now |
| 2 | Tabloids, opinion sites, partisan outlets, Brussels Signal / IBTimes style re-reporters |
| 1 | Anonymous blogs (theeconomiccollapseblog), Facebook/Instagram/X posts, Reddit threads, Telegram |

Rating an outlet is not rating the claim. A 5-rated outlet can carry a REPORTED
item (single source) and a 1-rated post can point at a FACT once we find the primary
source. The two axes are shown separately so readers learn the difference.

## 5. Page structure (content-driven, top to bottom)

1. **Status line** (the focal point): one sentence, bold, in plain words, e.g.
   "Confirmed: the Pentagon wants bases to survive 90 days off-grid. Not confirmed:
   any order for civilians to stock 30 days." Below it: `Last updated <time> UTC`,
   counts by label, and a "What changed today" link.
2. **The board**: the claims list. Default sort newest first. Filter chips by
   status, theory, region (US / UK / EU / Asia / Global), and minimum trust. Each
   row: date, stamp, headline, one-line summary, outlet chips with trust blocks,
   expand for sources, quote, status history, share. Deep link `#c-<id>`.
   Under 640 px rows become card-stack; no horizontal scroll anywhere.
3. **What people think it means**: the theories rail. Six to eight theories, each
   SPECULATION-stamped with for / against bullets and best sources.
4. **What would have to be true** (the analysis section you asked for): Claude's
   written reasoning, signed "Analysis by Claude, <date>, not a prediction". For each
   theory it answers four questions in plain words: what would trigger a warning like
   this, what signs we would expect to see first, which of those signs are visible
   today (linked to board items with their labels), and what is the boring
   explanation. It closes with the most likely reading given the evidence on the
   board, stated with its uncertainty. The section re-renders its "visible today"
   links from the data, so it stays honest as labels change. It is stamped ANALYSIS
   (grey) so it is never confused with FACT. Covers at least: coordinated resilience
   policy (the boring one), cyberattack on utilities including the AI-vulnerability
   angle, geopolitical escalation (Iran, Russia, China), geomagnetic storm (Carrington
   1859 as the reference event, with what it did to telegraph lines), and election
   period disruption. Also explains what the 2026-11-17 alert test is and how often
   such tests have happened before.
5. **What officials actually recommend**: real checklists only, with links: UK Be
   Ready (3 days), ready.gov (72 h kit), EU preparedness strategy (72 h). A table
   comparing what each government says, by country and date. No invented numbers.
6. **Incoming wire**: the automated feed of the last 48 h of headlines matching the
   topic, each with its outlet's trust blocks, labeled "Unreviewed, auto-collected".
   This is how the site stays current between hand reviews.
7. **Methodology and corrections**: label rules, trust scale, corrections log,
   how to send a tip (mailto; we say we read tips, no promises beyond that).
8. **Footer**: BookHockeys, version, privacy page link, GA opt-out note. No repo link.

No testimonials, no stats we did not measure, no "trusted by", no generic FAQ. An
FAQ block exists only as the real questions people are typing (from the SEO list the
research returns), each answered from the board with its label.

## 6. Data model (`data/`)

- `sources.json`: `[{ id, name, domain, type, trust, trustReason, url }]`
- `items.json`: `[{ id, date, headline, summary, status, theory, simpsons?, eventDate?, sourceIds, urls, quote, region, history: [{ date, status, note }], updated }]`
- `analysis.json`: `[{ theory, trigger, earlySigns, visibleToday: [itemIds], boringExplanation, updated }]` plus a `verdict` text, written by Claude in a session, never by the Action
- `feed.json`: auto-collected `[{ fetched, published, title, url, domain, sourceId|null, trust|null }]`, last 48 h, deduped by URL
- `meta.json`: `{ lastUpdated, lastFeedRun, version }`

Hand-curated items live in `items.json` and are edited by a Claude session (or you)
from research, from the wire, and from screenshots in `inbox/`. The page is a
single `index.html` plus `app.js` that fetches the four JSON files. No build step,
same as hantavirus.

## 7. Update mechanism

**v0.1 (ship):** `refresh.py` + GitHub Action `fortress-refresh.yml`, modeled on
`.github/workflows/kickpocketed-refresh.yml`. Every 6 hours it pulls Google News RSS
for a fixed query list ("FORTRESS Pentagon", "90 days bases", "Fortress America",
"Be Ready stockpile", "30 days food water warning", "Hegseth fortress"), maps domains
to `sources.json` for trust, writes `feed.json` and `meta.json`, bumps the sitemap
lastmod, and commits only if changed. The script never changes a label: a script
cannot know if something is true.

**v0.2 (D4, optional):** add a Claude API step in the Action that reads new feed
items, proposes a label and a one-line summary, and writes them into `items.json`
with `status: "pending-review"` and a visible "auto-labeled, pending review" mark
on the page. Needs `ANTHROPIC_API_KEY` as a GitHub secret on itsavibecode/book (you
set it; never pasted in chat).

**Inbox workflow:** you drop screenshots / photos into `inbox/`. Any Claude session
run from `book/` with "triage the fortress inbox" reads each image, extracts the
claim, finds the source, proposes a label, and appends to `items.json`. Processed
files move to `inbox/done/`. Nothing from `inbox/` is ever published as an image
unless you say so (rights and privacy).

## 8. SEO and sharing

- Title: `FORTRESS: what is confirmed about the Pentagon 90-day plan and the 30-day stockpile warnings | Fortress Watch v0.1.0`. Description written from the status line.
- Schema.org `LiveBlogPosting` with `liveBlogUpdate` entries generated from items
  (the schema Google uses for updating event pages), plus `FAQPage` for the
  real questions, plus `Organization` BookHockeys.
- Canonical, OG card 1200x630 (status line + stamp motif), Twitter summary_large_image.
- `sitemap.xml` entry with `changefreq hourly`; IndexNow ping from the Action on each
  commit (reuse the niceshirt IndexNow pattern).
- Per-claim share: copies `https://bookhockeys.com/fortress/#c-<id>` with prefilled
  text "<headline> [<STATUS>] via Fortress Watch" for X, Reddit, copy link. These are
  the units people screenshot and repost, so each row renders well as a crop.
- `llms.txt` with the label rules so AI answer engines cite the board.
- Reddit / X launch posts are yours to post; the share buttons give you ready text per claim.

## 9. Design direction (D2) and antislop dials

Design Read: a public claim-tracker for an anxious general audience arriving from
social links on phones. Visual language: civil-defense pamphlet meets wire desk.
Identity motif: the rubber-stamp status label, used on every claim, on the OG card,
and once as the favicon. Fonts from Google Fonts, chosen per option below.

Three options go into `design-switcher.html` (self-contained local file, A/B/C keys):

**A. Wire desk.** Paper white, ink black, one steel-blue accent on links and the
active filter. Headlines in a readable serif (Source Serif 4), body in system sans,
tabular figures for dates. Dense rows, hairline dividers. Dial ENERGY 2 / RHYTHM 2 /
MOTION 1. Reason: reads like a newsroom tool, which is the trust signal.

**B. Situation board.** Deep slate (not black), bone text, one amber accent reserved
for RUMOR/SPECULATION and the live timestamp. Headlines in a geometric sans (Archivo),
monospace only on timestamps. Dial ENERGY 2 / RHYTHM 2 / MOTION 1. Reason: the
monitoring genre the hantavirus page already uses on this domain; dark is justified by
genre, not by default. Risk: looks like hantavirus and like every ops dashboard.

**C. Civil defense (recommended).** Off-white paper, near-black ink, one alert red
used only on DEBUNKED and the "Not confirmed" half of the status line, amber for
RUMOR. Headlines in a condensed grotesque (Barlow Condensed, heavy), body in Source
Serif 4, dates in tabular figures. Stamps are rotated 1 to 2 degrees with a slight
ink texture, the one decorative gesture, written reason: it is the identity motif and
it makes screenshots recognizable. Hazard stripe appears exactly once, under the
status line. Dial ENERGY 3 / RHYTHM 3 / MOTION 1. Reason: distinctive enough to be
recognized in a repost, sober enough to be believed.

All three: light default with a working dark toggle (R-21), contrast checked per
theme with `contrast-check.py`, 44 px tap targets, visible focus rings, empty /
loading / error states that say what happened and what to do ("Feed is 9 hours old,
the last refresh failed; the board below is unaffected").

Decision reasons (R-31): color = paper/ink for credibility, one red because the
site's job is to say "not confirmed"; layout = list not cards because the content is
a ranked list of claims; typography = condensed headline for stamp energy, serif body
for reading long summaries on a phone; spacing = tight rows on the board, generous
around the status line so it is the one focal point; no illustrations because real
sources are the evidence.

## 10. Version, analytics, site kit

- v0.1.0 at launch; semver in `<meta name="version">`, visible in footer, in the
  title suffix, and in README changelog.
- GA4 `G-DYME377V2S` with the `?ga=off` / `?ga=on` localStorage opt-out.
- favicon set, apple-touch-icon, `manifest.webmanifest` (A2HS), `og-card.png`,
  `privacy.html`, `llms.txt`. No repo link in the UI.
- README entry in `book/README.md` table and `fortress/README.md` with the label and
  trust rules (same text as the methodology section, kept in sync).

## 11. Build brief for Opus (after sign-off)

1. Load antislop core + antislop-ui + antislop-copywriting + antislop-human +
   antislop-layoutmobile. Mode: after (audit at the end, fix, then report the gate).
2. Build `index.html`, `app.js`, `styles.css` for the chosen design; fetch
   `data/*.json`; implement filters, sort, deep links, share, dark toggle, states.
3. Build `refresh.py` and `.github/workflows/fortress-refresh.yml` (6-hourly) with
   the same commit guard as kickpocketed. Test locally with `python -I refresh.py`.
4. Site kit files, sitemap entry, README rows, llms.txt.
5. Run `contrast-check.py` on both themes; click-through list in the gate report;
   check at 375, 768, 1280 px; no horizontal scroll.
6. Commit in small steps: data seed, page, refresh script + workflow, site kit.
   Do not push; Fable reviews, then you push.

## 12. Research summary (Opus research agent, 2026-10-29)

Timeline: EU 72-hour preparedness goal (2025-03-26); US-Iran war begins (2026-02-28);
FEMA/FCC schedule the Nov 17 test (09-16); Hegseth signs FORTRESS memo (09-30); Trump
says no Iran strikes before the Nov 3 midterms (10-08); Streeting "alert not alarmed"
stock-up remark (10-14); official: ~500 bases under review, energy first, no cost
estimate (10-20); PHP2Shell AI-assisted discovery disclosed (10-21); UK Be Ready
launches, 3 days (10-22); Fox reports 90-day standard; Streeting "1,000 days" Telegraph
piece (10-25); Snopes: Mostly True, 90 days unconfirmed; Bongino urges 30 days; Japan
previews a 3-day request (10-26); CISA: PHP flaws exploited (10-26/27); "UK 30 days"
and Simpsons Nov 17 posts surge (10-27 to 10-29).

Primary sources found: war.gov memo PDF, beready.campaign.gov.uk, EU Commission
preparedness page, fema.gov release + test page + FAQ, FCC DA-26-989 PDF, FEMA and
Parnell posts on X. Not found: any DVIDS or Naval Station Norfolk release.

Could not fetch (blocked or paywalled): the Independent, Times Now, both Reddit
threads, the X trend and the MikeyStoxx post (its ID decodes to 2025-11-17), Snopes
direct (read via Yahoo copy), the memo PDF itself (403; confirmed via outlets quoting
it). otakuandoddballs.com has expired. YouTube returned titles only.

Date caveats in the seed: WTKR item date inferred from an image filename (10-28);
Newsweek shows no date (10-26 used); the chain post has no source URL (placeholder
source entry). Fix these during the build review.

Search keywords people are using (for title, headings, FAQ): Pentagon 90 days without
power; FORTRESS America Pentagon; Hegseth FORTRESS memo; military bases off grid 90
days; UK Be Ready campaign 3 days; stockpile food water warning 2026; Bongino 30 days
food water; FEMA emergency alert test November 17 2026; Simpsons blackout November 17;
why are governments telling people to stock up.

## 13. Decisions (D1-D10)

Decided 2026-10-29: D2 = C (user: "design c looks good"). The rest proceed on the
recommended defaults until the user says otherwise: D1 Fortress Watch, D3 every 6 hours,
D4 hand-curated labels (no API step yet), D5 theories rail in place, D6 inbox images are
research only, D7 no gear links, D8 Fable reviews then the user pushes, D9 analysis right
after the theories rail, D10 tag plus filter chip.

- D1 Site name: Fortress Watch / Ninety / Rumor Board (section 2).
- D2 Design: A / B / C after you click through the switcher (section 9).
- D3 Refresh cadence: every 6 hours (recommended) or daily.
- D4 Claude auto-labeling in the Action (v0.2): yes with a GitHub secret, or hand-curated only.
- D5 Theories rail prominence: section 3 of the page (recommended) or folded under the board.
- D6 Inbox photos: research only (recommended) or some may be published with credit.
- D7 Preparedness gear links: none (recommended for credibility) or link to your Picks site.
- D8 Launch: push live at v0.1.0 as soon as the gate passes, or stage on dev.rizzo.cc first.
- D9 Analysis section placement: right after the theories rail (recommended, it answers them) or at the bottom before methodology.
- D10 Simpsons tag: tag plus filter chip (recommended) or its own small section listing the episodes people cite.

## 14. Additional sources you sent (2026-10-29, second batch)

Carrington Event (Wikipedia), otakuandoddballs.com Simpsons / November 17 post,
r/conspiracy predictive-programming thread, two YouTube videos, one X post by
MikeyStoxx, and a pasted viral text tying the stock-up warnings to a coming national
blackout, Simpsons predictive programming, and the 2026-11-17 FEMA alert test. Also
the context that AI recently found large numbers of PHP and web-interface
vulnerabilities. All passed to research; the viral text itself becomes a RUMOR item.
