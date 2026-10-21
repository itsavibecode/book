/* Kick Translate - languages and the translation pipeline:
   clean -> skip rules -> cache -> detect -> coalesce -> provider chain.
   Pure helpers (clean, skipReason, detectScript, guessLatin) have no DOM or
   network and are what tools/selftest.mjs checks under Node. Nothing here
   runs at import time. */
'use strict';

/* ================= languages ================= */

/* Reading languages offered in the target select. The first 39 are the ones
   Chrome's on-device Translator lists; fil and ms are cloud-only but common
   in Kick chat. */
export const TARGETS = ['ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hr',
  'hu', 'id', 'it', 'ja', 'kn', 'ko', 'lt', 'mr', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta',
  'te', 'th', 'tr', 'uk', 'vi', 'zh', 'zh-Hant', 'fil', 'ms'];

const NAME_FIX = { zh: 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)', no: 'Norwegian', fil: 'Filipino' };

let dn = null;
export function langName(code) {
  if (!code) return '';
  if (NAME_FIX[code]) return NAME_FIX[code];
  try {
    if (!dn && typeof Intl !== 'undefined' && Intl.DisplayNames) dn = new Intl.DisplayNames(['en'], { type: 'language' });
    if (dn) return dn.of(code) || code;
  } catch (e) { /* unknown code */ }
  return code;
}

/* Any BCP 47 tag -> one of our codes, or ''. Folds regional and legacy
   spellings: zh-TW/zh-HK -> zh-Hant, nb/nn -> no, tl -> fil, iw -> he. */
export function normLang(tag) {
  if (!tag) return '';
  const t = String(tag).trim().replace(/_/g, '-');
  const low = t.toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(low)) return 'zh-Hant';
  const base = low.split('-')[0];
  const map = { nb: 'no', nn: 'no', tl: 'fil', iw: 'he', in: 'id', jw: 'jv' };
  return map[base] || base;
}

/* Two letters for the per-line tag. */
export function shortTag(code) {
  if (code === 'zh-Hant') return 'ZH';
  if (code === 'fil') return 'TL';
  return String(code || '').slice(0, 2).toUpperCase();
}

export function browserLang() {
  try {
    const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    for (let i = 0; i < list.length; i++) {
      const c = normLang(list[i]);
      if (TARGETS.indexOf(c) !== -1) return c;
    }
  } catch (e) { /* no navigator */ }
  return 'en';
}

/* Kick declares a stream's language by English name ("Japanese"). */
const NAME_TO_CODE = {};
export function codeFromName(name) {
  if (!name) return '';
  const n = String(name).trim().toLowerCase();
  if (/^[a-z]{2,3}$/.test(n)) return normLang(n);
  if (!Object.keys(NAME_TO_CODE).length) {
    TARGETS.concat(['ca', 'et', 'lv', 'fa', 'ur', 'sr', 'sw', 'af', 'ga', 'is', 'mk', 'sq', 'bs', 'az', 'ka', 'hy', 'kk', 'uz', 'mn', 'ne', 'si', 'km', 'lo', 'my', 'pa', 'gu', 'ml']).forEach(function (c) {
      NAME_TO_CODE[langName(c).toLowerCase()] = c;
    });
    NAME_TO_CODE.chinese = 'zh';
    NAME_TO_CODE.tagalog = 'fil';
    NAME_TO_CODE.norwegian = 'no';
    NAME_TO_CODE.persian = 'fa';
  }
  // "English (India)" -> "english"
  return NAME_TO_CODE[n] || NAME_TO_CODE[n.replace(/\s*\(.*\)\s*$/, '')] || '';
}

/* ================= cleaning ================= */

const EMOTE_RE = /\[emote:\d+:[^\]]*\]/g;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const MENTION_RE = /@[A-Za-z0-9_]{2,30}/g;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;

