// node worker/test-parse.mjs  — unit tests for the pure title/id helpers.
import { extractVideoId, parseTitle, cleanTitle, songKey } from './src/parse.js';

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
};

// --- video id extraction
eq(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'raw id');
eq(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ', 'watch url');
eq(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'short url');
eq(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'embed url');
eq(extractVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'shorts url');
eq(extractVideoId(''), '', 'empty');

// --- title parsing
eq(parseTitle('Rick Astley - Never Gonna Give You Up (Official Video)'),
   { artist: 'Rick Astley', song: 'Never Gonna Give You Up', guessed: false }, 'artist - song (official video)');
eq(parseTitle('Daft Punk - Harder, Better, Faster, Stronger [Official Music Video]'),
   { artist: 'Daft Punk', song: 'Harder, Better, Faster, Stronger', guessed: false }, 'strip [official music video]');
eq(parseTitle('Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)'),
   { artist: 'Rick Astley', song: 'Never Gonna Give You Up', guessed: false }, 'strip multiple parens incl (4K Remaster)');
eq(parseTitle('Artist – Song Name (Lyrics)'),
   { artist: 'Artist', song: 'Song Name', guessed: false }, 'en-dash + (lyrics)');
eq(parseTitle('Some Song (Official Audio)', 'CoolArtist'),
   { artist: 'CoolArtist', song: 'Some Song', guessed: true }, 'no dash -> channel as artist');
eq(parseTitle('Tycho - Awake', 'Tycho - Topic'),
   { artist: 'Tycho', song: 'Awake', guessed: false }, 'topic channel, clean title');

// --- cleanTitle
eq(cleanTitle('Song Title (Official Video) [4K]'), 'Song Title', 'clean removes tags');

// --- songKey: stable across casing/punctuation so different uploads collide
eq(songKey('Rick Astley', 'Never Gonna Give You Up'), 'rick astley|never gonna give you up', 'song key basic');
eq(songKey('AC/DC', 'T.N.T.'), 'ac dc|t n t', 'song key punctuation');
eq(songKey("Guns N' Roses", "Sweet Child O' Mine"),
   songKey('Guns N Roses', 'Sweet Child O Mine'), 'song key apostrophes collapse');
eq(songKey('  Daft   Punk ', 'One More Time'), 'daft punk|one more time', 'song key whitespace');
eq(songKey('', 'Untitled'), 'untitled', 'song key no artist');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
