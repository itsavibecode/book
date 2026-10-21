/* Kick Translate self-test. Runs the pure parts of the pipeline under Node
   (no browser, no network):

     node tools/selftest.mjs

   Cleaning, skip rules and the laughter table, the script detector against
   tools/fixture.mjs (200 real-looking chat lines), the Latin word vote,
   filters and glossary, provider order and cooldowns, and the chat frame
   parser. Exits 1 on any failure. */
import * as T from '../translate.js';
import { parseEvent, tokenize, plainText, readableColor } from '../chat.js';
import { parseSlug } from '../kick.js';
import { LINES } from './fixture.mjs';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w);
}

/* ---- cleaning ---- */
eq('clean strips emotes, links, mentions', T.clean('[emote:1:KEKW] @bob look https://x.co/a hola').text, 'look hola');
eq('clean collapses elongation', T.clean('holaaaa amigooo!!!!').text, 'hola amigo!');
eq('clean keeps doubled letters', T.clean('good llama').text, 'good llama');
eq('clean strips emoji', T.clean('nice \u{1F525}\u{1F525} one').text, 'nice one');
eq('clean keeps the stripped form for laughter', T.clean('jajajaaaa').stripped, 'jajajaaaa');

/* ---- the fixture: skip reason + script per line ---- */
eq('fixture has 200 lines', LINES.length, 200);
LINES.forEach(function (l, i) {
  const c = T.clean(l[0]);
  eq('skip #' + i + ' ' + JSON.stringify(l[0].slice(0, 30)), T.skipReason(c), l[1]);
  eq('script #' + i + ' ' + JSON.stringify(l[0].slice(0, 30)), T.detectScript(c.text), l[2]);
});

/* ---- Latin word vote ---- */
eq('guess es', T.guessLatin('esto es muy bueno la verdad'), 'es');
eq('guess pt', T.guessLatin('não acompanho muito jogo do vasco'), 'pt');
eq('guess en', T.guessLatin('what is this game'), 'en');
eq('guess fr', T.guessLatin('c est quoi ce jeu'), 'fr');
eq('guess unsure', T.guessLatin('grabe'), '');

/* ---- languages ---- */
eq('normLang zh-TW', T.normLang('zh-TW'), 'zh-Hant');
eq('normLang nb', T.normLang('nb-NO'), 'no');
eq('normLang iw', T.normLang('iw'), 'he');
eq('codeFromName Japanese', T.codeFromName('Japanese'), 'ja');
eq('codeFromName English (India)', T.codeFromName('English (India)'), 'en');
eq('codeFromName unknown', T.codeFromName('Klingon'), '');
eq('shortTag zh-Hant', T.shortTag('zh-Hant'), 'ZH');

/* ---- filters and glossary ---- */
eq('bot', T.isBot('BotRix'), true);
eq('not bot', T.isBot('botrixfan'), false);
eq('parseList', T.parseList('a, @B\nc'), ['a', 'b', 'c']);
eq('blocked word', T.hasBlockedWord('Free Skins here', T.parseList('free skins')), 'free skins');
eq('blocked word is whole-word', T.hasBlockedWord('wow', ['w']), '');
const g = T.parseGlossary('Cobra = Lacobraaa\nbad line\nkick=Kick');
eq('glossary parse', g.length, 2);
eq('glossary apply', T.applyGlossary('the cobra fell, cobras too', g), 'the Lacobraaa fell, cobras too');

