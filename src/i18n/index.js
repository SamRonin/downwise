/**
 * Runtime i18n engine.
 * chrome.i18n cannot switch language at runtime, so DownWise ships its own
 * dictionaries (fa = default & RTL, en = LTR) plus DOM-localization helpers.
 */
import { fa } from './fa.js';
import { en } from './en.js';

export const DICTS = { fa, en };
export const LANGUAGES = ['fa', 'en'];
export const DEFAULT_LANG = 'fa';

export function isLang(value) {
  return LANGUAGES.includes(value);
}

export function getDict(lang) {
  return DICTS[lang] || DICTS[DEFAULT_LANG];
}

export function dirOf(lang) {
  return getDict(lang).meta.dir;
}

/** Translate a dot-path key with {param} interpolation. Falls back fa ⇄ en. */
export function t(lang, path, params) {
  const dict = getDict(lang);
  const alt = getDict(lang === 'fa' ? 'en' : 'fa');
  const resolve = (root) =>
    path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), root);
  let value = resolve(dict);
  if (typeof value !== 'string') value = resolve(alt);
  if (typeof value !== 'string') return path;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

/** Set <html lang dir data-lang> so CSS switches fonts + RTL/LTR instantly. */
export function applyLanguage(doc, lang) {
  const d = getDict(lang);
  doc.documentElement.lang = d.meta.code;
  doc.documentElement.dir = d.meta.dir;
  doc.documentElement.dataset.lang = d.meta.code;
}

/**
 * Localize all elements carrying data-i18n / data-i18n-attrs.
 *   <h2 data-i18n="popup.historySection"></h2>
 *   <button data-i18n-attrs="title:popup.retry;aria-label:popup.retry"></button>
 */
export function localizeDom(root, lang) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(lang, el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-attrs]').forEach((el) => {
    const spec = el.getAttribute('data-i18n-attrs') || '';
    for (const pair of spec.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s?.trim());
      if (attr && key) el.setAttribute(attr, t(lang, key));
    }
  });
}

/** Localize + apply language in one call for extension pages. */
export function setupPage(doc, lang) {
  applyLanguage(doc, lang);
  localizeDom(doc, lang);
}
