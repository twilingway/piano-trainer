// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateReadingExercise } from "./generator";
import {
  bassReadingSequenceForSeed,
  BASS_READING_PITCHES,
  generateBassReadingExercise,
  nextBassReadingSeed
} from "./bassGenerator";
import { toBassReadingResult } from "./bassTypes";
import type { BassReadingResult, BassReadingTask } from "./bassTypes";
import { summarizeBassReadingResults } from "./bassProgress";
import { addReadingResult, emptyReadingProfile, summarizeReadingResults } from "./progress";
import { ReadingSession } from "./session";
import { readingPromptXml } from "./prompt";
import { DEFAULT_READING_PREFERENCES } from "./types";
import { songFromMusicXml } from "../song/musicxml";

function completed(task: BassReadingTask = "notes", id = "bass-run", helped = false) {
  const exercise = generateBassReadingExercise(task, 42);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId: id,
    startedAt: 100
  });
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    const at = index * 10_000;
    session.prepare(note.id, note.pitch, at);
    session.present(note.id, at);
    if (helped) session.showHint(note.id, 1, at + 100);
    session.answer(note.pitch, "keyboard", at + 1_000);
  });
  const result = toBassReadingResult(session.result(id, 200));
  if (!result) throw new Error("Bass fixture failed to complete");
  return result;
}

describe("bass reading source profile", () => {
  it("generates twenty balanced left notes in F clef, with stable source XML", () => {
    for (const task of ["notes", "phrases"] as const) {
      for (const seed of [0, 1, 42, 0xffffffff]) {
        const exercise = generateBassReadingExercise(task, seed);
        expect(exercise).toEqual(generateBassReadingExercise(task, seed));
        expect(exercise.song.notes).toHaveLength(20);
        expect(exercise.song.notes.map((note) => note.pitch)).toEqual(
          bassReadingSequenceForSeed(seed)
        );
        for (const pitch of BASS_READING_PITCHES)
          expect(exercise.song.notes.filter((note) => note.pitch === pitch)).toHaveLength(4);
        expect(exercise.song.notes.every((note) => note.hand === "left")).toBe(true);
        expect(exercise.song.notes.every((note) => note.duration === 0.5)).toBe(true);
        expect(exercise.song.duration).toBe(10);
        expect(exercise.musicXml).toContain("<clef><sign>F</sign><line>4</line></clef>");
        expect(exercise.musicXml).toContain("<octave>3</octave>");
        expect(exercise.musicXml).not.toContain("fingering");
        expect(exercise.plan).toBeUndefined();
        expect(bassReadingSequenceForSeed(nextBassReadingSeed(seed, task))).not.toEqual(
          bassReadingSequenceForSeed(seed)
        );
      }
    }
    expect(() => generateBassReadingExercise("notes", NaN)).toThrow();
    expect(() => generateBassReadingExercise("notes", 1, 2)).toThrow();
  });

  it("preserves the exact P1/P2 version-one XML and order", () => {
    const exercise = generateReadingExercise("notes", 42);
    expect(createHash("sha256").update(exercise.musicXml).digest("hex")).toBe(
      "9c1d9992284f10df2c51c0c6c95b4a1b4e5f3d72d8a7ea6c8d596f9330b8a4df"
    );
    expect(exercise.song.notes.every((note) => note.hand === "right")).toBe(true);
  });

  it("presents just a current note or four-note phrase with the bass attributes", () => {
    const exercise = generateBassReadingExercise("phrases", 42);
    for (const task of ["notes", "phrases"] as const) {
      const prompt = readingPromptXml(exercise.musicXml, task, 7);
      expect(songFromMusicXml(prompt.musicXml, "").notes.map((note) => note.pitch)).toEqual(
        exercise.song.notes.slice(task === "notes" ? 7 : 4, 8).map((note) => note.pitch)
      );
      expect(prompt.musicXml).toContain("<sign>F</sign><line>4</line>");
      expect(prompt.musicXml).not.toContain("bass-reading-n8");
    }
  });
});

