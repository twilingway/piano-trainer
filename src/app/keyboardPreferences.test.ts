// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBOARD_PREFS, type KeyboardPrefs } from "../input/keyboardLayouts";
import { loadKeyboardPrefs, saveKeyboardPrefs } from "./keyboardPreferences";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("keyboard preference storage", () => {
  it("persists active preset and independently edited mappings", () => {
    const prefs: KeyboardPrefs = {
      version: 1,
      preset: "bass_chords",
      overrides: {
        extended_range: { KeyG: { type: "note", pitch: 65 } },
        bass_chords: { Digit1: { type: "sustain" }, KeyQ: { type: "disabled" } }
      }
    };
    expect(saveKeyboardPrefs(prefs)).toBe(true);
    expect(loadKeyboardPrefs()).toEqual(prefs);
  });

  it.each([
    null,
    "{",
    "null",
    "[]",
    "42",
    '{"version":1,"preset":"obsolete","overrides":{}}',
    '{"version":1,"preset":"extended_range","overrides":{"extended_range":{"KeyG":{"type":"note","pitch":128}}}}'
  ])("falls back to default for absent or corrupt storage %s", (raw) => {
    if (raw !== null) localStorage.setItem("computer-keyboard-v1", raw);
    expect(loadKeyboardPrefs()).toEqual(DEFAULT_KEYBOARD_PREFS);
  });

  it("survives denied storage reads", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      }
    });
    expect(loadKeyboardPrefs()).toEqual(DEFAULT_KEYBOARD_PREFS);
  });

  it("reports a failed storage write without replacing the last saved value", () => {
    expect(saveKeyboardPrefs(DEFAULT_KEYBOARD_PREFS)).toBe(true);
    const originalStorage = localStorage;
    vi.stubGlobal("localStorage", {
      getItem: originalStorage.getItem.bind(originalStorage),
      setItem: () => {
        throw new Error("quota");
      }
    });
    expect(saveKeyboardPrefs({ ...DEFAULT_KEYBOARD_PREFS, preset: "bass_chords" })).toBe(false);
    expect(loadKeyboardPrefs()).toEqual(DEFAULT_KEYBOARD_PREFS);
  });
});
