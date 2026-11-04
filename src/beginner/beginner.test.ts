// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { BEGINNER_STAGES, type BeginnerSelection } from "./catalog";
import { beginnerPitches, generateBeginnerExercise } from "./generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { generateReadingExercise } from "../reading/generator";
import {
  emptyBeginnerProgress,
  mergeBeginnerProgress,
  nextBeginnerStage,
  readBeginnerProgress
} from "./progress";
import { validBeginnerResult, type BeginnerResult } from "./resultValidation";

function completed(
  stageId = "beginner-v1-right-2",
  phase: "guided" | "independent" = "independent",
  id = "run-1"
): BeginnerResult {
  const selection: BeginnerSelection = { stageId, phase, seed: 42 };
  const stage = BEGINNER_STAGES.find((s) => s.id === stageId);
  const exercise = generateBeginnerExercise(selection);
  const session = new ReadingSession(
    exercise,
    DEFAULT_READING_PREFERENCES,
    { runId: id, startedAt: 10 },
    stage?.targetCount
  );
  exercise.song.notes.forEach((note, i) => {
    session.prepare(note.id, note.pitch, i * 100);
    session.setActive(true, i * 100);
    session.present(note.id, i * 100);
    if (phase === "guided") session.showHint(note.id, 1, i * 100);
    session.answer(note.pitch, "pointer", i * 100 + 20);
  });
  const result = session.result(id, 5000);
  if (!result) throw new Error("Not complete");
  return { selection, generatorVersion: 1, result };
}
describe("gradual beginner source", () => {
  it("adds exactly one written pitch through C5 and C4 with bounded count, correct hand and fingering", () => {
    expect(BEGINNER_STAGES).toHaveLength(16);
    for (const stage of BEGINNER_STAGES) {
      const selection: BeginnerSelection = { stageId: stage.id, phase: "guided", seed: 17 };
      const exercise = generateBeginnerExercise(selection);
      expect(exercise.song.notes).toHaveLength(stage.targetCount);
      expect(new Set(exercise.song.notes.map((n) => n.pitch))).toEqual(new Set(stage.pitches));
      expect(
        exercise.song.notes.every((n) => n.hand === stage.hand && n.finger !== undefined)
      ).toBe(true);
      expect(exercise.musicXml).toBe(generateBeginnerExercise(selection).musicXml);
      if (stage.count <= 5)
        for (const note of exercise.song.notes) {
          const rank = stage.pitches.indexOf(note.pitch);
          expect(note.finger).toBe(stage.hand === "right" ? rank + 1 : 5 - rank);
        }
      expect(exercise.song.notes[0]?.pitch).toBe(stage.pitches.at(-1));
      const measures = new DOMParser()
        .parseFromString(exercise.musicXml, "application/xml")
        .querySelectorAll("measure");
      expect(measures.length).toBe(Math.ceil(stage.targetCount / 4));
      expect(measures[measures.length - 1]?.getAttribute("implicit")).toBe(
        stage.targetCount % 4 ? "yes" : null
      );
    }
    expect(BEGINNER_STAGES[7]?.pitches.at(-1)).toBe(72);
    expect(BEGINNER_STAGES[15]?.pitches.at(-1)).toBe(60);
  });
  it("changes musical order with seed while keeping pitch membership", () => {
    const s: BeginnerSelection = { stageId: "beginner-v1-right-8", phase: "independent", seed: 11 };
    expect(beginnerPitches(s)).not.toEqual(beginnerPitches({ ...s, seed: 12 }));
    expect(generateBeginnerExercise(s).musicXml).toContain("<octave>5</octave>");
    expect(generateBeginnerExercise(s).musicXml).toContain("<step>B</step>");
    expect(generateBeginnerExercise(s).musicXml).toContain("<step>A</step>");
  });
  it("requires the whole mini-series and preserves the legacy twenty-note default", () => {
    const ex = generateReadingExercise("notes", 42);
    const session = new ReadingSession(ex, DEFAULT_READING_PREFERENCES);
    ex.song.notes.slice(0, 6).forEach((n, i) => {
      session.prepare(n.id, n.pitch, i * 10);
      session.setActive(true, i * 10);
      session.present(n.id, i * 10);
      session.answer(n.pitch, "keyboard", i * 10 + 1);
    });
    expect(session.snapshot().completed).toBe(false);
    expect(session.result("partial", 1000)).toBeNull();
    const mini = completed();
    expect(mini.result.notes).toHaveLength(6);
    expect(validBeginnerResult(mini)).toBe(true);
    expect(
      validBeginnerResult({
        ...mini,
        result: { ...mini.result, notes: mini.result.notes.slice(0, 5) }
      })
    ).toBe(false);
  });
});
describe("separate beginner journal", () => {
  it("merges concurrent records idempotently and recommends completion without old credit", () => {
    const a = completed(),
      b = completed("beginner-v1-left-3", "independent", "run-2");
    let saved = mergeBeginnerProgress(null, {
      ...emptyBeginnerProgress(),
      selection: a.selection,
      history: [a]
    });
    saved = mergeBeginnerProgress(saved, { ...emptyBeginnerProgress(), history: [b] }, false);
    saved = mergeBeginnerProgress(saved, { ...emptyBeginnerProgress(), history: [a] }, false);
    expect(saved.history).toHaveLength(2);
    expect(saved.completed).toEqual(
      expect.arrayContaining([a.selection.stageId, b.selection.stageId])
    );
    expect(saved.selection).toEqual(a.selection);
    expect(nextBeginnerStage(saved.completed)).toBe("beginner-v1-right-1");
    expect(
      readBeginnerProgress({
        schemaVersion: 1,
        history: [completed("beginner-v1-right-1", "guided")]
      }).completed
    ).toEqual([]);
    expect(readBeginnerProgress({ schemaVersion: 9, history: [a.result] }).completed).toEqual([]);
  });
  it("isolates corrupt records, refuses future schema, and never restores answers", () => {
    const a = completed();
    const state = readBeginnerProgress({
      schemaVersion: 1,
      selection: a.selection,
      history: [null, a, { result: {} }],
      completed: ["unknown"]
    });
    expect(state.history).toEqual([a]);
    expect(state.selection).toEqual(a.selection);
    expect(mergeBeginnerProgress(state, state).history).toHaveLength(1);
    expect(() => mergeBeginnerProgress({ schemaVersion: 2 }, state)).toThrow();
    const run = new ReadingSession(
      generateBeginnerExercise(a.selection),
      DEFAULT_READING_PREFERENCES,
      undefined,
      6
    );
    expect(run.snapshot().answers).toEqual([]);
  });
  it("does not trust orphan completion labels after the evidence is corrupt", () => {
    expect(
      readBeginnerProgress({
        schemaVersion: 1,
        history: [null],
        completed: ["beginner-v1-right-1"]
      }).completed
    ).toEqual([]);
  });
  it("keeps the latest independent proof when recent guided history is trimmed", () => {
    const proof = completed("beginner-v1-right-1");
    const guided = completed("beginner-v1-right-2", "guided");
    const history = [
      proof,
      ...Array.from({ length: 100 }, (_, i) => ({
        ...guided,
        result: {
          ...guided.result,
          id: `guided-${String(i)}`,
          runId: `guided-${String(i)}`,
          createdAt: 6000 + i,
          completedAt: 6000 + i,
          notes: guided.result.notes.map((n) => ({
            ...n,
            attempts: n.attempts.map((a, j) => ({
              ...a,
              runId: `guided-${String(i)}`,
              attemptId: `guided-${String(i)}-${n.noteId}-${String(j)}`
            }))
          }))
        }
      }))
    ];
    const state = mergeBeginnerProgress(null, { ...emptyBeginnerProgress(), history });
    expect(state.history.length).toBeLessThanOrEqual(96);
    expect(state.completed).toContain("beginner-v1-right-1");
  });
  it("rejects mismatched pitches, fake successful attempts, and help in independent checks", () => {
    const a = completed();
    expect(validBeginnerResult({ ...a, result: { ...a.result, exerciseId: "old-reading" } })).toBe(
      false
    );
    expect(
      validBeginnerResult({
        ...a,
        result: { ...a.result, notes: a.result.notes.map((n) => ({ ...n, hintLevel: 1 })) }
      })
    ).toBe(false);
    expect(
      validBeginnerResult({
        ...a,
        result: { ...a.result, notes: a.result.notes.map((n) => ({ ...n, attempts: [] })) }
      })
    ).toBe(false);
  });
});
