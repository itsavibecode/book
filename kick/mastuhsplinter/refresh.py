"""Daily refresh for KickPocketed. Standard library only.

Run from this folder:  python -I refresh.py
GitHub Actions runs it once a day (.github/workflows/kickpocketed-refresh.yml).

Pulls, each step on its own so one failing source never aborts the run:
  a. the source site's channel rows (mastuhsplinter.nedbot.site/data.json)
  b. any night page the source site has that we do not, plus emotes.json
  c. kicklogz: ban records, KICKs sent, and each channel's top-gifters row
  d. Kick's channel API: the subject's followers and ban flag, every channel's profile
  e. the subject's own Kick channel chat (latest 25 messages), merged into hisChat
  f. kicklogz's cross-channel chat search for the username, merged into mentions
     (guests get 25 searches a day and a 6-month window; on any refusal the
     stored mentions are kept)
Everything hand-written (X posts, quotes, timeline, evidence, assumptions) is left alone.
Then rewrites data.json, regenerates the night pages and, when nights were added, the sitemap.
"""
import datetime
import html
import http.cookiejar
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / 'data.json'
NIGHTS_DIR = HERE / 'nights'
SITEMAP = HERE.parent.parent / 'sitemap.xml'
SOURCE = 'https://mastuhsplinter.nedbot.site/'
KICKLOGZ = 'https://kicklogz.com/api/'
KICK = 'https://kick.com/api/v2/channels/'
BASE_URL = 'https://bookhockeys.com/kick/mastuhsplinter/'
SUBJECT_SLUG = 'mastuhsplinter'
GIFTER = 'MASTUHSPLINTER'
# Chat in his own channel is collected from the first public post onwards.
PUBLIC_SINCE = '2026-10-09T17:53:44Z'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
# Channels whose sub count is not a kicklogz record (kept from the source site).
LEADER = {'twigggs': 'leaderboard', 'zuesirl': 'leaderboard', 'nedx': 'count'}

TODAY = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
problems = []   # human-readable notes on sources that refused or failed


def log(msg):
    print(msg, flush=True)


def fetch(url, accept='application/json', pause=0.0):
    """GET a URL with a browser User-Agent; returns bytes. Raises on failure."""
    if pause:
        time.sleep(pause)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.9'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def fetch_json(url, pause=0.0):
    return json.loads(fetch(url, pause=pause).decode('utf-8'))


def as_int(v):
    """Kick sends some counts as strings; store numbers."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def why(e):
    if isinstance(e, urllib.error.HTTPError):
        return 'HTTP %d' % e.code
    return '%s: %s' % (type(e).__name__, e)


def kicklogz(path):
    """kicklogz request with the 0.4 s pause between calls."""
    return fetch_json(KICKLOGZ + path, pause=0.4)


def kicklogz_pages(path):
    rows, page = [], 1
    while True:
        sep = '&' if '?' in path else '?'
        d = kicklogz('%s%spage=%d&limit=100' % (path, sep, page))
        batch = d.get('data') or []
        rows.extend(batch)
        if len(batch) < 100:
            return rows
        page += 1


# ---------------------------------------------------------------- night pages

def _strip(s):
    return re.sub(r'<[^>]+>', '', s)


def parse_keys(s):
    try:
        return json.loads(s)
    except ValueError:
        s2 = re.sub(r'//[^\n]*', '', s)
        s2 = re.sub(r',\s*([\]\}])', r'\1', s2)
        return json.loads(s2)


def parse_night(file, s):
    """Parse one source night page into a manifest entry (without counts)."""
    def one(rx, flags=re.S):
        m = re.search(rx, s, flags)
        if not m:
            raise ValueError('%s: no match for %s' % (file, rx))
        return m.group(1)

    def meta(attr, name):
        return html.unescape(one(r'<meta\s+%s="%s"\s+content="([^"]*)"' % (attr, re.escape(name))))

    base = file[:-5]
    title = html.unescape(_strip(one(r'<title>(.*?)</title>'))).strip()
    h1 = html.unescape(_strip(one(r'<h1[^>]*>(.*?)</h1>'))).strip()
    lede = one(r'<p class="lede">(.*?)</p>').strip()
    facts_html = one(r'<div class="facts">(.*?)</div>\s*</header>')
    facts = [[b.strip(), sp.strip()] for b, sp in
             re.findall(r'<div class="fact"><b>(.*?)</b><span>(.*?)</span></div>', facts_html, re.S)]
    k = s.index('const KEYS=') + len('const KEYS=')
    try:
        keys, _ = json.JSONDecoder().raw_decode(s, k)
    except ValueError:
        keys = parse_keys(one(r'const KEYS=(\[.*?\n\]);'))
    speaker = html.unescape(one(r'<span class="lbl">(.*?)</span>'))
    jsons = [j for j in re.findall(r'fetch\("([^"]+\.json)"\)', s) if j != 'emotes.json']
    if not jsons:
        raise ValueError('%s: no transcript json referenced' % file)
    ft = one(r'<footer>(.*?)</footer>')
    ftt = html.unescape(_strip(ft)).strip()
    win = re.search(r'Window:\s*(.*?)(?:\.|$)', ftt.replace('\n', ' '))
    return {
        'file': file, 'slug': base[:-11], 'date': base[-10:], 'title': title, 'h1': h1,
        'lede': lede, 'facts': facts, 'keys': keys, 'speaker': speaker,
        'window': win.group(1).strip() if win else '',
        'chatSource': 'kicklogz' if "kicklogz.com's archive" in ftt else 'live',
        'desc': meta('name', 'description'), 'ogTitle': meta('property', 'og:title'),
        '_json': jsons[0],
    }


# ---------------------------------------------------------------- steps

def step_source(old):
    """(a) the source site's channel rows; on failure rebuild rows from our own data."""
    try:
        src = fetch_json(SOURCE + 'data.json')
        rows = src['rows']
        if not rows:
            raise ValueError('no rows')
        return rows
    except Exception as e:
        problems.append('source data.json: %s (kept previous channel rows)' % why(e))
        return [{'c': r['slug'], 's': r['subs'], 'k': r['kicks'], 'm': r['msgs'],
                 'p': [[n['label'], n['href']] for n in r['nights']]} for r in old['channels']]


