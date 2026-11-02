// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  musicResultFixture,
  retargetMusicResultFixture,
  harmonyAccompanimentResultFixture
} from "./progressFixture";
import {
  computeSightReadingMetrics,
  computeHarmonyMetrics,
  HARMONY_ONSET_WINDOW_MS,
  matchSightReadingNotes,
  SIGHT_READING_MATCH_WINDOW_BEATS,
  SIGHT_READING_TIMING_TOLERANCE_BEATS,
  mergeMusicHistory,
  summarizeMusicProgress,
  validateMusicResult
} from "./progress";
import type { MusicResult } from "./progress";
import { validateIntegratedProgress } from "./progressIntegrated";
import { createIntegratedPlan, IntegratedLesson } from "./integrated";

const courses = ["sight-reading", "harmony", "dictation", "integrated"] as const;
describe("music evidence validation and cohorts", () => {
  it("retains each real typed course with its own evidence and derives metrics from raw answers", () => {
    for (const course of courses) {
      const result = musicResultFixture(course);
      expect(validateMusicResult(result)).toEqual(result);
    }
    const reading = musicResultFixture("sight-reading");
    if (reading.course !== "sight-reading") throw new Error("Fixture course");
    const corrupt = {
      ...reading,
      metrics: { pitchErrors: 999 },
      playedNotes: reading.playedNotes.map((note, index) =>
        index === 0 ? { ...note, pitch: note.pitch + 1 } : note
      )
    };
    expect(validateMusicResult(corrupt)).toMatchObject({
      metrics: { pitchErrors: 1, onsetErrors: null, durationErrors: null }
    });
    const harmony = musicResultFixture("harmony");
    if (harmony.course !== "harmony") throw new Error("Fixture course");
    expect(validateMusicResult({ ...harmony, metrics: { totalAnswers: 999 } })).toMatchObject({
      metrics: { totalAnswers: 1, correctAnswers: 1 }
    });
    const dictation = musicResultFixture("dictation");
    if (dictation.course !== "dictation") throw new Error("Fixture course");
    expect(
      validateMusicResult({
        ...dictation,
        result: { ...dictation.result, comparison: { correct: false } }
      })
    ).toMatchObject({ result: { comparison: { correct: true } } });
  });
  it("keeps measured non-grid attack/duration coordinates and does not invent WAIT rhythm grades", () => {
    const reading = musicResultFixture("sight-reading");
    if (reading.course !== "sight-reading") throw new Error("Fixture course");
    const playedNotes = reading.playedNotes.map((note) => ({
      ...note,
      startBeat: note.startBeat + 0.031,
      durationBeats: note.durationBeats + 0.013
    }));
    expect(validateMusicResult({ ...reading, playedNotes })).not.toBeNull();
    expect(
      computeSightReadingMetrics(reading.expectedNotes, playedNotes, [], "training")
    ).toMatchObject({ onsetErrors: null, durationErrors: null });
    expect(
      computeSightReadingMetrics(reading.expectedNotes, playedNotes, [], "control")
    ).toMatchObject({ onsetErrors: 0, durationErrors: 0 });
  });
  it("rejects unknown versions, identities, timing, prototypes and score/fingerprint mismatches", () => {
    const reading = musicResultFixture("sight-reading");
    for (const patch of [
      { generatorVersion: 2 },
      { runId: "" },
      { startedAt: 3000 },
      { completedAt: Infinity },
      { bpm: 20 },
      { fingerprint: "foreign" },
      { inputSource: "unknown" },
      { purpose: "unknown" }
    ])
      expect(validateMusicResult({ ...reading, ...patch })).toBeNull();
    expect(validateMusicResult(Object.assign(new Date(), reading))).toBeNull();
    expect(validateMusicResult({ ...reading, help: [{ atMs: 1, kind: "unknown" }] })).toBeNull();
    expect(
      validateMusicResult({
        ...reading,
        purpose: "control",
        help: [{ atMs: 1, kind: "key-light" }]
      })
    ).toBeNull();
    expect(validateMusicResult({ ...reading, course: "future" })).toBeNull();
  });
  it("distinguishes unobserved group recognition from a measured first answer", () => {
    const reading = musicResultFixture("sight-reading");
    if (reading.course !== "sight-reading") throw new Error("Fixture course");
    expect(
      computeSightReadingMetrics(reading.expectedNotes, reading.playedNotes, [], "control")
        .groupErrors
    ).toBeNull();
    expect(
      computeSightReadingMetrics(
        reading.expectedNotes,
        reading.playedNotes,
        [{ expected: "scalar", answer: "triadic" }],
        "control"
      ).groupErrors
    ).toBe(1);
    expect(
      computeSightReadingMetrics(
        reading.expectedNotes,
        reading.playedNotes,
        [{ expected: "scalar", answer: "scalar" }],
        "control"
      ).groupErrors
    ).toBe(0);
    expect(
      validateMusicResult({
        ...reading,
        groupAnswers: [],
        metrics: { ...reading.metrics, groupErrors: 0 }
      })
    ).toMatchObject({ metrics: { groupErrors: null } });
  });
  it("rejects corrupt dictation origin/listening boundaries separately from valid reading", () => {
    const dictation = musicResultFixture("dictation");
    if (dictation.course !== "dictation") throw new Error("Fixture course");
    const bad = [
      { ...dictation, result: { ...dictation.result, attemptId: "foreign" } },
      {
        ...dictation,
        result: {
          ...dictation.result,
          notes: dictation.result.notes.map((note) => ({ ...note, origin: { source: "midi" } }))
        }
      },
      {
        ...dictation,
        result: { ...dictation.result, listening: { ...dictation.result.listening, receipts: [] } }
      },
      {
        ...dictation,
        result: {
          ...dictation.result,
          notes: dictation.result.notes.map((note) => ({ ...note, upAtMs: null }))
        }
      },
      {
        ...dictation,
        result: {
          ...dictation.result,
          listening: {
            ...dictation.result.listening,
            receipts: dictation.result.listening.receipts.map((r) => ({ ...r, outcome: "partial" }))
          }
        }
      }
    ];
    for (const value of bad) expect(validateMusicResult(value)).toBeNull();
    const reading = musicResultFixture("sight-reading");
    expect(mergeMusicHistory([], [reading, ...(bad as MusicResult[])])).toHaveLength(1);
  });
  it("keeps committed identities idempotent even when stale tabs edit payload or reuse a result ID", () => {
    const saved = musicResultFixture("sight-reading", "one");
    const edited = { ...saved, newMaterial: true };
    const foreign = { ...musicResultFixture("harmony", "two"), id: saved.id };
    expect(mergeMusicHistory([saved], [edited, foreign])).toEqual([saved]);
    expect(mergeMusicHistory([saved], [saved])).toEqual([saved]);
  });
  it("caps20 independently per course, source and purpose rather than collapsing all four skills", () => {
    const base = courses.map((course) => musicResultFixture(course));
    const history = base.flatMap((sample) =>
      (["keyboard", "pointer", "midi"] as const).flatMap((inputSource) =>
        (["training", "control"] as const).flatMap((purpose) =>
          Array.from({ length: 23 }, (_, index) => ({
            ...retargetMusicResultFixture(
              sample,
              `${sample.course}:${inputSource}:${purpose}:${String(index)}`,
              inputSource,
              purpose
            ),
            completedAt: 2000 + index
          }))
        )
      )
    );
    const merged = mergeMusicHistory([], history);
    expect(merged).toHaveLength(4 * 3 * 2 * 20);
    expect(
      summarizeMusicProgress(merged, { course: "harmony", source: "midi", purpose: "control" })
    ).toHaveLength(1);
    expect(
      summarizeMusicProgress(merged, { course: "harmony", source: "midi", purpose: "control" })[0]
    ).toMatchObject({ completedRuns: 20, inputSource: "midi", purpose: "control" });
  });
  it("summarizes sources/training/aural/visual separately without aggregate accuracy or finger grade", () => {
    const history = courses.map((course) => musicResultFixture(course));
    const summary = summarizeMusicProgress(history);
    expect(summary).toHaveLength(4);
    expect(summary.find((r) => r.course === "dictation")?.auditoryRuns).toBe(1);
    expect(summary.find((r) => r.course === "harmony")?.auditoryRuns).toBe(0);
    expect(summary.find((r) => r.course === "integrated")?.completedRuns).toBe(1);
    expect(summary[0]).not.toHaveProperty("accuracy");
    expect(summary[0]).not.toHaveProperty("fingerAccuracy");
  });
  it("validates P8 recipe, phase coverage and child identity, without persisting live answers", () => {
    const plan = createIntegratedPlan({ seed: 1 });
    const lesson = new IntegratedLesson({ plan, lessonId: "partial" });
    const saved = {
      plan: { seed: 1, version: 1, theme: "c-major", bpm: plan.bpm },
      state: lesson.save()
    };
    expect(validateIntegratedProgress(saved)).toBe(true);
    expect(
      validateIntegratedProgress({
        ...saved,
        state: { ...saved.state, completedPhases: ["find-keys"] }
      })
    ).toBe(false);
    expect(validateIntegratedProgress({ ...saved, plan: { ...saved.plan, version: 2 } })).toBe(
      false
    );
    const final = musicResultFixture("integrated");
    if (final.course !== "integrated") throw new Error("Fixture course");
    expect(
      validateMusicResult({
        ...final,
        state: {
          ...final.state,
          results: final.state.results.map((r, index) =>
            index === 0 ? { ...r, runId: "foreign" } : r
          )
        }
      })
    ).toBeNull();
    expect(
      validateMusicResult({ ...final, state: { ...final.state, completedPhases: [] } })
    ).toBeNull();
  });
});

