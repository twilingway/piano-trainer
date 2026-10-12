// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { generateRhythmExercise } from "../rhythm/generator";
import { RhythmSession } from "../rhythm/session";
import type { RhythmBpm, RhythmInputSource, RhythmResult } from "../rhythm/types";
import { generateIntervalExercise } from "../intervals/generator";
import { IntervalSession } from "../intervals/session";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { addReadingResult } from "../reading/progress";
import { mergeRhythmHistory, validRhythmResult } from "./rhythmPersistence";
import { emptyReadingState, normalizeReadingState } from "./readingMigration";
import { readingActions, readingReducer } from "./readingSlice";
import { createAppStore } from "./store";
import { createMemoryReadingRepository, defaultReadingRepository } from "./readingRepository";
import { READING_STORAGE_KEY } from "./readingPersistence";
import { songActions } from "./songSlice";

function result(
  runId: string,
  completedAt = 100,
  bpm: RhythmBpm = 60,
  source: RhythmInputSource = "keyboard",
  deviceId?: string
): RhythmResult {
  const exercise = generateRhythmExercise(7, bpm);
  const session = new RhythmSession(exercise, {
    runId,
    source,
    ...(deviceId === undefined ? {} : { deviceId }),
    startedAt: 0,
    startedAtMs: 0,
    offsets: {
      inputOffsetMs: 0,
      manualInputOffsetMs: 0,
      audioOutputOffsetMs: 0,
      visualOffsetMs: 0,
      status: "uncalibrated"
    }
  });
  for (const onset of exercise.onsets)
    session.attack({
      runId,
      source,
      ...(deviceId === undefined ? {} : { deviceId }),
      rawAtMs: onset.timeS * 1000,
      correctedAtMs: onset.timeS * 1000,
      receivedAtMs: onset.timeS * 1000,
      songTimeS: onset.timeS,
      receivedSongTimeS: onset.timeS
    });
  session.advance(session.completionTimeS);
  const completed = session.result(completedAt);
  if (!completed) throw new Error("Incomplete rhythm fixture");
  return completed;
}
function intervalResult(runId: string) {
  const exercise = generateIntervalExercise("see-and-play", 1);
  const session = new IntervalSession(exercise, { runId, startedAt: 0 });
  session.setActive(true, 0);
  exercise.pairs.forEach((pair, index) => {
    const identity = session.identity();
    if (!identity) throw new Error("Missing interval identity");
    session.present(identity, index * 10);
    session.answerPitch(identity, pair.anchorMidi, "keyboard", index * 10 + 1);
    session.answerPitch(identity, pair.targetMidi, "keyboard", index * 10 + 2);
  });
  const completed = session.result(runId, 100);
  if (!completed) throw new Error("Incomplete interval fixture");
  return completed;
}
function readingResult(id: string) {
  const exercise = generateReadingExercise("notes", 42);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    session.prepare(note.id, note.pitch, index * 1000);
    session.present(note.id, index * 1000);
    session.answer(note.pitch, "midi", index * 1000 + 100);
  });
  const completed = session.result(id, 200);
  if (!completed) throw new Error("Incomplete reading fixture");
  return completed;
}
const storage = () => ({ getItem: () => null, setItem: vi.fn() });

