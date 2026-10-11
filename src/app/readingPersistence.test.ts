// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { generateReadingExercise } from "../reading/generator";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { createAppStore } from "./store";
import { readingActions } from "./readingSlice";
import { loadReadingState, READING_STORAGE_KEY } from "./readingPersistence";
import {
  createMemoryReadingRepository,
  defaultReadingRepository,
  type ReadingRepository
} from "./readingRepository";
import { emptyReadingState, normalizeReadingState } from "./readingMigration";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import { readingDisplayProfile } from "./readingProfile";

function result(id: string, createdAt = 123) {
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
  return completed;
}
function storage(initial?: unknown) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(READING_STORAGE_KEY, JSON.stringify(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe("reading preferences and progress", () => {
  it("gives IDB priority over untouched legacy progress even with pre-hydration writes", async () => {
    const old = { history: [result("legacy-backup")] };
    const saved = emptyReadingState();
    saved.history = [result("idb-existing")];
    const loaded = deferred<unknown>();
    const backing = createMemoryReadingRepository(saved);
    const repository = { ...backing, load: () => loaded.promise };
    const store = createAppStore({ storage: storage(old), readingRepository: repository });
    store.dispatch(readingActions.resultAdded(result("new-local")));
    loaded.resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    expect(store.getState().reading.history.map((row) => row.id)).toEqual([
      "idb-existing",
      "new-local"
    ]);
    expect(store.getState().persistence.errors).toEqual({});
    const persisted = normalizeReadingState(await backing.load()).reading;
    expect(persisted.history.map((row) => row.id)).toEqual(["idb-existing", "new-local"]);
    expect(persisted.profile.processedRunIds).not.toContain("legacy-backup");
  });
  it("reports a reading transaction abort after successful put and preserves the prior record", async () => {
    const store = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await store.readingPersistenceReady;
    const before = await defaultReadingRepository.load();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Call the native method with its original receiver.
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
      store.dispatch(readingActions.resultAdded(result("rolled-back")));
      await store.flushReadingPersistence();
    } finally {
      put.mockRestore();
    }
    expect(store.getState().reading.history.some((row) => row.id === "rolled-back")).toBe(true);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
    expect(await defaultReadingRepository.load()).toEqual(before);
  });
  it("stores progress asynchronously in IDB and leaves the legacy backup intact", async () => {
    const backing = storage({ task: "notes", seed: 42, history: [result("legacy")] });
    const original = backing.getItem(READING_STORAGE_KEY);
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: backing, readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(
      readingActions.preferencesChanged({
        automaticHints: false,
        nameDelayMs: 8000,
        keyDelayMs: 9000
      })
    );
    const sample = result("sample");
    for (let i = 0; i < 23; i++)
      store.dispatch(readingActions.resultAdded({ ...sample, id: String(i), runId: String(i) }));
    await store.flushReadingPersistence();
    expect(store.getState().reading.history).toHaveLength(20);
    const restored = createAppStore({ storage: backing, readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading).toMatchObject({
      task: "notes",
      seed: 42,
      preferences: { automaticHints: false, nameDelayMs: 8000 }
    });
    expect(backing.getItem(READING_STORAGE_KEY)).toBe(original);
    expect(backing.setItem).not.toHaveBeenCalled();
    expect(await repository.load()).not.toHaveProperty("selectionRevision");
  });
  it("protects defaults after read failure and keeps progress in memory", async () => {
    const update = vi.fn();
    const repository: ReadingRepository = {
      load: () => Promise.reject(new Error("denied")),
      update
    };
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    store.dispatch(readingActions.resultAdded(result("saved")));
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    expect(store.getState().reading.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:read"]).toBe("unavailable");
    expect(update).not.toHaveBeenCalled();
    expect(
      loadReadingState({ getItem: () => "broken", setItem: () => undefined }).errors
    ).toHaveProperty(`localStorage:${READING_STORAGE_KEY}:read`, "invalid");
  });
  it("blocks future versions without overwriting their saved data", async () => {
    const future = { schemaVersion: 99, marker: "future" };
    const repository = createMemoryReadingRepository(future);
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.select({ task: "notes", seed: 42 }));
    await store.flushReadingPersistence();
    expect(await repository.load()).toEqual(future);
    expect(store.getState().persistence.errors["indexedDB:reading:read"]).toBe("invalid");
  });
  it("merges late hydration while preserving newer individual fields and new results", async () => {
    const saved = emptyReadingState();
    saved.task = "phrases";
    saved.seed = 77;
    saved.preferences = { automaticHints: false, nameDelayMs: 9000, keyDelayMs: 20000 };
    saved.history = [result("old")];
    const loaded = deferred<unknown>();
    const backing = createMemoryReadingRepository(saved);
    const repository = { ...backing, load: () => loaded.promise };
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    store.dispatch(readingActions.select({ task: "notes", seed: 42 }));
    store.dispatch(readingActions.preferencesChanged({ automaticHints: true }));
    store.dispatch(readingActions.sourceFilterChanged("midi"));
    store.dispatch(readingActions.resultAdded(result("new")));
    loaded.resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    expect(store.getState().reading).toMatchObject({
      task: "notes",
      seed: 42,
      sourceFilter: "midi",
      preferences: { nameDelayMs: 9000, keyDelayMs: 20000 }
    });
    expect(store.getState().reading.history.map((row) => row.id)).toEqual(["old", "new"]);
    expect(store.getState().reading.profile.processedRunIds).toEqual(["old", "new"]);
  });
  it("serializes snapshots so slow older writes cannot replace newer preferences", async () => {
    const first = deferred<undefined>();
    const backing = createMemoryReadingRepository();
    let calls = 0;
    const repository: ReadingRepository = {
      load: () => backing.load(),
      update: async (merge) => {
        calls++;
        if (calls === 1) await first.promise;
        await backing.update(merge);
      }
    };
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.select({ task: "notes", seed: 42 }));
    store.dispatch(readingActions.preferencesChanged({ nameDelayMs: 9000 }));
    store.dispatch(readingActions.preferencesChanged({ nameDelayMs: 12000 }));
    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });
    first.resolve(undefined);
    await store.flushReadingPersistence();
    expect(normalizeReadingState(await repository.load()).reading.preferences.nameDelayMs).toBe(
      12000
    );
  });
  it("atomically unions results from concurrent tabs in the existing DB", async () => {
    const first = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    const second = createAppStore({
      storage: storage(),
      readingRepository: defaultReadingRepository
    });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(readingActions.resultAdded(result("tab-first")));
    second.dispatch(readingActions.resultAdded(result("tab-second")));
    await Promise.all([first.flushReadingPersistence(), second.flushReadingPersistence()]);
    const saved = normalizeReadingState(await defaultReadingRepository.load()).reading;
    expect(saved.history.map((row) => row.id)).toEqual(["tab-first", "tab-second"]);
    expect(saved.profile.processedRunIds).toEqual(["tab-first", "tab-second"]);
  });
  it("keeps in-memory state and reports transaction failure", async () => {
    const repository: ReadingRepository = {
      load: () => Promise.resolve(undefined),
      update: () => Promise.reject(new Error("abort after put"))
    };
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.resultAdded(result("saved")));
    await store.flushReadingPersistence();
    expect(store.getState().reading.history).toHaveLength(1);
    expect(store.getState().persistence.errors["indexedDB:reading:write"]).toBe("unavailable");
  });
  it("forces a safe effective display without touching saved values", () => {
    const saved = {
      ...DEFAULT_STAFF_PREFS,
      lane: true,
      hands: true,
      labels: true,
      noteNames: "en" as const,
      fingers: true,
      fingerColors: "fingers" as const,
      chords: true
    };
    expect(readingDisplayProfile(saved)).toMatchObject({
      lane: false,
      keys: true,
      visible: true,
      labels: false,
      noteNames: "off",
      fingers: false,
      fingerColors: "mono",
      hands: false,
      chords: false
    });
    expect(saved.fingers).toBe(true);
    expect(saved.noteNames).toBe("en");
  });
});