describe("shared evaluator with bass identity", () => {
  it("rejects wrong octaves, stale presentation and inactive attacks; excludes pauses", () => {
    const exercise = generateBassReadingExercise("notes", 42);
    const note = exercise.song.notes[0];
    if (!note) throw new Error("Missing note");
    const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
    session.setActive(true, 0);
    session.prepare(note.id, note.pitch, 0);
    session.present("old-note", 100);
    expect(session.answer(note.pitch, "midi", 100)).toBeNull();
    session.present(note.id, 100);
    expect(session.answer(note.pitch, "midi", 99)).toBeNull();
    expect(session.answer(note.pitch + 12, "midi", 200)).toMatchObject({
      skillId: "bass-note-reading",
      expectedMidi: note.pitch,
      playedMidi: note.pitch + 12
    });
    session.setActive(false, 250);
    expect(session.answer(note.pitch, "midi", 300)).toBeNull();
    session.setActive(true, 1_250);
    session.answer(note.pitch, "pointer", 1_350);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: true,
      responseLatencyMs: 250
    });
    expect(session.answer(note.pitch, "pointer", 1_351)).toBeNull();
    expect(session.result("incomplete", 200)).toBeNull();
  });

  it("records actual help only on the current note and produces all twenty identities", () => {
    const exercise = generateBassReadingExercise("phrases", 42);
    const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
    const [first, next] = exercise.song.notes;
    if (!first || !next) throw new Error("Missing note");
    session.setActive(true, 0);
    session.prepare(first.id, first.pitch, 100);
    session.present(first.id, 100);
    expect(session.suggestHint(5_100)).toBe(1);
    expect(session.snapshot().hintLevel).toBe(0);
    session.showHint(next.id, 2, 5_100);
    expect(session.snapshot().hintLevel).toBe(0);
    session.showHint(first.id, 1, 5_100);
    session.answer(first.pitch, "keyboard", 5_200);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: false,
      hintHistory: [{ atMs: 5_100, level: 1 }]
    });
    session.prepare(next.id, next.pitch, 6_000);
    expect(session.snapshot().hintLevel).toBe(0);
    for (const task of ["notes", "phrases"] as const) {
      const result = completed(task);
      expect(result).toMatchObject({
        skillId: "bass-note-reading",
        generatorVersion: 1,
        task,
        runId: "bass-run",
        startedAt: 100,
        completedAt: 200,
        plan: null
      });
      expect(
        new Set(result.notes.flatMap((note) => note.attempts.map((a) => a.attemptId))).size
      ).toBe(20);
    }
  });

  it("does not narrow an unrelated, incomplete or inconsistent shared result", () => {
    const result = completed();
    expect(toBassReadingResult(null)).toBeNull();
    expect(toBassReadingResult({ ...result, skillId: "note-reading" })).toBeNull();
    expect(toBassReadingResult({ ...result, generatorVersion: 2 })).toBeNull();
    expect(toBassReadingResult({ ...result, notes: result.notes.slice(1) })).toBeNull();
    expect(toBassReadingResult({ ...result, notes: [...result.notes].reverse() })).toBeNull();
    expect(toBassReadingResult({ ...result, exerciseId: "foreign-exercise" })).toBeNull();
    expect(
      toBassReadingResult({
        ...result,
        notes: result.notes.map((note) => ({ ...note, independentCorrect: false }))
      })
    ).toBeNull();
  });

  it("retains the original presentation evidence after a failed staff redraw and retry", () => {
    const exercise = generateBassReadingExercise("notes", 42);
    const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, {
      runId: "retry",
      startedAt: 100
    });
    session.setActive(true, 0);
    exercise.song.notes.forEach((note, index) => {
      const at = index * 10_000 + 100;
      session.prepare(note.id, note.pitch, at);
      session.present(note.id, at);
      if (index === 0) {
        session.answer(note.pitch + 12, "midi", at + 100);
        session.showHint(note.id, 1, at + 200);
        session.requirePresentation(note.id, at + 300);
        expect(session.answer(note.pitch, "pointer", at + 400)).toBeNull();
        session.present(note.id, at + 1_000);
        session.answer(note.pitch, "pointer", at + 1_100);
      } else session.answer(note.pitch, "keyboard", at + 100);
    });
    const result = toBassReadingResult(session.result("retry", 200));
    expect(result?.notes[0]).toMatchObject({
      presentedAtMs: 100,
      responseLatencyMs: 400,
      hintHistory: [{ atMs: 300, level: 1 }],
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: false
    });
    expect(result?.notes[0]?.attempts.map((attempt) => attempt.atMs)).toEqual([200, 1_200]);
  });
});

