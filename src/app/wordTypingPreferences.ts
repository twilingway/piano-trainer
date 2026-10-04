import type { Language, Layout } from "../wordTyping/types";

export interface WordTypingPrefs {
  readonly enabled: boolean;
  readonly language: Language;
  /** The other hand plays itself under the typed line. */
  readonly accompaniment: boolean;
  /** A letter keeps one pitch for the whole song or only inside its word. */
  readonly layout: Layout;
}
const KEY = "word-typing-prefs-v1";
const DEFAULTS: WordTypingPrefs = {
  enabled: false,
  language: "ru",
  accompaniment: false,
  layout: "word"
};

export function loadWordTypingPrefs(): WordTypingPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const value = raw as Record<string, unknown>;
    return {
      enabled: value.enabled === true,
      language: value.language === "en" ? "en" : "ru",
      accompaniment: value.accompaniment === true,
      layout: value.layout === "song" ? "song" : "word"
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
