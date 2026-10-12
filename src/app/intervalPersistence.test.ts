// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type {
  IntervalCategory,
  IntervalMode,
  IntervalResult,
  IntervalSkillId
} from "../intervals/types";
import { validIntervalResult } from "./intervalPersistence";
import { emptyReadingState, normalizeReadingState } from "./readingMigration";
import { readingActions, readingReducer } from "./readingSlice";
import { createAppStore } from "./store";
import { createMemoryReadingRepository, defaultReadingRepository } from "./readingRepository";
import { songActions } from "./songSlice";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { addReadingResult } from "../reading/progress";

function intervalResult(
  runId: string,
  mode: IntervalMode = "see-and-play",
  completedAt = 100
): IntervalResult {
  const visual = mode === "see-and-play";
  const skillId: IntervalSkillId = visual ? "interval-pair-playing" : "aural-interval";
  const exerciseId = "interval-v1";
  const categories: IntervalCategory[] = [
    "repeat",
    "step-up",
    "step-down",
    "third-up",
    "third-down"
  ];
  return {
    id: runId,
    runId,
    exerciseId,
    skillId,
    mode,
    seed: 1,
    generatorVersion: 1,
    createdAt: completedAt,
    startedAt: 0,
    completedAt,
    questions: Array.from({ length: 10 }, (_, index) => {
      const category = categories[index % 5] ?? "repeat";
      const targetMidi = [64, 65, 62, 67, 60][index % 5] ?? 64;
      const questionId = `question-${String(index)}`;
      const common = {
        skillId,
        exerciseId,
        runId,
        questionId,
        inputSource: "keyboard" as const,
        atMs: 2,
        responseLatencyMs: 2,
        helpShown: false,
        correct: true
      };
      return {
        questionId,
        category,
        anchorMidi: 64,
        targetMidi,
        inputSource: "keyboard",
        responseKind: visual ? "piano-pair" : "category-choice",
        firstAttemptCorrect: true,
        independentCorrect: true,
        unassistedSolved: true,
        firstListeningCorrect: visual ? null : true,
        firstReactionMs: 1,
        solutionMs: 2,
        fullListeningCount: visual ? 0 : 1,
        partialListeningCount: 0,
        presentedAtMs: 0,
        helpHistory: [],
        attempts: visual
          ? [
              {
                ...common,
                atMs: 1,
                responseLatencyMs: 1,
                attemptId: `${questionId}:0`,
                responseKind: "piano-pair",
                noteRole: 0,
                expectedMidi: 64,
                playedMidi: 64
              },
              {
                ...common,
                attemptId: `${questionId}:1`,
                responseKind: "piano-pair",
                noteRole: 1,
                expectedMidi: targetMidi,
                playedMidi: targetMidi
              }
            ]
          : [
              {
                ...common,
                attemptId: `${questionId}:0`,
                responseKind: "category-choice",
                expectedCategory: category,
                chosenCategory: category
              }
            ]
      };
    })
  };
}
function noteResult(id: string) {
  const exercise = generateReadingExercise("notes", 42);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    session.prepare(note.id, note.pitch, index * 1000);
    session.present(note.id, index * 1000);
    session.answer(note.pitch, "midi", index * 1000 + 100);
  });
  const result = session.result(id, 200);
  if (!result) throw new Error("Fixture incomplete");
  return result;
}
const storage = () => ({ getItem: () => null, setItem: vi.fn() });

