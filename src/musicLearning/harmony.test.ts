// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  buildTriad,
  compareHarmonyChord,
  compareHarmonyTransition,
  createHarmonyAccompaniment,
  createHarmonyTriadExercise,
  generateHarmonyTriad,
  harmonyFunctionChord,
  harmonyProgression,
  harmonyVoicingCandidates,
  smoothHarmonyVoicing
} from "./harmony";
import type { HarmonyTarget, TriadPitches } from "./harmony";

const C: TriadPitches = [60, 64, 67];
const exact: HarmonyTarget = { mode: "exact", pitches: C };
const classes: HarmonyTarget = { mode: "pitch-class", pitches: C };
const inversion: HarmonyTarget = { ...classes, bassPitchClass: 4 };
const range = { low: 48, high: 79 };

describe("harmony material and comparisons", () => {
  it("constructs major/minor thirds, different tonics and all ascending inversions", () => {
    expect(buildTriad(60, "major").pitches).toEqual(C);
    expect(buildTriad(60, "minor").pitches).toEqual([60, 63, 67]);
    expect(buildTriad(62, "minor").pitches).toEqual([62, 65, 69]);
    expect(buildTriad(63, "major").pitches).toEqual([63, 67, 70]);
    expect(buildTriad(60, "major", 1).pitches).toEqual([64, 67, 72]);
    expect(buildTriad(60, "major", 2).pitches).toEqual([67, 72, 76]);
  });
  it("writes C minor with E flat and changes the score/reference when tonic or quality changes", () => {
    const options = { id: "written", seed: 1, bpm: 90, root: 60, quality: "minor" as const };
    const minor = createHarmonyTriadExercise(options);
    expect(minor.exercise.musicXml).toContain("<step>E</step><alter>-1</alter>");
    expect(minor.exercise.song.notes.map((note) => note.pitch).sort((a, b) => a - b)).toEqual([
      60, 63, 67
    ]);
    const major = createHarmonyTriadExercise({ ...options, quality: "major" });
    expect(major.exercise.fingerprint).not.toBe(minor.exercise.fingerprint);
    const moved = createHarmonyTriadExercise({ ...options, root: 62, inversion: 1 });
    expect(moved.chord.pitches).toEqual([65, 69, 74]);
    expect(moved.exercise.musicXml).not.toBe(minor.exercise.musicXml);
  });
  it("distinguishes class recognition, exact position and physical inversion bass", () => {
    const first = [64, 67, 72];
    expect(compareHarmonyChord(classes, first).correct).toBe(true);
    expect(compareHarmonyChord(exact, first).reason).toBe("wrong-position");
    expect(compareHarmonyChord(inversion, first).correct).toBe(true);
    expect(compareHarmonyChord(inversion, C).reason).toBe("wrong-bass");
    expect(compareHarmonyChord(exact, [...C].reverse()).correct).toBe(true);
  });
  it("allows octave doubling only for unrestricted class recognition", () => {
    expect(compareHarmonyChord(classes, [...C, 72]).correct).toBe(true);
    expect(compareHarmonyChord(exact, [...C, 72]).reason).toBe("octave-duplicate");
    expect(compareHarmonyChord(inversion, [64, 67, 72, 76]).reason).toBe("octave-duplicate");
    for (const target of [exact, classes, inversion]) {
      expect(compareHarmonyChord(target, [...C, 65]).reason).toBe("extra-note");
      expect(compareHarmonyChord(target, [60, 64]).reason).toBe("missing-note");
      expect(compareHarmonyChord(target, [60, 60, 64, 67]).reason).toBe("invalid-input");
      expect(compareHarmonyChord(target, [60, NaN, 67]).correct).toBe(false);
    }
  });
  it("rejects malformed targets and impossible construction", () => {
    for (const root of [NaN, Infinity, -1, 128, 60.5])
      expect(() => buildTriad(root, "major")).toThrow(RangeError);
    expect(() => buildTriad(124, "minor")).toThrow(RangeError);
    expect(() => compareHarmonyChord({ mode: "exact", pitches: [60, 64, 72] }, C)).toThrow(
      RangeError
    );
    expect(() => compareHarmonyChord({ ...classes, bassPitchClass: 2 }, C)).toThrow(RangeError);
    expect(() => compareHarmonyChord({ ...classes, bassPitchClass: NaN }, C)).toThrow(RangeError);
  });
  it("maps functions and both progressions including A minor on vi", () => {
    expect(harmonyFunctionChord("I")).toMatchObject({ function: "tonic", pitches: C });
    expect(harmonyFunctionChord("IV")).toMatchObject({
      function: "subdominant",
      pitches: [65, 69, 72]
    });
    expect(harmonyFunctionChord("V")).toMatchObject({
      function: "dominant",
      pitches: [67, 71, 74]
    });
    expect(harmonyProgression("I-IV-V-I").map((chord) => chord.degree)).toEqual([
      "I",
      "IV",
      "V",
      "I"
    ]);
    const pop = harmonyProgression("I-V-vi-IV");
    expect(pop[2]).toMatchObject({
      degree: "vi",
      root: 69,
      quality: "minor",
      pitches: [69, 72, 76]
    });
    expect(harmonyProgression("I-V-vi-IV", 62)[2]?.pitches).toEqual([71, 74, 78]);
  });
  it("selects the smallest summed voice motion with a common C", () => {
    const F = buildTriad(65, "major");
    const candidates = harmonyVoicingCandidates(C, F, range);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(32);
    expect(smoothHarmonyVoicing(C, F, range)).toEqual({
      pitches: [60, 65, 69],
      inversion: 2,
      motion: 3,
      commonPitches: [60]
    });
    for (const candidate of candidates) {
      expect(candidate.pitches[0]).toBeGreaterThanOrEqual(range.low);
      expect(candidate.pitches[2]).toBeLessThanOrEqual(range.high);
      expect(candidate.pitches[0]).toBeLessThan(candidate.pitches[1]);
      expect(candidate.pitches[1]).toBeLessThan(candidate.pitches[2]);
      expect(candidate.pitches[2] - candidate.pitches[0]).toBeLessThanOrEqual(12);
      expect(candidate.motion).toBeGreaterThanOrEqual(3);
    }
    expect(compareHarmonyTransition(C, F, [60, 65, 69], range)).toMatchObject({
      chord: { correct: true },
      admissible: true,
      optimal: true,
      minimumMotion: 3,
      motion: 3
    });
    expect(compareHarmonyTransition(C, F, [65, 69, 72], range)).toMatchObject({
      chord: { correct: true },
      admissible: true,
      optimal: false,
      motion: 15
    });
    expect(compareHarmonyTransition(C, F, [60, 65, 69, 72], range)).toMatchObject({
      chord: { correct: true },
      admissible: false,
      optimal: false,
      motion: null
    });
    expect(compareHarmonyTransition(C, F, [77, 81, 84], range)).toMatchObject({
      chord: { correct: true },
      admissible: false,
      optimal: false,
      motion: null,
      minimumMotion: 3
    });
  });
  it("bounds candidate searches at MIDI edges and never invents unreachable voicings", () => {
    expect(smoothHarmonyVoicing(C, buildTriad(65, "major"), { low: 60, high: 62 })).toBeNull();
    expect(
      harmonyVoicingCandidates([115, 119, 122], buildTriad(120, "major"), { low: 112, high: 127 })
        .length
    ).toBeGreaterThan(0);
    for (const badRange of [
      { low: 80, high: 50 },
      { low: NaN, high: 70 },
      { low: 48, high: 72, maxSpan: 13 }
    ])
      expect(() => harmonyVoicingCandidates(C, buildTriad(65, "major"), badRange)).toThrow(
        RangeError
      );
    expect(() => harmonyVoicingCandidates([64, 60, 67], buildTriad(65, "major"), range)).toThrow(
      RangeError
    );
  });
  it("generates deterministic real score pitches and fingering recommendations", () => {
    const options = { id: "triad", seed: 27, bpm: 90 };
    const first = generateHarmonyTriad(options);
    expect(generateHarmonyTriad(options)).toEqual(first);
    expect(first.exercise.song.notes.map((note) => note.pitch).sort((a, b) => a - b)).toEqual(
      first.chord.pitches
    );
    expect(first.exercise.song.notes.every((note) => note.finger !== undefined)).toBe(true);
    const fingerprints = new Set(
      Array.from(
        { length: 12 },
        (_, seed) => generateHarmonyTriad({ ...options, seed }).exercise.fingerprint
      )
    );
    expect(fingerprints.size).toBeGreaterThan(6);
  });
  it("writes one shared accompaniment song, preserving melody beats, hands and Am", () => {
    const melody = [72, 74, 76, 77].map((pitch, index) => ({
      pitch,
      startBeat: index * 4,
      durationBeats: 4,
      hand: "right" as const
    }));
    const result = createHarmonyAccompaniment({
      id: "pop",
      seed: 1,
      bpm: 120,
      progression: "I-V-vi-IV",
      melody
    });
    expect(result.chords.map((chord) => chord.quality)).toEqual([
      "major",
      "major",
      "minor",
      "major"
    ]);
    expect(result.chords[2]?.pitches.map((pitch) => pitch % 12).sort((a, b) => a - b)).toEqual([
      0, 4, 9
    ]);
    expect(result.exercise.notes.filter((note) => note.hand === "right")).toEqual(melody);
    expect(result.exercise.song.notes.filter((note) => note.hand === "left")).toHaveLength(12);
    expect(
      result.exercise.song.notes
        .filter((note) => note.hand === "right")
        .map((note) => [note.pitch, note.start, note.duration])
    ).toEqual([
      [72, 0, 2],
      [74, 2, 2],
      [76, 4, 2],
      [77, 6, 2]
    ]);
    expect(() =>
      createHarmonyAccompaniment({
        id: "bad",
        seed: 1,
        bpm: 120,
        progression: "I-IV-V-I",
        melody: [],
        range
      })
    ).toThrow(RangeError);
  });
});

describe("physical three-key pitch-class targets", () => {
  it("allows another inversion but rejects octave doubling when the exercise requires exactly three keys", () => {
    const target: HarmonyTarget = { mode: "pitch-class", pitches: C, allowOctaveDoubling: false };
    expect(compareHarmonyChord(target, [64, 67, 72]).correct).toBe(true);
    expect(compareHarmonyChord(target, [64, 67, 72, 76]).reason).toBe("octave-duplicate");
    expect(
      compareHarmonyChord({ ...target, allowOctaveDoubling: true }, [64, 67, 72, 76]).correct
    ).toBe(true);
    expect(
      compareHarmonyChord(
        { ...target, bassPitchClass: 4, allowOctaveDoubling: true },
        [64, 67, 72, 76]
      ).reason
    ).toBe("octave-duplicate");
    expect(() =>
      compareHarmonyChord({ ...target, allowOctaveDoubling: "yes" as unknown as boolean }, C)
    ).toThrow(RangeError);
  });
});
