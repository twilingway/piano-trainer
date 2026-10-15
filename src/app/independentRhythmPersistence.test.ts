// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { makeIndependentRhythmResult as result } from "./independentRhythmPersistenceFixture";
import { validateIndependentRhythmResult } from "../independentRhythm/validation";
import {
  emptyIndependentRhythmState,
  mergeIndependentRhythmHistory,
  normalizeIndependentRhythmState
} from "./independentRhythmPersistence";
import { readingPersistenceSiblings } from "./readingPersistenceSiblingsFixture";
import { makeHeldBassResult } from "./heldBassPersistenceFixture";
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

const storage = () => ({ getItem: () => null, setItem: vi.fn() });
function siblings() {
  const state = readingPersistenceSiblings();
  state.heldBass.history = [makeHeldBassResult("prior-held-bass")];
  return state;
}

describe("independentRhythm schema8 persistence", () => {
  it("requires actual pulse proof and exact replayed outcomes, clock and metrics", () => {
    const sample = result("strict");
    expect(validateIndependentRhythmResult(sample)).not.toBeNull();
    for (const invalid of [
      { ...sample, generatorVersion: 2 },
      { ...sample, rulesVersion: 2 },
      { ...sample, pulse: null },
      { ...sample, pulse: { ...sample.pulse, passed: false } },
      { ...sample, series: { ...sample.series, outcomes: sample.series.outcomes.slice(1) } },
      { ...sample, series: { ...sample.series, clock: { ...sample.series.clock, segments: [] } } },
      { ...sample, series: { ...sample.series, summary: { ...sample.series.summary, extras: 5 } } },
      { ...sample, pulse: { ...sample.pulse, config: { ...sample.pulse.config, runId: "other" } } }
    ]) {
      expect(validateIndependentRhythmResult(invalid)).toBeNull();
      expect(
        normalizeIndependentRhythmState({ ...emptyIndependentRhythmState(), history: [invalid] })
          .invalid
      ).toBe(true);
    }
  });
  it("keeps twenty committed runs, dedupes both identities and deep-copies every nested proof", () => {
    const samples = Array.from({ length: 22 }, (_, index) =>
      result(`run-${String(index)}`, 2000 + index, index === 0)
    );
    const first = samples[0];
    if (!first) throw new Error("Missing fixture");
    const copied = mergeIndependentRhythmHistory([], [first]);
    expect(copied).toEqual([first]);
    const saved = copied[0];
    if (!saved) throw new Error("Missing copied result");
    expect(saved).not.toBe(first);
    for (const phase of ["pulse", "series"] as const) {
      expect(saved[phase]).not.toBe(first[phase]);
      expect(saved[phase].config).not.toBe(first[phase].config);
      expect(saved[phase].clock.segments).not.toBe(first[phase].clock.segments);
      expect(saved[phase].clock.segments[0]).not.toBe(first[phase].clock.segments[0]);
      expect(saved[phase].events[0]).not.toBe(first[phase].events[0]);
      expect(saved[phase].outcomes[0]).not.toBe(first[phase].outcomes[0]);
      expect(saved[phase].summary.left).not.toBe(first[phase].summary.left);
      expect(saved[phase].summary.right).not.toBe(first[phase].summary.right);
      expect(saved[phase].extras).not.toBe(first[phase].extras);
      expect(saved[phase].help).not.toBe(first[phase].help);
      expect(saved[phase].help[0]).not.toBe(first[phase].help[0]);
      expect(saved[phase].help[0]?.pitches).not.toBe(first[phase].help[0]?.pitches);
    }
    const latest = mergeIndependentRhythmHistory([], [...samples, ...samples]);
    expect(latest).toHaveLength(20);
    expect(latest[0]?.runId).toBe("run-2");
    expect(latest.at(-1)?.runId).toBe("run-21");
    const duplicateId = { ...result("other"), id: first.id };
    expect(mergeIndependentRhythmHistory([first], [duplicateId])).toEqual([first]);
    expect(
      mergeIndependentRhythmHistory([first], [{ ...first, createdAt: first.createdAt + 1 }])
    ).toEqual([first]);
  });
  it("migrates schemas1..7 idempotently and preserves every supported sibling and P2 profile", () => {
    const modern = siblings();
    const { independentRhythm: _independentRhythm, ...old } = modern;
    for (const version of [1, 2, 3, 4, 5, 6, 7]) {
      const first = normalizeReadingState({
        ...old,
        schemaVersion: version,
        activeCourse:
          version >= 7
            ? "held-bass-reading"
            : version >= 5
              ? "bass-reading"
              : version >= 4
                ? "rhythm-training"
                : version >= 3
                  ? "interval-training"
                  : null
      });
      expect(first.invalid).toBe(false);
      expect(first.reading.schemaVersion).toBe(8);
      expect(first.reading.independentRhythm).toEqual(emptyIndependentRhythmState());
      expect(first.reading.history).toEqual(modern.history);
      if (version >= 2) expect(first.reading.profile).toEqual(modern.profile);
      if (version >= 3) expect(first.reading.intervals).toEqual(modern.intervals);
      if (version >= 4) expect(first.reading.rhythm).toEqual(modern.rhythm);
      if (version >= 5) expect(first.reading.bass).toEqual(modern.bass);
      if (version >= 6) expect(first.reading.coordination).toEqual(modern.coordination);
      if (version >= 7) expect(first.reading.heldBass).toEqual(modern.heldBass);
      expect(normalizeReadingState(first.reading)).toEqual(first);
    }
  });
  it("requires schema8 sibling and strictly validates persistent source and preferences", () => {
    const { independentRhythm: _independentRhythm, ...missing } = emptyReadingState();
    expect(normalizeReadingState(missing).invalid).toBe(true);
    for (const partial of [
      { seed: -1 },
      { seed: 1.2 },
      { seed: 0x100000000 },
      { generatorVersion: 99 },
      { inputSource: "unknown" },
      { sourceFilter: "unknown" },
      { showKeyHints: 1 },
      { history: null }
    ]) {
      expect(
        normalizeIndependentRhythmState({ ...emptyIndependentRhythmState(), ...partial }).invalid
      ).toBe(true);
    }
    expect(
      normalizeIndependentRhythmState({
        ...emptyIndependentRhythmState(),
        phase: "playing",
        pulsePermit: true,
        owners: [60]
      }).independentRhythm
    ).toEqual(emptyIndependentRhythmState());
  });
  it("tracks selection, source, filter, hints and results without changing P2", () => {
    const initial = emptyReadingState();
    expect(
      readingReducer(
        initial,
        readingActions.independentRhythmSelected({ seed: 7, generatorVersion: 99 })
      )
    ).toEqual(initial);
    const selected = readingReducer(initial, readingActions.independentRhythmSelected({ seed: 7 }));
    expect(changedReadingFields(selected, initial)).toEqual([
      "activeCourse",
      "independentRhythmSelection"
    ]);
    const repeated = readingReducer(
      selected,
      readingActions.independentRhythmSelected({ seed: 7 })
    );
    expect(repeated.selectionRevision).toBe(selected.selectionRevision + 1);
    expect(changedReadingFields(repeated, selected)).toEqual([
      "activeCourse",
      "independentRhythmSelection"
    ]);
    const source = readingReducer(repeated, readingActions.independentRhythmSourceChanged("midi"));
    expect(changedReadingFields(source, repeated)).toContain("independentRhythmSource");
    const filtered = readingReducer(
      source,
      readingActions.independentRhythmSourceFilterChanged("keyboard")
    );
    expect(changedReadingFields(filtered, source)).toEqual(["independentRhythmSourceFilter"]);
    const helped = readingReducer(filtered, readingActions.independentRhythmKeyHintsChanged(true));
    expect(changedReadingFields(helped, filtered)).toEqual(["independentRhythmKeyHints"]);
    const completed = readingReducer(
      helped,
      readingActions.independentRhythmResultAdded(result("action"))
    );
    expect(changedReadingFields(completed, helped)).toEqual([]);
    expect(completed.independentRhythm.history).toHaveLength(1);
    expect(completed.profile).toEqual(initial.profile);
    expect(completed.history).toEqual(initial.history);
  });
  it("round-trips stopped selection/preferences/results without rewriting legacy or phase/gate/owners", async () => {
    const legacy = JSON.stringify({ task: "notes", seed: 42 });
    const backing = {
      getItem: (key: string) => (key === READING_STORAGE_KEY ? legacy : null),
      setItem: vi.fn()
    };
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: backing, readingRepository: repository });
    await store.readingPersistenceReady;
    const sample = result("roundtrip");
    store.dispatch(readingActions.independentRhythmSelected({ seed: 7 }));
    store.dispatch(readingActions.independentRhythmSourceChanged("pointer"));
    store.dispatch(readingActions.independentRhythmSourceFilterChanged("midi"));
    store.dispatch(readingActions.independentRhythmKeyHintsChanged(true));
    store.dispatch(readingActions.independentRhythmResultAdded(sample));
    store.dispatch(readingActions.independentRhythmResultAdded(sample));
    await store.flushReadingPersistence();
    const reloaded = createAppStore({ storage: backing, readingRepository: repository });
    await reloaded.readingPersistenceReady;
    expect(reloaded.getState().reading).toMatchObject({
      schemaVersion: 8,
      activeCourse: "independent-rhythm-reading",
      independentRhythm: {
        seed: 7,
        generatorVersion: 1,
        inputSource: "pointer",
        sourceFilter: "midi",
        showKeyHints: true,
        history: [sample]
      }
    });
    const saved = await repository.load();
    expect(saved).not.toHaveProperty("selectionRevision");
    expect(reloaded.getState().reading.independentRhythm).not.toHaveProperty("phase");
    expect(reloaded.getState().reading.independentRhythm).not.toHaveProperty("pulsePermit");
    expect(reloaded.getState().reading.independentRhythm).not.toHaveProperty("owners");
    expect(backing.getItem(READING_STORAGE_KEY)).toBe(legacy);
    expect(backing.setItem).not.toHaveBeenCalled();
  });
  it.each([1, 99])(
    "preserves fresh local selection/source/preferences and result through late hydration seed%i",
    async (seed) => {
      const saved = siblings();
      saved.independentRhythm.seed = 123;
      saved.independentRhythm.history = mergeIndependentRhythmHistory([], [result("saved")]);
      let resolve!: (value: unknown) => void;
      const pending = new Promise<unknown>((yes) => {
        resolve = yes;
      });
      const repository = createMemoryReadingRepository(saved);
      const store = createAppStore({
        storage: storage(),
        readingRepository: { ...repository, load: () => pending }
      });
      store.dispatch(readingActions.independentRhythmSelected({ seed }));
      store.dispatch(readingActions.independentRhythmSourceChanged("pointer"));
      store.dispatch(readingActions.independentRhythmSourceFilterChanged("midi"));
      store.dispatch(readingActions.independentRhythmKeyHintsChanged(true));
      store.dispatch(readingActions.independentRhythmResultAdded(result("local", 3000)));
      resolve(saved);
      await store.readingPersistenceReady;
      await store.flushReadingPersistence();
      const current = store.getState().reading;
      expect(current).toMatchObject({
        activeCourse: "independent-rhythm-reading",
        independentRhythm: {
          seed,
          inputSource: "pointer",
          sourceFilter: "midi",
          showKeyHints: true
        }
      });
      expect(current.independentRhythm.history.map((row) => row.runId)).toEqual(["saved", "local"]);
      expect(current.heldBass).toEqual(saved.heldBass);
      expect(current.profile).toEqual(saved.profile);
      expect(normalizeReadingState(await repository.load()).reading.independentRhythm).toEqual(
        current.independentRhythm
      );
    }
  );
  it("merges independent preference fields and committed histories from stale tabs", () => {
    const saved = siblings();
    saved.independentRhythm = {
      ...emptyIndependentRhythmState(),
      seed: 7,
      inputSource: "pointer",
      showKeyHints: true,
      history: mergeIndependentRhythmHistory([], [result("saved")])
    };
    const stale = emptyReadingState();
    stale.independentRhythm.sourceFilter = "midi";
    stale.independentRhythm.history = mergeIndependentRhythmHistory([], [result("new", 3000)]);
    const merged = mergeReadingState(saved, stale, ["independentRhythmSourceFilter"]);
    expect(merged.independentRhythm).toMatchObject({
      seed: 7,
      inputSource: "pointer",
      showKeyHints: true,
      sourceFilter: "midi"
    });
    expect(merged.independentRhythm.history.map((row) => row.runId)).toEqual(["saved", "new"]);
    expect(merged.heldBass).toEqual(saved.heldBass);
    expect(merged.profile).toEqual(saved.profile);
  });
  it("honors explicit default source/filter/hints chosen before hydration", async () => {
    const saved = emptyReadingState();
    saved.independentRhythm.inputSource = "midi";
    saved.independentRhythm.sourceFilter = "midi";
    saved.independentRhythm.showKeyHints = true;
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((yes) => {
      resolve = yes;
    });
    const repository = createMemoryReadingRepository(saved);
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...repository, load: () => pending }
    });
    store.dispatch(readingActions.independentRhythmSourceChanged("keyboard"));
    store.dispatch(readingActions.independentRhythmSourceFilterChanged("all"));
    store.dispatch(readingActions.independentRhythmKeyHintsChanged(false));
    resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    expect(store.getState().reading.independentRhythm).toEqual(emptyIndependentRhythmState());
    expect(normalizeReadingState(await repository.load()).reading.independentRhythm).toEqual(
      emptyIndependentRhythmState()
    );
  });
  it("atomically merges concurrent writes with every sibling in real IndexedDB", async () => {
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
    const sample = result("idb-independent");
    first.dispatch(readingActions.independentRhythmSelected({ seed: 7 }));
    first.dispatch(readingActions.independentRhythmResultAdded(sample));
    for (const row of legacy.heldBass.history)
      second.dispatch(readingActions.heldBassResultAdded(row));
    for (const row of legacy.coordination.history)
      second.dispatch(readingActions.twoHandResultAdded(row));
    for (const row of legacy.bass.history) second.dispatch(readingActions.bassResultAdded(row));
    for (const row of legacy.intervals.history)
      second.dispatch(readingActions.intervalResultAdded(row));
    for (const row of legacy.rhythm.history) second.dispatch(readingActions.rhythmResultAdded(row));
    for (const row of legacy.history) second.dispatch(readingActions.resultAdded(row));
    await Promise.all([first.flushReadingPersistence(), second.flushReadingPersistence()]);
    const saved = normalizeReadingState(await defaultReadingRepository.load()).reading;
    expect(saved.independentRhythm.history).toContainEqual(sample);
    for (const key of ["heldBass", "coordination", "bass", "intervals", "rhythm"] as const) {
      const actual: readonly unknown[] = saved[key].history;
      const previous: readonly unknown[] = legacy[key].history;
      expect(actual).toEqual(expect.arrayContaining([...previous]));
    }
    expect(saved.history).toEqual(expect.arrayContaining(legacy.history));
  });
  it.each([
    { schemaVersion: 9, marker: "future" },
    { ...emptyReadingState(), independentRhythm: undefined },
    {
      ...emptyReadingState(),
      independentRhythm: { ...emptyIndependentRhythmState(), history: [{ id: "forged" }] }
    }
  ])("retains corrupt/future blobs while allowing complete local evidence", async (saved) => {
    const repository = createMemoryReadingRepository(saved);
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.independentRhythmResultAdded(result("memory")));
    await store.flushReadingPersistence();
    expect(await repository.load()).toEqual(saved);
    expect(store.getState().reading.independentRhythm.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:read"]).toBe("invalid");
  });
  it("protects valid siblings when a saved pulse permit has been forged", async () => {
    const original = siblings();
    const sample = result("forged");
    const saved = {
      ...original,
      independentRhythm: {
        ...original.independentRhythm,
        history: [{ ...sample, pulse: { ...sample.pulse, passed: false } }]
      }
    };
    const repository = createMemoryReadingRepository(saved);
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.independentRhythmSourceChanged("midi"));
    await store.flushReadingPersistence();
    expect(store.getState().reading.heldBass).toEqual(original.heldBass);
    expect(store.getState().reading.profile).toEqual(original.profile);
    expect(await repository.load()).toEqual(saved);
  });
  it("blocks writes if future/corrupt data appears after hydration", async () => {
    for (const invalid of [
      { schemaVersion: 9, marker: "future-after-hydration" },
      {
        ...emptyReadingState(),
        independentRhythm: { ...emptyIndependentRhythmState(), generatorVersion: 99 }
      }
    ]) {
      const repository = createMemoryReadingRepository();
      const store = createAppStore({ storage: storage(), readingRepository: repository });
      await store.readingPersistenceReady;
      await repository.update(() => invalid);
      store.dispatch(readingActions.independentRhythmResultAdded(result("late")));
      await store.flushReadingPersistence();
      expect(await repository.load()).toEqual(invalid);
      expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
    }
  });
  it("keeps local results on read or quota failure", async () => {
    const update = vi.fn();
    const unreadable = createAppStore({
      storage: storage(),
      readingRepository: { load: () => Promise.reject(new Error("denied")), update }
    });
    await unreadable.readingPersistenceReady;
    unreadable.dispatch(readingActions.independentRhythmResultAdded(result("unreadable")));
    await unreadable.flushReadingPersistence();
    expect(update).not.toHaveBeenCalled();
    expect(unreadable.getState().reading.independentRhythm.history).toHaveLength(1);
    const store = createAppStore({
      storage: storage(),
      readingRepository: {
        load: () => Promise.resolve(undefined),
        update: () => Promise.reject(new DOMException("full", "QuotaExceededError"))
      }
    });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.independentRhythmResultAdded(result("quota")));
    await store.flushReadingPersistence();
    expect(store.getState().reading.independentRhythm.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
  it("rolls back abort after put and retains the result in memory", async () => {
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
      store.dispatch(readingActions.independentRhythmResultAdded(result("aborted")));
      await store.flushReadingPersistence();
    } finally {
      put.mockRestore();
    }
    expect(await defaultReadingRepository.load()).toEqual(before);
    expect(
      store.getState().reading.independentRhythm.history.some((row) => row.runId === "aborted")
    ).toBe(true);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
});