describe("isolated bass summaries", () => {
  it("keeps assisted first answers distinct from unassisted solutions after errors", () => {
    const assisted = completed("notes", "assist", true);
    expect(summarizeBassReadingResults([assisted]).totals).toMatchObject({
      observationCount: 20,
      firstAttemptCorrectCount: 20,
      independentCorrectCount: 0,
      independentLatencyMs: null,
      newMaterialCount: 0
    });
    const base = completed();
    const first = base.notes[0];
    const attack = first?.attempts[0];
    if (!first || !attack) throw new Error("Missing note");
    const mixed: BassReadingResult = {
      ...base,
      notes: [
        {
          ...first,
          firstAttemptCorrect: false,
          independentCorrect: false,
          responseLatencyMs: 3_000,
          attempts: [
            {
              ...attack,
              playedMidi: first.expectedMidi + 12,
              inputSource: "midi",
              responseLatencyMs: 1_000
            },
            { ...attack, inputSource: "pointer", responseLatencyMs: 3_000 }
          ]
        }
      ]
    };
    expect(summarizeBassReadingResults([mixed], "pointer").totals).toMatchObject({
      observationCount: 1,
      errorCount: 1,
      firstAttemptCorrectCount: 0,
      independentCorrectCount: 0,
      unassistedSolvedCount: 1,
      firstLatencyMs: 1_000,
      responseLatencyMs: 3_000,
      independentLatencyMs: null
    });
    expect(summarizeBassReadingResults([mixed], "midi").totals.observationCount).toBe(0);
    expect(mixed.notes[0]?.attempts).toHaveLength(2);
    expect(assisted.notes[0]?.hintHistory).toEqual([{ atMs: 100, level: 1 }]);
  });

  it("separates tasks, takes the even median, and leaves P2 aggregates unchanged", () => {
    const single = completed();
    const phrase = completed("phrases", "phrases");
    const adjusted = {
      ...single,
      notes: single.notes.map((note, index) => ({
        ...note,
        responseLatencyMs: index < 10 ? 1_000 : 3_000,
        attempts: note.attempts.map((attack) => ({
          ...attack,
          responseLatencyMs: index < 10 ? 1_000 : 3_000
        }))
      }))
    };
    const summary = summarizeBassReadingResults([adjusted, adjusted, phrase]);
    expect(summary.rows.map((row) => row.expectedMidi)).toEqual(BASS_READING_PITCHES);
    expect(summary.totals).toMatchObject({ observationCount: 20, independentLatencyMs: 2_000 });
    expect(summary.byPurpose).toHaveLength(2);
    expect(
      summarizeBassReadingResults([single, phrase], "all", "phrases").totals.observationCount
    ).toBe(20);
    expect(summarizeBassReadingResults([]).totals.independentLatencyMs).toBeNull();
    const profile = emptyReadingProfile();
    expect(addReadingResult(profile, single)).toBe(profile);
    expect(summarizeReadingResults([single]).totals.observationCount).toBe(0);
  });

  it("uses twenty recent series per task, before applying source filters", () => {
    const single = completed();
    const history = Array.from({ length: 21 }, (_, index) => ({
      ...single,
      id: `n${String(index)}`,
      runId: `n${String(index)}`,
      createdAt: index
    }));
    expect(summarizeBassReadingResults(history).totals.observationCount).toBe(400);
    expect(
      summarizeBassReadingResults([...history, completed("phrases", "phrase")], "all", "phrases")
        .totals.observationCount
    ).toBe(20);
  });
});
