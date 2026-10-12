// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { generateBassReadingExercise } from "../reading/bassGenerator";
import { toBassReadingResult, type BassReadingTask } from "../reading/bassTypes";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { generateReadingExercise } from "../reading/generator";
import { generateIntervalExercise } from "../intervals/generator";
import { IntervalSession } from "../intervals/session";
import { generateRhythmExercise } from "../rhythm/generator";
import { RhythmSession } from "../rhythm/session";
import { emptyBassState, mergeBassHistory, validBassResult } from "./bassPersistence";
import { emptyReadingState, normalizeReadingState } from "./readingMigration";
import { readingActions, readingReducer } from "./readingSlice";
import { createAppStore } from "./store";
import { createMemoryReadingRepository, defaultReadingRepository } from "./readingRepository";
import { READING_STORAGE_KEY } from "./readingPersistence";

function result(runId: string, task: BassReadingTask = "notes", completedAt = 100, help = false) {
  const exercise = generateBassReadingExercise(task, 7);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId,
    startedAt: 1
  });
  session.setActive(true, 0);
  exercise.song.notes.forEach((note, index) => {
    const at = index * 1000;
    session.prepare(note.id, note.pitch, at);
    session.present(note.id, at);
    if (help && index === 0) {
      session.answer(note.pitch + 12, "midi", at + 10);
      session.showHint(note.id, 2, at + 20);
    }
    session.answer(note.pitch, "pointer", at + 100);
  });
  const completed = session.result(runId, completedAt);
  const bass = completed && toBassReadingResult(completed);
  if (!bass) throw new Error("Incomplete bass fixture");
  return bass;
}
const storage = () => ({ getItem: () => null, setItem: vi.fn() });