def step_nights(D, rows):
    """(b) new night pages and their transcripts; refetch emotes.json."""
    have = {n['file'] for n in D['nights']}
    hrefs = []
    for r in rows:
        for _, h in (r.get('p') or []):
            if re.fullmatch(r'[a-z0-9_.-]+-\d{4}-\d{2}-\d{2}\.html', h or '') and h not in have and h not in hrefs:
                hrefs.append(h)
    added = []
    for h in hrefs:
        try:
            page = fetch(SOURCE + h, accept='text/html').decode('utf-8')
            n = parse_night(h, page)
            raw = fetch(SOURCE + n.pop('_json'))
            tj = json.loads(raw.decode('utf-8'))
            n['speech'] = len(tj.get('speech') or [])
            n['chat'] = len(tj.get('chat') or [])
            NIGHTS_DIR.mkdir(exist_ok=True)
            (NIGHTS_DIR / (h[:-5] + '.json')).write_bytes(raw)
            D['nights'].append(n)
            added.append(h)
        except Exception as e:
            problems.append('night %s: %s (skipped)' % (h, why(e)))
    D['nights'].sort(key=lambda n: (n['date'], n['slug']))
    try:
        raw = fetch(SOURCE + 'emotes.json')
        json.loads(raw.decode('utf-8'))
        ef = NIGHTS_DIR / 'emotes.json'
        if not ef.exists() or ef.read_bytes() != raw:
            ef.write_bytes(raw)
    except Exception as e:
        problems.append('emotes.json: %s (kept previous)' % why(e))
    return added


def _ts(iso):
    try:
        return datetime.datetime.strptime(iso[:19], '%Y-%m-%dT%H:%M:%S').timestamp()
    except (TypeError, ValueError):
        return None


