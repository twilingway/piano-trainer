// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { generateTwoHandExercise } from "../reading/twoHandGenerator";
import { TwoHandSession } from "../reading/twoHandSession";
import type { HeldBassResult } from "../reading/heldBassTypes";
import { makeHeldBassResult } from "./heldBassPersistenceFixture";
import { validateHeldBassResult } from "../reading/heldBassValidation";
import { generateBassReadingExercise } from "../reading/bassGenerator";
import { toBassReadingResult } from "../reading/bassTypes";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { generateIntervalExercise } from "../intervals/generator";
import { IntervalSession } from "../intervals/session";
import { generateRhythmExercise } from "../rhythm/generator";
import { RhythmSession } from "../rhythm/session";
import { addReadingResult } from "../reading/progress";
import {
  emptyHeldBassState,
  mergeHeldBassHistory,
  normalizeHeldBassState
} from "./heldBassPersistence";
import {
  changedReadingFields,
  emptyReadingState,
  mergeReadingState,
  normalizeReadingState
} from "./readingMigration";
import { readingActions, readingReducer } from "./readingSlice";
import { READING_STORAGE_KEY } from "./readingPersistence";
import { createAppStore } from "./store";
import { createMemoryReadingRepository, defaultReadingRepository } from "./readingRepository";

function result(runId: string, completedAt = 2000, help = false): HeldBassResult {
  return makeHeldBassResult(runId, completedAt, help);
}

function coordinationResult(runId: string, completedAt = 2000, help = false) {
  const exercise = generateTwoHandExercise(7);
  const session = new TwoHandSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId,
    startedAt: 1000
  });
  session.setActive(true, 0);
  exercise.pairs.forEach((pair, index) => {
    const at = index * 1000;
    session.prepare(pair.id, at);
    session.present(pair.id, at);
    if (help && index === 0) session.showHint(pair.id, 1, at + 1);
    for (const [kind, pitch, delta] of [
      ["down", pair.pitches[0], 10],
      ["down", pair.pitches[1], 110],
      ["up", pair.pitches[0], 120],
      ["up", pair.pitches[1], 130]
    ] as const) {
      session.input({ kind, pitch, source: "keyboard", atMs: at + delta }, at + delta);
    }
    session.tick(at + 381);
  });
  const completed = session.result(runId, completedAt);
  if (!completed) throw new Error("Incomplete coordination fixture");
  return completed;
}