describe("bass schema5 persistence", () => {
  it("validates completed evidence including errors and current-note help", () => {
    expect(validBassResult(result("notes"))).toBe(true);
    expect(validBassResult(result("phrases", "phrases", 100, true))).toBe(true);
  });
  it("retains evidence before a staff retry and excludes the inactive interval", () => {
    const exercise = generateBassReadingExercise("notes", 7);
    const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, {
      runId: "retry",
      startedAt: 1
    });
    session.setActive(true, 0);
    exercise.song.notes.forEach((note, index) => {
      const at = index * 1000;
      session.prepare(note.id, note.pitch, at);
      session.present(note.id, at);
      if (index === 0) {
        session.answer(note.pitch + 12, "midi", 10);
        session.showHint(note.id, 2, 20);
        session.setActive(false, 30);
        session.requirePresentation(note.id, 50);
        session.present(note.id, 100);
        session.setActive(true, 110);
      }
      session.answer(note.pitch, "pointer", at + (index === 0 ? 120 : 100));
    });
    const completed = toBassReadingResult(session.result("retry", 100));
    expect(completed?.notes[0]).toMatchObject({ presentedAtMs: 0, responseLatencyMs: 40 });
    expect(validBassResult(completed)).toBe(true);
  });
  it("rejects changed identity, unknown generator, reordered notes, broken errors/help and forged metrics", () => {
    const sample = result("strict", "notes", 100, true);
    const first = sample.notes[0];
    if (!first) throw new Error("Missing note");
    const variants = [
      { ...sample, skillId: "note-reading" },
      { ...sample, exerciseId: "other" },
      { ...sample, seed: 8 },
      { ...sample, generatorVersion: 2 },
      { ...sample, notes: sample.notes.toReversed() },
      { ...sample, notes: [...sample.notes.slice(0, 19)] },
      { ...sample, notes: [{ ...first, firstAttemptCorrect: true }, ...sample.notes.slice(1)] },
      { ...sample, notes: [{ ...first, independentCorrect: true }, ...sample.notes.slice(1)] },
      { ...sample, notes: [{ ...first, hintHistory: [] }, ...sample.notes.slice(1)] },
      { ...sample, notes: [{ ...first, presentedAtMs: 1000 }, ...sample.notes.slice(1)] },
      {
        ...sample,
        notes: [
          { ...first, attempts: first.attempts.map((a) => ({ ...a, runId: "other" })) },
          ...sample.notes.slice(1)
        ]
      },
      {
        ...sample,
        notes: sample.notes.map((n) => ({
          ...n,
          attempts: n.attempts.map((a) => ({ ...a, attemptId: "same" }))
        }))
      }
    ];
    for (const bad of variants) expect(validBassResult(bad)).toBe(false);
  });
  it("keeps twenty per task and deduplicates committed run IDs", () => {
    const notes = Array.from({ length: 23 }, (_, i) =>
      result(`notes-${String(i)}`, "notes", i + 1)
    );
    const phrases = Array.from({ length: 23 }, (_, i) =>
      result(`phrases-${String(i)}`, "phrases", i + 1)
    );
    const history = mergeBassHistory(notes, [...phrases, ...notes.slice(-1)]);
    expect(history).toHaveLength(40);
    expect(history.filter((row) => row.task === "notes")).toHaveLength(20);
    expect(history.some((row) => row.runId === "notes-0")).toBe(false);
    const committed = history[0];
    if (!committed) throw new Error("Missing committed run");
    expect(mergeBassHistory(history, [{ ...committed, id: "stale" }])).toEqual(history);
  });
  it("migrates schema1..4 idempotently with empty bass and unchanged sibling evidence", () => {
    const modern = emptyReadingState();
    modern.profile = { ...modern.profile, processedRunIds: ["p2-processed"] };
    modern.presentedFingerprints = ["p2-seen"];
    for (const version of [1, 2, 3, 4]) {
      const { bass: _bass, ...old } = modern;
      const normalized = normalizeReadingState({ ...old, schemaVersion: version });
      expect(normalized.invalid).toBe(false);
      expect(normalized.reading.schemaVersion).toBe(5);
      expect(normalized.reading.bass).toEqual(emptyBassState());
      expect(normalized.reading.profile.processedRunIds).toEqual(["p2-processed"]);
      expect(normalizeReadingState(normalized.reading).reading).toEqual(normalized.reading);
    }
  });
  it("rejects missing schema5 bass and filters invalid bass without swallowing it into P2", () => {
    const { bass: _bass, ...missing } = emptyReadingState();
    expect(normalizeReadingState(missing).invalid).toBe(true);
    const sample = result("isolated");
    const saved = emptyReadingState();
    const attempted = readingReducer(saved, readingActions.resultAdded(sample));
    expect(attempted.history).toEqual([]);
    expect(attempted.profile).toEqual(saved.profile);
    const normalized = normalizeReadingState({
      ...saved,
      history: [sample],
      bass: { ...saved.bass, history: [sample, { ...sample, exerciseId: "wrong" }] }
    });
    expect(normalized.invalid).toBe(true);
    expect(normalized.reading.history).toEqual([]);
    expect(normalized.reading.bass.history).toEqual([sample]);
  });
  it("round-trips selected task/filter and leaves legacy storage untouched", async () => {
    const legacy = JSON.stringify({ task: "notes", seed: 4 });
    const backing = {
      getItem: (key: string) => (key === READING_STORAGE_KEY ? legacy : null),
      setItem: vi.fn()
    };
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: backing, readingRepository: repository });
    await store.readingPersistenceReady;
    const sample = result("roundtrip", "phrases");
    store.dispatch(readingActions.bassSelected({ task: "phrases", seed: 7 }));
    store.dispatch(readingActions.bassSourceFilterChanged("pointer"));
    store.dispatch(readingActions.bassResultAdded(sample));
    store.dispatch(readingActions.bassResultAdded(sample));
    await store.flushReadingPersistence();
    const restored = createAppStore({ storage: backing, readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading).toMatchObject({
      schemaVersion: 5,
      activeCourse: "bass-reading",
      bass: { task: "phrases", seed: 7, sourceFilter: "pointer", history: [sample] }
    });
    expect(restored.getState().reading.profile.processedRunIds).toEqual([]);
    expect(await repository.load()).not.toHaveProperty("selectionRevision");
    expect(backing.getItem(READING_STORAGE_KEY)).toBe(legacy);
    expect(backing.setItem).not.toHaveBeenCalled();
  });
  it("retains a newer bass selection and completed local run through late hydration", async () => {
    const saved = emptyReadingState();
    saved.activeCourse = "rhythm-training";
    saved.bass.history = [result("saved")];
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((yes) => {
      resolve = yes;
    });
    const repository = createMemoryReadingRepository(saved);
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...repository, load: () => pending }
    });
    store.dispatch(readingActions.bassSelected({ task: "phrases", seed: 9 }));
    store.dispatch(readingActions.bassSourceFilterChanged("midi"));
    store.dispatch(readingActions.bassResultAdded(result("local", "phrases", 200)));
    resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    expect(store.getState().reading).toMatchObject({
      activeCourse: "bass-reading",
      bass: { task: "phrases", seed: 9, sourceFilter: "midi" }
    });
    expect(
      normalizeReadingState(await repository.load()).reading.bass.history.map((r) => r.runId)
    ).toEqual(["saved", "local"]);
  });
  it("atomically preserves P2 and bass results across stale tabs and unrelated preferences", async () => {
    const repository = createMemoryReadingRepository();
    const first = createAppStore({ storage: storage(), readingRepository: repository });
    const second = createAppStore({ storage: storage(), readingRepository: repository });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(readingActions.bassSelected({ task: "phrases", seed: 7 }));
    first.dispatch(readingActions.bassResultAdded(result("bass-tab", "phrases")));
    const exercise = generateReadingExercise("notes", 42);
    const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
    session.setActive(true, 0);
    exercise.song.notes.forEach((n, i) => {
      session.prepare(n.id, n.pitch, i * 100);
      session.present(n.id, i * 100);
      session.answer(n.pitch, "keyboard", i * 100 + 10);
    });
    const right = session.result("right-tab", 200);
    if (!right) throw new Error("Incomplete right fixture");
    second.dispatch(readingActions.resultAdded(right));
    second.dispatch(readingActions.preferencesChanged({ nameDelayMs: 9000 }));
    await Promise.all([first.flushReadingPersistence(), second.flushReadingPersistence()]);
    const saved = normalizeReadingState(await repository.load()).reading;
    expect(saved.activeCourse).toBe("bass-reading");
    expect(saved.bass.history.map((r) => r.runId)).toEqual(["bass-tab"]);
    expect(saved.history.map((r) => r.id)).toEqual(["right-tab"]);
    expect(saved.profile.processedRunIds).toEqual(["right-tab"]);
    expect(saved.preferences.nameDelayMs).toBe(9000);
  });
  it("unions bass, interval and rhythm siblings from stale tabs in the actual DB", async () => {
    const first = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    const second = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    const bass = result("sibling-bass");
    const intervals = generateIntervalExercise("see-and-play", 3);
    const interval = new IntervalSession(intervals, { runId: "sibling-interval", startedAt: 1 });
    interval.setActive(true, 0);
    intervals.pairs.forEach((pair, index) => {
      const identity = interval.identity();
      if (!identity) throw new Error("Missing interval identity");
      interval.present(identity, index * 100);
      interval.answerPitch(identity, pair.anchorMidi, "keyboard", index * 100 + 10);
      interval.answerPitch(identity, pair.targetMidi, "keyboard", index * 100 + 20);
    });
    const intervalResult = interval.result("sibling-interval", 200);
    if (!intervalResult) throw new Error("Incomplete interval");
    const exercise = generateRhythmExercise(4, 60);
    const rhythm = new RhythmSession(exercise, {
      runId: "sibling-rhythm",
      source: "keyboard",
      startedAt: 1,
      startedAtMs: 0,
      offsets: {
        inputOffsetMs: 0,
        manualInputOffsetMs: 0,
        audioOutputOffsetMs: 0,
        visualOffsetMs: 0,
        status: "uncalibrated"
      }
    });
    rhythm.advance(rhythm.completionTimeS);
    const rhythmResult = rhythm.result(300);
    if (!rhythmResult) throw new Error("Incomplete rhythm");
    first.dispatch(readingActions.bassResultAdded(bass));
    first.dispatch(readingActions.bassSelected({ task: "notes", seed: 7 }));
    second.dispatch(readingActions.intervalResultAdded(intervalResult));
    second.dispatch(readingActions.rhythmResultAdded(rhythmResult));
    await Promise.all([first.flushReadingPersistence(), second.flushReadingPersistence()]);
    const saved = normalizeReadingState(await defaultReadingRepository.load()).reading;
    expect(saved.bass.history).toContainEqual(bass);
    expect(saved.intervals.history).toContainEqual(intervalResult);
    expect(saved.rhythm.history).toContainEqual(rhythmResult);
    expect(saved.activeCourse).toBe("bass-reading");
  });
  it("blocks a destructive write if the saved schema becomes corrupt after hydration", async () => {
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    const corrupt = { ...emptyReadingState(), bass: { ...emptyBassState(), generatorVersion: 99 } };
    await repository.update(() => corrupt);
    store.dispatch(readingActions.bassResultAdded(result("memory-after-corrupt")));
    await store.flushReadingPersistence();
    expect(await repository.load()).toEqual(corrupt);
    expect(store.getState().reading.bass.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
  it.each([
    { schemaVersion: 6, marker: "future" },
    { ...emptyReadingState(), bass: undefined },
    { ...emptyReadingState(), bass: { ...emptyBassState(), history: [{ id: "corrupt" }] } }
  ])(
    "keeps unknown or corrupted records intact while practice remains in memory",
    async (saved) => {
      const repository = createMemoryReadingRepository(saved);
      const store = createAppStore({ storage: storage(), readingRepository: repository });
      await store.readingPersistenceReady;
      store.dispatch(readingActions.bassResultAdded(result("memory")));
      await store.flushReadingPersistence();
      expect(await repository.load()).toEqual(saved);
      expect(store.getState().reading.bass.history).toHaveLength(1);
      expect(store.getState().persistence.errors["indexedDB:reading:read"]).toBe("invalid");
    }
  );
  it("blocks reads that fail and preserves local bass results on quota failure", async () => {
    const update = vi.fn();
    const unreadable = createAppStore({
      storage: storage(),
      readingRepository: { load: () => Promise.reject(new Error("denied")), update }
    });
    await unreadable.readingPersistenceReady;
    unreadable.dispatch(readingActions.bassResultAdded(result("unread")));
    await unreadable.flushReadingPersistence();
    expect(update).not.toHaveBeenCalled();
    const store = createAppStore({
      storage: storage(),
      readingRepository: {
        load: () => Promise.resolve(undefined),
        update: () => Promise.reject(new DOMException("full", "QuotaExceededError"))
      }
    });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.bassResultAdded(result("quota")));
    await store.flushReadingPersistence();
    expect(store.getState().reading.bass.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
  it("rolls back an IDB abort after put while retaining the bass result in memory", async () => {
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
      store.dispatch(readingActions.bassResultAdded(result("aborted")));
      await store.flushReadingPersistence();
    } finally {
      put.mockRestore();
    }
    expect(await defaultReadingRepository.load()).toEqual(before);
    expect(store.getState().reading.bass.history.some((row) => row.runId === "aborted")).toBe(true);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
});
