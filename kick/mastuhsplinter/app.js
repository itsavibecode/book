/* KickPocketed - overview page */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n) { return (n == null) ? '' : Number(n).toLocaleString('en-US'); };
  var money = function (n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function utc(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function dayOnly(iso) { return iso ? utc(iso).slice(0, 10) : ''; }
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* "Oct 9, 16:12" in UTC, no year: short enough to stay on one line in the table */
  function shortUtc(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return MON3[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------- tooltip ---------- */
  var tip = $('tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(x + 14, window.innerWidth - w - 8), top = y - h - 12;
    if (top < 8) top = y + 16;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- consent banner (site-wide `greenline-consent` key) ---------- */
  (function () {
    var b = $('consentBanner'); if (!b) return;
    function record(state) {
      lsSet('greenline-consent', state);
      if (window.gtag) window.gtag('consent', 'update', { 'analytics_storage': state });
      b.hidden = true;
    }
    if (window.__needsConsent) b.hidden = false;
    $('consentAccept').addEventListener('click', function () { record('granted'); });
    $('consentReject').addEventListener('click', function () { record('denied'); });
    $('cookieReset').addEventListener('click', function () { lsDel('greenline-consent'); b.hidden = false; });
  })();

  fetch('data.json').then(function (r) { return r.json(); }).then(render).catch(function (e) {
    $('gridBody').innerHTML = '<tr><td colspan="9">Could not load data.json (' + esc(e.message) + ').</td></tr>';
  });

  function render(D) {
    var A = D.assumptions, perSub = A.subPrice * A.streamerShare;
    var firstPost = Date.parse('2026-10-09T17:53:44Z');
    var bans24 = D.bans.filter(function (b) { var t = Date.parse(b.at); return t >= firstPost - 3600e3 && t <= firstPost + 86400e3; }).length;

    /* stats */
    $('sSubs').textContent = num(D.totals.subs);
    $('sKicks').textContent = num(D.totals.kicks);
    $('sChannels').textContent = num(D.totals.channels);
    $('sBans').textContent = num(bans24);
    $('sValue').textContent = money(D.totals.subs * perSub);
    $('aSub').textContent = money(A.subPrice);
    $('aShare').textContent = money(perSub);
    $('aKicks').textContent = money(A.kicksPer1000);
    $('subjectFollowers').textContent = num(D.subject.followers);
    $('subjectCreated').textContent = D.subject.created;
    $('banCount').textContent = num(D.bans.length);
    $('nSubCh').textContent = num(D.totals.subChannels);
    $('nKickCh').textContent = num(D.totals.kickChannels);
    if (D.generated) $('asOf').textContent = D.generated;

    renderTable(D, perSub);
    renderBans(D);
    renderQuotes(D);
    renderHisChat(D);
    renderMentions(D);
    renderEvidence(D);
    renderNights(D);
  }

  /* ---------- channel table ---------- */
  var COLS = [
    { id: 'channel', label: 'Channel', tip: 'Kick channel. Click the name to open it on Kick.', sort: function (r) { return r.name.toLowerCase(); }, always: true },
    { id: 'followers', label: 'Followers', tip: 'Follower count from Kick\'s channel API on 2026-10-10.', n: true, sort: function (r) { return r.followers || 0; } },
    { id: 'subs', label: 'Gifted subs', tip: 'Gifted subscriptions attributed to this gifter. Mostly from each channel\'s top-gifters record on kicklogz; a few from Kick\'s own gifting leaderboards or a streamer\'s own count.', n: true, sort: function (r) { return r.subs; }, def: 'desc' },
    { id: 'kicks', label: 'KICKs', tip: 'KICKs sent to this channel, from the gifter\'s kicklogz profile. KICKs are Kick\'s tipping currency.', n: true, sort: function (r) { return r.kicks; } },
    { id: 'share', label: 'Share at risk', tip: 'Gifted subs multiplied by the streamer\'s share of one sub ($4.99 less Kick\'s 5%, which is the $4.74 per refund wvagabond\'s ledger shows). What a full chargeback claws back from the streamer, not counting KICKs.', n: true, sort: function (r) { return r.subs; } },
    { id: 'msgs', label: 'His messages', tip: 'Messages the account posted in that chat since 1 Sept, per the source site\'s logs. "not logged" means that channel was not being recorded.', n: true, sort: function (r) { return r.msgs == null ? -1 : r.msgs; } },
    { id: 'lastGift', label: 'Last gift', tip: 'Date of the last gifted sub recorded by kicklogz (UTC).', sort: function (r) { return r.lastGift || ''; } },
    { id: 'banned', label: 'Banned him', tip: 'When a moderator of this channel banned the account, from kicklogz ban records (UTC). A hollow dot means the ban was lifted again.', sort: function (r) { return r.bannedAt || ''; } },
    { id: 'nights', label: 'The night', tip: 'Minute-by-minute transcript of the stream beside the chat, for the nights that were captured.', sort: function (r) { return r.nights.length; } },
  ];
  var DEFAULT_HIDDEN = ['followers', 'lastGift'];
  var state = { sortId: 'subs', dir: 'desc', hidden: null };
  (function () {
    var saved = lsGet('kp_cols');
    state.hidden = saved ? saved.split(',').filter(Boolean) : DEFAULT_HIDDEN.slice();
  })();

  function renderTable(D, perSub) {
    var rows = D.channels.slice();
    var maxSubs = Math.max.apply(null, rows.map(function (r) { return r.subs; }));
    var maxKicks = Math.max.apply(null, rows.map(function (r) { return r.kicks; }));
    var head = $('gridHead'), body = $('gridBody'), foot = $('gridFoot');

    function visible() { return COLS.filter(function (c) { return c.always || state.hidden.indexOf(c.id) < 0; }); }

    function draw() {
      var cols = visible();
      if (state.sortId) {
        var col = COLS.filter(function (c) { return c.id === state.sortId; })[0];
        rows.sort(function (a, b) {
          var x = col.sort(a), y = col.sort(b);
          if (x < y) return state.dir === 'asc' ? -1 : 1;
          if (x > y) return state.dir === 'asc' ? 1 : -1;
          return b.subs - a.subs || b.kicks - a.kicks;
        });
      } else {
        rows.sort(function (a, b) { return b.subs - a.subs || b.kicks - a.kicks; });
      }
      head.innerHTML = cols.map(function (c) {
        var dir = state.sortId === c.id ? (state.dir === 'asc' ? '▲' : '▼') : '';
        return '<th class="sortable c-' + c.id + (c.n ? ' n' : '') + '" data-col="' + c.id + '" title="' + esc(c.tip) + ' Click to sort; click again to flip; a third click resets."><span class="dir">' + dir + '</span>' + esc(c.label) + '</th>';
      }).join('');
      body.innerHTML = rows.map(function (r) {
        return '<tr>' + cols.map(function (c) { return cell(c, r); }).join('') + '</tr>';
      }).join('');
      var tSubs = rows.reduce(function (s, r) { return s + r.subs; }, 0), tKicks = rows.reduce(function (s, r) { return s + r.kicks; }, 0);
      foot.innerHTML = cols.map(function (c) {
        var v = '';
        if (c.id === 'channel') v = num(rows.length) + ' channels';
        else if (c.id === 'subs') v = num(tSubs);
        else if (c.id === 'kicks') v = num(tKicks);
        else if (c.id === 'share') v = money(tSubs * perSub);
        else if (c.id === 'banned') v = num(rows.filter(function (r) { return r.bannedAt; }).length) + ' channels';
        else if (c.id === 'nights') v = num(rows.reduce(function (s, r) { return s + r.nights.length; }, 0)) + ' nights';
        return '<td class="c-' + c.id + (c.n ? ' n' : '') + (c.id === 'share' ? ' money' : '') + '" data-label="Total ' + esc(c.label.toLowerCase()) + '">' + v + '</td>';
      }).join('');
    }

    /* number on one line, thin full-width track under it; zero shows a dash and no track */
    function meter(v, max, kind, mark) {
      if (!v) return '<span class="pend">&mdash;</span>';
      return '<div class="meter' + (kind ? ' ' + kind : '') + '"><span class="val">' + num(v) + (mark || '') + '</span>' +
        '<span class="track"><i style="width:max(2px, ' + (100 * v / max).toFixed(2) + '%)"></i></span></div>';
    }

    function cell(c, r) {
      var lab = ' data-label="' + esc(c.label) + '"';
      var cls = function (extra) { return ' class="c-' + c.id + (extra ? ' ' + extra : '') + '"'; };
      switch (c.id) {
        case 'channel':
          return '<td' + cls('chan-cell') + lab + '><div class="chan">' +
            (r.pic ? '<img src="' + esc(r.pic) + '" alt="" loading="lazy" decoding="async" width="32" height="32">' : '<span class="dot mut" style="width:32px;height:32px"></span>') +
            '<div><a class="nm" href="https://kick.com/' + esc(r.slug) + '" target="_blank" rel="noopener" title="Open ' + esc(r.name) + ' on Kick">' + esc(r.name) + '</a>' +
            (r.verified ? '<span class="vf" title="Verified on Kick">&#10004;</span>' : '') +
            (r.name.toLowerCase() !== r.slug ? '<span class="sl">' + esc(r.slug) + '</span>' : '') + '</div></div></td>';
        case 'followers': return '<td' + cls('n') + lab + '>' + (r.followers == null ? '<span class="pend">&mdash;</span>' : num(r.followers)) + '</td>';
        case 'subs':
          var mark = (r.subsSource && r.subsSource !== 'kicklogz') ? '<sup class="srcmark" title="' + (r.subsSource === 'leaderboard' ? 'From Kick\'s all-time gifting leaderboard for this channel' : 'The streamer\'s own count') + '">*</sup>' : '';
          return '<td' + cls('n') + lab + '>' + meter(r.subs, maxSubs, '', mark) + '</td>';
        case 'kicks':
          return '<td' + cls('n') + lab + '>' + meter(r.kicks, maxKicks, 'kicks') + '</td>';
        case 'share': return '<td' + cls('money') + lab + '>' + (r.subs ? '&minus;' + money(r.subs * perSub) : '') + '</td>';
        case 'msgs': return '<td' + cls('n') + lab + '>' + (r.msgs == null ? '<span class="pend">not logged</span>' : num(r.msgs)) + '</td>';
        case 'lastGift': return '<td' + cls() + lab + '>' + (r.lastGift ? dayOnly(r.lastGift) : '<span class="pend">&mdash;</span>') + '</td>';
        case 'banned':
          if (!r.bannedAt) return '<td' + cls() + lab + '><span class="pend">no</span></td>';
          return '<td' + cls() + lab + ' title="' + (r.banActive ? 'Permanent ban still in place' : 'Banned, later lifted') + ' (' + utc(r.bannedAt) + ' UTC)"><span class="dot ' + (r.banActive ? 'red' : 'amber') + '"></span>' + shortUtc(r.bannedAt) + '</td>';
        case 'nights':
          return '<td' + cls('nights-links') + lab + '>' + (r.nights.length ? r.nights.map(function (n) { return '<a class="chip" href="' + esc(n.href) + '" title="Transcript: ' + esc(n.label) + '">' + esc(n.label) + '</a>'; }).join('') : '<span class="pend">&mdash;</span>') + '</td>';
      }
      return '<td' + cls() + '></td>';
    }

    head.addEventListener('click', function (e) {
      var th = e.target.closest('th'); if (!th) return;
      var id = th.getAttribute('data-col');
      var col = COLS.filter(function (c) { return c.id === id; })[0];
      if (state.sortId !== id) { state.sortId = id; state.dir = col.def || (col.n ? 'desc' : 'asc'); }
      else if (state.dir === (col.def || (col.n ? 'desc' : 'asc'))) { state.dir = state.dir === 'asc' ? 'desc' : 'asc'; }
      else { state.sortId = null; }
      draw();
    });

    /* columns manager */
    var btn = $('colsBtn'), menu = $('colsMenu');
    function drawMenu() {
      menu.innerHTML = COLS.filter(function (c) { return !c.always; }).map(function (c) {
        return '<label title="' + esc(c.tip) + '"><input type="checkbox" data-col="' + c.id + '"' + (state.hidden.indexOf(c.id) < 0 ? ' checked' : '') + '> ' + esc(c.label) + '</label>';
      }).join('') + '<button type="button" class="btn-ol reset" id="colsReset" title="Back to the default column set">Reset columns</button>';
    }
    btn.addEventListener('click', function () {
      var open = menu.hidden; if (open) drawMenu();
      menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('change', function (e) {
      var id = e.target.getAttribute('data-col'); if (!id) return;
      if (e.target.checked) state.hidden = state.hidden.filter(function (h) { return h !== id; });
      else if (state.hidden.indexOf(id) < 0) state.hidden.push(id);
      lsSet('kp_cols', state.hidden.join(','));
      draw();
    });
    menu.addEventListener('click', function (e) {
      if (e.target.id === 'colsReset') { state.hidden = DEFAULT_HIDDEN.slice(); lsDel('kp_cols'); drawMenu(); draw(); }
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    draw();
  }

  /* ---------- ban wave ---------- */
  function renderBans(D) {
    var chart = $('banChart');
    var start = Date.parse('2026-10-09T16:00:00Z'), end = Date.parse('2026-10-10T08:00:00Z');
    var buckets = [], earlier = [], later = [];
    for (var t = start; t < end; t += 3600e3) buckets.push({ t: t, items: [] });
    D.bans.forEach(function (b) {
      var t = Date.parse(b.at);
      if (t < start) { earlier.push(b); return; }
      if (t >= end) { later.push(b); return; }
      var i = Math.floor((t - start) / 3600e3); if (buckets[i]) buckets[i].items.push(b);
    });
    var all = [{ label: 'earlier', items: earlier, earlier: true }].concat(buckets.map(function (b) {
      var d = new Date(b.t); return { label: pad(d.getUTCHours()) + ':00', items: b.items, day: d.getUTCDate() };
    }));
    /* bans logged after the wave (the daily refresh keeps adding them) share one "after" column */
    if (later.length) all.push({ label: 'later', items: later, later: true });
    var max = Math.max.apply(null, all.map(function (b) { return b.items.length; }));
    chart.innerHTML = all.map(function (b, i) {
      var h = b.items.length ? Math.max(3, 100 * b.items.length / max) : 0;
      var lbl = b.earlier ? 'before' : b.later ? 'after' : (b.label === '00:00' ? 'Oct 10' : (i === 1 ? 'Oct 9 ' + b.label : b.label));
      return '<div class="col' + (b.earlier || b.later ? ' earlier' : '') + '" data-i="' + i + '" style="--h:' + h + '%"><i style="height:' + h + '%"></i>' + (b.items.length ? '<span class="v">' + b.items.length + '</span>' : '') + '<span class="x">' + lbl + '</span></div>';
    }).join('');
    chart.addEventListener('mousemove', function (e) {
      var col = e.target.closest('.col'); if (!col) { hideTip(); return; }
      var b = all[+col.getAttribute('data-i')];
      if (!b.items.length) { hideTip(); return; }
      var by = {}; b.items.forEach(function (x) { by[x.by] = (by[x.by] || 0) + 1; });
      var byTxt = Object.keys(by).sort(function (a, c) { return by[c] - by[a]; }).slice(0, 3).map(function (k) { return esc(k) + ' (' + by[k] + ')'; }).join(', ');
      var chans = b.items.map(function (x) { return x.channel; });
      showTip('<b>' + (b.earlier ? 'Before Oct 9, 16:00 UTC' : b.later ? 'After Oct 10, 08:00 UTC' : (b.label + ' UTC hour')) + ': ' + b.items.length + ' ban' + (b.items.length === 1 ? '' : 's') + '</b><span class="l">By: ' + byTxt + '</span><br>' + esc(chans.slice(0, 14).join(', ')) + (chans.length > 14 ? ' and ' + (chans.length - 14) + ' more' : ''), e.clientX, e.clientY);
    });
    chart.addEventListener('mouseleave', hideTip);
    var tb = $('banTable').querySelector('tbody');
    tb.innerHTML = D.bans.slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; }).map(function (b) {
      var type = b.permanent ? (b.unbanned_at ? 'permanent, lifted ' + utc(b.unbanned_at) : 'permanent') : 'timeout';
      return '<tr><td data-label="Time (UTC)">' + utc(b.at) + '</td><td data-label="Channel"><a href="https://kick.com/' + esc(b.channel) + '" target="_blank" rel="noopener">' + esc(b.channel) + '</a></td><td data-label="Banned by">' + esc(b.by || '') + '</td><td data-label="Type">' + type + '</td></tr>';
    }).join('');
  }

  /* ---------- quotes, posts, chat ---------- */
  function renderQuotes(D) {
    var KIND = { 'first-hand': ['tag-key', 'first-hand number'], 'named': ['tag-key', 'names the gifter'], 'claim': ['tag-amber', 'claim, unverified'], 'allegation': ['tag-red', 'allegation, unverified'], 'reaction': ['tag-muted', 'reaction'] };
    $('onair').innerHTML = D.quotes.map(function (q) {
      return '<div class="quote"><p>&ldquo;' + esc(q.text) + '&rdquo;</p><div class="who"><strong>' + esc(q.who) + '</strong> <span>' + utc(q.when) + ' UTC</span> <a href="' + esc(q.href) + '" title="Jump to this minute in the transcript">read the minute &rarr;</a></div><p class="ctx">' + esc(q.context) + '</p></div>';
    }).join('');
    $('quotes').innerHTML = D.tweets.map(function (t) {
      var k = KIND[t.kind] || KIND.reaction;
      return '<div class="quote q-' + esc(t.kind) + '"><p>' + esc(t.text) + '</p><div class="who"><span class="tag ' + k[0] + '">' + k[1] + '</span><strong>' + esc(t.who) + '</strong><a href="' + esc(t.url) + '" target="_blank" rel="noopener" title="Open the original post">' + esc(t.handle) + '</a><span>' + utc(t.time) + ' UTC</span>' + (t.views ? '<span>' + num(t.views) + ' views</span>' : '') + '</div>' + (t.note ? '<p class="note">' + esc(t.note) + '</p>' : '') + '</div>';
    }).join('');
    $('chatlog').innerHTML = D.chat.map(function (c) {
      return '<li><time>' + esc(c.time.replace('T', ' ').replace(/:00Z$/, '')) + '</time><div><span class="ch">#' + esc(c.channel) + '</span>' + esc(c.text) + '</div></li>';
    }).join('');
  }

  /* ---------- his own channel chat ---------- */
  var EMOTE_RX = /\[emote:(\d+):([^\]]+)\]/g;
  var TAGS = [
    [/legend|hero|cinema|goat\b|gigachad|king\b|based|absolute|\bW\b|thank/i, 'tag-key', 'praise'],
    [/charge ?back|refund|scam|fraud|stole|thief|recon|authorit/i, 'tag-amber', 'chargeback talk'],
    [/gift|sub\b|subs\b/i, 'tag-muted', 'asks for gifts'],
  ];
  /* message text with [emote:id:name] tokens shown as Kick emote images */
  function chatBody(text) {
    return esc(text).replace(EMOTE_RX, function (all, id, name) {
      return '<img class="emi" src="https://files.kick.com/emotes/' + id + '/fullsize" alt="' + name + '" title="' + name + '" loading="lazy">';
    });
  }
  function keywordTags(text) {
    var plain = String(text || '').replace(EMOTE_RX, ' ');
    return TAGS.filter(function (t) { return t[0].test(plain); }).map(function (t) { return ' <span class="tag ' + t[1] + '">' + t[2] + '</span>'; }).join('');
  }
  function niceDate(day) {
    var p = String(day || '').split('-');
    return p.length === 3 ? +p[2] + ' ' + MON3[+p[1] - 1] + ' ' + p[0] : esc(day);
  }
  function renderHisChat(D) {
    var all = D.hisChat || [], shown = [], emoteOnly = 0;
    all.forEach(function (m) {
      if (!String(m.text || '').replace(EMOTE_RX, '').trim()) emoteOnly++;
      else shown.push(m);
    });
    shown.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    $('hischatCount').textContent = num(all.length) + ' message' + (all.length === 1 ? '' : 's') + ' collected since ' + niceDate(D.hisChatSince) + '.';
    $('hischatList').innerHTML = shown.map(function (m) {
      var who = m.slug || m.user;
      return '<li><time title="' + esc(utc(m.at)) + ' UTC">' + shortUtc(m.at) + '</time><div><a class="u" href="https://kick.com/' + encodeURIComponent(who) + '" rel="noopener" target="_blank" title="Open ' + esc(m.user) + ' on Kick">' + esc(m.user) + '</a>' + chatBody(m.text) + keywordTags(m.text) + '</div></li>';
    }).join('') || '<li><div class="pend">Nothing collected yet.</div></li>';
    var em = $('hischatEmotes');
    if (emoteOnly) { em.textContent = 'plus ' + num(emoteOnly) + ' emote-only message' + (emoteOnly === 1 ? '' : 's'); em.hidden = false; }
  }

  /* ---------- mentions in other channels (kicklogz chat search) ---------- */
  var MENTION_CAP = 60;
  function isBot(u) { u = String(u || '').toLowerCase(); return u === 'nedbot' || u === 'kickbot' || u === 'botrix' || /bot$/.test(u); }
  function renderMentions(D) {
    var all = (D.mentions || []).slice().sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    var sel = $('mentionChannel'), q = $('mentionQ'), list = $('mentionsList'), more = $('mentionsMore'), count = $('mentionsCount');
    var byCh = {};
    all.forEach(function (m) { byCh[m.channel] = (byCh[m.channel] || 0) + 1; });
    var chans = Object.keys(byCh).sort(function (a, b) { return byCh[b] - byCh[a] || (a < b ? -1 : 1); });
    sel.innerHTML = '<option value="">All channels (' + num(all.length) + ')</option>' + chans.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + ' (' + num(byCh[c]) + ')</option>';
    }).join('');
    var span = all.length ? niceDate(all[all.length - 1].at.slice(0, 10)) + ' to ' + niceDate(all[0].at.slice(0, 10)) : '';
    var showAll = false;

    function row(m) {
      var bot = isBot(m.user);
      var tags = bot ? '' : keywordTags(m.text);
      if (bot && /\bban(ned|s)?\b/i.test(m.text)) tags += ' <span class="tag tag-amber">ban notice</span>';
      if (m.self) tags += ' <span class="tag tag-him">his own message</span>';
      return '<li' + (m.self ? ' class="self"' : '') + '><time title="' + esc(utc(m.at)) + ' UTC">' + shortUtc(m.at) + '</time><div>' +
        '<a class="chip mch" href="https://kick.com/' + encodeURIComponent(m.channel) + '" rel="noopener" target="_blank" title="Open ' + esc(m.channel) + '\'s channel on Kick">' + esc(m.channel) + '</a>' +
        '<a class="u" href="https://kick.com/' + encodeURIComponent(String(m.user).toLowerCase()) + '" rel="noopener" target="_blank" title="Open ' + esc(m.user) + ' on Kick">' + esc(m.user) + '</a>' +
        chatBody(m.text) + tags + '</div></li>';
    }
    function draw() {
      var ch = sel.value, needle = q.value.trim().toLowerCase();
      var hits = all.filter(function (m) {
        if (ch && m.channel !== ch) return false;
        if (!needle) return true;
        return (m.text + ' ' + m.user + ' ' + m.channel).toLowerCase().indexOf(needle) >= 0;
      });
      var shown = showAll ? hits : hits.slice(0, MENTION_CAP);
      list.innerHTML = shown.map(row).join('') || '<li><div class="pend">' + (all.length ? 'No message matches.' : 'Nothing collected yet.') + '</div></li>';
      more.hidden = hits.length <= shown.length;
      more.textContent = 'Show all ' + num(hits.length);
      var base = num(all.length) + ' message' + (all.length === 1 ? '' : 's') + ' in ' + num(chans.length) + ' channel' + (chans.length === 1 ? '' : 's') + (span ? ', ' + span : '') + '.';
      count.textContent = (ch || needle) ? num(hits.length) + ' of ' + base : base;
    }
    sel.addEventListener('change', draw);
    q.addEventListener('input', draw);
    more.addEventListener('click', function () { showAll = true; draw(); });
    draw();
  }

  function renderEvidence(D) {
    $('evidence').innerHTML = D.evidence.map(function (e) {
      return '<figure><a href="' + esc(e.file) + '" target="_blank" rel="noopener" title="Open full size"><img src="' + esc(e.file) + '" alt="' + esc(e.alt) + '" loading="lazy" decoding="async" width="1400" height="700"></a><figcaption><b>' + esc(e.title) + '</b>' + esc(e.caption) + '</figcaption></figure>';
    }).join('');
  }

  function renderNights(D) {
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    $('nights').innerHTML = D.nights.map(function (n) {
      var d = n.date.split('-');
      return '<a class="night" href="' + esc(n.file) + '" title="' + esc(n.desc) + '"><span class="d">' + esc(n.slug) + ' &middot; ' + +d[2] + ' ' + MON[+d[1] - 1] + '</span><span class="t">' + esc(n.h1.replace(/^[^:]+:\s*/, '')) + '</span><span class="m">' + num(n.speech) + ' lines of speech &middot; ' + num(n.chat) + ' chat messages</span></a>';
    }).join('');
  }
})();