/* What may leave the machine: the line with emotes, links, @mentions and
   emoji taken out, whitespace collapsed. `stripped` keeps elongations
   ("holaaaa", "wwwww") for the laughter table; `text` collapses runs of
   three or more of the same letter ("holaaaa" -> "hola") for translating. */
export function clean(content) {
  const stripped = String(content || '')
    .replace(EMOTE_RE, ' ')
    .replace(URL_RE, ' ')
    .replace(MENTION_RE, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const text = stripped
    .replace(/(\p{L})\1{2,}/gu, '$1')
    .replace(/([!?.,~])\1{2,}/g, '$1');
  return { stripped: stripped, text: text };
}

/* ================= skip rules ================= */

/* Whole-token laughter and noise, per language. A line is skipped when every
   word is laughter or slang. */
const LAUGH = [
  /^(?:[jh][aeiou]){2,}[jh]?$/,         // jaja, jeje, haha, hehe, jiji
  /^(?:a?ha){2,}h?$/, /^(?:ah){2,}$/,   // ahaha
  /^(?:js){2,}j?$/, /^(?:sk){2,}s?$/,   // jsjsjs, skskks
  /^k{3,}$/, /^(?:rs){2,}$/,            // pt: kkkk, rsrs
  /^w{2,}$/, /^ｗ{2,}$/, /^草+$/, /^笑+$/,  // ja
  /^5{3,}$/,                            // th
  /^[ㅋㅎ]{2,}$/,                        // ko
  /^(?:哈){2,}$/, /^(?:呵){2,}$/, /^(?:嘿){2,}$/, // zh
  /^(?:х[аеи]){2,}х?$/, /^(?:ах){2,}$/, // ru
  /^(?:x[aα]){2,}$/, /^(?:χα){2,}$/,    // el
  /^ه{3,}$/, /^خخ+$/, /^ح{3,}$/,        // ar
  /^ח{3,}$/,                             // he
  /^(?:wk){2,}w?$/, /^(?:hi){2,}h?$/,   // id, hihi
  /^mdr+$/, /^ptdr+$/, /^xd+$/, /^l+o+l+$/, /^lmf?ao+$/, /^rofl$/, /^kek(?:w)?$/,
  /^a+s+d+[asdf]*$/                     // asdasd
];
const SLANG = new Set(('pog poggers pogchamp pogu kekw kek gg ggs ggwp gz gj wp nt ez w l ratio lul lulw omegalul ' +
  'monkas monkaw pepega sadge copium hopium xd lol lmao lmfao f o7 7 rip bruh sheesh fr ong ok okay yes no ' +
  'hi hey yo sup bye gn gm brb afk ty thx tysm np 1 2 +1 -1 ?? ? !! wtf omg ayo lets go letsgo hype kappa ' +
  'catjam ezclap pepelaugh widepeepohappy based cringe clutch goat nice').split(' '));

function isLaugh(tok) {
  for (let i = 0; i < LAUGH.length; i++) if (LAUGH[i].test(tok)) return true;
  return false;
}

/* A run of Latin letters with almost no vowels, or a single keyboard row. */
function isSmash(tok) {
  if (tok.length < 6 || !/^[a-z]+$/.test(tok)) return false;
  if (/^(?:[asdfghjkl]+|[qwertyuiop]+|[zxcvbnm]+)$/.test(tok)) return true;
  const v = (tok.match(/[aeiouy]/g) || []).length;
  return v / tok.length < 0.12;
}

export const MAX_CHARS = 800;

/* Reason a line will not be translated, or ''. `c` is clean()'s result.
   Repeats, filters and "already your language" need state and are checked
   by the caller. */
export function skipReason(c) {
  if (c.text.length > MAX_CHARS) return 'too long';
  const letters = (c.text.match(/\p{L}/gu) || []).length;
  if (!letters && !/\p{N}/u.test(c.text)) return 'emotes only';
  const toks = c.stripped.toLowerCase().replace(/[!?.,~:;"'()*]+/g, ' ').split(/\s+/).filter(Boolean);
  if (toks.length) {
    let laugh = 0, slang = 0, smash = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (isLaugh(t)) laugh++;
      else if (SLANG.has(t) || /^\d+$/.test(t)) slang++;
      else if (isSmash(t)) smash++;
      else { laugh = -1; break; }
    }
    if (laugh > 0) return 'laughter';
    if (laugh === 0 && smash) return 'noise';
    if (laugh === 0 && slang) return 'slang only';
  }
  if (letters < 2) return 'too short';
  return '';
}

/* ================= language detection ================= */

/* Dominant script -> language code, '' when nothing stands out, 'latin'
   when the line is Latin script (which needs another method). */
export function detectScript(text) {
  const n = { kana: 0, han: 0, hangul: 0, cyr: 0, uk: 0, ar: 0, th: 0, he: 0, el: 0, hi: 0, bn: 0, ta: 0, te: 0, kn: 0, latin: 0 };
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0x3040 && c <= 0x30ff) n.kana++;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) n.han++;
    else if ((c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f)) n.hangul++;
    else if (c >= 0x0400 && c <= 0x04ff) { n.cyr++; if ('іїєґІЇЄҐ'.indexOf(ch) !== -1) n.uk++; }
    else if (c >= 0x0600 && c <= 0x06ff) n.ar++;
    else if (c >= 0x0e00 && c <= 0x0e7f) n.th++;
    else if (c >= 0x0590 && c <= 0x05ff) n.he++;
    else if (c >= 0x0370 && c <= 0x03ff) n.el++;
    else if (c >= 0x0900 && c <= 0x097f) n.hi++;
    else if (c >= 0x0980 && c <= 0x09ff) n.bn++;
    else if (c >= 0x0b80 && c <= 0x0bff) n.ta++;
    else if (c >= 0x0c00 && c <= 0x0c7f) n.te++;
    else if (c >= 0x0c80 && c <= 0x0cff) n.kn++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) n.latin++;
  }
  if (n.kana) return 'ja';
  if (n.hangul) return 'ko';
  if (n.han) return 'zh';
  const best = Object.keys(n).filter(function (k) { return k !== 'uk' && k !== 'kana'; })
    .sort(function (a, b) { return n[b] - n[a]; })[0];
  if (!n[best]) return '';
  if (best === 'cyr') return n.uk ? 'uk' : 'ru';
  if (best === 'latin') return 'latin';
  return best;
}