def merge_bans(stored, recs):
    """Merge kicklogz ban records into the stored list, by kicklogz `id`.

    kicklogz can list one ban twice with timestamps a second apart, so the id is
    the identity. A stored entry keeps its time; permanent/unbanned_at follow the
    live record. Stored entries without an id are matched on channel + moderator
    + time within 5 s and get the id written onto them; leftovers that still
    match an id'd entry that way are duplicates and are dropped. Entries that
    kicklogz stops listing are kept (the record only grows)."""
    def same(a, b):
        ta, tb = _ts(a['at']), _ts(b['at'])
        return a['channel'] == b['channel'] and a['by'] == b['by'] and ta is not None and tb is not None and abs(ta - tb) <= 5

    by_id, legacy = {}, []
    for b in stored:
        if b.get('id'):
            by_id.setdefault(b['id'], dict(b))
        else:
            legacy.append(dict(b))
    for r in recs:
        rid, at = r.get('id'), r.get('created_at')
        if not rid or not at:
            continue
        live = {'id': rid, 'channel': (r.get('channel_name') or '').lower(), 'by': r.get('banned_by_username'), 'at': at,
                'permanent': r.get('permanent'), 'unbanned_at': r.get('unbanned_at')}
        if rid not in by_id:
            hit = next((b for b in legacy if same(b, live)), None)
            if hit:
                legacy.remove(hit)
            by_id[rid] = hit or dict(live)
        cur = by_id[rid]
        cur['permanent'], cur['unbanned_at'] = live['permanent'], live['unbanned_at']
    legacy = [b for b in legacy if not any(same(b, x) for x in by_id.values())]
    keys = ('id', 'channel', 'by', 'at', 'permanent', 'unbanned_at')
    out = [{k: b.get(k) for k in keys} for b in by_id.values()] + [{k: b.get(k) for k in keys[1:]} for b in legacy]
    for i, b in zip(by_id, out):
        b['id'] = i
    out.sort(key=lambda b: (b['at'], b['channel']))
    return out


def step_bans(D):
    """(c1) kicklogz ban records, merged by id."""
    try:
        recs = kicklogz_pages('kick-profile/%s/bans' % SUBJECT_SLUG)
        if not recs and D['bans']:
            raise ValueError('kicklogz returned no bans, previously %d' % len(D['bans']))
        D['bans'] = merge_bans(D['bans'], recs)
    except Exception as e:
        problems.append('kicklogz bans: %s (kept previous)' % why(e))


def step_kicks():
    """(c2) KICKs sent per channel; None when kicklogz failed."""
    try:
        return {(x.get('channel_name') or '').lower(): x.get('total_amount') or 0
                for x in kicklogz_pages('kick-profile/%s/sent-kicks' % SUBJECT_SLUG)}
    except Exception as e:
        problems.append('kicklogz sent-kicks: %s (kept previous)' % why(e))
        return None


def step_top_gifters(slugs):
    """(c3) the gifter's row in each channel's top-gifters list.
    Returns {slug: row or None (no row)}; slugs whose request failed are absent."""
    out, failed = {}, []
    for s in slugs:
        try:
            d = kicklogz('streamer/%s/subscriptions/top-gifters?page=1&limit=100' % s)
            row = next((x for x in (d.get('data') or []) if (x.get('gifter_username') or '').upper() == GIFTER), None)
            out[s] = row
        except Exception as e:
            failed.append('%s (%s)' % (s, why(e)))
    if failed:
        problems.append('kicklogz top-gifters failed for %d: %s (kept previous)' % (len(failed), ', '.join(failed)))
    return out


def step_kick_channels(slugs):
    """(d) Kick channel API; slugs whose request failed are absent."""
    out, failed = {}, []
    for s in slugs:
        try:
            d = fetch_json(KICK + s, pause=0.25)
            u = d.get('user') or {}
            out[s] = {'name': u.get('username'), 'followers': as_int(d.get('followers_count')),
                      'pic': u.get('profile_pic'), 'verified': bool(d.get('verified')),
                      'is_banned': d.get('is_banned')}
        except Exception as e:
            failed.append('%s (%s)' % (s, why(e)))
    if failed:
        problems.append('Kick channel API failed for %d: %s (kept previous)' % (len(failed), ', '.join(failed)))
    return out


def step_his_chat(D):
    """(e) merge his own channel's latest chat into hisChat, by id, newest first."""
    try:
        d = fetch_json(KICK + '%d/messages' % D['subject']['channelId'])
        msgs = (d.get('data') or {}).get('messages') or []
    except Exception as e:
        problems.append('Kick channel chat: %s (kept previous)' % why(e))
        return 0
    have = {m['id']: m for m in D.get('hisChat') or []}
    new = 0
    for m in msgs:
        at, text = m.get('created_at'), m.get('content')
        if not m.get('id') or not at or text is None or at < PUBLIC_SINCE:
            continue
        sender = m.get('sender') or {}
        if m['id'] not in have:
            new += 1
        have[m['id']] = {'id': m['id'], 'at': at, 'user': sender.get('username') or sender.get('slug') or '',
                         'slug': sender.get('slug') or '', 'text': text}
    D['hisChat'] = sorted(have.values(), key=lambda x: (x['at'], x['id']), reverse=True)
    if not D.get('hisChatSince'):
        D['hisChatSince'] = TODAY
    return new