function siblings() {
  const state = emptyReadingState();
  state.coordination = {
    ...state.coordination,
    seed: 7,
    sourceFilter: "midi",
    history: [coordinationResult("coordination")]
  };
  const reading = generateReadingExercise("notes", 42);
  const readSession = new ReadingSession(reading, DEFAULT_READING_PREFERENCES);
  readSession.setActive(true, 0);
  reading.song.notes.forEach((note, index) => {
    readSession.prepare(note.id, note.pitch, index * 1000);
    readSession.present(note.id, index * 1000);
    readSession.answer(note.pitch, "keyboard", index * 1000 + 10);
  });
  const right = readSession.result("p2", 100);
  if (!right) throw new Error("Incomplete reading fixture");
  state.task = "notes";
  state.seed = 42;
  state.history = [right];
  state.profile = { ...addReadingResult(state.profile, right), delayedDueAt: 99999 };
  state.presentedFingerprints = ["seen-p2"];
  state.preferences = { automaticHints: false, nameDelayMs: 7000, keyDelayMs: 12000 };
  const bass = generateBassReadingExercise("phrases", 3);
  const bassSession = new ReadingSession(bass, DEFAULT_READING_PREFERENCES, {
    runId: "bass",
    startedAt: 1
  });
  bassSession.setActive(true, 0);
  bass.song.notes.forEach((note, index) => {
    bassSession.prepare(note.id, note.pitch, index * 1000);
    bassSession.present(note.id, index * 1000);
    bassSession.answer(note.pitch, "pointer", index * 1000 + 10);
  });
  const bassResult = toBassReadingResult(bassSession.result("bass", 200));
  if (!bassResult) throw new Error("Incomplete bass fixture");
  state.bass = {
    ...state.bass,
    task: "phrases",
    seed: 3,
    sourceFilter: "pointer",
    history: [bassResult]
  };
  const interval = generateIntervalExercise("see-and-play", 3);
  const intervalSession = new IntervalSession(interval, { runId: "interval", startedAt: 1 });
  intervalSession.setActive(true, 0);
  interval.pairs.forEach((pair, index) => {
    const identity = intervalSession.identity();
    if (!identity) throw new Error("Missing interval identity");
    intervalSession.present(identity, index * 100);
    intervalSession.answerPitch(identity, pair.anchorMidi, "keyboard", index * 100 + 10);
    intervalSession.answerPitch(identity, pair.targetMidi, "keyboard", index * 100 + 20);
  });
  const intervalResult = intervalSession.result("interval", 300);
  if (!intervalResult) throw new Error("Incomplete interval fixture");
  state.intervals = {
    ...state.intervals,
    mode: "see-and-play",
    seed: 3,
    history: [intervalResult]
  };
  const rhythm = generateRhythmExercise(3, 60);
  const rhythmSession = new RhythmSession(rhythm, {
    runId: "rhythm",
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
  rhythmSession.advance(rhythmSession.completionTimeS);
  const rhythmResult = rhythmSession.result(400);
  if (!rhythmResult) throw new Error("Incomplete rhythm fixture");
  state.rhythm = { ...state.rhythm, seed: 3, bpm: 60, history: [rhythmResult] };
  state.activeCourse = "bass-reading";
  return state;
}
const storage = () => ({ getItem: () => null, setItem: vi.fn() });

describe("heldBass schema7 persistence", () => {
  it("admits replay-backed results and rejects forged flags or missing releases", () => {
    const sample = result("strict", 2000, true);
    expect(validateHeldBassResult(sample)).not.toBeNull();
    const first = sample.fragments[0];
    if (!first) throw new Error("Missing pair");
    for (const [mutation, invalid] of [
      { ...sample, generatorVersion: 2 },
      { ...sample, held: [48] },
      { ...sample, exerciseId: "wrong" },
      { ...sample, fragments: sample.fragments.slice(0, 9) },
      {
        ...sample,
        fragments: [
          { ...first, attempts: first.attempts.map((a) => ({ ...a, clock: [] })) },
          ...sample.fragments.slice(1)
        ]
      },
      {
        ...sample,
        fragments: [
          {
            ...first,
            attempts: first.attempts.map((a) => ({
              ...a,
              clock: a.clock.map((segment) => ({ ...segment, speed: 0 }))
            }))
          },
          ...sample.fragments.slice(1)
        ]
      },
      {
        ...sample,
        fragments: [
          {
            ...first,
            attempts: first.attempts.map((a) => ({ ...a, onsets: a.onsets.slice(0, -1) }))
          },
          ...sample.fragments.slice(1)
        ]
      },
      { ...sample, fragments: [{ ...first, heldDurationMs: 0 }, ...sample.fragments.slice(1)] },
      {
        ...sample,
        fragments: [{ ...first, independentCorrect: true }, ...sample.fragments.slice(1)]
      },
      { ...sample, fragments: [{ ...first, hintHistory: [] }, ...sample.fragments.slice(1)] },
      {
        ...sample,
        fragments: [
          {
            ...first,
            attempts: first.attempts.map((attempt) => ({
              ...attempt,
              events: attempt.events.filter((event) => event.kind === "down")
            }))
          },
          ...sample.fragments.slice(1)
        ]
      }
    ].entries()) {
      const normalized = normalizeHeldBassState({
        ...emptyHeldBassState(),
        history: [sample, invalid]
      });
      expect(normalized.invalid, `Mutation ${String(mutation)}`).toBe(true);
      expect(normalized.heldBass.history).toEqual([sample]);
    }
  });
  it("keeps twenty newest results, unique IDs and committed runs without mutating input", () => {
    const runs = Array.from({ length: 23 }, (_, i) => result(`run-${String(i)}`, 2000 + i));
    const original = JSON.stringify(runs);
    const history = mergeHeldBassHistory(runs, runs.slice(-1));
    expect(history).toHaveLength(20);
    expect(history[0]?.runId).toBe("run-3");
    expect(history.at(-1)?.runId).toBe("run-22");
    const committed = history[0];
    const last = runs[22];
    if (!committed || !last) throw new Error("Missing committed result");
    expect(mergeHeldBassHistory(history, [{ ...committed, id: "stale-copy" }])).toEqual(history);
    expect(mergeHeldBassHistory([committed], [{ ...last, id: committed.id }])).toHaveLength(1);
    expect(JSON.stringify(runs)).toBe(original);
  });
  it("detaches nested evidence from incoming objects and stores only completed data", () => {
    const sample = result("detached");
    const history = mergeHeldBassHistory([], [sample]);
    const copied = history[0];
    if (!copied) throw new Error("Missing copied result");
    expect(copied).toEqual(sample);
    expect(copied).not.toBe(sample);
    expect(copied.fragments).not.toBe(sample.fragments);
    const fragment = copied.fragments[0];
    const original = sample.fragments[0];
    if (!fragment || !original) throw new Error("Missing fragment");
    expect(fragment.attempts).not.toBe(original.attempts);
    expect(fragment.attempts[0]?.events).not.toBe(original.attempts[0]?.events);
    expect(fragment.attempts[0]?.clock).not.toBe(original.attempts[0]?.clock);
    expect(fragment.attempts[0]?.onsets).not.toBe(original.attempts[0]?.onsets);
    expect(history).not.toHaveProperty("held");
    expect(
      normalizeHeldBassState({ ...emptyHeldBassState(), held: [48], clock: [0] }).heldBass
    ).toEqual(emptyHeldBassState());
  });
  it("migrates v1..6 idempotently, preserving supported siblings and exact P2 profile", () => {
    const modern = siblings();
    const { heldBass: _heldBass, ...old } = modern;
    for (const version of [1, 2, 3, 4, 5, 6]) {
      const first = normalizeReadingState({
        ...old,
        schemaVersion: version,
        activeCourse:
          version >= 5
            ? "bass-reading"
            : version >= 4
              ? "rhythm-training"
              : version >= 3
                ? "interval-training"
                : null
      });
      expect(first.invalid).toBe(false);
      expect(first.reading.schemaVersion).toBe(7);
      expect(first.reading.heldBass).toEqual(emptyHeldBassState());
      if (version >= 6) expect(first.reading.coordination).toEqual(modern.coordination);
      expect(first.reading.history).toEqual(modern.history);
      if (version >= 2) expect(first.reading.profile).toEqual(modern.profile);
      else expect(first.reading.profile.processedRunIds).toEqual(modern.profile.processedRunIds);
      expect(first.reading.preferences).toEqual(modern.preferences);
      if (version >= 2)
        expect(first.reading.presentedFingerprints).toEqual(modern.presentedFingerprints);
      else expect(first.reading.presentedFingerprints).toContain("seen-p2");
      if (version >= 3) expect(first.reading.intervals).toEqual(modern.intervals);
      if (version >= 4) expect(first.reading.rhythm).toEqual(modern.rhythm);
      if (version >= 5) expect(first.reading.bass).toEqual(modern.bass);
      expect(normalizeReadingState(first.reading)).toEqual(first);
    }
  });
  it("preserves unchanged P2 evidence order while merging concurrent new observations, dates and due time", () => {
    const saved = siblings();
    const stale = structuredClone(saved);
    expect(mergeReadingState(saved, stale, []).profile).toEqual(saved.profile);
    const observation = saved.profile.observations[0];
    const date = saved.profile.lastIndependent[0];
    if (!observation || !date) throw new Error("Missing P2 evidence");
    const fresh = emptyReadingState();
    fresh.profile = {
      observations: [{ ...observation, runId: "p2-new", completedAt: 500 }],
      lastIndependent: [{ ...date, completedAt: 500 }],
      processedRunIds: ["p2-new"],
      delayedDueAt: 200000
    };
    const merged = mergeReadingState(saved, fresh, []);
    expect(merged.profile.observations).toContainEqual(fresh.profile.observations[0]);
    expect(merged.profile.observations).toEqual(
      expect.arrayContaining([...saved.profile.observations])
    );
    expect(merged.profile.lastIndependent).toContainEqual(fresh.profile.lastIndependent[0]);
    expect(merged.profile.processedRunIds).toEqual(["p2", "p2-new"]);
    expect(merged.profile.delayedDueAt).toBe(200000);
    expect(mergeReadingState(merged, stale, []).profile).toEqual(merged.profile);
  });
  it("requires the schema7 sibling, validates its selection and never routes heldBass into P2", () => {
    const { heldBass: _heldBass, ...missing } = emptyReadingState();
    expect(normalizeReadingState(missing).invalid).toBe(true);
    for (const partial of [
      { seed: -1 },
      { seed: 1.2 },
      { seed: 0x100000000 },
      { generatorVersion: 99 },
      { sourceFilter: "unknown" },
      { history: null }
    ])
      expect(normalizeHeldBassState({ ...emptyHeldBassState(), ...partial }).invalid).toBe(true);
    const saved = emptyReadingState();
    const sample = result("isolated");
    const normalized = normalizeReadingState({
      ...saved,
      history: [sample],
      heldBass: { ...saved.heldBass, history: [sample] }
    });
    expect(normalized.invalid).toBe(true);
    expect(normalized.reading.heldBass.history).toEqual([sample]);
    expect(normalized.reading.history).toEqual([]);
    expect(normalized.reading.profile).toEqual(saved.profile);
  });
  it("tracks repeated selection, filter and result actions independently", () => {
    const before = emptyReadingState();
    expect(
      readingReducer(before, readingActions.heldBassSelected({ seed: 7, generatorVersion: 99 }))
    ).toEqual(before);
    const selected = readingReducer(before, readingActions.heldBassSelected({ seed: 7 }));
    expect(changedReadingFields(selected, before)).toEqual(["activeCourse", "heldBassSelection"]);
    const repeated = readingReducer(selected, readingActions.heldBassSelected({ seed: 7 }));
    expect(repeated.selectionRevision).toBe(selected.selectionRevision + 1);
    expect(changedReadingFields(repeated, selected)).toEqual(["activeCourse", "heldBassSelection"]);
    const filtered = readingReducer(repeated, readingActions.heldBassSourceFilterChanged("midi"));
    expect(changedReadingFields(filtered, repeated)).toEqual(["heldBassSourceFilter"]);
    const completed = readingReducer(
      filtered,
      readingActions.heldBassResultAdded(result("action"))
    );
    expect(completed.selectionRevision).toBe(filtered.selectionRevision);
    expect(changedReadingFields(completed, filtered)).toEqual([]);
    expect(completed.heldBass.history).toHaveLength(1);
    expect(completed.profile).toEqual(before.profile);
    expect(
      readingReducer(completed, readingActions.heldBassResultAdded(result("action"))).heldBass
        .history
    ).toHaveLength(1);
  });
  it("round-trips selection, filter, deduped history without touching the legacy backup", async () => {
    const legacy = JSON.stringify({ task: "notes", seed: 42 });
    const backing = {
      getItem: (key: string) => (key === READING_STORAGE_KEY ? legacy : null),
      setItem: vi.fn()
    };
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: backing, readingRepository: repository });
    await store.readingPersistenceReady;
    const sample = result("roundtrip");
    store.dispatch(readingActions.heldBassSelected({ seed: 7 }));
    store.dispatch(readingActions.heldBassSourceFilterChanged("keyboard"));
    store.dispatch(readingActions.heldBassResultAdded(sample));
    store.dispatch(readingActions.heldBassResultAdded(sample));
    await store.flushReadingPersistence();
    const restored = createAppStore({ storage: backing, readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading).toMatchObject({
      schemaVersion: 7,
      activeCourse: "held-bass-reading",
      heldBass: { seed: 7, generatorVersion: 1, sourceFilter: "keyboard", history: [sample] }
    });
    expect(await repository.load()).not.toHaveProperty("selectionRevision");
    expect(backing.getItem(READING_STORAGE_KEY)).toBe(legacy);
    expect(backing.setItem).not.toHaveBeenCalled();
  });
  it("round-trips a failed attempt and actual help without turning the fragment independent", async () => {
    const sample = makeHeldBassResult("error-and-help", 2000, true, true);
    expect(validateHeldBassResult(sample)).not.toBeNull();
    const first = sample.fragments[0];
    if (!first) throw new Error("Missing first fragment");
    expect(first.attempts.map((attempt) => attempt.outcome)).toEqual(["wrong-note", "success"]);
    expect(first.hintHistory).toHaveLength(1);
    expect(first.firstAttemptCorrect).toBe(false);
    expect(first.independentCorrect).toBe(false);
    expect(sample.fragments.slice(1).every((fragment) => fragment.independentCorrect)).toBe(true);
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.heldBassResultAdded(sample));
    await store.flushReadingPersistence();
    const reloaded = createAppStore({ storage: storage(), readingRepository: repository });
    await reloaded.readingPersistenceReady;
    expect(reloaded.getState().reading.heldBass.history).toEqual([sample]);
    expect(reloaded.getState().reading.profile).toEqual(emptyReadingState().profile);
  });
  it("reloads the same stopped selection with no unfinished runtime or held keys", async () => {
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.heldBassSelected({ seed: 19 }));
    await store.flushReadingPersistence();
    const restored = createAppStore({ storage: storage(), readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading.heldBass).toEqual({ ...emptyHeldBassState(), seed: 19 });
    expect(restored.getState().reading).not.toHaveProperty("attempts");
    expect(restored.getState().reading).not.toHaveProperty("held");
  });
  it.each([1, 99])(
    "keeps local seed %i, filter and completed run through late hydration",
    async (seed) => {
      const saved = siblings();
      saved.heldBass.seed = 123;
      saved.heldBass.history = [result("saved")];
      let resolve!: (value: unknown) => void;
      const pending = new Promise<unknown>((yes) => {
        resolve = yes;
      });
      const repository = createMemoryReadingRepository(saved);
      const store = createAppStore({
        storage: storage(),
        readingRepository: { ...repository, load: () => pending }
      });
      store.dispatch(readingActions.heldBassSelected({ seed }));
      store.dispatch(readingActions.heldBassSourceFilterChanged("midi"));
      store.dispatch(readingActions.heldBassResultAdded(result("local", 3000)));
      resolve(saved);
      await store.readingPersistenceReady;
      await store.flushReadingPersistence();
      const current = store.getState().reading;
      expect(current).toMatchObject({
        activeCourse: "held-bass-reading",
        heldBass: { seed, sourceFilter: "midi" }
      });
      expect(current.heldBass.history.map((row) => row.runId)).toEqual(["saved", "local"]);
      expect(current.coordination).toEqual(saved.coordination);
      expect(current.bass).toEqual(saved.bass);
      expect(current.rhythm).toEqual(saved.rhythm);
      expect(current.profile).toEqual(saved.profile);
      expect(normalizeReadingState(await repository.load()).reading.heldBass).toEqual(
        current.heldBass
      );
    }
  );
  it("atomically merges independent stale-tab selections, filters, preferences and sibling evidence", async () => {
    const initial = siblings();
    const repository = createMemoryReadingRepository(initial);
    const first = createAppStore({ storage: storage(), readingRepository: repository });
    const second = createAppStore({ storage: storage(), readingRepository: repository });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(readingActions.heldBassSelected({ seed: 7 }));
    first.dispatch(readingActions.heldBassSourceFilterChanged("keyboard"));
    first.dispatch(readingActions.heldBassResultAdded(result("two-tab-first")));
    await first.flushReadingPersistence();
    second.dispatch(readingActions.bassSelected({ task: "phrases", seed: 99 }));
    second.dispatch(readingActions.heldBassSourceFilterChanged("midi"));
    second.dispatch(readingActions.preferencesChanged({ nameDelayMs: 8000 }));
    second.dispatch(readingActions.heldBassResultAdded(result("two-tab-second", 3000)));
    await second.flushReadingPersistence();
    const saved = normalizeReadingState(await repository.load()).reading;
    expect(saved.activeCourse).toBe("bass-reading");
    expect(saved.bass).toEqual({ ...initial.bass, seed: 99 });
    expect(saved.heldBass).toMatchObject({ seed: 7, sourceFilter: "midi" });
    expect(saved.heldBass.history.map((row) => row.runId)).toEqual([
      "two-tab-first",
      "two-tab-second"
    ]);
    expect(saved.preferences.nameDelayMs).toBe(8000);
    expect(saved.history).toEqual(initial.history);
    expect(saved.profile).toEqual(initial.profile);
    expect(saved.coordination).toEqual(initial.coordination);
    expect(saved.intervals).toEqual(initial.intervals);
    expect(saved.rhythm).toEqual(initial.rhythm);
    expect(saved.presentedFingerprints).toEqual(initial.presentedFingerprints);
  });
  it("preserves concurrent sibling writes in the actual IndexedDB transaction", async () => {
    const first = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    const second = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    const legacy = siblings();
    const sample = result("idb-heldBass");
    const bass = legacy.bass.history[0];
    const interval = legacy.intervals.history[0];
    const rhythm = legacy.rhythm.history[0];
    const right = legacy.history[0];
    const coordination = legacy.coordination.history[0];
    if (!bass || !interval || !rhythm || !right || !coordination)
      throw new Error("Missing siblings");
    first.dispatch(readingActions.heldBassSelected({ seed: 7 }));
    first.dispatch(readingActions.heldBassResultAdded(sample));
    second.dispatch(readingActions.bassSelected({ task: "phrases", seed: 3 }));
    second.dispatch(readingActions.twoHandResultAdded(coordination));
    second.dispatch(readingActions.bassResultAdded(bass));
    second.dispatch(readingActions.intervalResultAdded(interval));
    second.dispatch(readingActions.rhythmResultAdded(rhythm));
    second.dispatch(readingActions.resultAdded(right));
    await Promise.all([first.flushReadingPersistence(), second.flushReadingPersistence()]);
    const saved = normalizeReadingState(await defaultReadingRepository.load()).reading;
    expect(saved.heldBass.history).toContainEqual(sample);
    expect(saved.coordination.history).toContainEqual(legacy.coordination.history[0]);
    expect(saved.bass.history).toContainEqual(legacy.bass.history[0]);
    expect(saved.intervals.history).toContainEqual(legacy.intervals.history[0]);
    expect(saved.rhythm.history).toContainEqual(legacy.rhythm.history[0]);
    expect(saved.history).toContainEqual(legacy.history[0]);
  });
  it.each([
    { schemaVersion: 8, marker: "future" },
    { ...emptyReadingState(), heldBass: undefined },
    {
      ...emptyReadingState(),
      heldBass: { ...emptyHeldBassState(), history: [{ id: "forged" }] }
    }
  ])(
    "keeps corrupt or future records intact while local practice remains available",
    async (saved) => {
      const repository = createMemoryReadingRepository(saved);
      const store = createAppStore({ storage: storage(), readingRepository: repository });
      await store.readingPersistenceReady;
      store.dispatch(readingActions.heldBassSelected({ seed: 7 }));
      store.dispatch(readingActions.heldBassResultAdded(result("memory")));
      await store.flushReadingPersistence();
      expect(await repository.load()).toEqual(saved);
      expect(store.getState().reading.heldBass.history).toHaveLength(1);
      expect(store.getState().persistence.errors["indexedDB:reading:read"]).toBe("invalid");
    }
  );
  it("blocks destructive writes if corruption or a future schema appears after hydration", async () => {
    for (const invalid of [
      { schemaVersion: 8, marker: "future-after-hydration" },
      { ...emptyReadingState(), heldBass: { ...emptyHeldBassState(), generatorVersion: 99 } }
    ]) {
      const repository = createMemoryReadingRepository();
      const store = createAppStore({ storage: storage(), readingRepository: repository });
      await store.readingPersistenceReady;
      await repository.update(() => invalid);
      store.dispatch(readingActions.heldBassResultAdded(result("post-hydration")));
      await store.flushReadingPersistence();
      expect(await repository.load()).toEqual(invalid);
      expect(store.getState().reading.heldBass.history).toHaveLength(1);
      expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
    }
  });
  it("rejects failed reads and leaves complete local evidence in memory on quota failure", async () => {
    const update = vi.fn();
    const unreadable = createAppStore({
      storage: storage(),
      readingRepository: { load: () => Promise.reject(new Error("denied")), update }
    });
    await unreadable.readingPersistenceReady;
    unreadable.dispatch(readingActions.heldBassResultAdded(result("unreadable")));
    await unreadable.flushReadingPersistence();
    expect(update).not.toHaveBeenCalled();
    expect(unreadable.getState().reading.heldBass.history).toHaveLength(1);
    const store = createAppStore({
      storage: storage(),
      readingRepository: {
        load: () => Promise.resolve(undefined),
        update: () => Promise.reject(new DOMException("full", "QuotaExceededError"))
      }
    });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.heldBassResultAdded(result("quota")));
    await store.flushReadingPersistence();
    expect(store.getState().reading.heldBass.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
  it("rolls back abort after put, retaining the complete result in memory", async () => {
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
      store.dispatch(readingActions.heldBassResultAdded(result("aborted")));
      await store.flushReadingPersistence();
    } finally {
      put.mockRestore();
    }
    expect(await defaultReadingRepository.load()).toEqual(before);
    expect(store.getState().reading.heldBass.history.some((row) => row.runId === "aborted")).toBe(
      true
    );
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
});
