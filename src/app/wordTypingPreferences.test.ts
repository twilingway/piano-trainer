// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWordTypingPrefs,
  normalizeWordTypingPrefs,
  saveWordTypingPrefs,
  updateWordTypingPrefs
} from "./wordTypingPreferences";
import { setInterfaceLanguage } from "./interfaceLanguage";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  setInterfaceLanguage("en");
});
describe("separate word typing preferences", () => {
  it("persists language and dictionary independently of ordinary keyboard settings", () => {
    localStorage.setItem("computer-keyboard-prefs", "custom");
    const prefs = {
      enabled: true,
      language: "en",
      languageManuallyChosen: true,
      accompaniment: true,
      layout: "song"
    } as const;
    expect(saveWordTypingPrefs(prefs)).toBe(true);
    expect(loadWordTypingPrefs()).toEqual(prefs);
    expect(localStorage.getItem("computer-keyboard-prefs")).toBe("custom");
  });
  it("reads settings saved before the layout choice as the per-word layout", () => {
    localStorage.setItem(
      "word-typing-prefs-v1",
      JSON.stringify({ enabled: true, language: "en", accompaniment: true })
    );
    expect(loadWordTypingPrefs()).toEqual({
      enabled: true,
      language: "en",
      languageManuallyChosen: true,
      accompaniment: true,
      layout: "word"
    });
  });
  it("rejects invalid persisted values and tolerates unavailable storage", () => {
    localStorage.setItem(
      "word-typing-prefs-v1",
      JSON.stringify({ enabled: "true", language: "bad", dictionarySize: 3000, accompaniment: 1 })
    );
    expect(loadWordTypingPrefs()).toEqual({
      enabled: false,
      language: "en",
      languageManuallyChosen: false,
      accompaniment: true,
      layout: "word"
    });
    const save = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(
      saveWordTypingPrefs({
        enabled: false,
        language: "ru",
        languageManuallyChosen: true,
        accompaniment: false,
        layout: "word"
      })
    ).toBe(false);
    save.mockRestore();
  });

  it("uses the interface locale for missing or automatic preferences", () => {
    for (const locale of ["en", "ru"] as const) {
      expect(normalizeWordTypingPrefs(null, locale).language).toBe(locale);
      expect(
        normalizeWordTypingPrefs({ language: "ru", languageManuallyChosen: false }, locale).language
      ).toBe(locale);
    }
  });

  it("enables accompaniment by default and preserves either saved boolean choice", () => {
    expect(normalizeWordTypingPrefs(null, "en").accompaniment).toBe(true);
    expect(normalizeWordTypingPrefs({}, "ru").accompaniment).toBe(true);
    for (const accompaniment of [false, true]) {
      const prefs = normalizeWordTypingPrefs({ accompaniment }, "en");
      expect(prefs.accompaniment).toBe(accompaniment);
      expect(saveWordTypingPrefs(prefs)).toBe(true);
      expect(loadWordTypingPrefs().accompaniment).toBe(accompaniment);
    }
  });

  it("migrates old Russian to automatic while preserving layout and accompaniment", () => {
    localStorage.setItem(
      "word-typing-prefs-v1",
      JSON.stringify({ enabled: true, language: "ru", layout: "song", accompaniment: true })
    );
    expect(loadWordTypingPrefs()).toEqual({
      enabled: true,
      language: "en",
      languageManuallyChosen: false,
      layout: "song",
      accompaniment: true
    });
  });

  it("only a text-language change becomes manual and survives reload", () => {
    let prefs = normalizeWordTypingPrefs(null, "en");
    prefs = updateWordTypingPrefs(prefs, { enabled: true, accompaniment: true, layout: "song" });
    expect(prefs.languageManuallyChosen).toBe(false);
    saveWordTypingPrefs(prefs);
    setInterfaceLanguage("ru");
    expect(loadWordTypingPrefs().language).toBe("ru");
    prefs = updateWordTypingPrefs(prefs, { language: "ru" });
    expect(prefs.languageManuallyChosen).toBe(true);
    saveWordTypingPrefs(prefs);
    setInterfaceLanguage("en");
    expect(loadWordTypingPrefs().language).toBe("ru");
    expect(updateWordTypingPrefs(prefs, { enabled: false }).languageManuallyChosen).toBe(true);
  });

  it("rejects broken JSON and denied reads without losing the interface fallback", () => {
    localStorage.setItem("word-typing-prefs-v1", "broken");
    expect(loadWordTypingPrefs().language).toBe("en");
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadWordTypingPrefs()).toEqual(normalizeWordTypingPrefs(null, "en"));
  });
});