MENTIONS_FROM = '2026-09-01T00:00:00Z'
MENTION_PAGES = 12          # 50 hits a page; each page may count as one guest search


def _mention_key(m):
    return (m['at'], m['channel'], m['user'], m['text'])


def _first(d, *names):
    for n in names:
        v = d
        for part in n.split('.'):
            v = v.get(part) if isinstance(v, dict) else None
        if v not in (None, ''):
            return v
    return None


def _iso_z(v):
    """kicklogz times ('2026-10-10T19:06:51.000Z' or '2026-10-10 19:06:51') -> '2026-10-10T19:06:51Z'."""
    m = re.match(r'(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)', str(v or ''))
    return '%sT%sZ' % (m.group(1), m.group(2)) if m else None


def step_mentions(D):
    """(f) kicklogz chat search for the username across all channels, merged into mentions.

    GET /search for the _csrf value and cookie, POST /api/search for a jobId, poll
    /api/search/status/<id> until completed, follow data.cursor for more pages.
    Gives up quietly (stored mentions kept) on any non-200, a Turnstile demand,
    or a response shape it does not recognise. Returns the number of new rows."""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def call(url, data=None, headers=None):
        h = {'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'application/json'}
        h.update(headers or {})
        with opener.open(urllib.request.Request(url, data=data, headers=h), timeout=40) as r:
            if r.status != 200:
                raise ValueError('HTTP %d' % r.status)
            return r.read().decode('utf-8', 'replace')

    def refused(e):
        if isinstance(e, urllib.error.HTTPError):
            if e.code == 429:   # kicklogz answers in Turkish: daily search limit reached
                return 'HTTP 429 (daily guest search limit reached)'
            try:
                body = e.read().decode('utf-8', 'replace')[:160]
                body = body.encode('ascii', 'replace').decode('ascii')
            except Exception:
                body = ''
            return 'HTTP %d%s' % (e.code, (' ' + body) if body else '')
        return why(e)

    stored = D.get('mentions') or []
    now = datetime.datetime.now(datetime.timezone.utc)
    floor = (now - datetime.timedelta(days=180)).strftime('%Y-%m-%dT%H:%M:%SZ')
    date_from = max(MENTIONS_FROM, floor)
    # Once the stored list reaches back to the window start, a page with nothing
    # new means the rest is already on file.
    oldest = min((m['at'] for m in stored), default='9999')
    start = datetime.datetime.strptime(date_from[:10], '%Y-%m-%d')
    backfilled = oldest[:10] <= (start + datetime.timedelta(days=3)).strftime('%Y-%m-%d')
    try:
        page = call('https://kicklogz.com/search', headers={'Accept': 'text/html'})
        m = re.search(r'name=["\']?_csrf["\']?[^>]*value=["\']([^"\']+)', page) or \
            re.search(r'value=["\']([^"\']+)["\'][^>]*name=["\']?_csrf', page)
        if not m:
            raise ValueError('no _csrf on the search page')
        token = m.group(1)
    except Exception as e:
        problems.append('kicklogz search page: %s (kept %d stored mentions)' % (refused(e), len(stored)))
        return 0

    found, cursor, pages, note = [], None, 0, ''
    try:
        while pages < MENTION_PAGES:
            body = {'query': GIFTER, 'username': '', 'channelName': '',
                    'dateFrom': date_from.replace('Z', '.000Z'), 'dateTo': now.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
                    'oldUsernames': [], 'excludeEmoteOnly': True, 'cursor': cursor, 'listIds': [], 'turnstileToken': ''}
            time.sleep(0.4)
            txt = call('https://kicklogz.com/api/search', data=json.dumps(body).encode('utf-8'), headers={
                'Content-Type': 'application/json', 'CSRF-Token': token,
                'Origin': 'https://kicklogz.com', 'Referer': 'https://kicklogz.com/search'})
            if 'turnstile' in txt.lower():
                raise ValueError('kicklogz asked for a Turnstile check')
            job = (json.loads(txt) or {}).get('jobId')
            if not job:
                raise ValueError('no jobId in %s' % txt[:120])
            st = {}
            for _ in range(40):
                time.sleep(1.5)
                st = json.loads(call('https://kicklogz.com/api/search/status/%s' % job))
                if st.get('status') in ('completed', 'failed', 'error'):
                    break
            if st.get('status') != 'completed':
                raise ValueError('search job ended as %r' % st.get('status'))
            data = st.get('data') or {}
            hits = data.get('hits')
            if not isinstance(hits, list):
                raise ValueError('no hits list (keys: %s)' % ', '.join(sorted(data)))
            pages += 1
            fresh = 0
            have = {_mention_key(x) for x in stored} | {_mention_key(x) for x in found}
            for h in hits:
                at = _iso_z(_first(h, 'created_at', 'createdAt', 'timestamp'))
                ch = _first(h, 'channel_slug', 'channel_name', 'channelName', 'channel.slug', 'channel')
                user = _first(h, 'sender_username', 'username', 'sender.username', 'user.username', 'sender_slug')
                text = _first(h, 'content', 'message', 'text')
                if not at or not isinstance(ch, str) or not isinstance(user, str) or not isinstance(text, str):
                    raise ValueError('unrecognised hit shape (keys: %s)' % ', '.join(sorted(h)))
                row = {'at': at, 'channel': ch.lower(), 'user': user, 'text': text.strip(),
                       'self': user.lower() == SUBJECT_SLUG}
                if _mention_key(row) not in have:
                    have.add(_mention_key(row))
                    found.append(row)
                    fresh += 1
            cursor = data.get('cursor')
            if not cursor or not hits or (backfilled and not fresh):
                break
    except Exception as e:
        note = refused(e)
    if note and not found:
        problems.append('kicklogz chat search: %s (kept %d stored mentions)' % (note, len(stored)))
        return 0
    if note:
        problems.append('kicklogz chat search stopped after %d page(s): %s (merged what came back)' % (pages, note))
    merged = {_mention_key(x): x for x in stored}
    for r in found:
        merged.setdefault(_mention_key(r), r)
    D['mentions'] = sorted(merged.values(), key=lambda x: (x['at'], x['channel'], x['user']), reverse=True)
    D.setdefault('mentionsSince', date_from[:10])
    D['mentionsSource'] = 'kicklogz chat search'
    log('kicklogz chat search: %d page(s), %d new' % (pages, len(found)))
    return len(found)


def build_channels(prev_channels, bans, rows, kicks, gifters, kick):
    prev = {r['slug']: r for r in prev_channels}
    out = []
    for r in rows:
        s = r['c']
        p = prev.get(s, {})
        info = kick.get(s)
        b = sorted([x for x in bans if x['channel'] == s], key=lambda x: x['at'])
        active = [x for x in b if x['permanent'] == 1 and not x['unbanned_at']]
        src_subs = r.get('s') or 0
        if s in gifters:
            g = gifters[s]
            subs = src_subs if (s in LEADER or not g) else (g.get('total_gifts') or 0)
            source = LEADER.get(s, 'kicklogz' if g else ('leaderboard' if src_subs else None))
            last = g.get('last_gift_date') if g else None
        elif p:
            subs, source, last = p.get('subs', src_subs), p.get('subsSource'), p.get('lastGift')
        else:
            subs, source, last = src_subs, LEADER.get(s, 'leaderboard' if src_subs else None), None
        if kicks is not None and s in kicks:
            k = kicks[s]
        elif kicks is None and p:
            k = p.get('kicks', 0)
        else:
            k = r.get('k') or 0
        out.append({
            'slug': s,
            'name': (info or {}).get('name') or p.get('name') or s,
            'followers': info['followers'] if info and info['followers'] is not None else p.get('followers'),
            'verified': info['verified'] if info else bool(p.get('verified')),
            'pic': (info or {}).get('pic') or p.get('pic'),
            'subs': subs, 'subsSource': source,
            'kicks': k, 'msgs': r.get('m'),
            'lastGift': last,
            'bannedAt': (active[-1]['at'] if active else (b[-1]['at'] if b else None)), 'banActive': bool(active),
            'nights': [{'label': l, 'href': h} for l, h in (r.get('p') or [])],
        })
    out.sort(key=lambda r: (-r['subs'], -r['kicks']))
    return out


def update_sitemap(added):
    xml = SITEMAP.read_text(encoding='utf-8')
    blocks = ''.join(
        '  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n'
        % (BASE_URL, f, TODAY) for f in added if (BASE_URL + f) not in xml)
    xml = xml.replace('</urlset>', blocks + '</urlset>', 1)
    xml = re.sub(r'(<loc>%s</loc>\s*<lastmod>)[^<]*(</lastmod>)' % re.escape(BASE_URL), r'\g<1>%s\g<2>' % TODAY, xml, count=1)
    with open(SITEMAP, 'w', encoding='utf-8', newline='\n') as f:
        f.write(xml)


def main():
    old = json.loads(DATA.read_text(encoding='utf-8'))
    D = json.loads(DATA.read_text(encoding='utf-8'))
    before = {'subs': old['totals']['subs'], 'kicks': old['totals']['kicks'], 'channels': old['totals']['channels'],
              'bans': len(old['bans']), 'nights': len(old['nights']), 'hisChat': len(old.get('hisChat') or []),
              'mentions': len(old.get('mentions') or [])}

    rows = step_source(old)
    try:
        added = step_nights(D, rows)
    except Exception as e:
        problems.append('nights: %s' % why(e))
        added = []
    step_bans(D)
    kicks = step_kicks()
    slugs = [r['c'] for r in rows]
    gifters = step_top_gifters(slugs)
    kick = step_kick_channels([SUBJECT_SLUG] + slugs)
    subj = kick.pop(SUBJECT_SLUG, None)
    if subj:
        if subj['followers'] is not None:
            D['subject']['followers'] = subj['followers']
        D['subject']['platformBanned'] = bool(subj['is_banned'])
    try:
        D['channels'] = build_channels(old['channels'], D['bans'], rows, kicks, gifters, kick)
    except Exception as e:
        problems.append('channels: %s (kept previous)' % why(e))
    new_chat = step_his_chat(D)
    try:
        new_mentions = step_mentions(D)
    except Exception as e:      # belt and braces: this step must never end the run
        problems.append('mentions: %s (kept previous)' % why(e))
        new_mentions = 0

    ch = D['channels']
    D['totals'] = {'subs': sum(r['subs'] for r in ch), 'kicks': sum(r['kicks'] for r in ch), 'channels': len(ch),
                   'subChannels': sum(1 for r in ch if r['subs']), 'kickChannels': sum(1 for r in ch if r['kicks'])}

    # same top-level key order as before; new keys go after "chat"
    order = list(old.keys())
    for k in ('hisChat', 'hisChatSince'):
        if k not in order:
            order.insert(order.index('chat') + 1 if 'chat' in order else len(order), k)
    out = {k: D[k] for k in order if k in D}
    out.update({k: v for k, v in D.items() if k not in out})

    # Write only when something other than the date moved, so the daily job
    # commits only on real changes.
    def body(d):
        return json.dumps({k: v for k, v in d.items() if k != 'generated'}, indent=1, ensure_ascii=False)
    changed = body(out) != body(old)
    if changed:
        out['generated'] = TODAY
        with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(out, indent=1, ensure_ascii=False))

    try:
        r = subprocess.run([sys.executable, '-I', str(HERE / 'build-nights.py')], cwd=str(HERE),
                           capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0:
            problems.append('build-nights failed: %s' % (r.stderr.strip().splitlines() or ['?'])[-1])
    except Exception as e:
        problems.append('build-nights: %s' % why(e))
    if added:
        try:
            update_sitemap(added)
        except Exception as e:
            problems.append('sitemap: %s' % why(e))

    for p in problems:
        log('WARN ' + p)
    if not changed:
        log('no change')
    t = D['totals']
    log('refresh %s: subs %d->%d, kicks %d->%d, channels %d->%d, bans %d->%d, nights %d->%d (+%s), hisChat %d->%d (+%d new), mentions %d->%d (+%d new), followers %s, %d warning(s)' % (
        TODAY, before['subs'], t['subs'], before['kicks'], t['kicks'], before['channels'], t['channels'],
        before['bans'], len(D['bans']), before['nights'], len(D['nights']), ', '.join(added) or '0',
        before['hisChat'], len(D.get('hisChat') or []), new_chat,
        before['mentions'], len(D.get('mentions') or []), new_mentions, D['subject'].get('followers'), len(problems)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