/* Small stopword vote for Latin-script lines when the browser has no
   on-device detector. Returns a code only with a clear winner. */
const STOP = {
  en: 'the you and is are it this that what why how not for with your just have was but they can do does im dont its he she we my me to of in on so',
  es: 'el la los las que de y es un una por para con no pero como esta este muy ya yo tu se lo le si porque mas eso jaja hola bueno',
  pt: 'o a os as que de e um uma por para com nao mas como esta muito ja eu voce se isso mano cara tem vai ta pra né nao',
  fr: 'le la les des et est un une pour avec pas mais comme il elle je tu nous vous ce cest quoi oui non bien',
  de: 'der die das und ist nicht ein eine ich du wir mit was wie aber auch noch schon ja nein',
  it: 'il lo la gli che di e un una per con non ma come questo sono io tu cosa perche anche',
  tr: 've bir bu ne da de mi ben sen o çok ama için gibi var yok',
  id: 'yang dan di ini itu aku kamu ga gak tidak apa ada sama aja udah',
  pl: 'i w nie na to jest że się jak ale co tak czy ja ty',
  nl: 'de het een en is niet ik je wat dat maar met voor zijn'
};
const STOPSETS = {};
Object.keys(STOP).forEach(function (k) { STOPSETS[k] = new Set(STOP[k].split(' ')); });
export function guessLatin(text) {
  const toks = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(Boolean);
  if (!toks.length) return '';
  const score = {};
  Object.keys(STOPSETS).forEach(function (k) {
    let s = 0;
    toks.forEach(function (t) { if (STOPSETS[k].has(t)) s++; });
    score[k] = s;
  });
  const order = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
  if (!score[order[0]] || score[order[0]] === score[order[1]]) return '';
  return order[0];
}