/* ---- provider order and cooldowns ---- */
function fake(name) { return T.withCooldown({ name: name, label: name, batch: async function () { return []; } }); }
const P = { a: fake('a'), b: fake('b'), c: fake('c') };
eq('chain order', T.chainOrder(P, ['a', 'b', 'c'], {}, '', Date.now()).map(function (p) { return p.name; }), ['a', 'b', 'c']);
eq('chain sticky first', T.chainOrder(P, ['a', 'b', 'c'], {}, 'c', Date.now()).map(function (p) { return p.name; }), ['c', 'a', 'b']);
eq('chain disabled', T.chainOrder(P, ['a', 'b', 'c'], { b: false }, '', Date.now()).map(function (p) { return p.name; }), ['a', 'c']);
P.a.onFailure(new Error('google 500'));
eq('cooldown 10 s', Math.round((P.a.until - Date.now()) / 1000), 10);
P.a.onFailure(new Error('google 500'));
eq('cooldown doubles', Math.round((P.a.until - Date.now()) / 1000), 20);
eq('cooling provider left out', T.chainOrder(P, ['a', 'b', 'c'], {}, 'a', Date.now()).map(function (p) { return p.name; }), ['b', 'c']);
P.a.onSuccess();
eq('cooldown reset', P.a.ready(), true);
P.b.onFailure(new Error('server 429 budget'));
eq('budget rests 5 min', Math.round((P.b.until - Date.now()) / 60000), 5);

/* ---- chat frames ---- */
const frame = { channel: 'chatrooms.56746877.v2', data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify({
  id: '449e3aae', chatroom_id: 56746877, content: 'きたよ [emote:37226:KEKW]', type: 'message',
  created_at: '2026-10-20T15:53:09+00:00',
  sender: { id: 58259730, username: 'satojun0316', slug: 'satojun0316', identity: { color: '#93EBE0', badges: [],
    badges_v2: [{ name: 'level', badge_type: 'global', image_url: 'https://ext.cdn.kick.com/chat/badges/22_x.png', metadata: { level: 22 }, sort_order: 1 }] } },
  metadata: { message_ref: '1792511588672' } }) } };
const m = parseEvent(frame);
eq('frame kind', m.kind, 'message');
eq('frame user', [m.user.name, m.user.color], ['satojun0316', '#93EBE0']);
eq('frame badge', m.badges, [{ img: 'https://ext.cdn.kick.com/chat/badges/22_x.png', title: 'Level 22', type: 'level' }]);
eq('frame time', m.time, Date.parse('2026-10-20T15:53:09+00:00'));
const reply = parseEvent({ data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify({ id: '1', content: 'si', sender: { id: 1, username: 'a', identity: {} },
  metadata: { original_sender: { id: 2, username: 'lenaaa' }, original_message: { id: '0', content: 'hola [emote:1:wave]' } } }) } });
eq('reply', reply.reply, { name: 'lenaaa', content: 'hola [emote:1:wave]' });
eq('reply plain text', plainText(reply.reply.content), 'hola :wave:');
eq('deleted', parseEvent({ data: { event: 'App\\Events\\MessageDeletedEvent', data: JSON.stringify({ id: 'x', message: { id: '449e3aae' } }) } }), { kind: 'deleted', id: '449e3aae' });
eq('banned', parseEvent({ data: { event: 'App\\Events\\UserBannedEvent', data: JSON.stringify({ user: { id: 9, username: 'Spam', slug: 'spam' } }) } }), { kind: 'banned', userId: '9', name: 'spam' });
eq('cleared', parseEvent({ data: { event: 'App\\Events\\ChatroomClearEvent', data: '{"id":"1"}' } }), { kind: 'cleared' });
eq('other events ignored', parseEvent({ data: { event: 'App\\Events\\PinnedMessageCreatedEvent', data: '{}' } }), null);
eq('tokenize', tokenize('hi @bob [emote:5:pog] https://a.b/c').map(function (k) { return k.t; }), ['text', 'mention', 'text', 'emote', 'text', 'link']);
eq('dark name lifted', readableColor('#000000') !== 'rgb(0,0,0)', true);
eq('bright name kept', readableColor('#93EBE0'), 'rgb(147,235,224)');
eq('slug from link', parseSlug('https://kick.com/Korekore_ch/videos'), 'korekore_ch');
eq('slug from hash', parseSlug('#xqc'), 'xqc');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