describe("sight reading score matching policy", () => {
  const note = (
    pitch: number,
    startBeat: number,
    hand: "left" | "right" = "right",
    durationBeats = 1
  ) => ({ pitch, startBeat, durationBeats, hand });
  it("matches all expected notes despite an early extra and reports a same-length missing/extra pair", () => {
    const expected = [note(60, 0), note(62, 1), note(64, 2)];
    expect(
      computeSightReadingMetrics(expected, [note(65, 0), note(60, 0.02), note(62, 1), note(64, 2)])
    ).toMatchObject({
      pitchErrors: 1,
      missingNotes: 0,
      extraNotes: 1,
      onsetErrors: 0,
      durationErrors: 0
    });
    expect(
      computeSightReadingMetrics(expected, [note(60, 0), note(65, 1), note(64, 2)])
    ).toMatchObject({ pitchErrors: 1, missingNotes: 1, extraNotes: 1, onsetErrors: 0 });
  });
  it("ignores the attack order of synchronous chord notes and two score hands", () => {
    expect(
      computeSightReadingMetrics(
        [note(60, 0), note(64, 0), note(67, 0)],
        [note(60, 0), note(67, 0), note(64, 0)]
      )
    ).toMatchObject({ pitchErrors: 0, missingNotes: 0, extraNotes: 0, onsetErrors: 0 });
    expect(
      computeSightReadingMetrics(
        [note(48, 0, "left"), note(60, 0)],
        [note(60, 0), note(48, 0.01, "left")]
      )
    ).toMatchObject({ pitchErrors: 0, missingNotes: 0, extraNotes: 0, onsetErrors: 0 });
    expect(computeSightReadingMetrics([note(60, 0, "left")], [note(60, 0)])).toMatchObject({
      missingNotes: 1,
      extraNotes: 1
    });
  });
  it("matches repeated pitches to the nearest score beats while maximizing one-to-one coverage", () => {
    expect(matchSightReadingNotes([note(60, 0), note(60, 0.5)], [note(60, 0.49)])).toEqual([
      { expectedIndex: 1, playedIndex: 0 }
    ]);
    const expected = [note(60, 0), note(60, 0.5)],
      played = [note(60, 0.3), note(60, 0.9)];
    expect(matchSightReadingNotes(expected, played)).toEqual([
      { expectedIndex: 0, playedIndex: 0 },
      { expectedIndex: 1, playedIndex: 1 }
    ]);
    expect(computeSightReadingMetrics(expected, played)).toMatchObject({
      missingNotes: 0,
      extraNotes: 0,
      onsetErrors: 2
    });
  });
  it("keeps the matching window distinct from timing tolerance and leaves inputs immutable", () => {
    expect(SIGHT_READING_MATCH_WINDOW_BEATS).toBeGreaterThan(SIGHT_READING_TIMING_TOLERANCE_BEATS);
    const expected = Object.freeze([Object.freeze(note(60, 0))]);
    const played = Object.freeze([Object.freeze(note(60, SIGHT_READING_MATCH_WINDOW_BEATS))]);
    expect(computeSightReadingMetrics(expected, played)).toMatchObject({
      missingNotes: 0,
      extraNotes: 0,
      onsetErrors: 1
    });
    expect(
      computeSightReadingMetrics(expected, [note(60, SIGHT_READING_MATCH_WINDOW_BEATS + 0.001)])
    ).toMatchObject({ missingNotes: 1, extraNotes: 1, onsetErrors: null, durationErrors: null });
    expect(expected).toEqual([note(60, 0)]);
    expect(played).toEqual([note(60, SIGHT_READING_MATCH_WINDOW_BEATS)]);
  });
});

