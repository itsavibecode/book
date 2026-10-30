"""Feed refresh for Fortress Watch. Python 3.12, standard library only.

Run from this folder:  python -I refresh.py
GitHub Actions runs it every 6 hours (.github/workflows/fortress-refresh.yml).

What it does, each step on its own so one failure never aborts the run:
  1. Pulls Google News RSS for each query in QUERIES (last 2 days).
  2. Keeps headlines published in the last 48 hours that mention the topic,
     (see TOPIC_WORDS), dedupes them by link and by title, merges them with the headlines already
     in data/feed.json, and maps each outlet's domain to data/sources.json for
     its trust rating. A query that fails is skipped; if every query fails,
     feed.json is left exactly as it was.
  3. Writes data/meta.json: lastFeedRun, lastFeedAttempt, feedStatus, and
     lastUpdated when items.json or analysis.json changed since the last run.
     statusConfirmed, statusNotTrue and version are never touched.
  4. Bumps the fortress lastmod in ../sitemap.xml when the feed or the board changed.
  5. Runs tools/build-seo.py so the JSON-LD follows the data.

It never changes a label. A script cannot know if something is true.
Exit code is 0 when a feed fails (the notice says which); 1 only on a bug.
"""
import datetime
import email.utils
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / 'data'
FEED = DATA / 'feed.json'
META = DATA / 'meta.json'
SOURCES = DATA / 'sources.json'
SITEMAP = HERE.parent / 'sitemap.xml'
PAGE_URL = 'https://bookhockeys.com/fortress/'

QUERIES = [
    'FORTRESS Pentagon',
    '90 days bases',
    'Fortress America',
    'Be Ready stockpile',
    '30 days food water warning',
    'Hegseth fortress',
]
RSS = 'https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en'
KEEP_HOURS = 48
MAX_ENTRIES = 150
# The wire keeps only headlines whose title contains at least one of these
# (case-insensitive), so off-topic Pentagon or base stories stay out.
# This is the one place the list lives.
TOPIC_WORDS = ['fortress', '90 day', '90-day', 'off-grid', 'stockpile', 'stock up',
               'be ready', '30 days', 'emergency alert', 'blackout', 'prepared']
# Second-level suffixes where the registrable domain has three labels (bbc.co.uk).
SECOND_LEVEL = {'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'gov.au',
                'co.nz', 'govt.nz', 'co.in', 'co.jp', 'or.jp', 'go.jp', 'com.br', 'co.za', 'go.kr', 'co.kr'}
UA = 'FortressWatch/0.2 (+https://bookhockeys.com/fortress/)'

DEFAULT_META = {
    'version': '0.2.0',
    'statusConfirmed': 'the Pentagon has ordered its bases to stop depending on the civilian grid.',
    'statusNotTrue': 'the UK told people to stock 30 days. The official figure is 3 days.',
}

NOW = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
NOW_ISO = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')
IN_ACTIONS = os.environ.get('GITHUB_ACTIONS') == 'true'


def notice(msg, level='notice'):
    print(('::%s::%s' % (level, msg)) if IN_ACTIONS else '%s: %s' % (level.upper(), msg), flush=True)


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return fallback
    except ValueError as e:
        notice('%s is not valid JSON (%s); treating it as empty' % (path.name, e), 'warning')
        return fallback


def write_json(path, obj):
    """Write only when the content changed. Returns True if the file was written."""
    text = json.dumps(obj, indent=1, ensure_ascii=False) + '\n'
    try:
        if path.read_text(encoding='utf-8') == text:
            return False
    except FileNotFoundError:
        pass
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)
    return True


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml;q=0.9'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def host_of(url):
    try:
        return (urllib.parse.urlsplit(url).hostname or '').lower().removeprefix('www.')
    except ValueError:
        return ''


def on_topic(title):
    t = (title or '').lower()
    return any(w in t for w in TOPIC_WORDS)


def registrable(host):
    """news.sky.com -> sky.com, www.bbc.co.uk -> bbc.co.uk."""
    parts = host.split('.')
    if len(parts) >= 3 and '.'.join(parts[-2:]) in SECOND_LEVEL:
        return '.'.join(parts[-3:])
    return '.'.join(parts[-2:])


def source_domains(s):
    doms = [s.get('domain') or ''] + list(s.get('altDomains') or [])
    return [d.lower().removeprefix('www.') for d in doms if isinstance(d, str) and '.' in d]


def source_for(host, sources):
    """Match a hostname to a source by domain or altDomains: exact or subdomain
    first, then same registrable domain when one side is the bare registrable name."""
    host = (host or '').lower().removeprefix('www.')
    if not host:
        return None
    for s in sources:
        for d in source_domains(s):
            if host == d or host.endswith('.' + d):
                return s
    reg = registrable(host)
    for s in sources:
        for d in source_domains(s):
            if registrable(d) == reg and (d == reg or host == reg):
                return s
    return None


def norm_title(t):
    return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()


def link_key(url):
    p = urllib.parse.urlsplit(url)
    return (p.netloc + p.path).lower()


def parse_rss(raw, sources):
    """Yield feed entries from one Google News RSS document."""
    root = ET.fromstring(raw)
    for item in root.iter('item'):
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        pub = item.findtext('pubDate') or ''
        src_el = item.find('source')
        outlet = (src_el.text or '').strip() if src_el is not None and src_el.text else ''
        outlet_url = src_el.get('url', '') if src_el is not None else ''
        if not title or not link:
            continue
        # Google News appends " - Outlet" to every title.
        if outlet and title.endswith(' - ' + outlet):
            title = title[: -len(' - ' + outlet)].strip()
        try:
            published = email.utils.parsedate_to_datetime(pub)
            if published.tzinfo is None:
                published = published.replace(tzinfo=datetime.timezone.utc)
        except (TypeError, ValueError):
            continue
        host = host_of(outlet_url)
        src = source_for(host, sources)
        yield {
            'fetched': NOW_ISO,
            'published': published.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'title': title,
            'url': link,
            'domain': host,
            'outlet': outlet,
            'sourceId': src['id'] if src else None,
            'trust': src['trust'] if src else None,
        }


