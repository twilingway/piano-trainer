import { DEFAULT_LOCALE, resolveLocale } from "../i18n/locales";
import type { Locale } from "../i18n/locales";

export const LANGUAGE_STORAGE_KEY = "interface-language-v1";

import { appMessages } from "../i18n/appMessages";
import { translate } from "../i18n/translate";

export function loadInterfaceLanguage(storage: Pick<Storage, "getItem">): Locale {
  try {
    return resolveLocale(storage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveInterfaceLanguage(storage: Pick<Storage, "setItem">, locale: Locale): boolean {
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

let locale: Locale = DEFAULT_LOCALE;
try {
  locale = loadInterfaceLanguage(localStorage);
} catch {
  // Some browsers deny even accessing localStorage.
}
const listeners = new Set<() => void>();

export function getInterfaceLanguage(): Locale {
  return locale;
}

export function subscribeInterfaceLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setInterfaceLanguage(next: Locale): void {
  locale = resolveLocale(next);
  try {
    saveInterfaceLanguage(localStorage, locale);
  } catch {
    // The in-memory choice remains usable when storage is unavailable.
  }
  updateDocumentLanguage();
  for (const listener of listeners) listener();
}

export function updateDocumentLanguage(): void {
  document.documentElement.lang = locale;
  document.title = translate(locale, appMessages, "Пианино-тренажёр");
}
