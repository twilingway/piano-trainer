// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadWordTypingPrefs, saveWordTypingPrefs } from "./wordTypingPreferences";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("separate word typing preferences", () => {
  it("persists language and dictionary independently of ordinary keyboard settings", () => {
    localStorage.setItem("computer-keyboard-prefs", "custom");
    expect(saveWordTypingPrefs({ enabled: true, language: "en", dictionarySize: 3000 })).toBe(true);
    expect(loadWordTypingPrefs()).toEqual({ enabled: true, language: "en", dictionarySize: 3000 });
    expect(localStorage.getItem("computer-keyboard-prefs")).toBe("custom");
  });
  it("rejects invalid persisted values and tolerates unavailable storage", () => {
    localStorage.setItem(
      "word-typing-prefs-v1",
      JSON.stringify({ enabled: "true", language: "bad", dictionarySize: 20 })
    );
    expect(loadWordTypingPrefs()).toEqual({ enabled: false, language: "ru", dictionarySize: 1000 });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveWordTypingPrefs({ enabled: false, language: "ru", dictionarySize: 1000 })).toBe(
      false
    );
  });
});
