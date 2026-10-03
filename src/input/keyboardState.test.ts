import { describe, expect, it } from "vitest";
import { presetBindings, type KeyboardBindings } from "./keyboardLayouts";
import { KeyboardState } from "./keyboardState";

const natural = { shift: false, alt: false };

describe("physical keyboard hold ownership", () => {
  it.each([
    ["extended_range", "KeyQ", true, false, 72],
    ["extended_range", "KeyG", false, true, 59],
    ["bass_chords", "KeyN", true, true, 60],
    ["bass_chords", "Comma", false, true, 63]
  ] as const)(
    "%s %s applies modifiers and releases its attacked pitch",
    (preset, code, shift, alt, pitch) => {
      const state = new KeyboardState();
      expect(state.press(code, presetBindings(preset), { shift, alt })).toEqual([
        { type: "down", pitch }
      ]);
      expect(state.release(code)).toEqual([{ type: "up", pitch }]);
      expect(state.release(code)).toEqual([]);
    }
  );

  it("keeps a shared pitch until the final physical key is released", () => {
    const state = new KeyboardState();
    const bindings = presetBindings("octave_layout");
    expect(state.press("KeyA", bindings, natural)).toEqual([{ type: "down", pitch: 48 }]);
    expect(state.press("Comma", bindings, natural)).toEqual([]);
    expect(state.release("KeyA")).toEqual([]);
    expect(state.has("Comma")).toBe(true);
    expect(state.release("Comma")).toEqual([{ type: "up", pitch: 48 }]);
  });

  it("ignores autorepeat and retains the pitch if modifiers or bindings change", () => {
    const state = new KeyboardState();
    expect(
      state.press("KeyG", presetBindings("extended_range"), { shift: true, alt: false })
    ).toEqual([{ type: "down", pitch: 61 }]);
    expect(state.press("KeyG", presetBindings("bass_chords"), natural)).toEqual([]);
    expect(state.release("KeyG")).toEqual([{ type: "up", pitch: 61 }]);
  });

  it("moves only subsequent attacks by an octave once per physical press", () => {
    const state = new KeyboardState();
    const bindings = presetBindings("extended_range");
    state.press("KeyG", bindings, natural);
    state.press("ArrowUp", bindings, natural);
    state.press("ArrowUp", bindings, natural);
    expect(state.press("KeyH", bindings, natural)).toEqual([{ type: "down", pitch: 74 }]);
    expect(state.release("KeyG")).toEqual([{ type: "up", pitch: 60 }]);
    state.release("ArrowUp");
    state.press("ArrowDown", bindings, natural);
    expect(state.press("KeyJ", bindings, natural)).toEqual([{ type: "down", pitch: 64 }]);
  });

  it.each([
    [0, false, true],
    [127, true, false]
  ] as const)("silences pitches outside MIDI range at %i", (pitch, shift, alt) => {
    const state = new KeyboardState();
    const bindings: KeyboardBindings = { KeyA: { type: "note", pitch } };
    expect(state.press("KeyA", bindings, { shift, alt })).toEqual([]);
    expect(state.has("KeyA")).toBe(false);
    expect(state.press("KeyA", bindings, natural)).toEqual([{ type: "down", pitch }]);
  });

  it("reference-counts pedals and clears unique notes, pedal and octave", () => {
    const state = new KeyboardState();
    const bindings: KeyboardBindings = {
      ...presetBindings("octave_layout"),
      Digit1: { type: "sustain" }
    };
    expect(state.press("Space", bindings, natural)).toEqual([{ type: "pedal", down: true }]);
    expect(state.press("Digit1", bindings, natural)).toEqual([]);
    expect(state.release("Space")).toEqual([]);
    state.press("KeyA", bindings, natural);
    state.press("Comma", bindings, natural);
    state.press("ArrowUp", bindings, natural);
    expect(state.clear()).toEqual([
      { type: "up", pitch: 48 },
      { type: "pedal", down: false }
    ]);
    expect(state.clear()).toEqual([]);
    expect(state.release("Comma")).toEqual([]);
    expect(state.press("KeyA", bindings, natural)).toEqual([{ type: "down", pitch: 48 }]);
  });

  it("ignores disabled and unassigned keys", () => {
    const state = new KeyboardState();
    expect(state.press("KeyA", { KeyA: { type: "disabled" } }, natural)).toEqual([]);
    expect(state.press("KeyB", {}, natural)).toEqual([]);
    expect(state.clear()).toEqual([]);
  });
});
