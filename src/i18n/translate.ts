import { DEFAULT_LOCALE, LOCALES } from "./locales";
import type { Locale, MessageParams, Messages } from "./locales";

/** Pure translation: callers supply the locale and catalog, including outside React. */
export function translate(
  locale: Locale,
  messages: Messages,
  message: string,
  params: MessageParams = {}
): string {
  const template = locale === DEFAULT_LOCALE ? message : (messages[message]?.[locale] ?? message);
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : token
  );
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(LOCALES[locale].intl, options).format(value);
}

export function formatDate(
  locale: Locale,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat(LOCALES[locale].intl, options).format(value);
}