describe("interval envelope persistence", () => {
  it("migrates schema2 without reassessing valid P2 profile and is idempotent", () => {
    const result = noteResult("p2");
    const state = emptyReadingState();
    state.task = "notes";
    state.seed = 42;
    state.history = [result];
    state.profile = { ...addReadingResult(state.profile, result), delayedDueAt: 99999 };
    state.presentedFingerprints = ["actual-fingerprint"];
    const { activeCourse: _active, intervals: _intervals, ...p2 } = state;
    const first = normalizeReadingState({ ...p2, schemaVersion: 2 });
    expect(first.invalid).toBe(false);
    expect(first.reading).toMatchObject({ ...p2, schemaVersion: 5, activeCourse: "note-reading" });
    expect(first.reading.profile).toEqual(state.profile);
    expect(first.reading.intervals.history).toEqual([]);
    expect(normalizeReadingState(first.reading).reading).toEqual(first.reading);
  });
  it("keeps both selections but only one active course and does not revise for progress/filter", () => {
    let state = readingReducer(undefined, readingActions.select({ task: "phrases", seed: 42 }));
    state = readingReducer(
      state,
      readingActions.intervalSelected({ mode: "hear-and-choose", seed: 7 })
    );
    expect(state).toMatchObject({
      task: "phrases",
      seed: 42,
      activeCourse: "interval-training",
      intervals: { mode: "hear-and-choose", seed: 7 }
    });
    const revision = state.selectionRevision;
    state = readingReducer(state, readingActions.intervalSourceFilterChanged("pointer"));
    state = readingReducer(
      state,
      readingActions.intervalResultAdded(intervalResult("done", "hear-and-choose"))
    );
    expect(state.selectionRevision).toBe(revision);
    state = readingReducer(state, readingActions.exit());
    expect(state.activeCourse).toBe(null);
    expect(state.task).toBe("phrases");
    expect(state.intervals.mode).toBe("hear-and-choose");
  });
  it("retains twenty runs per P3 mode without reducing P2 history", () => {
    let state = readingReducer(undefined, { type: "init" });
    state = readingReducer(state, readingActions.resultAdded(noteResult("p2-retained")));
    for (let index = 0; index < 23; index++) {
      for (const mode of ["see-and-play", "hear-and-choose"] as const)
        state = readingReducer(
          state,
          readingActions.intervalResultAdded(
            intervalResult(`${mode}:${String(index)}`, mode, index)
          )
        );
    }
    const restored = normalizeReadingState(state).reading;
    expect(restored.history).toHaveLength(1);
    expect(restored.intervals.history).toHaveLength(40);
    expect(restored.intervals.history.some((row) => row.id === "see-and-play:0")).toBe(false);
    expect(restored.intervals.history.some((row) => row.id === "hear-and-choose:22")).toBe(true);
  });
  it("discards one malformed P3 run while preserving valid P2 and P3", () => {
    const valid = intervalResult("valid");
    expect(validIntervalResult(valid)).toBe(true);
    const state = emptyReadingState();
    state.history = [noteResult("p2-valid")];
    const restored = normalizeReadingState({
      ...state,
      intervals: {
        ...state.intervals,
        history: [valid, { ...valid, runId: "bad", questions: valid.questions.slice(1) }]
      }
    });
    expect(restored.invalid).toBe(true);
    expect(restored.reading.history).toHaveLength(1);
    expect(restored.reading.intervals.history.map((row) => row.runId)).toEqual(["valid"]);
    expect(
      validIntervalResult({
        ...intervalResult("ear", "hear-and-choose"),
        questions: valid.questions
      })
    ).toBe(false);
  });
  it("preserves a newer P3 selection, filter, and local run through late hydration", async () => {
    const saved = emptyReadingState();
    saved.activeCourse = "note-reading";
    saved.task = "notes";
    saved.intervals.history = [intervalResult("old")];
    const backing = createMemoryReadingRepository(saved);
    let resolve!: (value: unknown) => void;
    const load = new Promise<unknown>((yes) => {
      resolve = yes;
    });
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...backing, load: () => load }
    });
    store.dispatch(readingActions.intervalSelected({ mode: "hear-and-choose", seed: 42 }));
    store.dispatch(readingActions.intervalSourceFilterChanged("pointer"));
    store.dispatch(readingActions.intervalResultAdded(intervalResult("local", "hear-and-choose")));
    resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    for (const state of [
      store.getState().reading,
      normalizeReadingState(await backing.load()).reading
    ]) {
      expect(state.activeCourse).toBe("interval-training");
      expect(state.intervals).toMatchObject({
        mode: "hear-and-choose",
        seed: 42,
        sourceFilter: "pointer"
      });
      expect(state.intervals.history.map((row) => row.runId)).toEqual(["old", "local"]);
    }
  });
  it("a normal song chosen before late restoration keeps both course runtimes inactive", async () => {
    const saved = emptyReadingState();
    saved.activeCourse = "interval-training";
    saved.intervals.mode = "see-and-play";
    let resolve!: (value: unknown) => void;
    const load = new Promise<unknown>((yes) => {
      resolve = yes;
    });
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...createMemoryReadingRepository(saved), load: () => load }
    });
    store.dispatch(
      songActions.songOpened({
        song: { title: "", source: "midi", notes: [], beats: [], measures: [], duration: 0 },
        lesson: null,
        librarySource: null
      })
    );
    resolve(saved);
    await store.readingPersistenceReady;
    expect(store.getState().reading.activeCourse).toBe(null);
    expect(store.getState().reading.intervals.mode).toBe("see-and-play");
  });
  it("atomic stale P2 writes preserve P3 selection, filter, run and cross-tab dedup", async () => {
    const first = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    const second = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(readingActions.intervalSelected({ mode: "hear-and-choose", seed: 123 }));
    first.dispatch(readingActions.intervalSourceFilterChanged("pointer"));
    first.dispatch(readingActions.intervalResultAdded(intervalResult("tab-p3", "hear-and-choose")));
    await first.flushReadingPersistence();
    second.dispatch(readingActions.resultAdded(noteResult("tab-p2")));
    second.dispatch(readingActions.preferencesChanged({ automaticHints: false }));
    second.dispatch(
      readingActions.intervalResultAdded(intervalResult("tab-p3", "hear-and-choose"))
    );
    await second.flushReadingPersistence();
    const restored = normalizeReadingState(await defaultReadingRepository.load()).reading;
    expect(restored.activeCourse).toBe("interval-training");
    expect(restored.intervals).toMatchObject({
      mode: "hear-and-choose",
      seed: 123,
      sourceFilter: "pointer"
    });
    expect(restored.intervals.history.filter((row) => row.runId === "tab-p3")).toHaveLength(1);
    expect(restored.history.some((row) => row.id === "tab-p2")).toBe(true);
  });
  it("blocks unknown future schema and read failures for P3 while retaining memory progress", async () => {
    for (const load of [
      () => Promise.resolve({ schemaVersion: 6, marker: "future" }),
      () => Promise.reject(new Error("denied"))
    ]) {
      const update = vi.fn();
      const store = createAppStore({ storage: storage(), readingRepository: { load, update } });
      store.dispatch(readingActions.intervalSelected({ mode: "hear-and-choose", seed: 123 }));
      store.dispatch(readingActions.intervalResultAdded(intervalResult("memory")));
      await store.readingPersistenceReady;
      await store.flushReadingPersistence();
      expect(update).not.toHaveBeenCalled();
      expect(store.getState().reading.intervals.history).toHaveLength(1);
      expect(store.getState().persistence.errors).toHaveProperty("indexedDB:reading:read");
    }
  });
  it("stale P3 progress preserves a freshly selected P2 series and its preferences", async () => {
    const repository = createMemoryReadingRepository();
    const first = createAppStore({ storage: storage(), readingRepository: repository });
    const second = createAppStore({ storage: storage(), readingRepository: repository });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(readingActions.select({ task: "phrases", seed: 77 }));
    first.dispatch(readingActions.sourceFilterChanged("midi"));
    first.dispatch(readingActions.preferencesChanged({ nameDelayMs: 18000 }));
    first.dispatch(readingActions.resultAdded(noteResult("recent-p2")));
    await first.flushReadingPersistence();
    second.dispatch(readingActions.intervalResultAdded(intervalResult("stale-p3")));
    await second.flushReadingPersistence();
    const restored = normalizeReadingState(await repository.load()).reading;
    expect(restored).toMatchObject({
      activeCourse: "note-reading",
      task: "phrases",
      seed: 77,
      sourceFilter: "midi",
      preferences: { nameDelayMs: 18000 }
    });
    expect(restored.history.some((row) => row.runId === "recent-p2")).toBe(true);
    expect(restored.intervals.history.some((row) => row.runId === "stale-p3")).toBe(true);
  });
  it("retains P3 progress in memory when a successful put is followed by transaction abort", async () => {
    const store = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await store.readingPersistenceReady;
    const before = await defaultReadingRepository.load();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the native receiver.
    const original = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      const request =
        key === undefined ? original.call(this, value) : original.call(this, value, key);
      request.addEventListener("success", () => {
        this.transaction.abort();
      });
      return request;
    });
    try {
      store.dispatch(readingActions.intervalResultAdded(intervalResult("aborted-p3")));
      await store.flushReadingPersistence();
    } finally {
      put.mockRestore();
    }
    expect(
      store.getState().reading.intervals.history.some((row) => row.runId === "aborted-p3")
    ).toBe(true);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
    expect(await defaultReadingRepository.load()).toEqual(before);
  });
});
