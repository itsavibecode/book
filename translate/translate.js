/* Kick Translate - languages, and (from v0.3.0) the translation pipeline.
   No DOM access at import time: tools/selftest.mjs loads this file in Node. */
'use strict';

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
  if (/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(n) && n.length <= 3) return normLang(n);
  if (!Object.keys(NAME_TO_CODE).length) {
    TARGETS.concat(['ca', 'et', 'lv', 'fa', 'ur', 'sr', 'sw', 'af', 'ga', 'is', 'mk', 'sq', 'bs', 'az', 'ka', 'hy', 'kk', 'uz', 'mn', 'ne', 'si', 'km', 'lo', 'my', 'pa', 'gu', 'ml']).forEach(function (c) {
      NAME_TO_CODE[langName(c).toLowerCase()] = c;
    });
    NAME_TO_CODE.chinese = 'zh';
    NAME_TO_CODE.tagalog = 'fil';
    NAME_TO_CODE.norwegian = 'no';
    NAME_TO_CODE.persian = 'fa';
  }
  return NAME_TO_CODE[n] || '';
}
