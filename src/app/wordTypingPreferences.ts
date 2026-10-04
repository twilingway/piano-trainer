import type { Language } from "../wordTyping/types";

export interface WordTypingPrefs {
  readonly enabled: boolean;
  readonly language: Language;
  readonly dictionarySize: 1000 | 3000;
}
const KEY = "word-typing-prefs-v1";
const DEFAULTS: WordTypingPrefs = { enabled: false, language: "ru", dictionarySize: 1000 };

export function loadWordTypingPrefs(): WordTypingPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const value = raw as Record<string, unknown>;
    return {
      enabled: value.enabled === true,
      language: value.language === "en" ? "en" : "ru",
      dictionarySize: value.dictionarySize === 3000 ? 3000 : 1000
    };
  } catch {
    return DEFAULTS;
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