/* ================= helpers ================= */

export const ON_DEVICE_TIMEOUT = 3000;

/* Every Translator / LanguageDetector call goes through this: in at least
   one Chromium shell availability() never resolves, so a hang must fall
   through to the cloud instead of freezing the line. */
export function race(p, ms, label) {
  return new Promise(function (resolve, reject) {
    const t = setTimeout(function () { reject(new Error((label || 'call') + ' timed out')); }, ms || ON_DEVICE_TIMEOUT);
    Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
  });
}

/* ================= on-device (Chrome / Edge 138+ desktop) ================= */

export function createOnDevice() {
  const hasT = typeof self !== 'undefined' && 'Translator' in self;
  const hasD = typeof self !== 'undefined' && 'LanguageDetector' in self;
  const pairs = new Map();     // 'ja>en' -> {state, tr, avail}
  let broken = false;          // availability() hung once: stop asking
  let detector = null, detectorP = null;

  function key(s, t) { return s + '>' + t; }

  /* Called from a click (the Go button) so a first-time model download is
     allowed. Never blocks the caller for more than 3 s. */
  function initDetector() {
    if (!hasD || detector || detectorP) return;
    try {
      detectorP = self.LanguageDetector.create();
      detectorP.then(function (d) { detector = d; }, function () { detectorP = null; });
    } catch (e) { detectorP = null; }
  }

  /* -> {lang, confidence} or null */
  async function detect(text) {
    if (!detector) return null;
    try {
      const r = await race(detector.detect(text), ON_DEVICE_TIMEOUT, 'detect');
      const top = r && r[0];
      if (top && top.confidence >= 0.6 && top.detectedLanguage !== 'und') return { lang: normLang(top.detectedLanguage), confidence: top.confidence };
    } catch (e) { /* fall through */ }
    return null;
  }

  /* 'ready' | 'downloadable' | 'unavailable'. Creates the translator when
   the pack is already on the device (no click needed for that). */
  async function prepare(src, tgt) {
    if (!hasT || broken || !src || !tgt || src === tgt) return 'unavailable';
    const k = key(src, tgt);
    let p = pairs.get(k);
    if (p && p.state !== 'checking') return p.state;
    if (p && p.wait) return p.wait;
    p = { state: 'checking' };
    pairs.set(k, p);
    p.wait = (async function () {
      let a;
      try {
        a = await race(self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt }), ON_DEVICE_TIMEOUT, 'availability');
      } catch (e) {
        if (/timed out/.test(e.message)) broken = true;
        p.state = 'unavailable';
        return p.state;
      }
      if (a === 'available') {
        try {
          p.tr = await race(self.Translator.create({ sourceLanguage: src, targetLanguage: tgt }), ON_DEVICE_TIMEOUT, 'create');
          p.state = 'ready';
        } catch (e) { p.state = 'downloadable'; }
      } else if (a === 'downloadable' || a === 'downloading') p.state = 'downloadable';
      else p.state = 'unavailable';
      return p.state;
    })();
    return p.wait;
  }

  /* From a click: downloads the pair with progress. The download itself can
     take minutes, so instead of the 3 s race it fails when no progress
     arrives for 30 s. */
  function download(src, tgt, onProgress) {
    const k = key(src, tgt);
    return new Promise(function (resolve, reject) {
      let stall = 0;
      function arm() { clearTimeout(stall); stall = setTimeout(function () { reject(new Error('download stalled')); }, 30000); }
      arm();
      let created;
      try {
        created = self.Translator.create({
          sourceLanguage: src, targetLanguage: tgt,
          monitor: function (m) {
            m.addEventListener('downloadprogress', function (e) { arm(); if (onProgress) onProgress(e.loaded); });
          }
        });
      } catch (e) { clearTimeout(stall); reject(e); return; }
      created.then(function (tr) {
        clearTimeout(stall);
        pairs.set(k, { state: 'ready', tr: tr });
        resolve(tr);
      }, function (e) { clearTimeout(stall); reject(e); });
    });
  }

  async function translate(src, tgt, text) {
    const p = pairs.get(key(src, tgt));
    if (!p || !p.tr) throw new Error('not ready');
    return race(p.tr.translate(text), ON_DEVICE_TIMEOUT, 'translate');
  }

  function state(src, tgt) { const p = pairs.get(key(src, tgt)); return p ? p.state : ''; }

  return { hasTranslator: hasT, hasDetector: hasD, initDetector, detect, prepare, download, translate, state,
    isBroken: function () { return broken; } };
}

