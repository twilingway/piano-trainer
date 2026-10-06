import { resolveLocale } from "../i18n/locales";
import type { Locale } from "../i18n/locales";
import { DEFAULT_INTERFACE_LOCALE, selectInterfaceLocale } from "../i18n/interfaceLocale";
import { siteLocaleFromPath } from "../i18n/siteMetadata";
import { updateSiteMetadata } from "./siteMetadata";

export const LANGUAGE_STORAGE_KEY = "interface-language-v1";

function readPagePath(): string {
  try {
    return window.location.pathname;
  } catch {
    return "/";
  }
}

export function readBrowserLanguage(): string | undefined {
  try {
    return navigator.language || navigator.languages[0];
  } catch {
    return undefined;
  }
}

export function loadInterfaceLanguage(
  storage: Pick<Storage, "getItem">,
  browserLanguage: unknown = readBrowserLanguage(),
  pathname: string = readPagePath()
): Locale {
  const automaticLanguage = siteLocaleFromPath(pathname) ?? browserLanguage;
  try {
    return selectInterfaceLocale(storage.getItem(LANGUAGE_STORAGE_KEY), automaticLanguage);
  } catch {
    return selectInterfaceLocale(null, automaticLanguage);
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
  locale = selectInterfaceLocale(null, siteLocaleFromPath(readPagePath()) ?? readBrowserLanguage());
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
  updateSiteMetadata(document, locale, readPagePath());
}
