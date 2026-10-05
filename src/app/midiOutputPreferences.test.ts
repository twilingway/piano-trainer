// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadMidiOutput, saveMidiOutput } from "./midiOutputPreferences";

beforeEach(() => {
  localStorage.clear();
});

describe("MIDI output storage", () => {
  it("keeps the chosen output and its name", () => {
    saveMidiOutput({ id: "a", name: "loopMIDI Port" });
    expect(loadMidiOutput()).toEqual({ id: "a", name: "loopMIDI Port" });
    saveMidiOutput(null);
    expect(loadMidiOutput()).toBeNull();
  });

  it.each(["{", JSON.stringify({ id: 3, name: "Piano" }), JSON.stringify("a")])(
    "falls back to none on %s",
    (stored) => {
      localStorage.setItem("midi-output-v1", stored);
      expect(loadMidiOutput()).toBeNull();
    }
  );
});
