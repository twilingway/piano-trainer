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
    const prefs = {
      enabled: true,
      language: "en",
      dictionarySize: 3000,
      accompaniment: true
    } as const;
    expect(saveWordTypingPrefs(prefs)).toBe(true);
    expect(loadWordTypingPrefs()).toEqual(prefs);
    expect(localStorage.getItem("computer-keyboard-prefs")).toBe("custom");
  });
  it("rejects invalid persisted values and tolerates unavailable storage", () => {
    localStorage.setItem(
      "word-typing-prefs-v1",
      JSON.stringify({ enabled: "true", language: "bad", dictionarySize: 20, accompaniment: 1 })
    );
    expect(loadWordTypingPrefs()).toEqual({
      enabled: false,
      language: "ru",
      dictionarySize: 1000,
      accompaniment: false
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(
      saveWordTypingPrefs({
        enabled: false,
        language: "ru",
        dictionarySize: 1000,
        accompaniment: false
      })
    ).toBe(false);
  });
});