def within_window(entry):
    try:
        t = datetime.datetime.strptime(entry['published'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    except (KeyError, ValueError):
        return False
    return NOW - datetime.timedelta(hours=KEEP_HOURS) <= t <= NOW + datetime.timedelta(hours=1)


def step_feed(sources):
    """Returns (status, changed, count). status is ok / partial / failed."""
    old = read_json(FEED, [])
    if not isinstance(old, list):
        old = []
    fresh, failed = [], []
    for q in QUERIES:
        url = RSS.format(q=urllib.parse.quote(q + ' when:2d'))
        try:
            got = list(parse_rss(fetch(url), sources))
            fresh.extend(got)
            print('query %-28s %3d headlines' % (repr(q), len(got)), flush=True)
        except (urllib.error.URLError, TimeoutError, ET.ParseError, OSError, ValueError) as e:
            failed.append(q)
            notice('query %r failed: %s' % (q, e), 'warning')
    if len(failed) == len(QUERIES):
        notice('every feed query failed; feed.json kept as it was', 'warning')
        return 'failed', False, len(old)

    merged, seen_links, seen_titles = [], set(), set()
    # Older entries first so a headline keeps its first "fetched" time; trust is
    # re-read from sources.json every run so a re-rating shows up on the wire.
    for e in old + fresh:
        if not isinstance(e, dict) or not e.get('url') or not within_window(e):
            continue
        if not on_topic(e.get('title', '')):
            continue
        lk, tk = link_key(e['url']), norm_title(e.get('title', '')) + '|' + (e.get('domain') or '')
        if lk in seen_links or tk in seen_titles:
            continue
        seen_links.add(lk)
        seen_titles.add(tk)
        src = source_for(e.get('domain') or '', sources)
        e['sourceId'] = src['id'] if src else None
        e['trust'] = src['trust'] if src else None
        merged.append(e)
    merged.sort(key=lambda e: e['published'], reverse=True)
    merged = merged[:MAX_ENTRIES]
    changed = write_json(FEED, merged)
    status = 'partial' if failed else 'ok'
    if failed:
        notice('%d of %d queries failed (%s); kept the rest' % (len(failed), len(QUERIES), ', '.join(failed)))
    return status, changed, len(merged)


def board_hash():
    h = hashlib.sha256()
    for name in ('items.json', 'analysis.json'):
        try:
            h.update(json.dumps(json.loads((DATA / name).read_text(encoding='utf-8')), sort_keys=True).encode('utf-8'))
        except (OSError, ValueError):
            h.update(b'missing:' + name.encode())
    return h.hexdigest()[:16]


def step_meta(status, count):
    meta = read_json(META, {})
    if not isinstance(meta, dict):
        meta = {}
    out = dict(DEFAULT_META)
    out.update(meta)
    bh = board_hash()
    board_changed = out.get('boardHash') != bh
    if board_changed or not out.get('lastUpdated'):
        out['lastUpdated'] = NOW_ISO
    out['boardHash'] = bh
    out['lastFeedAttempt'] = NOW_ISO
    out['feedStatus'] = status
    if status != 'failed':
        out['lastFeedRun'] = NOW_ISO
    out.setdefault('lastFeedRun', None)
    out['feedCount'] = count
    order = ['version', 'statusConfirmed', 'statusNotTrue', 'lastUpdated', 'lastFeedRun',
             'lastFeedAttempt', 'feedStatus', 'feedCount', 'boardHash']
    final = {k: out[k] for k in order if k in out}
    final.update({k: v for k, v in out.items() if k not in final})
    write_json(META, final)
    return board_changed


def step_sitemap():
    xml = SITEMAP.read_text(encoding='utf-8')
    pat = re.compile(r'(<loc>%s</loc>\s*<lastmod>)[^<]*(</lastmod>)' % re.escape(PAGE_URL))
    if not pat.search(xml):
        notice('sitemap.xml has no entry for %s; add one by hand' % PAGE_URL, 'warning')
        return
    new = pat.sub(r'\g<1>%s\g<2>' % NOW_ISO, xml, count=1)
    if new != xml:
        with open(SITEMAP, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new)


def step_seo():
    r = subprocess.run([sys.executable, '-I', str(HERE / 'tools' / 'build-seo.py')], cwd=str(HERE),
                       capture_output=True, text=True, encoding='utf-8')
    print((r.stdout or '').strip(), flush=True)
    if r.returncode != 0:
        notice('build-seo failed: %s' % ((r.stderr or '').strip().splitlines() or ['?'])[-1], 'warning')


def main():
    sources = read_json(SOURCES, [])
    if not isinstance(sources, list):
        sources = []
    status, feed_changed, count = step_feed(sources)
    board_changed = step_meta(status, count)
    if feed_changed or board_changed:
        try:
            step_sitemap()
        except OSError as e:
            notice('sitemap: %s' % e, 'warning')
    step_seo()
    print('refresh %s: feed %s, %d headlines%s%s' % (
        NOW_ISO, status, count, ', feed changed' if feed_changed else '', ', board changed' if board_changed else ''), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
