// Pure helpers for the ChordSwarm BPM worker — extract a YouTube video id and
// parse a messy video title into { artist, song }. Kept separate so they can be
// unit-tested with node (see ../test-parse.mjs) without a live API key.

export function extractVideoId(input){
  if (!input) return '';
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;            // already a raw id
  try{
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1, 12);
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/\/(embed|shorts)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[2];
  }catch{ /* not a URL */ }
  const m = s.match(/[A-Za-z0-9_-]{11}/);                 // last resort
  return m ? m[0] : '';
}

// Strip the usual YouTube-title noise so the artist/song split is cleaner.
const NOISE = [
  /\(\s*official\s*(music\s*)?video\s*\)/ig,
  /\[\s*official\s*(music\s*)?video\s*\]/ig,
  /\(\s*official\s*(lyric|lyrics)\s*video\s*\)/ig,
  /\(\s*official\s*audio\s*\)/ig, /\[\s*official\s*audio\s*\]/ig,
  /\(\s*(lyric|lyrics)\s*\)/ig, /\[\s*(lyric|lyrics)\s*\]/ig,
  /\(\s*audio\s*\)/ig, /\(\s*visuali[sz]er\s*\)/ig,
  /\bofficial\s*(music\s*)?video\b/ig, /\bofficial\s*audio\b/ig,
  /\(\s*prod\.?[^)]*\)/ig,
  /\[[^\]]*\]/g,                          // any remaining [..] tag
  /\b(hd|hq|4k|m\/?v)\b/ig,
];
export function cleanTitle(t){
  let s = ' ' + (t || '') + ' ';
  for (const re of NOISE) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Normalized key for caching BPM by SONG (not just video id), so different
// uploads of the same track (official video / lyric video / re-up) share a hit.
export function songKey(artist, song){
  const norm = s => (s || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')        // drop apostrophes (don't -> dont)
    .replace(/[^a-z0-9]+/g, ' ')            // everything else -> space
    .trim().replace(/\s+/g, ' ');
  const a = norm(artist), s = norm(song);
  if (!s) return '';
  return a ? `${a}|${s}` : s;
}

export function parseTitle(rawTitle, author){
  const t = cleanTitle(rawTitle);
  const parts = t.split(/\s+[-–—]\s+/);                   // hyphen / en / em dash
  if (parts.length >= 2 && parts[0].trim()){
    return { artist: parts[0].trim(), song: parts.slice(1).join(' - ').trim(), guessed:false };
  }
  // No "Artist - Song" — fall back to the channel name as artist (weak).
  const artist = (author || '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
  return { artist, song: t, guessed:true };
}
