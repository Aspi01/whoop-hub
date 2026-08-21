import en from './en.js';
import ru from './ru.js';
import uk from './uk.js';

export const SUPPORTED_LOCALES = ['en', 'ru', 'uk'];
export const DEFAULT_LOCALE = 'ru';

export const dictionaries = {
  en,
  ru,
  uk
};

export function detectDefaultLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const saved = localStorage.getItem('app_locale');
  if (saved && SUPPORTED_LOCALES.includes(saved)) {
    return saved;
  }

  const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  if (navLang.startsWith('uk')) return 'uk';
  if (navLang.startsWith('ru')) return 'ru';
  if (navLang.startsWith('en')) return 'en';

  return DEFAULT_LOCALE;
}

export function getLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const saved = localStorage.getItem('app_locale');
  return (saved && SUPPORTED_LOCALES.includes(saved)) ? saved : detectDefaultLocale();
}

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  if (typeof window !== 'undefined') {
    localStorage.setItem('app_locale', locale);
    window.dispatchEvent(new CustomEvent('app_locale_changed', { detail: locale }));
  }
}

export function t(key, params = {}, locale = getLocale()) {
  const dict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE] || {};
  let str = dict[key] || dictionaries[DEFAULT_LOCALE]?.[key] || key;

  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`{${k}}`, 'g'), String(v));
    }
  }

  return str;
}
