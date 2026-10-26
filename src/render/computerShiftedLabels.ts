/** Physical keyboard legends, independent of the interface language. */
const SHIFTED: Readonly<Record<"ru" | "en", Readonly<Record<string, string>>>> = {
  en: { Backquote: "~", Digit1: "!", Digit2: "@", Digit3: "#", Digit4: "$", Digit5: "%" },
  ru: { Backquote: "Ё", Digit1: "!", Digit2: '"', Digit3: "№", Digit4: ";", Digit5: "%" }
};
const COMMON: Readonly<Record<string, string>> = {
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Digit0: ")",
  Minus: "_",
  Equal: "+"
};
const RUSSIAN: Readonly<Record<string, string>> = { Digit6: ":", Digit7: "?" };

export function shiftedKeyLabel(language: "ru" | "en", code: string): string | undefined {
  return (language === "ru" ? RUSSIAN[code] : undefined) ?? SHIFTED[language][code] ?? COMMON[code];
}
