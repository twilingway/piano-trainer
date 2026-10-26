// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { compareDictation, generateDictation, generateDictationMaterial } from "./dictation";
import type { DictationExercise, DictationReplyNote } from "./dictation";
import { createMusicExercise } from "./material";

function phrase(startMode: DictationExercise["startMode"] = "known"): DictationExercise {
  return {
    ...createMusicExercise({
      id: "phrase",
      seed: 1,
      bpm: 120,
      notes: [60, 62, 64].map((pitch, index) => ({
        pitch,
        startBeat: index,
        durationBeats: 1,
        hand: "right"
      }))
    }),
    startMode,
    level: 1
  };
}
function answer(pitches = [60, 62, 64], delay = 0): DictationReplyNote[] {
  return pitches.map((pitch, index) => ({ pitch, startBeat: delay + index, durationBeats: 1 }));
}
const plan = {
  seed: 42,
  length: 3,
  studiedPitches: [60, 62, 64],
  studiedDurations: [0.5, 1, 2],
  startMode: "known" as const,
  bpm: 100
};

describe("seeded melodic dictation", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])("reproduces %i studied notes and rhythms", (length) => {
    const first = generateDictation({ ...plan, length });
    const second = generateDictation({ ...plan, length });
    expect(first).toEqual(second);
    expect(first.notes).toHaveLength(length);
    expect(first.song.notes).toHaveLength(length);
    expect(first.notes.every((note) => plan.studiedPitches.includes(note.pitch))).toBe(true);
    expect(first.notes.every((note) => plan.studiedDurations.includes(note.durationBeats))).toBe(
      true
    );
    expect(first.notes[0]?.startBeat).toBe(0);
  });
  it("searches 4096 candidates without DOMParser or constructing a score", () => {
    const expected = generateDictation(plan);
    vi.stubGlobal("DOMParser", undefined);
    try {
      expect(generateDictationMaterial(plan).notes).toEqual(expected.notes);
      for (let seed = 0; seed < 4096; seed++) {
        const candidate = generateDictationMaterial({ ...plan, seed, length: 8 });
        expect(candidate.notes).toHaveLength(8);
        expect(candidate.generatorVersion).toBe(1);
        expect("musicXml" in candidate).toBe(false);
        expect("song" in candidate).toBe(false);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("changes material with the seed without consulting a result history", () => {
    expect(generateDictation(plan).fingerprint).not.toBe(
      generateDictation({ ...plan, seed: 43 }).fingerprint
    );
  });
  it.each([0, 1, 9, 2.5, NaN, Infinity])("rejects unsupported length %s", (length) => {
    expect(() => generateDictation({ ...plan, length })).toThrow(RangeError);
  });
  it("rejects unstudied/invalid material plans", () => {
    expect(() => generateDictation({ ...plan, studiedPitches: [] })).toThrow();
    expect(() => generateDictation({ ...plan, studiedPitches: [128] })).toThrow();
    expect(() => generateDictation({ ...plan, studiedDurations: [] })).toThrow();
    expect(() => generateDictation({ ...plan, studiedDurations: [0.3] })).toThrow();
    expect(() => generateDictation({ ...plan, level: 0 })).toThrow();
    expect(() => generateDictation({ ...plan, generatorVersion: 2 })).toThrow();
  });
});

describe("dictation comparison", () => {
  it("permits full transposition only with a relative start", () => {
    const relative = compareDictation(phrase("relative"), answer([67, 69, 71]));
    expect(relative.correct).toBe(true);
    expect(relative.transposition).toBe(7);
    expect(relative.positionalPitchAccuracy).toBe(1);
    expect(compareDictation(phrase(), answer([67, 69, 71])).positionalPitchAccuracy).toBe(0);
    expect(compareDictation(phrase(), answer([67, 69, 71])).correct).toBe(false);
  });
  it("separates pitch content from positional pitch and order", () => {
    const result = compareDictation(phrase(), answer([60, 64, 62]));
    expect(result.pitchContentAccuracy).toBe(1);
    expect(result.positionalPitchAccuracy).toBeCloseTo(1 / 3);
    expect(result.orderAccuracy).toBeCloseTo(2 / 3);
    expect(result.orderCorrect).toBe(false);
    expect(result.pitchMismatchIndices).toEqual([1, 2]);
    expect(result.correct).toBe(false);
  });
  it("retains repeated pitch multiplicity in pitch content", () => {
    const result = compareDictation(phrase(), answer([60, 60, 60]));
    expect(result.pitchContentAccuracy).toBeCloseTo(1 / 3);
  });
  it("ignores initial delay and anchors even a wrong first pitch", () => {
    const immediate = compareDictation(phrase(), answer([59, 62, 64]));
    const delayed = compareDictation(phrase(), answer([59, 62, 64], 10));
    expect(delayed).toEqual(immediate);
    expect(delayed.alignedOnsets.errorsBeats).toEqual([0, 0, 0]);
    expect(delayed.onsetIntervals.accuracy).toBe(1);
    expect(delayed.positionalPitchAccuracy).toBeCloseTo(2 / 3);
  });
  it("distinguishes inter-attack timing and actual holding", () => {
    const result = compareDictation(phrase(), [
      { pitch: 60, startBeat: 10, durationBeats: 0.5 },
      { pitch: 62, startBeat: 11.5, durationBeats: 1 },
      { pitch: 64, startBeat: 12.5, durationBeats: 1 }
    ]);
    expect(result.onsetIntervals.errorsBeats).toEqual([0.5, 0]);
    expect(result.onsetIntervals.accuracy).toBe(0.5);
    expect(result.holdingDurations.errorsBeats).toEqual([-0.5, 0, 0]);
    expect(result.holdingDurations.accuracy).toBeCloseTo(2 / 3);
    expect(result.correct).toBe(false);
  });
  it("keeps short and long answers without manufacturing completion", () => {
    const short = compareDictation(phrase(), answer([60, 62]));
    expect(short.missingNotes).toBe(1);
    expect(short.extraNotes).toBe(0);
    expect(short.positionalPitchAccuracy).toBeCloseTo(2 / 3);
    expect(short.correct).toBe(false);
    const long = compareDictation(phrase(), answer([60, 62, 64, 65]));
    expect(long.extraNotes).toBe(1);
    expect(long.missingNotes).toBe(0);
    expect(long.positionalPitchAccuracy).toBe(0.75);
    expect(long.correct).toBe(false);
  });
  it("marks an empty reply not performed, with no fabricated accuracies", () => {
    const result = compareDictation(phrase(), []);
    expect(result.status).toBe("not-performed");
    expect(result.positionalPitchAccuracy).toBeNull();
    expect(result.pitchContentAccuracy).toBeNull();
    expect(result.orderAccuracy).toBeNull();
    expect(result.correct).toBeNull();
    expect(result.onsetIntervals.accuracy).toBeNull();
    expect(result.holdingDurations.accuracy).toBeNull();
    expect(result.missingNotes).toBe(3);
  });
  it("rejects invalid/reordered input rather than inventing durations", () => {
    expect(() =>
      compareDictation(phrase(), [{ pitch: 60, startBeat: 0, durationBeats: -1 }])
    ).toThrow();
    expect(() =>
      compareDictation(phrase(), [
        { pitch: 60, startBeat: 1, durationBeats: 1 },
        { pitch: 62, startBeat: 0, durationBeats: 1 }
      ])
    ).toThrow();
  });
});
