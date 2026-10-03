import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBOARD_PREFS,
  effectiveBindings,
  isAssignableCode,
  parseKeyboardPrefs,
  presetBindings,
  type KeyboardPreset
} from "./keyboardLayouts";

// Acceptance table written independently of the implementation's numeric arrays.
const expected: Record<KeyboardPreset, string[]> = {
  extended_range: [
    "Q:71 W:72 E:74 R:76 T:77 Y:79 U:81 I:83 O:84 P:86",
    "A:53 S:55 D:57 F:59 G:60 H:62 J:64 K:65 L:67 Semicolon:69",
    "Z:36 X:38 C:40 V:41 B:43 N:45 M:47 Comma:48 Period:50 Slash:52"
  ],
  octave_layout: [
    "Q:60 W:62 E:64 R:65 T:67 Y:69 U:71 I:72 O:74 P:76",
    "A:48 S:50 D:52 F:53 G:55 H:57 J:59 K:60 L:62 Semicolon:64",
    "Z:36 X:38 C:40 V:41 B:43 N:45 M:47 Comma:48 Period:50 Slash:52"
  ],
  bass_chords: [
    "Q:48 W:50 E:52 R:53 T:55 Y:72 U:74 I:76 O:77 P:79",
    "A:41 S:43 D:45 F:47 G:48 H:65 J:67 K:69 L:71 Semicolon:72",
    "Z:36 X:38 C:40 V:41 B:43 N:60 M:62 Comma:64 Period:65 Slash:67"
  ]
};

describe("keyboard preset acceptance table", () => {
  for (const [preset, rows] of Object.entries(expected)) {
    for (const entry of rows.join(" ").split(" ")) {
      const [label = "", pitch = ""] = entry.split(":");
      const code = label.length === 1 ? `Key${label}` : label;
      it(`${preset}: ${code} plays MIDI ${pitch}`, () => {
        expect(presetBindings(preset as KeyboardPreset)[code]).toEqual({
          type: "note",
          pitch: Number(pitch)
        });
      });
    }
    it(`${preset} has exactly 30 note bindings and the default controls`, () => {
      const bindings = presetBindings(preset as KeyboardPreset);
      expect(Object.values(bindings).filter((binding) => binding.type === "note")).toHaveLength(30);
      expect(bindings.Space).toEqual({ type: "sustain" });
      expect(bindings.ArrowDown).toEqual({ type: "octaveDown" });
      expect(bindings.ArrowUp).toEqual({ type: "octaveUp" });
    });
  }
  it("uses octave layout by default and keeps extended range's 30 unique pitches", () => {
    expect(DEFAULT_KEYBOARD_PREFS.preset).toBe("octave_layout");
    const pitches = Object.values(presetBindings("extended_range"))
      .filter((binding) => binding.type === "note")
      .map((binding) => binding.pitch);
    expect(new Set(pitches).size).toBe(30);
  });
});

describe("keyboard preferences", () => {
  it("round trips separate per-preset assignments without leaking them", () => {
    const prefs = parseKeyboardPrefs(
      JSON.parse(
        JSON.stringify({
          version: 1,
          preset: "extended_range",
          overrides: {
            extended_range: { KeyG: { type: "note", pitch: 65 }, KeyQ: { type: "disabled" } },
            bass_chords: { Digit1: { type: "sustain" } }
          }
        })
      )
    );
    expect(effectiveBindings(prefs).KeyG).toEqual({ type: "note", pitch: 65 });
    expect(effectiveBindings(prefs).KeyQ).toEqual({ type: "disabled" });
    expect(effectiveBindings({ ...prefs, preset: "bass_chords" }).KeyG).toEqual({
      type: "note",
      pitch: 48
    });
    expect(effectiveBindings({ ...prefs, preset: "bass_chords" }).Digit1).toEqual({
      type: "sustain"
    });
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { version: 2, preset: "extended_range", overrides: {} },
    { version: 1, preset: "classic", overrides: {} },
    { version: 1, preset: "extended_range", overrides: { extended_range: [] } }
  ])("falls back safely for malformed preferences %j", (value) => {
    expect(parseKeyboardPrefs(value)).toEqual(DEFAULT_KEYBOARD_PREFS);
  });
  it.each([-1, 128, 60.5, "60", NaN])("rejects invalid MIDI pitch %s", (pitch) => {
    expect(
      parseKeyboardPrefs({
        version: 1,
        preset: "extended_range",
        overrides: {
          extended_range: { KeyG: { type: "note", pitch } }
        }
      })
    ).toEqual(DEFAULT_KEYBOARD_PREFS);
  });
  it.each([0, 127])("accepts MIDI endpoint %i", (pitch) => {
    const prefs = parseKeyboardPrefs({
      version: 1,
      preset: "extended_range",
      overrides: {
        extended_range: { KeyG: { type: "note", pitch } }
      }
    });
    expect(effectiveBindings(prefs).KeyG).toEqual({ type: "note", pitch });
  });
  it.each(["ShiftLeft", "AltRight", "ControlLeft", "MetaLeft", "Escape", "Unidentified", "KeyAA"])(
    "does not assign modifier or unsupported code %s",
    (code) => {
      expect(isAssignableCode(code)).toBe(false);
    }
  );
  it.each(["KeyG", "Digit0", "Numpad7", "NumpadEnter", "F12", "Space", "IntlBackslash"])(
    "allows captured physical code %s",
    (code) => {
      expect(isAssignableCode(code)).toBe(true);
    }
  );
});
