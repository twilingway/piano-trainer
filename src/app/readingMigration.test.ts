// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { addReadingResult } from "../reading/progress";
import { emptyReadingState, mergeReadingState, normalizeReadingState } from "./readingMigration";

export function readingResult(id: string, createdAt = 123) {
  const exercise = generateReadingExercise("notes", 42);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    session.prepare(note.id, note.pitch, index * 1000);
    session.present(note.id, index * 1000);
    session.answer(note.pitch, "keyboard", index * 1000 + 100);
  });
  const completed = session.result(id, createdAt);
  if (!completed) throw new Error("Incomplete fixture");
  return {
    id: completed.id,
    exerciseId: completed.exerciseId,
    task: completed.task,
    seed: completed.seed,
    createdAt: completed.createdAt,
    notes: completed.notes.map((note) => ({
      noteId: note.noteId,
      expectedMidi: note.expectedMidi,
      firstAttemptCorrect: note.firstAttemptCorrect,
      independentCorrect: note.independentCorrect,
      unassistedSolved: note.unassistedSolved,
      responseLatencyMs: note.responseLatencyMs,
      hintLevel: note.hintLevel,
      attempts: note.attempts.map((attempt) => ({
        exerciseId: attempt.exerciseId,
        noteId: attempt.noteId,
        expectedMidi: attempt.expectedMidi,
        playedMidi: attempt.playedMidi,
        responseLatencyMs: attempt.responseLatencyMs,
        hintLevel: attempt.hintLevel,
        inputSource: attempt.inputSource,
        atMs: attempt.atMs
      }))
    }))
  };
}

describe("reading storage migration", () => {
  it("rejects malformed plans, string MIDI values and malformed native help history", () => {
    const plan = {
      purpose: "adaptive",
      generatorVersion: 2,
      policyVersion: 1,
      source: "all",
      counts: [2, 8, 4, 3, 3]
    };
    expect(normalizeReadingState({ task: "notes", plan }).reading.plan).toEqual(plan);
    for (const invalidPlan of [
      { ...plan, generatorVersion: 99 },
      { ...plan, policyVersion: 99 },
      { ...plan, counts: [1, 9, 4, 3, 3] },
      { ...plan, purpose: "check" }
    ]) {
      expect(normalizeReadingState({ task: "notes", plan: invalidPlan })).toMatchObject({
        invalid: true,
        reading: { plan: null }
      });
    }
    const sample = readingResult("bad-midi");
    const wrongMidi = {
      ...sample,
      notes: sample.notes.map((note) => ({ ...note, expectedMidi: String(note.expectedMidi) }))
    };
    const wrongHints = {
      ...sample,
      provenance: "native",
      notes: sample.notes.map((note) => ({ ...note, hintHistory: [{ atMs: -1, level: 1 }] }))
    };
    for (const bad of [wrongMidi, wrongHints])
      expect(normalizeReadingState({ history: [bad] })).toMatchObject({
        invalid: true,
        reading: { history: [] }
      });
  });
  it("retains twenty results independently for each purpose", () => {
    const sample = readingResult("sample");
    const history = Array.from({ length: 23 }, (_, index) => [
      { ...sample, id: `normal-${String(index)}` },
      {
        ...sample,
        id: `adaptive-${String(index)}`,
        plan: {
          purpose: "adaptive",
          generatorVersion: 2,
          policyVersion: 1,
          source: "all",
          counts: [2, 8, 4, 3, 3]
        }
      }
    ]).flat();
    const normalized = normalizeReadingState({ history }).reading;
    expect(normalized.history).toHaveLength(40);
    expect(normalized.history.filter((result) => result.plan?.purpose === "adaptive")).toHaveLength(
      20
    );
  });
  it("preserves known legacy timing and uses null for unavailable provenance", () => {
    const sample = readingResult("legacy");
    const { reading, invalid } = normalizeReadingState({
      task: "notes",
      seed: 42,
      preferences: { automaticHints: false },
      history: [sample, { id: "broken" }]
    });
    expect(invalid).toBe(true);
    expect(reading.schemaVersion).toBe(2);
    expect(reading.preferences.automaticHints).toBe(false);
    expect(reading.history).toHaveLength(1);
    const migrated = reading.history[0];
    expect(migrated).toMatchObject({
      runId: "legacy",
      startedAt: null,
      completedAt: 123,
      provenance: "legacy",
      plan: null,
      newMaterial: false
    });
    expect(migrated?.notes[0]).toMatchObject({
      hintHistory: null,
      presentedAtMs: null,
      responseLatencyMs: 100
    });
    expect(migrated?.notes[0]?.attempts[0]).toMatchObject({
      attemptId: "legacy:0",
      skillId: "note-reading",
      atMs: 100,
      hintLevel: 0
    });
    expect(reading.presentedFingerprints).toHaveLength(1);
    expect(reading.profile.observations).toHaveLength(20);
  });
  it("is idempotent on repeated migration and duplicate results", () => {
    const sample = readingResult("same");
    const first = normalizeReadingState({ history: [sample, sample] }).reading;
    const second = normalizeReadingState(first).reading;
    expect(second).toEqual(first);
    expect(second.history).toHaveLength(1);
    expect(second.profile.processedRunIds).toEqual(["same"]);
  });
  it("blocks downgrade of future schemas", () => {
    expect(normalizeReadingState({ schemaVersion: 100, history: [] }).blocked).toBe(true);
  });
  it("merges profiles independently from pruned detailed history", () => {
    const old = emptyReadingState();
    old.profile = addReadingResult(old.profile, readingResult("old", 1));
    const fresh = emptyReadingState();
    fresh.history = [readingResult("fresh", 2)];
    fresh.profile = addReadingResult(fresh.profile, readingResult("fresh", 2));
    const merged = mergeReadingState(old, fresh, []);
    expect(merged.profile.processedRunIds).toEqual(["old", "fresh"]);
    expect(merged.profile.observations).toHaveLength(40);
    expect(mergeReadingState(merged, fresh, []).profile).toEqual(merged.profile);
  });
});