describe("music review regressions", () => {
  it("retains actual zero duration as a measured error in dictation and as ungraded timing in WAIT", () => {
    const reading = musicResultFixture("sight-reading");
    if (reading.course !== "sight-reading") throw new Error("Wrong fixture course");
    const playedNotes = reading.playedNotes.map((note, index) =>
      index === 0 ? { ...note, durationBeats: 0 } : note
    );
    expect(validateMusicResult({ ...reading, playedNotes })).toMatchObject({
      metrics: { durationErrors: null, missingNotes: 0, extraNotes: 0 }
    });
    expect(validateMusicResult({ ...reading, purpose: "control", playedNotes })).toMatchObject({
      metrics: { durationErrors: 1 }
    });
    const dictation = musicResultFixture("dictation");
    if (dictation.course !== "dictation") throw new Error("Wrong fixture course");
    const notes = dictation.result.notes.map((note, index) =>
      index === 0 ? { ...note, durationBeats: 0, upAtMs: note.downAtMs } : note
    );
    expect(
      validateMusicResult({ ...dictation, result: { ...dictation.result, notes } })
    ).toMatchObject({
      result: { comparison: { holdingDurations: { errorsBeats: [-1, 0] }, correct: false } }
    });
  });
  it("retains actual two-hand accompaniment by matching the chord's score hand and onset", () => {
    const result = harmonyAccompanimentResultFixture();
    expect(result.answers).toHaveLength(4);
    expect(validateMusicResult(result)).toEqual(result);
    expect(mergeMusicHistory([], [result])).toEqual([result]);
    const changed = {
      ...result,
      answers: result.answers.map((answer, index) =>
        index === 0 ? { ...answer, hand: "right" } : answer
      )
    };
    expect(validateMusicResult(changed)).toBeNull();
  });
  it("rejects an assisted final reading in the independent P8 cohort but retains it as training", () => {
    const sample = musicResultFixture("integrated");
    if (sample.course !== "integrated") throw new Error("Wrong fixture course");
    const state = {
      ...sample.state,
      results: sample.state.results.map((ref) =>
        ref.activityId.endsWith("final-reading")
          ? {
              ...ref,
              purpose: "training" as const,
              help: [{ kind: "explanation" as const, atMs: 1 }]
            }
          : ref
      )
    };
    expect(validateMusicResult({ ...sample, purpose: "control", state })).toBeNull();
    expect(validateMusicResult({ ...sample, purpose: "training", state })).not.toBeNull();
    expect(validateMusicResult({ ...sample, purpose: "control" })).not.toBeNull();
  });
});

