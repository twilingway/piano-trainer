import { resolveLocale } from "../i18n/locales";
import type { Locale } from "../i18n/locales";
import { DEFAULT_INTERFACE_LOCALE, selectInterfaceLocale } from "../i18n/interfaceLocale";

export const LANGUAGE_STORAGE_KEY = "interface-language-v1";

import { appMessages } from "../i18n/appMessages";
import { translate } from "../i18n/translate";

export function readBrowserLanguage(): string | undefined {
  try {
    return navigator.language || navigator.languages[0];
  } catch {
    return undefined;
  }
}

export function loadInterfaceLanguage(
  storage: Pick<Storage, "getItem">,
  browserLanguage: unknown = readBrowserLanguage()
): Locale {
  try {
    return selectInterfaceLocale(storage.getItem(LANGUAGE_STORAGE_KEY), browserLanguage);
  } catch {
    return selectInterfaceLocale(null, browserLanguage);
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

let locale: Locale = DEFAULT_INTERFACE_LOCALE;
try {
  locale = loadInterfaceLanguage(localStorage);
} catch {
  // Some browsers deny even accessing localStorage.
  locale = selectInterfaceLocale(null, readBrowserLanguage());
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
  document.title = translate(locale, appMessages, "Нотопад");
}
