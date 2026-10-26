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
