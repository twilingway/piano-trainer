import { describe, expect, it } from "vitest";
import { createHarmonyToneMaterial, validHarmonyToneRecipe } from "./harmonyTone";

describe("tone lesson material recipe", () => {
  it("produces actual white whole tones and semitones, including E–F or B–C", () => {
    const intervals = new Set<number>();
    const semitoneRoots = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const material = createHarmonyToneMaterial(seed, "white", 61);
      const first = material.notes[0],
        second = material.notes[1];
      if (!first || !second) throw new Error("Missing tone pair");
      expect(material.notes.every((note) => [0, 2, 4, 5, 7, 9, 11].includes(note.pitch % 12))).toBe(
        true
      );
      expect(second.pitch - first.pitch).toBe(material.interval);
      expect(validHarmonyToneRecipe(material.toneRecipe, material.notes)).toBe(true);
      expect(createHarmonyToneMaterial(seed, "white", 72)).toEqual(material);
      intervals.add(material.interval);
      if (material.interval === 1) semitoneRoots.add(material.toneRecipe.root % 12);
    }
    expect(intervals).toEqual(new Set([1, 2]));
    expect(semitoneRoots).toEqual(new Set([4, 11]));
  });
  it("keeps a selected chromatic root and rejects a misleading or unknown recipe", () => {
    const { notes, toneRecipe } = createHarmonyToneMaterial(42, "all", 61);
    expect(notes[0]?.pitch).toBe(61);
    expect(validHarmonyToneRecipe(toneRecipe, notes)).toBe(true);
    for (const patch of [
      { version: 2 },
      { root: 60 },
      { pitchSet: "white" },
      { notationFifths: -3 },
      { extra: true }
    ])
      expect(validHarmonyToneRecipe({ ...toneRecipe, ...patch }, notes)).toBe(false);
  });
});
