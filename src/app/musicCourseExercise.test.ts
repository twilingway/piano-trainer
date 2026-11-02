// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { emptyMusicState } from "./musicPersistence";
import {
  makeMusicActivity,
  musicActivityFromIntegrated,
  musicProgressionPrompt
} from "./musicCourseExercise";
import { createIntegratedPlan } from "../musicLearning/integratedPlan";

describe("new course exercise descriptors", () => {
  it("uses the same white tone pair in the score, reference and answer with no key signature", () => {
    const intervals = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const activity = makeMusicActivity({ ...emptyMusicState(), course: "harmony", seed });
      const pitches = activity.exercise.notes.map((note) => note.pitch);
      const first = pitches[0],
        second = pitches[1];
      if (first === undefined || second === undefined || !activity.expectedChoice)
        throw new Error("Missing tone material");
      expect(pitches.every((pitch) => [0, 2, 4, 5, 7, 9, 11].includes(pitch % 12))).toBe(true);
      expect(activity.exercise.song.notes.map((note) => note.pitch)).toEqual(pitches);
      expect(activity.exercise.musicXml).toContain("<fifths>0</fifths>");
      expect(activity.exercise.musicXml).not.toContain("<alter>");
      expect(activity.expectedChoice).toBe(String(second - first));
      expect(activity.toneRecipe?.root).toBe(pitches[0]);
      expect(activity.exercise.generatorVersion).toBe(1);
      intervals.add(activity.expectedChoice);
    }
    expect(intervals).toEqual(new Set(["1", "2"]));
  });
  it("keeps chromatic roots and leaves other harmony topics unaffected by the tone preference", () => {
    const saved = { ...emptyMusicState(), course: "harmony" as const, harmonyRoot: 61 };
    const tone = makeMusicActivity({ ...saved, harmonyTonePitchSet: "all" });
    expect(tone.exercise.notes[0]?.pitch).toBe(61);
    expect(tone.exercise.musicXml).toContain("<fifths>0</fifths>");
    for (const harmonyLesson of [
      "triads",
      "inversions",
      "functions",
      "progressions",
      "accompaniment",
      "voice-leading"
    ] as const) {
      const settings = { ...saved, harmonyLesson, harmonyQuality: "minor" as const };
      const white = makeMusicActivity({ ...settings, harmonyTonePitchSet: "white" });
      const all = makeMusicActivity({ ...settings, harmonyTonePitchSet: "all" });
      expect(white.exercise.notes).toEqual(all.exercise.notes);
      expect(white.exercise.fingerprint).toBe(all.exercise.fingerprint);
      expect(white.toneRecipe).toBeUndefined();
    }
  });
  it("constructs every standalone course from preserved settings", () => {
    for (const course of ["sight-reading", "dictation", "harmony"] as const) {
      const activity = makeMusicActivity({ ...emptyMusicState(), course });
      expect(activity.exercise.song.notes.length).toBeGreaterThan(0);
      expect(activity.exercise.song.musicXml).toBe(activity.exercise.musicXml);
    }
  });
  it("includes all harmony lessons with actual distinct material", () => {
    for (const harmonyLesson of [
      "tone-semitone",
      "triads",
      "inversions",
      "functions",
      "progressions",
      "accompaniment",
      "voice-leading"
    ] as const) {
      const activity = makeMusicActivity({
        ...emptyMusicState(),
        course: "harmony",
        harmonyLesson,
        harmonyMode: "build-chord",
        harmonyInversion: 1
      });
      expect(activity.exercise.song.notes.length).toBeGreaterThan(0);
      if (harmonyLesson === "accompaniment")
        expect(new Set(activity.exercise.notes.map((note) => note.hand))).toEqual(
          new Set(["left", "right"])
        );
      if (harmonyLesson === "voice-leading") expect(activity.chords).toHaveLength(2);
    }
    const major = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "triads",
      harmonyQuality: "major"
    });
    const minor = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "triads",
      harmonyQuality: "minor"
    });
    expect(major.exercise.fingerprint).not.toBe(minor.exercise.fingerprint);
    expect(minor.exercise.notes.map((note) => note.pitch)).toEqual([60, 63, 67]);
  });
  it("has visual/aural naming and both contexts without revealing the missing chord", () => {
    const named = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "triads",
      harmonyMode: "name-chord",
      harmonyAural: true
    });
    expect(named.auditory).toBe(true);
    expect(named.choices.map((choice) => choice.value)).toEqual(["major", "minor"]);
    for (const harmonyProgression of ["I-IV-V-I", "I-V-vi-IV"] as const) {
      const activity = makeMusicActivity({
        ...emptyMusicState(),
        course: "harmony",
        harmonyLesson: "progressions",
        harmonyMode: "complete-progression",
        harmonyProgression
      });
      expect(activity.expectedChoice).toBe(harmonyProgression === "I-IV-V-I" ? "I" : "IV");
      const document = new DOMParser().parseFromString(
        musicProgressionPrompt(activity),
        "application/xml"
      );
      expect(document.querySelectorAll('note[print-object="no"]')).toHaveLength(3);
      expect(activity.exercise.musicXml).not.toContain('print-object="no"');
    }
  });
  it("adapts all16 integrated actions to actual exercises", () => {
    const plan = createIntegratedPlan({ seed: 1 });
    const activities = plan.phases.flatMap((phase) => phase.activities);
    expect(activities).toHaveLength(16);
    for (const source of activities) {
      const activity = musicActivityFromIntegrated(source);
      expect(activity.exercise).toBe(source.exercise);
      expect(activity.noveltyRequired).toBe(source.noveltyRequired);
      if (source.kind === "interval")
        expect(activity.choices.map((choice) => choice.value)).toEqual(["3", "5"]);
    }
  });
  it("transposes the familiar melody together with its accompaniment and key context", () => {
    const c = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "accompaniment",
      harmonyRoot: 60
    });
    const d = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "accompaniment",
      harmonyRoot: 62
    });
    expect(
      d.exercise.notes.filter((note) => note.hand === "right").map((note) => note.pitch)
    ).toEqual(
      c.exercise.notes.filter((note) => note.hand === "right").map((note) => note.pitch + 2)
    );
    expect(d.exercise.musicXml).toContain("<fifths>2</fifths>");
    expect(d.chords?.[0]?.target.pitches.map((pitch) => pitch % 12)).toEqual([2, 6, 9]);
  });
  it("never plays the hidden continuation chord in its reference", async () => {
    const { musicReferenceMaterial } = await import("./musicCourseExercise");
    const activity = makeMusicActivity({
      ...emptyMusicState(),
      course: "harmony",
      harmonyLesson: "progressions",
      harmonyMode: "complete-progression"
    });
    const prefix = musicReferenceMaterial(activity);
    expect(prefix.notes).toHaveLength(9);
    expect(prefix.notes.every((note) => note.startBeat < 6)).toBe(true);
    expect(activity.exercise.notes).toHaveLength(12);
  });
});
