import type { InputToken, Language } from "./types";

const EN_LETTERS = "qwertyuiopasdfghjklzxcvbnm";
const RU_LETTERS = "йцукенгшщзфывапролдячсмить";
const LETTER_CODES = Array.from(EN_LETTERS).map((letter) => `Key${letter.toUpperCase()}`);
const RU_EXTRA = [
  ["Backquote", "ё"],
  ["BracketLeft", "х"],
  ["BracketRight", "ъ"],
  ["Semicolon", "ж"],
  ["Quote", "э"],
  ["Comma", "б"],
  ["Period", "ю"]
] as const;
const TOP_ROW = [
  ["Backquote", "`"],
  ...Array.from("1234567890").map((digit) => [`Digit${digit}`, digit] as const),
  ["Minus", "-"],
  ["Equal", "="]
] as const;
const PUNCTUATION = [
  ["BracketLeft", "["],
  ["BracketRight", "]"],
  ["Backslash", "\\"],
  ["Semicolon", ";"],
  ["Quote", "'"],
  ["Comma", ","],
  ["Period", "."],
  ["Slash", "/"]
] as const;

export function inputTokenId(token: Pick<InputToken, "physicalKey" | "modifier">): string {
  return `${token.modifier}:${token.physicalKey}`;
}

export function languageTokens(language: Language): InputToken[] {
  const letters = language === "en" ? EN_LETTERS : RU_LETTERS;
  const tokens = Array.from(letters).map((display, index) => ({
    physicalKey: LETTER_CODES[index] ?? "",
    modifier: "none" as const,
    display
  }));
  if (language === "ru") {
    tokens.push(
      ...RU_EXTRA.map(([physicalKey, display]) => ({
        physicalKey,
        modifier: "none" as const,
        display
      }))
    );
  }
  return tokens;
}

/** What a key types without a modifier in `language`: its letter, else its digit or sign. */
export function keyDisplay(physicalKey: string, language: Language): string {
  return (
    languageTokens(language).find((token) => token.physicalKey === physicalKey)?.display ??
    [...TOP_ROW, ...PUNCTUATION].find(([code]) => code === physicalKey)?.[1] ??
    ""
  );
}

/** Cheap unused assignments are exhausted before any modified token is allocated. */
export function tokenPool(language: Language): InputToken[] {
  const letters = languageTokens(language);
  const used = new Set(letters.map((token) => token.physicalKey));
  const top = TOP_ROW.filter(([physicalKey]) => !used.has(physicalKey)).map(
    ([physicalKey, display]) => ({
      physicalKey,
      modifier: "none" as const,
      display
    })
  );
  const printable = [
    ...letters,
    ...TOP_ROW.map(([physicalKey, display]) => ({ physicalKey, display })),
    ...PUNCTUATION.map(([physicalKey, display]) => ({ physicalKey, display }))
  ];
  const unique = [...new Map(printable.map((token) => [token.physicalKey, token])).values()];
  const modified = (["shift", "alt"] as const).flatMap((modifier) =>
    unique.map((token) => ({
      physicalKey: token.physicalKey,
      modifier,
      display: `${modifier === "shift" ? "Shift" : "Alt"}+${token.display}`
    }))
  );
  return [...letters, ...top, ...modified];
}
