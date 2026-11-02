import { describe, expect, it, vi } from "vitest";
import { musicFingerprint } from "./material";
import { findNewMusicMaterial } from "./novelty";
import { generateSightReadingMaterial } from "./sightReading";
import type { MusicNote } from "./types";

const note = (pitch: number): MusicNote => ({
  pitch,
  startBeat: 0,
  durationBeats: 1,
  hand: "right"
});

describe("musical novelty candidate search", () => {
  it("rejects familiar music despite different ids and returns the first new musical plan", () => {
    const result = findNewMusicMaterial(
      0,
      (seed) => ({ id: `other-${String(seed)}`, notes: [note(seed < 2 ? 60 : 62)] }),
      new Set([musicFingerprint([note(60)])])
    );
    expect(result).toMatchObject({
      status: "found",
      seed: 2,
      checked: 3,
      material: { id: "other-2" }
    });
  });

  it("searches at most4096 candidates without XML parsing or changing a previous exercise", () => {
    const original = generateSightReadingMaterial({ seed: 9, level: "steps", purpose: "training" });
    const copy = JSON.stringify(original);
    const create = vi.fn(() => original);
    vi.stubGlobal("DOMParser", undefined);
    try {
      const result = findNewMusicMaterial(0, create, new Set([musicFingerprint(original.notes)]));
      expect(result).toEqual({ status: "exhausted", checked: 4096 });
      expect(create).toHaveBeenCalledTimes(4096);
      expect(JSON.stringify(original)).toBe(copy);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("normalizes and wraps seeds while preserving a deterministic plan", () => {
    const result = findNewMusicMaterial(
      0xffffffff,
      (seed) => ({ notes: [note(seed === 0xffffffff ? 60 : 62)] }),
      new Set([musicFingerprint([note(60)])])
    );
    expect(result).toMatchObject({ status: "found", seed: 0, checked: 2 });
    const create = (seed: number) =>
      generateSightReadingMaterial({ seed, level: "two-hands", purpose: "control" });
    const known = new Set([musicFingerprint(create(42).notes)]);
    expect(findNewMusicMaterial(42, create, known)).toEqual(
      findNewMusicMaterial(42, create, known)
    );
  });

  it.each([0, -1, 4097, NaN, 2.5])("rejects invalid candidate budget %s", (max) => {
    expect(() => findNewMusicMaterial(0, () => ({ notes: [note(60)] }), new Set(), max)).toThrow(
      RangeError
    );
  });
});