describe("harmony onset and physical synchrony evidence", () => {
  const chord = {
    kind: "played" as const,
    target: { mode: "exact" as const, pitches: [60, 64, 67] },
    playedPitches: [60, 64, 67],
    spreadMs: 100,
    attempts: []
  };
  it("uses the shared inclusive 180ms onset window only when the activity supplies an onset", () => {
    expect(HARMONY_ONSET_WINDOW_MS).toBe(180);
    for (const onsetOffsetMs of [-180, 0, 180])
      expect(computeHarmonyMetrics([{ ...chord, onsetOffsetMs }]).correctAnswers).toBe(1);
    for (const onsetOffsetMs of [-181, 181, null])
      expect(computeHarmonyMetrics([{ ...chord, onsetOffsetMs }]).correctAnswers).toBe(0);
    expect(computeHarmonyMetrics([chord]).correctAnswers).toBe(1);
  });
  it("does not invent a synchrony measurement for a missing chord but retains a real too-slow attempt", () => {
    const missing = { ...chord, playedPitches: [], spreadMs: null, onsetOffsetMs: null };
    expect(computeHarmonyMetrics([missing])).toMatchObject({
      correctAnswers: 0,
      pitchErrors: 1,
      synchronyErrors: 0
    });
    expect(
      computeHarmonyMetrics([
        { ...missing, attempts: [{ reason: "too-slow", firstAtMs: 1, failedAtMs: 202 }] }
      ])
    ).toMatchObject({ correctAnswers: 0, synchronyErrors: 1 });
    expect(computeHarmonyMetrics([{ ...chord, spreadMs: 201 }])).toMatchObject({
      correctAnswers: 0,
      synchronyErrors: 1
    });
  });
  it("validates finite optional onset evidence and recomputes the persisted harmonic grade", () => {
    const sample = musicResultFixture("harmony");
    if (sample.course !== "harmony") throw new Error("Unexpected fixture course");
    expect(
      validateMusicResult({ ...sample, answers: [{ ...chord, onsetOffsetMs: 181 }] })
    ).toMatchObject({ metrics: { correctAnswers: 0, synchronyErrors: 0 } });
    for (const onsetOffsetMs of [-60001, 60001, NaN, "late"])
      expect(validateMusicResult({ ...sample, answers: [{ ...chord, onsetOffsetMs }] })).toBeNull();
    expect(
      validateMusicResult({
        ...sample,
        answers: [{ ...chord, onsetOffsetMs: null, playedPitches: [], spreadMs: null }]
      })
    ).not.toBeNull();
  });
});

it("keeps unmeasured control rhythm null when no score note was matched", () => {
  const expected = [{ pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" as const }];
  for (const played of [
    [],
    [{ pitch: 61, startBeat: 0, durationBeats: 1, hand: "right" as const }]
  ])
    expect(computeSightReadingMetrics(expected, played, [], "control")).toMatchObject({
      missingNotes: 1,
      onsetErrors: null,
      durationErrors: null
    });
  expect(
    computeSightReadingMetrics(
      expected,
      [{ ...expected[0], pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" }],
      [],
      "control"
    )
  ).toMatchObject({ missingNotes: 0, onsetErrors: 0, durationErrors: 0 });
});
