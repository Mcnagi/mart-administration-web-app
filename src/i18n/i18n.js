// Framework-free i18n core: current-language state + translate function,
// usable both from React (via ../context/LanguageContext) and from plain
// service modules that can't call hooks but still throw user-facing errors.
import { translations, LANGUAGES } from './translations';

const STORAGE_KEY = 'emart-lang';

function detectInitialLanguage() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored && translations[stored]) return stored;
  return 'en';
}

let currentLanguage = detectInitialLanguage();
const listeners = new Set();

export { LANGUAGES };

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(lang) {
  if (!translations[lang] || lang === currentLanguage) return;
  currentLanguage = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  listeners.forEach((listener) => listener(currentLanguage));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function resolve(dict, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), dict);
}

export function t(key, vars) {
  const template = resolve(translations[currentLanguage], key) ?? resolve(translations.en, key) ?? key;
  if (typeof template !== 'string' || !vars) return template;
  return Object.keys(vars).reduce((str, k) => str.replaceAll(`{${k}}`, vars[k]), template);
}