describe("rhythm schema4 persistence", () => {
  it.each(["keyboard", "pointer"] as const)(
    "round-trips actual %s device evidence without dropping a completed series",
    async (source) => {
      const completed = result(`device-${source}`, 100, 80, source, source);
      expect(validRhythmResult(completed)).toBe(true);
      expect(completed.attacks.every((attack) => attack.deviceId === source)).toBe(true);
      const repository = createMemoryReadingRepository();
      const first = createAppStore({ storage: storage(), readingRepository: repository });
      await first.readingPersistenceReady;
      first.dispatch(readingActions.rhythmResultAdded(completed));
      await first.flushReadingPersistence();
      const restored = createAppStore({ storage: storage(), readingRepository: repository });
      await restored.readingPersistenceReady;
      expect(restored.getState().reading.rhythm.history).toEqual([completed]);
      expect(restored.getState().persistence.errors).toEqual({});
    }
  );
  it("retains a completely missed series with its declared source and null deviations", () => {
    const exercise = generateRhythmExercise(1, 100);
    const session = new RhythmSession(exercise, {
      runId: "missed",
      source: "pointer",
      startedAt: 10,
      startedAtMs: 100,
      offsets: {
        inputOffsetMs: 0,
        manualInputOffsetMs: 0,
        audioOutputOffsetMs: 0,
        visualOffsetMs: 0,
        status: "uncalibrated"
      }
    });
    session.advance(session.completionTimeS);
    const completed = session.result(200);
    expect(validRhythmResult(completed)).toBe(true);
    const state = emptyReadingState();
    const normalized = normalizeReadingState({
      ...state,
      rhythm: { ...state.rhythm, history: [completed] }
    });
    expect(normalized.invalid).toBe(false);
    expect(normalized.reading.rhythm.history[0]?.summary).toMatchObject({
      hits: 0,
      misses: 10,
      signedMedianMs: null,
      absoluteMedianMs: null
    });
    expect(
      normalized.reading.rhythm.history[0]?.misses.every((miss) => miss.source === "pointer")
    ).toBe(true);
  });
  it("migrates schema3 without reassessing or pruning P2/P3 and is idempotent", () => {
    const saved = emptyReadingState();
    const reading = readingResult("p2");
    saved.task = "notes";
    saved.seed = 42;
    saved.history = [reading];
    saved.plan = reading.plan ?? null;
    saved.profile = { ...addReadingResult(saved.profile, reading), delayedDueAt: 99999 };
    saved.presentedFingerprints = ["previously-shown"];
    saved.activeCourse = "interval-training";
    saved.intervals.mode = "see-and-play";
    saved.intervals.seed = 99;
    saved.intervals.history = [intervalResult("p3")];
    const { rhythm: _rhythm, ...old } = saved;
    const first = normalizeReadingState({ ...old, schemaVersion: 3 });
    expect(first.invalid).toBe(false);
    expect(first.reading).toMatchObject({ ...old, schemaVersion: 4 });
    expect(first.reading.profile).toEqual(saved.profile);
    expect(first.reading.rhythm.history).toEqual([]);
    expect(normalizeReadingState(first.reading).reading).toEqual(first.reading);
  });
  it("preserves all selections while choosing a single active course", () => {
    let state = readingReducer(undefined, readingActions.select({ task: "notes", seed: 42 }));
    state = readingReducer(
      state,
      readingActions.intervalSelected({ mode: "see-and-play", seed: 8 })
    );
    state = readingReducer(
      state,
      readingActions.rhythmSelected({ seed: 7, bpm: 80, inputSource: "pointer" })
    );
    const revision = state.selectionRevision;
    state = readingReducer(state, readingActions.rhythmResultAdded(result("finished")));
    expect(state).toMatchObject({
      activeCourse: "rhythm-training",
      task: "notes",
      seed: 42,
      intervals: { seed: 8 },
      rhythm: { seed: 7, bpm: 80, inputSource: "pointer" },
      selectionRevision: revision
    });
    state = readingReducer(state, readingActions.exit());
    expect(state.activeCourse).toBe(null);
    expect(state.rhythm.history).toHaveLength(1);
  });
  it("caps twenty completed rhythm runs across tempos and sources, preserving committed duplicate evidence", () => {
    const saved = emptyReadingState();
    saved.history = [readingResult("p2")];
    saved.intervals.history = [intervalResult("p3")];
    for (let index = 0; index < 24; index++)
      saved.rhythm.history.push(
        result(`run-${String(index)}`, index, index % 2 ? 80 : 60, index % 2 ? "midi" : "keyboard")
      );
    const restored = normalizeReadingState(saved).reading;
    expect(restored.rhythm.history).toHaveLength(20);
    expect(restored.rhythm.history[0]?.runId).toBe("run-4");
    expect(restored.history).toHaveLength(1);
    expect(restored.intervals.history).toHaveLength(1);
    const committed = result("same", 10);
    expect(mergeRhythmHistory([committed], [{ ...committed, completedAt: 99 }])).toEqual([
      committed
    ]);
  });
  it("drops corrupt rhythm rows without damaging valid course siblings", () => {
    const valid = result("valid");
    expect(validRhythmResult(valid)).toBe(true);
    const saved = emptyReadingState();
    saved.history = [readingResult("p2")];
    saved.intervals.history = [intervalResult("p3")];
    const corrupted = [
      { ...valid, runId: "bad-run" },
      { ...valid, summary: { ...valid.summary, hits: 9 } },
      { ...valid, attacks: [{ ...valid.attacks[0], rawAtMs: NaN }, ...valid.attacks.slice(1)] },
      { ...valid, offsets: { ...valid.offsets, status: "unknown" } }
    ];
    const normalized = normalizeReadingState({
      ...saved,
      rhythm: { ...saved.rhythm, history: [valid, ...corrupted] }
    });
    expect(normalized.invalid).toBe(true);
    expect(normalized.reading.rhythm.history.map((row) => row.runId)).toEqual(["valid"]);
    expect(normalized.reading.history).toHaveLength(1);
    expect(normalized.reading.intervals.history).toHaveLength(1);
  });
  it("hydrates late without replacing a locally reselected default rhythm or fresh run", async () => {
    const saved = emptyReadingState();
    saved.activeCourse = "interval-training";
    saved.intervals.mode = "see-and-play";
    saved.rhythm.seed = 77;
    saved.rhythm.bpm = 100;
    saved.rhythm.inputSource = "midi";
    saved.rhythm.history = [result("old")];
    const backing = createMemoryReadingRepository(saved);
    let resolve!: (value: unknown) => void;
    const load = new Promise<unknown>((yes) => {
      resolve = yes;
    });
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...backing, load: () => load }
    });
    store.dispatch(readingActions.rhythmSelected({ seed: 1, bpm: 60, inputSource: "keyboard" }));
    store.dispatch(readingActions.rhythmResultAdded(result("local", 200)));
    resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    for (const state of [
      store.getState().reading,
      normalizeReadingState(await backing.load()).reading
    ]) {
      expect(state).toMatchObject({
        activeCourse: "rhythm-training",
        rhythm: { seed: 1, bpm: 60, inputSource: "keyboard" }
      });
      expect(state.rhythm.history.map((row) => row.runId)).toEqual(["old", "local"]);
    }
  });
  it("a song opened before late restoration keeps rhythm inactive", async () => {
    const saved = emptyReadingState();
    saved.activeCourse = "rhythm-training";
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
  });
  it("atomically merges schema4 P4/P3/P2 writes while retaining the last selected course", async () => {
    const first = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    const second = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(readingActions.rhythmSelected({ seed: 9, bpm: 100, inputSource: "midi" }));
    first.dispatch(readingActions.rhythmResultAdded(result("tab-p4")));
    await first.flushReadingPersistence();
    second.dispatch(readingActions.intervalResultAdded(intervalResult("tab-p3")));
    second.dispatch(readingActions.resultAdded(readingResult("tab-p2")));
    second.dispatch(readingActions.rhythmResultAdded(result("tab-p4")));
    await second.flushReadingPersistence();
    const restored = normalizeReadingState(await defaultReadingRepository.load()).reading;
    expect(restored).toMatchObject({
      activeCourse: "rhythm-training",
      rhythm: { seed: 9, bpm: 100, inputSource: "midi" }
    });
    expect(restored.rhythm.history.filter((row) => row.runId === "tab-p4")).toHaveLength(1);
    expect(restored.intervals.history.some((row) => row.runId === "tab-p3")).toBe(true);
    expect(restored.history.some((row) => row.id === "tab-p2")).toBe(true);
    second.dispatch(readingActions.intervalSelected({ mode: "see-and-play", seed: 77 }));
    await second.flushReadingPersistence();
    first.dispatch(readingActions.rhythmResultAdded(result("stale-tab-p4")));
    await first.flushReadingPersistence();
    expect(normalizeReadingState(await defaultReadingRepository.load()).reading.activeCourse).toBe(
      "interval-training"
    );
  });
  it("blocks future/read failures and later downgrade attempts without overwriting data", async () => {
    for (const load of [
      () => Promise.resolve({ schemaVersion: 5, marker: "future" }),
      () => Promise.reject(new Error("read denied"))
    ]) {
      const update = vi.fn();
      const store = createAppStore({ storage: storage(), readingRepository: { load, update } });
      store.dispatch(readingActions.rhythmResultAdded(result("memory")));
      await store.readingPersistenceReady;
      await store.flushReadingPersistence();
      expect(update).not.toHaveBeenCalled();
      expect(store.getState().reading.rhythm.history).toHaveLength(1);
      expect(store.getState().persistence.errors).toHaveProperty("indexedDB:reading:read");
    }
    const repository = createMemoryReadingRepository(emptyReadingState());
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    const future = { schemaVersion: 5, marker: "future-after-hydration" };
    await repository.update(() => future);
    store.dispatch(readingActions.rhythmResultAdded(result("cannot-downgrade")));
    await store.flushReadingPersistence();
    expect(await repository.load()).toEqual(future);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
  it("reports transaction abort after successful put and retains local P4 evidence", async () => {
    const store = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await store.readingPersistenceReady;
    const before = await defaultReadingRepository.load();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Keep the native receiver.
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
      store.dispatch(readingActions.rhythmResultAdded(result("aborted-rhythm")));
      await store.flushReadingPersistence();
    } finally {
      put.mockRestore();
    }
    expect(
      store.getState().reading.rhythm.history.some((row) => row.runId === "aborted-rhythm")
    ).toBe(true);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
    expect(await defaultReadingRepository.load()).toEqual(before);
  });
  it("leaves legacy localStorage untouched and saves no unfinished runtime or revision", async () => {
    const legacy = JSON.stringify({ task: "notes", seed: 42 });
    const backing = {
      getItem: (key: string) => (key === READING_STORAGE_KEY ? legacy : null),
      setItem: vi.fn()
    };
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: backing, readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.rhythmSelected({ seed: 8, bpm: 80, inputSource: "pointer" }));
    await store.flushReadingPersistence();
    const saved = await repository.load();
    expect(saved).not.toHaveProperty("selectionRevision");
    expect(saved).toMatchObject({
      schemaVersion: 4,
      rhythm: { seed: 8, bpm: 80, inputSource: "pointer", history: [] }
    });
    expect(backing.getItem(READING_STORAGE_KEY)).toBe(legacy);
    expect(backing.setItem).not.toHaveBeenCalled();
  });
});
