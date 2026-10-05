import type { Language, Layout } from "../wordTyping/types";
import { getInterfaceLanguage } from "./interfaceLanguage";

export interface WordTypingPrefs {
  readonly enabled: boolean;
  readonly language: Language;
  readonly languageManuallyChosen: boolean;
  /** The other hand plays itself under the typed line. */
  readonly accompaniment: boolean;
  /** A letter keeps one pitch for the whole song or only inside its word. */
  readonly layout: Layout;
}
const KEY = "word-typing-prefs-v1";
const DEFAULTS: WordTypingPrefs = {
  enabled: false,
  language: "ru",
  languageManuallyChosen: false,
  accompaniment: false,
  layout: "word"
};

export function normalizeWordTypingPrefs(
  raw: unknown,
  interfaceLanguage: Language
): WordTypingPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS, language: interfaceLanguage };
  const value = raw as Record<string, unknown>;
  const validLanguage = value.language === "ru" || value.language === "en";
  const languageManuallyChosen =
    validLanguage &&
    (typeof value.languageManuallyChosen === "boolean"
      ? value.languageManuallyChosen
      : value.language === "en");
  return {
    enabled: value.enabled === true,
    language: languageManuallyChosen ? (value.language as Language) : interfaceLanguage,
    languageManuallyChosen,
    accompaniment: value.accompaniment === true,
    layout: value.layout === "song" ? "song" : "word"
  };
}

export function updateWordTypingPrefs(
  prefs: WordTypingPrefs,
  change: Partial<Omit<WordTypingPrefs, "languageManuallyChosen">>
): WordTypingPrefs {
  return {
    ...prefs,
    ...change,
    languageManuallyChosen: change.language !== undefined || prefs.languageManuallyChosen
  };
}

export function loadWordTypingPrefs(): WordTypingPrefs {
  const interfaceLanguage = getInterfaceLanguage();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return normalizeWordTypingPrefs(raw, interfaceLanguage);
  } catch {
    return normalizeWordTypingPrefs(null, interfaceLanguage);
  }
}

export function saveWordTypingPrefs(prefs: WordTypingPrefs): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
