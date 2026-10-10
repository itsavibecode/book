# KickPocketed

Public-record page on the MastuhSplinter gifted-sub chargeback on Kick. Live at **[bookhockeys.com/kick/mastuhsplinter/](https://bookhockeys.com/kick/mastuhsplinter/)**. Static, no backend.

It is a copy-and-improve of [mastuhsplinter.nedbot.site](https://mastuhsplinter.nedbot.site/), which first compiled the channel table and the night transcripts. That site is credited on the page and in every night footer. Keep the credit.

## What the page says

In about a month (18 Sept to 7 Oct 2026) one Kick account gifted 2,830 subs and 269,555 KICKs to 39 channels, mostly in single nights of non-stop gifting around Nick Lee's SeeEx event. The payments were then charged back. Streamers posted about it on 9 Oct, moderators banned the account in about 40 channels inside half an hour, and Kick Support confirmed to wvagabond that the deductions were chargebacks it could not reverse.

## Files

| File | Role |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The overview. Everything is rendered from `data.json`. |
| `data.json` | Single source of truth: subject, assumptions, channel rows, ban records, X posts, on-stream quotes, his own channel chat (`hisChat`), evidence captions, nights manifest. |
| `refresh.py` | The daily refresh (see below). Standard-library Python; run `python -I refresh.py` from this folder. |
| `../../.github/workflows/kickpocketed-refresh.yml` | Runs `refresh.py` every day at 11:20 UTC (and on demand from the Actions tab), then commits and pushes if anything changed. |
| `night.css`, `night.js`, `build-nights.py` | Night template and generator. Run `python build-nights.py` from this folder after editing the `nights` list in `data.json`; it rewrites one `<slug>-<date>.html` page per night. `refresh.py` runs it for you. |
| `nights/*.json`, `nights/emotes.json` | Transcript data per night (`speech: [[utc, text]]`, `chat: [[utc, user, text]]`) and the Kick emote map. About 10 MB. |
| `evidence/*.jpg` | Frames from wvagabond's 10 Oct stream: the Kick Support email, the Stripe refund ledger, the gift log. |
| `og-card.png`, favicons, `avatar.webp` | Share card and icons. The avatar is the account's public Kick profile picture. |
| `_source/` | Gitignored. The SingleFile saves and screenshots the page was built from. |

## Daily refresh

`refresh.py` re-reads the public sources once a day so the page keeps up while the story is still moving. Each source is fetched on its own; if one refuses, the run logs it and keeps yesterday's data for that part.

- **The source site** (`mastuhsplinter.nedbot.site/data.json`): which channels are in the table, their message counts and night links. Any night page the source adds is parsed, its transcript saved to `nights/`, its page generated here, and its URL added to the sitemap.
- **kicklogz**: ban records, KICKs per channel, and each channel's top-gifters row for gifted subs and the last gift date. Twigggs, ZuesIRL and nedx keep the source site's leaderboard or own-count figure.
- **Kick**: follower counts, profile pictures and verified marks for every channel; the account's followers and platform-ban flag; and the latest 25 messages in his own channel chat, merged into `hisChat` so the list only grows.

What stays manual: the X posts, the on-stream quotes, the timeline in "What happened", the evidence frames, the assumptions ($4.99, 95%) and the page copy. Edit those in `data.json` or `index.html` by hand.

## Where the numbers come from

- **Gifted subs per channel**: kicklogz `GET /api/streamer/<slug>/subscriptions/top-gifters?page=1&limit=100`, the gifter's row. Twigggs and ZuesIRL come from Kick's all-time gifting leaderboards and nedx from the streamer's own count, as the source site did; those rows carry a small asterisk after the number; hover it to see which source.
- **KICKs per channel**: kicklogz `GET /api/kick-profile/mastuhsplinter/sent-kicks?page=N&limit=100`.
- **Bans**: kicklogz `GET /api/kick-profile/mastuhsplinter/bans?page=N&limit=100`.
- **Profile and follower counts**: `https://kick.com/api/v2/channels/<slug>`, refreshed daily.
- **His own chat**: `https://kick.com/api/v2/channels/20492407/messages`, the latest 25 messages, collected daily from 10 Oct 2026. The praise, chargeback-talk and asks-for-gifts tags are keyword matches.
- **Share at risk**: subs x $4.74. That is $4.99 less Kick's 5%, and it is the exact per-refund amount on wvagabond's Stripe ledger. It is labelled an estimate because only wvagabond has published a first-hand total.
- **X posts**: read directly on X while signed in, 2026-10-10. Each carries a kind tag (first-hand number, names the gifter, claim, allegation, reaction). The stolen-card claim is labelled unverified; the $10,000+ figure is labelled a claim.

## What was improved over the source site

- **One clock, your choice.** The source shows Japan time only. Night pages default to the viewer's local zone with a Local / UTC / JST switch, remembered per device. The overview uses UTC throughout.
- **A real table.** Sortable columns (click, click again to flip, third click resets), a Columns manager with a saved layout, avatars, follower counts, when each channel banned him, and a bar in the subs and KICKs cells. It stacks into cards under 640 px; nothing scrolls sideways.
- **The ban wave, charted.** 51 ban records bucketed by hour with a hover listing the channels and the moderators. The full list sits in a disclosure.
- **Evidence on the page.** The Kick Support email and the Stripe refund rows are the two facts that settle "was it really a chargeback" and "how much per sub". The source site had neither.
- **Night pages.** Added "His messages only", previous/next mention buttons, copy-a-link-to-this-minute on the time column, previous/next night navigation, and a breadcrumb back to the overview. Kept the source's search, mention filter, silent-minute filter, show-every-message toggle, and key moments.
- **Every public post, tagged.** Ten X posts with a kind tag each, plus six on-stream quotes that link to the exact minute in the transcript.
- **Site standards.** Favicon set, Open Graph card, semver in the title and footer, sitemap entries for all 19 pages, GA4 with the site-wide consent key and the `?ga=off` opt-out, tooltips on every non-obvious control.

## Roadmap

- A per-day gifts chart. Needs the per-recipient gift events for each channel (kicklogz `subscriptions/gifted`, paginated), which is a few hundred requests. Worth it once the story settles.
- The six channels that only received KICKs were not scanned for gifted subs on kicklogz. Rerun the top-gifters endpoint for them.
- A corrections log section if streamers send first-hand numbers.
- A link from the home links row, if the page is meant to be found from the home page.

## Changelog

### v0.2.0 - 2026-10-10
The story is still moving: new bans are still being logged and the source site may add more nights. Rather than rebuild the page by hand each time, a small script now re-reads kicklogz, Kick and the source site every morning and updates the numbers, the ban chart, the follower counts and any new night pages on its own. The date it last ran shows under the headline numbers. Also new is "In his own chat": what people have been posting in the account's own Kick channel since the chargebacks came out, which is mostly praise ("you are my hero", "absolute cinema") and requests to gift their friends. Kick only shows the latest 25 messages, so the list grows a little every day. Bans logged after the main wave now show in an "after" column on the chart instead of dropping off it.

### v0.1.1 - 2026-10-10
The channel table felt cramped. Names like IrishMuldogz broke in the middle onto two or three lines, each sub and KICK count was stacked on top of a pill and a bar, and ban times wrapped. The page is now a bit wider and the table uses the room: names stay on one line, each count sits above a thin bar, ban times read like "Oct 9, 16:12", night transcripts show as small chips, and the column headings stay in view while you scroll. The "board" and "own" pills became a small asterisk you can hover.

### v0.1.0 - 2026-10-10
First build. Copied the structure and transcripts of mastuhsplinter.nedbot.site, then redesigned it as KickPocketed: an overview driven by one data file, a sortable and customizable channel table with avatars and ban times, the hourly ban-wave chart, the on-stream evidence from wvagabond's 10 Oct stream, tagged X posts, on-stream quotes linked to their minute, a lookup-tools section, and a method section that says what is confirmed and what is not. The 18 night pages are generated from a template and gained a local/UTC/JST clock, mention jumping, his-messages-only, minute permalinks, and night-to-night navigation.
