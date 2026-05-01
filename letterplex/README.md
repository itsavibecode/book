# Letterplex

Build a Plex playlist from your Letterboxd watchlist — entirely in your browser.

**Live:** https://bookhockeys.com/letterplex/

No server, no proxy, no third party. The page authenticates directly with Plex (PIN flow), reads your Letterboxd export CSV locally, and creates the playlist on your own Plex server.

## How it works

1. **Sign in to Plex.** Standard PIN flow — you get a 4-character code to enter at [plex.tv/link](https://plex.tv/link). Your Plex token is stored in your browser's `localStorage` only.
2. **Pick a server and movie libraries.** Letterplex lists every Plex server on your account, prefers your local connection, and lets you choose which movie libraries to search.
3. **Drop your Letterboxd export.** Letterboxd has no public watchlist API, so the cleanest source is the official export at [Letterboxd Settings → Data](https://letterboxd.com/settings/data/). Drop the resulting `letterboxd-…export.zip` (or just the `watchlist.csv` from inside it) onto the page.
4. **Match.** Each watchlist title is searched against your selected libraries and bucketed into Matched / Ambiguous / Missing. Ambiguous matches let you pick the right one from a dropdown.
5. **Create.** Letterplex creates a single playlist on the server with everything you ticked, batching adds in chunks of 100 to stay within Plex URI limits.

## Why a Letterboxd CSV instead of scraping a public profile?

- Works for **private** watchlists.
- No CORS proxy required — keeps Letterplex fully static.
- The export's `watchlist.csv` includes **release year**, which dramatically improves match accuracy (no more "Lion King 1994 vs 2019" ambiguity).

If you'd like a username-based mode added later, open an issue.

## Privacy

- Your Plex auth token is held in `localStorage` and sent only to `plex.tv` and your selected Plex server. It is never sent anywhere else.
- Letterboxd CSV data is parsed in your browser and never uploaded.
- Letterplex stores no analytics and has no backend.

Sign Out clears the stored token and user info.

## Run locally

It's a single static HTML file. Any static host works:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

The Plex PIN flow needs a public-ish origin only because Plex's auth popup writes back to `plex.tv` — `localhost` works fine for testing.

## Changelog

### v0.1.0 — 2026-05-01

- Initial release.
- Plex PIN sign-in, server + library selection, watchlist CSV/ZIP ingest, title+year matching with article-stripping fallback, ambiguous-match disambiguation, missing-list with Letterboxd deep links, batched playlist creation.

## License

MIT.
