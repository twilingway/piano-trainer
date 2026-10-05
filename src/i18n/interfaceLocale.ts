import { LOCALES, type Locale } from "./locales";

export const DEFAULT_INTERFACE_LOCALE: Locale = "en";

/** A manual preference wins; otherwise use only the browser's primary language. */
export function selectInterfaceLocale(saved: unknown, browserLanguage: unknown): Locale {
  if (typeof saved === "string" && Object.hasOwn(LOCALES, saved)) return saved as Locale;
  return typeof browserLanguage === "string" && /^ru(?:-|$)/i.test(browserLanguage)
    ? "ru"
    : DEFAULT_INTERFACE_LOCALE;
}