/* ================= cloud providers ================= */

/* Google's unofficial batch endpoint, straight from the browser (CORS open,
   verified 2026-10-20). POST form body with one q= per line; sl=auto
   returns [[text, detected], ...]. A soft ban answers 200 with junk, which
   is treated as a failure. */
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx&dt=t&sl=auto&tl=';
function googleCode(c) { return ({ zh: 'zh-CN', 'zh-Hant': 'zh-TW', fil: 'tl', he: 'iw' })[c] || c; }

export const google = {
  name: 'google',
  label: 'Google',
  async batch(items, target) {
    const body = new URLSearchParams();
    items.forEach(function (it) { body.append('q', it.text); });
    const res = await fetch(GOOGLE_URL + encodeURIComponent(googleCode(target)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body,
      credentials: 'omit',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    if (!res.ok) throw new Error('google ' + res.status);
    let d = await res.json();
    if (typeof d === 'string') d = [d];
    if (!Array.isArray(d) || d.length !== items.length) {
      // One q with a fixed source can come back unwrapped: ["text","es"].
      if (items.length === 1 && Array.isArray(d) && typeof d[0] === 'string') d = [d];
      else throw new Error('google empty');
    }
    return d.map(function (x) {
      if (typeof x === 'string') return { text: x, src: '' };
      if (Array.isArray(x) && typeof x[0] === 'string') return { text: x[0], src: normLang(x[1] || '') };
      return { text: '', src: '' };
    });
  }
};

function timeout(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

/* Runs fn over items, `n` at a time; resolves to results in order. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function w() { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

/* Our own Worker (stumble-worker POST /translate, Workers AI m2m100, capped
   at the free daily allowance). m2m100 needs the source language, so lines
   the detector could not place are left to the next provider. */
const M2M = new Set(('af am ar az be bg bn bs ca cs cy da de el en es et fa fi fr ga gl gu he hi hr hu hy id is it ja ' +
  'jv ka kk km kn ko lo lt lv mk ml mn mr ms my ne nl no pa pl ps pt ro ru sd si sk sl so sq sr sv sw ta th tl tr ' +
  'uk ur uz vi zh fil zh-Hant').split(' '));
export function createWorkerProvider(base) {
  return {
    name: 'server',
    label: 'our server',
    supports: function (j, target) { return !!j.src && M2M.has(j.src) && M2M.has(target) && j.src !== target; },
    async batch(items, target) {
      const res = await fetch(base() + '/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target, items: items.map(function (it, i) { return { id: String(i), text: it.text, src: it.src }; }) }),
        credentials: 'omit',
        signal: timeout(15000)
      });
      if (!res.ok) {
        let e = '';
        try { e = (await res.json()).error || ''; } catch (x) { /* not json */ }
        throw new Error('server ' + res.status + (e ? ' ' + e : ''));
      }
      const d = await res.json();
      const by = {};
      (d.items || []).forEach(function (x) { by[x.id] = x.text; });
      return items.map(function (it, i) { return { text: by[String(i)] || '', src: it.src }; });
    }
  };
}

/* MyMemory: one request per line, about 1 s each, 5,000 characters a day per
   IP. Poor on chat, so it sits near the end of the chain. */
export const mymemory = {
  name: 'mymemory',
  label: 'MyMemory',
  supports: function (j) { return j.text.length <= 480; },
  async batch(items, target) {
    let quota = false;
    const out = await pool(items, 3, async function (it) {
      if (quota) return { text: '', src: '' };
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(it.text) +
        '&langpair=' + encodeURIComponent((it.src || 'Autodetect') + '|' + target);
      try {
        const r = await fetch(url, { credentials: 'omit', signal: timeout(10000) });
        const d = await r.json();
        if (d.quotaFinished || d.responseStatus === 429 || d.responseStatus === '429') { quota = true; return { text: '', src: '' }; }
        const t = d.responseData && d.responseData.translatedText;
        if (!t || /^(MYMEMORY WARNING|PLEASE SELECT|INVALID)/i.test(t)) return { text: '', src: '' };
        return { text: t, src: it.src };
      } catch (e) { return { text: '', src: '' }; }
    });
    if (quota && !out.some(function (x) { return x.text; })) throw new Error('mymemory quota');
    return out;
  }
};

/* Lingva: a pool of public instances (plus one of your own), rotated when
   one fails. One request per line. An answer equal to the input counts as
   no answer (seen on short lines). */
export const LINGVA_POOL = ['https://lingva.ml', 'https://lingva.lunar.icu'];
export function createLingva(getCustom) {
  let start = 0;
  return {
    name: 'lingva',
    label: 'Lingva',
    supports: function (j) { return j.text.length <= 480; },
    async batch(items, target) {
      const custom = getCustom ? getCustom() : '';
      const list = (custom ? [custom] : []).concat(LINGVA_POOL);
      const tl = ({ zh: 'zh', 'zh-Hant': 'zh_HANT', fil: 'tl', he: 'iw' })[target] || target;
      let ok = 0;
      const out = await pool(items, 3, async function (it) {
        for (let k = 0; k < list.length; k++) {
          const host = list[(start + k) % list.length];
          try {
            const r = await fetch(host + '/api/v1/' + (it.src || 'auto') + '/' + tl + '/' + encodeURIComponent(it.text),
              { credentials: 'omit', signal: timeout(8000) });
            if (!r.ok) throw new Error('lingva ' + r.status);
            const d = await r.json();
            const t = d && d.translation;
            if (!t || t.trim().toLowerCase() === it.text.trim().toLowerCase()) return { text: '', src: '' };
            ok++;
            return { text: t, src: (d.info && normLang(d.info.detectedSource)) || it.src };
          } catch (e) { start = (start + 1) % list.length; }
        }
        return { text: '', src: '' };
      });
      if (!ok) throw new Error('lingva none');
      return out;
    }
  };
}

/* Cooldown wrapper: a provider that fails rests 10 s, doubling up to 5 min;
   a success resets it. */
export const COOLDOWN_MIN = 10000;
export const COOLDOWN_MAX = 5 * 60000;
export function withCooldown(p) {
  const w = Object.assign({}, p);
  w.fails = 0;
  w.until = 0;
  w.lastError = '';
  w.ready = function (now) { return (now || Date.now()) >= w.until; };
  w.onFailure = function (e) {
    w.fails++;
    w.lastError = (e && e.message) || 'failed';
    const budget = /budget|quota/.test(w.lastError);
    w.until = Date.now() + (budget ? COOLDOWN_MAX : Math.min(COOLDOWN_MIN * Math.pow(2, w.fails - 1), COOLDOWN_MAX));
  };
  w.onSuccess = function () { w.fails = 0; w.until = 0; w.lastError = ''; };
  return w;
}

/* The order to try cloud providers in: the viewer's enabled list, minus any
   cooling down, with the last one that worked moved to the front. */
export function chainOrder(providers, order, enabled, sticky, now) {
  const list = order.map(function (n) { return providers[n]; })
    .filter(function (p) { return p && enabled[p.name] !== false && p.ready(now); });
  const i = list.findIndex(function (p) { return p.name === sticky; });
  if (i > 0) list.unshift(list.splice(i, 1)[0]);
  return list;
}

/* ================= cache (memory LRU in front of IndexedDB) ================= */

export const CACHE_MAX = 2000;
export const CACHE_MS = 24 * 3600 * 1000;

export function createCache() {
  const mem = new Map();
  let dbP = null;

  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (resolve) {
      try {
        if (typeof indexedDB === 'undefined') { resolve(null); return; }
        const req = indexedDB.open('kct-cache', 1);
        req.onupgradeneeded = function () {
          const s = req.result.createObjectStore('tr');
          s.createIndex('t', 't');
        };
        req.onsuccess = function () { resolve(req.result); prune(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbP;
  }

  // Drop entries over 24 h old, then the oldest beyond 2,000.
  function prune(d) {
    try {
      const tx = d.transaction('tr', 'readwrite');
      const idx = tx.objectStore('tr').index('t');
      const cut = Date.now() - CACHE_MS;
      idx.openCursor(IDBKeyRange.upperBound(cut)).onsuccess = function (e) {
        const c = e.target.result; if (c) { c.delete(); c.continue(); }
      };
      const cnt = tx.objectStore('tr').count();
      cnt.onsuccess = function () {
        let extra = cnt.result - CACHE_MAX;
        if (extra <= 0) return;
        idx.openCursor().onsuccess = function (e) {
          const c = e.target.result; if (c && extra-- > 0) { c.delete(); c.continue(); }
        };
      };
    } catch (e) { /* best effort */ }
  }

  function k(text, target) { return target + '\u0001' + text.toLowerCase(); }

  function remember(key, v) {
    mem.delete(key);
    mem.set(key, v);
    if (mem.size > CACHE_MAX) mem.delete(mem.keys().next().value);
  }

  async function get(text, target) {
    const key = k(text, target);
    const m = mem.get(key);
    if (m) {
      if (Date.now() - m.t < CACHE_MS) { remember(key, m); return m; }
      mem.delete(key);
    }
    const d = await db();
    if (!d) return null;
    return new Promise(function (resolve) {
      try {
        const r = d.transaction('tr').objectStore('tr').get(key);
        r.onsuccess = function () {
          const v = r.result;
          if (v && Date.now() - v.t < CACHE_MS) { remember(key, v); resolve(v); } else resolve(null);
        };
        r.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  async function put(text, target, v) {
    const key = k(text, target);
    const val = { text: v.text, src: v.src || '', provider: v.provider, t: Date.now() };
    remember(key, val);
    const d = await db();
    if (!d) return;
    try { d.transaction('tr', 'readwrite').objectStore('tr').put(val, key); } catch (e) { /* quota */ }
  }

  async function count() {
    const d = await db();
    if (!d) return mem.size;
    return new Promise(function (resolve) {
      try {
        const r = d.transaction('tr').objectStore('tr').count();
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(mem.size); };
      } catch (e) { resolve(mem.size); }
    });
  }

  async function clear() {
    mem.clear();
    const d = await db();
    if (!d) return;
    try { d.transaction('tr', 'readwrite').objectStore('tr').clear(); } catch (e) { /* ignore */ }
  }

  return { get, put, clear, count };
}

/* ================= the engine: coalescer + provider chain ================= */

export const BATCH_WINDOW_MS = 120;
export const BATCH_MAX = 40;
export const MAX_IN_FLIGHT = 4;

/* opts:
     onDevice            createOnDevice()
     cloud()             -> array of cloud providers to try, in order
     consent()           -> 'yes' | 'no' | 'ask'
     askConsent()        -> Promise<boolean> (the one-time modal)
     onDownloadable(s,t) a pair could run on this device after a click
     onResult(job, res)  res = {text, src, provider} | {error}
   job = {id, text, src, target}. */
export function createEngine(opts) {
  const queue = [];
  let timer = 0, inflight = 0, paused = false, consentP = null;

  function enqueue(job) {
    queue.push(job);
    schedule();
  }

  function schedule() {
    if (paused || !queue.length) return;
    if (queue.length >= BATCH_MAX) { clearTimeout(timer); timer = 0; flush(); return; }
    if (!timer) timer = setTimeout(function () { timer = 0; flush(); }, BATCH_WINDOW_MS);
  }

  function flush() {
    while (!paused && queue.length && inflight < MAX_IN_FLIGHT) {
      const batch = queue.splice(0, BATCH_MAX);
      inflight++;
      run(batch).catch(function () { /* each job already answered */ }).then(function () {
        inflight--;
        schedule();
      });
    }
  }

  async function cloudAllowed() {
    const c = opts.consent();
    if (c === 'yes') return true;
    if (c === 'no') return false;
    if (!consentP) consentP = opts.askConsent().then(function (v) { consentP = null; return v; });
    return consentP;
  }

  async function run(batch) {
    const target = batch[0].target;
    const od = opts.onDevice;
    const mode = opts.mode ? opts.mode() : 'device-first';
    let rest = [];
    // 1. on this device, one line at a time (the model is sequential anyway)
    if (mode !== 'cloud-first') {
      for (let i = 0; i < batch.length; i++) {
        const j = batch[i];
        const st = j.src ? await od.prepare(j.src, target) : 'unavailable';
        if (st === 'downloadable' && opts.onDownloadable) opts.onDownloadable(j.src, target);
        if (st !== 'ready') { rest.push(j); continue; }
        try {
          const t = await od.translate(j.src, target, j.text);
          opts.onResult(j, { text: t, src: j.src, provider: 'device' });
        } catch (e) { rest.push(j); }
      }
    } else rest = batch.slice();
    if (!rest.length) return;
    if (mode === 'device-only') { rest.forEach(function (j) { opts.onResult(j, { error: 'on-device only' }); }); return; }
    // 2. the cloud, after the one-time question
    if (!(await cloudAllowed())) { rest.forEach(function (j) { opts.onResult(j, { error: 'cloud is off' }); }); return; }
    const providers = opts.cloud(target);
    let left = rest;
    for (let p = 0; p < providers.length && left.length; p++) {
      const prov = providers[p];
      // "Unsupported language" is not a failure: that provider just skips the line.
      const usable = prov.supports ? left.filter(function (j) { return prov.supports(j, target); }) : left;
      if (!usable.length) continue;
      if (opts.onCloudSend) opts.onCloudSend(usable.length, prov.name);
      try {
        const out = await prov.batch(usable, target);
        const failed = [];
        usable.forEach(function (j, i) {
          const r = out[i];
          if (r && r.text) opts.onResult(j, { text: r.text, src: r.src || j.src, provider: prov.name });
          else failed.push(j);
        });
        if (failed.length < usable.length) { if (prov.onSuccess) prov.onSuccess(); }
        else if (prov.onFailure) prov.onFailure(new Error(prov.name + ' empty'));
        left = left.filter(function (j) { return usable.indexOf(j) === -1; }).concat(failed);
      } catch (e) {
        if (prov.onFailure) prov.onFailure(e);
      }
    }
    // 3. on-device as a last resort in cloud-first mode
    if (mode === 'cloud-first' && left.length) {
      const still = [];
      for (let i = 0; i < left.length; i++) {
        const j = left[i];
        if (j.src && await od.prepare(j.src, target) === 'ready') {
          try { opts.onResult(j, { text: await od.translate(j.src, target, j.text), src: j.src, provider: 'device' }); continue; } catch (e) { /* fall */ }
        }
        still.push(j);
      }
      left = still;
    }
    left.forEach(function (j) { opts.onResult(j, { error: 'no provider answered' }); });
  }

  return {
    enqueue: enqueue,
    setPaused: function (p) { paused = p; if (!p) schedule(); },
    clear: function () { queue.length = 0; clearTimeout(timer); timer = 0; },
    pending: function () { return queue.length; }
  };
}
