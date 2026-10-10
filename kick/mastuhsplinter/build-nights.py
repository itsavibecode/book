"""Generate one static HTML page per captured night from data.json.

Run from this folder:  python build-nights.py
Each page loads nights/<slug>-<date>.json and nights/emotes.json at runtime.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'data.json'), encoding='utf-8'))
VERSION = '0.1.1'
BASE = 'https://bookhockeys.com/kick/mastuhsplinter/'
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="version" content="{version}" />
<title>{title} | KickPocketed</title>
<meta name="description" content="{desc}" />
<meta name="theme-color" content="#0b0e0b" />
<meta name="color-scheme" content="dark" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="{base}{file}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="BookHockeys" />
<meta property="og:title" content="{ogtitle}" />
<meta property="og:description" content="{desc}" />
<meta property="og:url" content="{base}{file}" />
<meta property="og:image" content="{base}og-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{ogtitle}" />
<meta name="twitter:image" content="{base}og-card.png" />
<link rel="icon" href="favicon.ico" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />
<link rel="icon" type="image/png" sizes="192x192" href="favicon-192.png" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
<link rel="preconnect" href="https://files.kick.com" crossorigin />
<script>
(function () {{
  var GA_ID = 'G-DYME377V2S', OPT_KEY = 'bookhockeys_ga_optout';
  try {{ var p = new URLSearchParams(location.search); if (p.get('ga') === 'off') localStorage.setItem(OPT_KEY, '1'); if (p.get('ga') === 'on') localStorage.removeItem(OPT_KEY); }} catch (e) {{}}
  var optedOut = false; try {{ optedOut = localStorage.getItem(OPT_KEY) === '1'; }} catch (e) {{}}
  window['ga-disable-' + GA_ID] = optedOut;
  window.dataLayer = window.dataLayer || []; window.gtag = function () {{ window.dataLayer.push(arguments); }};
  if (optedOut) return;
  gtag('consent', 'default', {{ 'ad_storage': 'denied', 'ad_user_data': 'denied', 'ad_personalization': 'denied', 'analytics_storage': 'denied', 'wait_for_update': 500 }});
  var saved = null; try {{ saved = localStorage.getItem('greenline-consent'); }} catch (e) {{}}
  var tz = ''; try {{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }} catch (e) {{}}
  var likelyEU = tz.indexOf('Europe/') === 0;
  if (saved === 'granted' || (saved !== 'denied' && !likelyEU)) gtag('consent', 'update', {{ 'analytics_storage': 'granted' }});
  var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID; document.head.appendChild(s);
  gtag('js', new Date()); gtag('config', GA_ID);
}})();
</script>
<link rel="stylesheet" href="night.css" />
</head>
<body>
<header class="top">
  <div class="wrap">
    <p class="crumbs"><a class="wm" href="./" title="Back to the overview">Kick<span>Pocketed</span></a> <span>&rsaquo;</span> <a href="./#nights-sec">Every night</a> <span>&rsaquo;</span> <span>{crumb}</span></p>
    <h1>{h1}</h1>
    <p class="lede">{lede}</p>
    <div class="facts">{facts}</div>
  </div>
</header>
<nav class="keys wrap" aria-label="Key moments">
  <h2>Key moments</h2>
  <ol id="keys"></ol>
</nav>
<div class="tools"><div class="in">
  <input type="search" id="q" placeholder="Search speech and chat" aria-label="Search speech and chat" title="Filter to minutes whose speech or chat contains this text" />
  <label title="Keep only minutes where the gifter is mentioned or speaks"><input type="checkbox" id="only" /> Mentions only</label>
  <label title="Keep only minutes where he posted in chat himself"><input type="checkbox" id="him" /> His messages only</label>
  <label title="Hide minutes where the streamer said nothing"><input type="checkbox" id="quiet" /> Hide silent minutes</label>
  <label title="Show every chat message, including the spam and bot lines hidden by default"><input type="checkbox" id="allchat" /> Every message</label>
  <span class="jump"><button type="button" id="prevHit" title="Jump to the previous mention of the gifter">&uarr; mention</button><button type="button" id="nextHit" title="Jump to the next mention of the gifter">&darr; mention</button></span>
  <span class="seg" role="group" aria-label="Clock" title="Show times in your local zone, in UTC, or in Japan time as the source site did"><button type="button" data-tz="local">Local</button><button type="button" data-tz="utc">UTC</button><button type="button" data-tz="jst">JST</button></span>
  <span class="count" id="count">loading&hellip;</span>
</div></div>
<main class="cols">
  <div class="colhead"><span id="colTz">Local</span><span>{speaker} said</span><span>Chat said</span></div>
  <div id="rows"></div>
  <div class="pager">{prev}{next}</div>
</main>
<footer>
  <p>Speech is an automatic transcript of the Kick VOD and will contain mishearings; numbers quoted are what {speaker} said aloud, not Kick's records. Chat comes from {chatsrc}. Green highlight: any mention of the gifter. Purple: messages by MASTUHSPLINTER himself. Emotes show as images where known, otherwise by name. Click a time to copy a link to that minute.</p>
  <p>Window: {window}. Transcript and chat capture adapted from <a href="https://mastuhsplinter.nedbot.site/{file}" rel="noopener" target="_blank">mastuhsplinter.nedbot.site</a>.</p>
  <p><a href="./">KickPocketed</a> &middot; <a href="https://bookhockeys.com/">bookhockeys.com</a> &middot; v{version}</p>
</footer>
<div class="toast" id="toast" hidden></div>
<script>window.NIGHT = {night};</script>
<script src="night.js"></script>
</body>
</html>
"""


def fact_html(facts):
    return ''.join('<div class="fact"><b>%s</b><span>%s</span></div>' % (b, s) for b, s in facts)


def nice_date(d):
    y, m, dd = d.split('-')
    return '%d %s' % (int(dd), MON[int(m) - 1])


nights = D['nights']
for i, n in enumerate(nights):
    prev = nights[i - 1] if i > 0 else None
    nxt = nights[i + 1] if i + 1 < len(nights) else None
    chatsrc = "kicklogz.com's archive of the channel" if n['chatSource'] == 'kicklogz' else 'logs taken live from the channel'
    page = TEMPLATE.format(
        version=VERSION, base=BASE, file=n['file'],
        title=html.escape(n['title'], quote=True), desc=html.escape(n['desc'], quote=True), ogtitle=html.escape(n['ogTitle'], quote=True),
        crumb=html.escape(n['slug']) + ', ' + nice_date(n['date']),
        h1=n['h1'], lede=n['lede'], facts=fact_html(n['facts']), speaker=html.escape(n['speaker']),
        chatsrc=chatsrc, window=html.escape(n['window']),
        prev=('<a href="%s" title="%s"><small>&larr; previous night</small>%s, %s</a>' % (prev['file'], html.escape(prev['h1'], quote=True), html.escape(prev['slug']), nice_date(prev['date']))) if prev else '<span></span>',
        next=('<a href="%s" title="%s"><small>next night &rarr;</small>%s, %s</a>' % (nxt['file'], html.escape(nxt['h1'], quote=True), html.escape(nxt['slug']), nice_date(nxt['date']))) if nxt else '<span></span>',
        night=json.dumps({'json': n['file'][:-5] + '.json', 'speaker': n['speaker'], 'keys': n['keys']}, ensure_ascii=False).replace('</', '<\\/'),
    )
    with open(os.path.join(HERE, n['file']), 'w', encoding='utf-8', newline='\n') as f:
        f.write(page)
    print('wrote', n['file'])
print(len(nights), 'night pages')
