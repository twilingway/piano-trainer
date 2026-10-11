// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateReadingExercise } from "./generator";
import { ReadingSession } from "./session";
import { DEFAULT_READING_PREFERENCES } from "./types";
import type { ReadingResult } from "./types";
import {
  addReadingResult,
  emptyReadingProfile,
  READING_REPEAT_INTERVAL_MS,
  summarizeReadingProfile,
  summarizeReadingResults
} from "./progress";
import { balancedReadingPlan } from "./adaptation";

function result(
  task: "notes" | "phrases" | "check",
  id: string,
  completedAt: number,
  hint = false
): ReadingResult {
  const exercise = generateReadingExercise(task, 123, balancedReadingPlan(task));
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId: id,
    startedAt: completedAt - 100_000,
    newMaterial: task === "check"
  });
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    const atMs = index * 10_000;
    session.prepare(note.id, note.pitch, atMs);
    session.present(note.id, atMs);
    if (hint) session.showHint(note.id, 1, atMs + 500);
    session.answer(note.pitch, "midi", atMs + 1_000);
  });
  const completed = session.result(id, completedAt);
  if (!completed) throw new Error("Fixture did not complete");
  return completed;
}

describe("reading evidence and summaries", () => {
  it("retains actual assistance and distinct raw first/solution times", () => {
    const exercise = generateReadingExercise("notes", 1);
    const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, {
      runId: "run",
      startedAt: 123
    });
    session.setActive(true, 0);
    session.prepare("n", 60, 100);
    session.present("n", 100);
    const wrong = session.answer(61, "midi", 1_100);
    session.setActive(false, 1_200);
    session.setActive(true, 2_200);
    session.answer(60, "keyboard", 4_100);
    const note = session.snapshot().answers[0];
    expect(wrong).toMatchObject({
      skillId: "note-reading",
      runId: "run",
      attemptId: "run:0",
      atMs: 1_100,
      responseLatencyMs: 1_000
    });
    expect(note).toMatchObject({
      presentedAtMs: 100,
      hintHistory: [],
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: true,
      responseLatencyMs: 3_000
    });
    expect(note?.attempts[1]).toMatchObject({ attemptId: "run:1", atMs: 4_100 });
    const assisted = result("notes", "assist", 10, true);
    expect(assisted.notes[0]?.hintHistory).toEqual([{ atMs: 500, level: 1 }]);
    expect(assisted).toMatchObject({
      runId: "assist",
      startedAt: -99_990,
      completedAt: 10,
      provenance: "native"
    });
    const totals = summarizeReadingResults([assisted]).totals;
    expect(totals).toMatchObject({
      firstAttemptCorrectCount: 20,
      independentCorrectCount: 0,
      independentRate: 0,
      independentLatencyMs: null
    });
  });

  it("classifies mixed-source notes by final correct attack without deleting errors", () => {
    const completed = result("notes", "mixed", 1);
    const original = completed.notes[0];
    const attack = original?.attempts[0];
    if (!original || !attack) throw new Error("Missing fixture note");
    const mixed: ReadingResult = {
      ...completed,
      notes: [
        {
          ...original,
          firstAttemptCorrect: false,
          independentCorrect: false,
          responseLatencyMs: 3_000,
          attempts: [
            { ...attack, playedMidi: 61, inputSource: "midi", responseLatencyMs: 1_000 },
            { ...attack, inputSource: "keyboard", responseLatencyMs: 3_000 }
          ]
        }
      ]
    };
    expect(summarizeReadingResults([mixed], "keyboard").totals).toMatchObject({
      observationCount: 1,
      errorCount: 1,
      independentRate: 0,
      firstLatencyMs: 1_000,
      responseLatencyMs: 3_000,
      independentLatencyMs: null
    });
    expect(summarizeReadingResults([mixed], "midi").totals.observationCount).toBe(0);
  });

  it("keeps phrases separate and deduplicates runs including legacy", () => {
    const single = result("notes", "single", 1);
    const phrase = result("phrases", "phrase", 2);
    const legacy = {
      ...result("check", "legacy", 3),
      provenance: "legacy" as const,
      newMaterial: true
    };
    const summary = summarizeReadingResults([single, single, phrase, legacy]);
    expect(summary.totals.observationCount).toBe(40);
    expect(
      summary.byPurpose.find((group) => group.purpose === "phrases")?.totals.observationCount
    ).toBe(20);
    expect(summarizeReadingResults([phrase], "all", "phrases").totals.observationCount).toBe(20);
    expect(summary.totals.newMaterialCount).toBe(0);
    expect(summarizeReadingResults([result("check", "native", 4)]).totals.newMaterialCount).toBe(
      20
    );
  });
});

describe("compact profile", () => {
  it("updates delayed date only for distinct balanced checks, surviving training and backward calendar shifts", () => {
    const check = result("check", "check", 100_000);
    const first = addReadingResult(emptyReadingProfile(), check);
    expect(first.delayedDueAt).toBe(100_000 + READING_REPEAT_INTERVAL_MS);
    expect(addReadingResult(first, check)).toBe(first);
    const training = addReadingResult(first, result("notes", "training", 200_000));
    expect(training.delayedDueAt).toBe(first.delayedDueAt);
    const older = addReadingResult(training, result("check", "old-calendar", 90_000));
    expect(older.delayedDueAt).toBe(first.delayedDueAt);
    const delayed = {
      ...result("check", "delayed", 300_000),
      plan: balancedReadingPlan("check", "delayed-check")
    };
    expect(addReadingResult(older, delayed).delayedDueAt).toBe(
      300_000 + READING_REPEAT_INTERVAL_MS
    );
  });

  it("keeps the last 20 per pitch/purpose/source across 21 series and retains new-material evidence", () => {
    let profile = emptyReadingProfile();
    for (let index = 0; index < 21; index++)
      profile = addReadingResult(profile, result("notes", `series${String(index)}`, index));
    expect(profile.observations).toHaveLength(100);
    expect(profile.observations.some((entry) => entry.runId === "series0")).toBe(false);
    expect(profile.processedRunIds).toHaveLength(21);
    profile = addReadingResult(profile, result("check", "check", 22));
    expect(summarizeReadingProfile(profile).totals).toMatchObject({
      observationCount: 120,
      newMaterialCount: 20
    });
  });
});
