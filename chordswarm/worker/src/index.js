// ChordSwarm BPM worker
// GET /bpm?v=<videoId|youtubeUrl>  ->  { ok, videoId, title, artist, song, bpm, ... }
// GET /bpm?v=<...>&debug=1  ->  also echoes _lookup + _getsongbpm.raw (the raw API
//   response, never the key) and skips the cache — use it to confirm parsing.
//
// Pipeline (PLAN §6b, "Song-ID + BPM database"):
//   1. KV cache by video id        (instant repeat of the same video)
//   2. YouTube oEmbed (no key)      -> title + channel
//   3. parse "Artist - Song"
//   4. KV cache by SONG key         (instant for a different upload of same song)
//   5. GetSongBPM search            -> tempo (BPM)
//   then persist under BOTH the video-id key and the song key.
// Tempo only (no beat phase); best-effort — fails on mixes/obscure/odd titles.
//
// DEPLOY (sevendwarfs account — see cf account routing):
//   cf sevendwarfs
//   wrangler kv namespace create BPM_CACHE   # paste the id into wrangler.toml
//   wrangler secret put GETSONGBPM_API_KEY   # free key from getsongbpm.com/api
//   wrangler deploy
// REQUIRED: getsongbpm.com's free API mandates a visible backlink to
//   getsongbpm.com on the site that uses it — add it to the overlay footer.
//
// NOTE: API base is api.getsong.co (confirmed). The response-shape parsing in
// fetchBpm() (d.search[].tempo) still needs a live confirm with a real key.

import { extractVideoId, parseTitle, songKey } from './parse.js';

function cors(origin){
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}
function pickOrigin(req, env){
  const o = req.headers.get('origin') || '';
  const allow = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return allow.includes(o) ? o : (allow[0] || '*');
}
const json = (obj, origin, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin), ...extra },
  });

async function fetchBpm(artist, song, key){
  // GetSongBPM Web API base is api.getsong.co (NOT api.getsongbpm.com).
  const lookup = encodeURIComponent(`song:${song}${artist ? ` artist:${artist}` : ''}`);
  const r = await fetch(`https://api.getsong.co/search/?api_key=${key}&type=song&lookup=${lookup}`,
    { headers: { 'Accept': 'application/json' } });
  let raw = null;
  try { raw = await r.json(); } catch { try { raw = await r.text(); } catch { raw = null; } }
  // search results may be an array, a single object, or nested under .search
  const list = raw && Array.isArray(raw.search) ? raw.search : (raw && raw.search ? [raw.search] : []);
  const hit = list.find(x => x && x.tempo);
  return {
    bpm: hit ? Math.round(+hit.tempo) : null,
    dbTitle: hit ? (hit.song_title || hit.title || null) : null,
    httpStatus: r.status,
    raw,                       // echoed only under ?debug=1; never contains the key
  };
}

export default {
  async fetch(req, env, ctx){
    const url = new URL(req.url);
    const origin = pickOrigin(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (url.pathname === '/healthz') return json({ ok: true }, origin);
    if (url.pathname !== '/bpm') return json({ ok: false, error: 'not found' }, origin, 404);

    const vid = extractVideoId(url.searchParams.get('v') || '');
    if (!vid) return json({ ok: false, error: 'bad video id' }, origin, 400);

    const KV = env.BPM_CACHE || null;           // durable store (optional until namespace bound)
    const HIT_HDR = { 'cache-control': 'max-age=2592000' };
    const debug = url.searchParams.get('debug') === '1';   // echo raw GetSongBPM, skip cache

    // 1) durable cache by video id
    if (KV && !debug){
      const v = await KV.get('v:' + vid, 'json');
      if (v) return json({ ...v, cache: 'video' }, origin, 200, HIT_HDR);
    }

    let out;
    try{
      // 2) YouTube title via oEmbed (no key)
      const oe = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`);
      if (!oe.ok) throw new Error('oembed ' + oe.status);
      const meta = await oe.json();
      const { artist, song, guessed } = parseTitle(meta.title, meta.author_name);
      const sk = songKey(artist, song);

      // 3) durable cache by SONG (a different upload of the same track)
      let cachedSong = null;
      if (KV && !debug && sk) cachedSong = await KV.get('s:' + sk, 'json');

      let bpm = null, matched = false, dbTitle = null, source = 'getsongbpm', dbg = null;
      if (cachedSong && cachedSong.bpm){
        bpm = cachedSong.bpm; dbTitle = cachedSong.dbTitle || null; matched = true; source = 'getsongbpm(song-cache)';
      } else if (env.GETSONGBPM_API_KEY && song){
        const res = await fetchBpm(artist, song, env.GETSONGBPM_API_KEY);
        if (res && res.bpm != null){ bpm = res.bpm; dbTitle = res.dbTitle; matched = true; }
        if (debug) dbg = { httpStatus: res && res.httpStatus, raw: res && res.raw };
      }

      out = { ok: matched, videoId: vid, title: meta.title, artist, song, songKey: sk, guessed, bpm, matched, dbTitle, source };
      if (!env.GETSONGBPM_API_KEY && !cachedSong) out.note = 'GETSONGBPM_API_KEY not set';
      if (debug){ out._lookup = { artist, song, songKey: sk }; out._getsongbpm = dbg; }

      // 4) persist: video-id key always; song key when freshly matched. (not in debug)
      if (KV && !debug){
        const vOpts = out.ok ? {} : { expirationTtl: 86400 };   // retry unresolved sooner
        ctx.waitUntil(KV.put('v:' + vid, JSON.stringify(out), vOpts));
        if (matched && sk && !cachedSong){
          ctx.waitUntil(KV.put('s:' + sk, JSON.stringify({ bpm, dbTitle, artist, song })));
        }
      }
    }catch(e){
      out = { ok: false, videoId: vid, error: String((e && e.message) || e) };
    }
    return json(out, origin, 200, out.ok ? HIT_HDR : { 'cache-control': 'max-age=86400' });
  },
};
