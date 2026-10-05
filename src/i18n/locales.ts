export const LOCALES = {
  ru: { name: "Русский", intl: "ru-RU" },
  en: { name: "English", intl: "en-US" }
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE = "ru" as const;
export type Messages = Readonly<Record<string, Readonly<Record<Exclude<Locale, "ru">, string>>>>;
export type MessageParams = Readonly<Record<string, string | number>>;

export function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && Object.hasOwn(LOCALES, value)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}
