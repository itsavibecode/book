"""Regenerate the search-engine blocks in fortress/index.html from the data files.
Standard library only.

Run from anywhere:  python -I tools/build-seo.py
refresh.py runs it after every feed refresh, so a session that edits
items.json, faq.json or meta.json only has to wait for the next refresh
(or run this by hand) for the structured data to follow.

It owns two marked blocks in index.html and nothing else:
  <!-- seo:jsonld:start ... -->  ... <!-- seo:jsonld:end -->
      JSON-LD: LiveBlogPosting (one liveBlogUpdate per claim), FAQPage, Organization
  <!-- seo:status:start ... -->  ... <!-- seo:status:end -->
      the two status sentences from meta.json, so crawlers and no-JS readers see them
The file is written only when one of the blocks changed.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
INDEX = ROOT / 'index.html'
SITE = 'https://bookhockeys.com/fortress/'
TITLE = 'FORTRESS: what is confirmed about the Pentagon 90-day plan and the 30-day stockpile warnings'
LAUNCH = '2026-10-29T00:00:00Z'
COVERAGE_START = '2026-09-16'   # FEMA and the FCC schedule the Nov 17 alert test
STATUS_WORD = {'fact': 'FACT', 'confirmed': 'CONFIRMED', 'reported': 'REPORTED', 'rumor': 'RUMOR',
               'speculation': 'SPECULATION', 'debunked': 'DEBUNKED'}
DEFAULT_CONFIRMED = 'the Pentagon has ordered its bases to stop depending on the civilian grid.'
DEFAULT_NOT_TRUE = 'the UK told people to stock 30 days. The official figure is 3 days.'


def load(name, fallback):
    try:
        return json.loads((DATA / name).read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        print('build-seo: %s unreadable (%s), using fallback' % (name, e))
        return fallback


def iso_day(d):
    return d + 'T00:00:00Z' if re.fullmatch(r'\d{4}-\d{2}-\d{2}', d or '') else d


def clip(text, n):
    text = ' '.join((text or '').split())
    return text if len(text) <= n else text[:n - 1].rsplit(' ', 1)[0] + '...'


def build_jsonld(items, faq, meta):
    org = {
        '@type': 'Organization',
        '@id': 'https://bookhockeys.com/#org',
        'name': 'BookHockeys',
        'url': 'https://bookhockeys.com/',
        'logo': SITE + 'favicon-512.png',
    }
    updates = []
    for it in sorted(items, key=lambda x: (x.get('date') or '', x.get('id') or ''), reverse=True):
        if (it.get('date') or '') < COVERAGE_START:
            continue
        word = STATUS_WORD.get(it.get('status'), str(it.get('status', '')).upper())
        u = {
            '@type': 'BlogPosting',
            'headline': clip('[%s] %s' % (word, it.get('headline', '')), 110),
            'datePublished': iso_day(it.get('date')),
            'articleBody': it.get('summary', ''),
            'url': SITE + '#c-' + it['id'],
        }
        hist = [h for h in (it.get('history') or []) if h.get('date')]
        if hist:
            u['dateModified'] = iso_day(max(h['date'] for h in hist))
        updates.append(u)
    confirmed = meta.get('statusConfirmed') or DEFAULT_CONFIRMED
    not_true = meta.get('statusNotTrue') or DEFAULT_NOT_TRUE
    live = {
        '@type': 'LiveBlogPosting',
        '@id': SITE + '#live',
        'headline': TITLE,
        'description': 'Confirmed: %s Not true: %s' % (confirmed, not_true),
        'url': SITE,
        'image': SITE + 'og-card.png',
        'inLanguage': 'en',
        'datePublished': LAUNCH,
        'dateModified': meta.get('lastUpdated') or LAUNCH,
        'coverageStartTime': iso_day(COVERAGE_START),
        'author': {'@id': 'https://bookhockeys.com/#org'},
        'publisher': {'@id': 'https://bookhockeys.com/#org'},
        'about': [
            {'@type': 'Thing', 'name': 'FORTRESS America'},
            {'@type': 'Thing', 'name': 'Emergency preparedness'},
        ],
        'liveBlogUpdate': updates,
    }
    graph = [live, org]
    if faq:
        graph.append({
            '@type': 'FAQPage',
            '@id': SITE + '#questions',
            'mainEntity': [{
                '@type': 'Question',
                'name': f['q'],
                'acceptedAnswer': {'@type': 'Answer', 'text': f['a']},
            } for f in faq if f.get('q') and f.get('a')],
        })
    body = json.dumps({'@context': 'https://schema.org', '@graph': graph}, indent=1, ensure_ascii=False)
    # Keep "</script>" inside a string from closing the tag early.
    return body.replace('</', '<\\/')


def build_status(meta):
    c = html.escape(meta.get('statusConfirmed') or DEFAULT_CONFIRMED, quote=False)
    n = html.escape(meta.get('statusNotTrue') or DEFAULT_NOT_TRUE, quote=False)
    return ('      <p class="l1"><span class="lead">Confirmed:</span> <span id="statusConfirmed">%s</span></p>\n'
            '      <p class="l2"><span class="lead">Not true:</span> <span id="statusNotTrue">%s</span></p>\n' % (c, n))


def replace_block(src, name, inner):
    pat = re.compile(r'(<!-- seo:%s:start[^>]*-->\n)(.*?)(<!-- seo:%s:end -->)' % (name, name), re.S)
    if not pat.search(src):
        raise ValueError('marker seo:%s not found in index.html' % name)
    return pat.sub(lambda m: m.group(1) + inner + m.group(3), src, count=1)


def main():
    items = load('items.json', [])
    faq = load('faq.json', [])
    meta = load('meta.json', {})
    if not isinstance(items, list) or not items:
        print('build-seo: no items, index.html left alone')
        return 0
    src = INDEX.read_text(encoding='utf-8')
    out = replace_block(src, 'jsonld', '<script type="application/ld+json">\n%s\n</script>\n' % build_jsonld(items, faq, meta))
    out = replace_block(out, 'status', build_status(meta))
    if out != src:
        with open(INDEX, 'w', encoding='utf-8', newline='\n') as f:
            f.write(out)
        print('build-seo: index.html updated (%d claims, %d questions)' % (len(items), len(faq)))
    else:
        print('build-seo: index.html already current')
    return 0


if __name__ == '__main__':
    sys.exit(main())
