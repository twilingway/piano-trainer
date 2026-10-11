// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  balancedReadingPlan,
  buildAdaptivePlan,
  chooseNewReadingCheck,
  DEFAULT_READING_POLICY,
  readingFingerprint,
  readingQuota,
  READING_NOVELTY_CANDIDATES
} from "./adaptation";
import { generateReadingExercise, readingSequenceForSeed, READING_PITCHES } from "./generator";
import { emptyReadingProfile } from "./progress";
import type { ReadingObservation, ReadingProfile } from "./progressTypes";

function profileFor(weights: readonly number[], completedAt = 100): ReadingProfile {
  const observations: ReadingObservation[] = READING_PITCHES.flatMap((expectedMidi, pitchIndex) =>
    Array.from({ length: 4 }, (_, index) => ({
      runId: `run${String(index)}`,
      noteId: `${String(pitchIndex)}:${String(index)}`,
      purpose: "notes" as const,
      completedAt,
      expectedMidi,
      inputSource: "midi" as const,
      firstAttemptCorrect: true,
      independentCorrect: true,
      unassistedSolved: true,
      firstLatencyMs: (weights[pitchIndex] ?? 0) * DEFAULT_READING_POLICY.latencyReferenceMs,
      responseLatencyMs: 500,
      errorCount: 0
    }))
  );
  return { observations, processedRunIds: [], delayedDueAt: null };
}

describe("adaptive reading allocation", () => {
  it("falls back when any note is missing data or the selected source has insufficient data", () => {
    expect(buildAdaptivePlan(emptyReadingProfile(), "all", 100).counts).toEqual([4, 4, 4, 4, 4]);
    const complete = profileFor([0, 1, 0, 0, 0]);
    expect(buildAdaptivePlan(complete, "keyboard", 100).counts).toEqual([4, 4, 4, 4, 4]);
    const missing = { ...complete, observations: complete.observations.slice(1) };
    expect(buildAdaptivePlan(missing, "all", 100).counts).toEqual([4, 4, 4, 4, 4]);
    const phrase = {
      ...complete,
      observations: complete.observations.map((entry) => ({
        ...entry,
        purpose: "phrases" as const
      }))
    };
    expect(buildAdaptivePlan(phrase, "all", 100).counts).toEqual([4, 4, 4, 4, 4]);
  });

  it("applies exact largest-remainder examples and preserves the baseline", () => {
    expect(readingQuota([0, 1, 0, 0, 0], 6)).toEqual([0, 6, 0, 0, 0]);
    expect(readingQuota([0, 0, 0, 0, 0], 6)).toEqual([2, 1, 1, 1, 1]);
    expect(readingQuota([1, 1, 1, 1, 1], 4)).toEqual([1, 1, 1, 1, 0]);
    const plan = buildAdaptivePlan(profileFor([0, 1, 0, 0, 0]), "all", 100);
    expect(plan.counts).toEqual([3, 9, 3, 3, 2]);
    const exercise = generateReadingExercise("notes", 1, plan);
    expect(exercise.song.notes).toHaveLength(20);
    READING_PITCHES.forEach((pitch, index) => {
      expect(exercise.song.notes.filter((note) => note.pitch === pitch)).toHaveLength(
        plan.counts[index] ?? 0
      );
    });
    expect(() => readingQuota([-1, 1], 2)).toThrow(RangeError);
  });

  it("weights mistakes and assistance even with missing independent latency", () => {
    const base = profileFor([0.1, 0.1, 0.1, 0.1, 0.1]);
    const difficult = {
      ...base,
      observations: base.observations.map((entry) =>
        entry.expectedMidi === 62
          ? { ...entry, independentCorrect: false, firstLatencyMs: null }
          : entry
      )
    };
    const plan = buildAdaptivePlan(difficult, "all", 100);
    expect(plan.counts[1]).toBeGreaterThan(plan.counts[0] ?? 0);
    expect(plan.counts.every((count) => count >= 2)).toBe(true);
    expect(plan.counts.reduce((sum, count) => sum + count, 0)).toBe(20);
  });

  it("orders overdue slots by last independent date, missing dates first, MIDI ties", () => {
    const base = profileFor([0, 0, 0, 0, 0], 0);
    const dated = {
      ...base,
      observations: base.observations.map((entry) => ({
        ...entry,
        completedAt: entry.expectedMidi === 65 ? 10 : 0,
        independentCorrect: entry.expectedMidi !== 67
      }))
    };
    const policy = { ...DEFAULT_READING_POLICY, repeatIntervalMs: 100 };
    expect(buildAdaptivePlan(dated, "all", 200, policy).counts).toEqual([3, 3, 3, 2, 9]);
  });

  it("replays frozen quotas after profile or calendar changes and preserves the v1 sequence", () => {
    const original = generateReadingExercise("notes", 42);
    expect(original.song.notes.map((note) => note.pitch)).toEqual(
      generateReadingExercise("check", 42).song.notes.map((note) => note.pitch)
    );
    expect(original.musicXml).toBe(
      generateReadingExercise("notes", 42, { ...balancedReadingPlan("notes"), generatorVersion: 1 })
        .musicXml
    );
    const plan = buildAdaptivePlan(profileFor([0, 1, 0, 0, 0]), "all", 100);
    const first = generateReadingExercise("notes", 42, plan);
    buildAdaptivePlan(profileFor([1, 0, 1, 1, 1]), "all", 999_999_999);
    expect(generateReadingExercise("notes", 42, plan).musicXml).toBe(first.musicXml);
    expect(() =>
      generateReadingExercise("notes", 42, { ...plan, counts: [2, 2, 2, 2, 2] })
    ).toThrow(RangeError);
  });
});

describe("bounded check novelty", () => {
  it("rejects a previously presented sequence across tasks and retains balanced independent checks", () => {
    const plan = balancedReadingPlan("notes");
    const shown = generateReadingExercise("notes", 11, plan);
    const chosen = chooseNewReadingCheck(
      10,
      [readingFingerprint(shown)],
      "delayed-check",
      "keyboard"
    );
    expect(chosen?.seed).toBe(12);
    expect(chosen?.plan).toMatchObject({
      purpose: "delayed-check",
      source: "keyboard",
      counts: [4, 4, 4, 4, 4]
    });
    expect(chosen?.exercise.task).toBe("check");
    expect(chosen && readingFingerprint(chosen.exercise)).not.toBe(readingFingerprint(shown));
  });

  it("returns null after all 4096 candidates collide without modifying the journal", () => {
    const plan = balancedReadingPlan("check");
    const known = Array.from({ length: READING_NOVELTY_CANDIDATES }, (_, index) =>
      readingSequenceForSeed(index + 1, plan).join(",")
    );
    const before = [...known];
    expect(chooseNewReadingCheck(0, known)).toBeNull();
    expect(known).toEqual(before);
  }, 30_000);
});
