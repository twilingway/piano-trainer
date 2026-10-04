import type { DictionarySize, Language } from "../wordTyping/types";

export interface WordTypingPrefs {
  readonly enabled: boolean;
  readonly language: Language;
  readonly dictionarySize: DictionarySize;
  /** The other hand plays itself under the typed line. */
  readonly accompaniment: boolean;
}
const KEY = "word-typing-prefs-v1";
const DEFAULTS: WordTypingPrefs = {
  enabled: false,
  language: "ru",
  dictionarySize: 1000,
  accompaniment: false
};

export function loadWordTypingPrefs(): WordTypingPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const value = raw as Record<string, unknown>;
    return {
      enabled: value.enabled === true,
      language: value.language === "en" ? "en" : "ru",
      dictionarySize:
        value.dictionarySize === 3000 || value.dictionarySize === 10000
          ? value.dictionarySize
          : 1000,
      accompaniment: value.accompaniment === true
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
