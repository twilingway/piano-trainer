import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import type { ReadingRoot, ReadingState } from "./readingSlice";
import { readingActions } from "./readingSlice";
import {
  browserPreferenceStorage,
  persistenceKey,
  type PreferenceRoot,
  type PreferenceStorage
} from "./preferencePersistence";
import { persistenceErrorChanged } from "./persistenceSlice";
import {
  changedReadingFields,
  mergeReadingState,
  normalizeReadingState,
  readingJournal,
  type ReadingPersistentField
} from "./readingMigration";
import { defaultReadingRepository, type ReadingRepository } from "./readingRepository";

export const READING_STORAGE_KEY = "reading-course-v1";
const READ_ERROR = "indexedDB:reading:read";
const WRITE_ERROR = "indexedDB:reading:write";
function persisted(reading: ReadingState) {
  const { selectionRevision: _revision, ...saved } = reading;
  return saved;
}

/** Synchronous legacy reader; its source remains untouched as a rollback backup. */
export function loadReadingState(storage: PreferenceStorage = browserPreferenceStorage()): {
  reading: ReadingState;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  let normalized = normalizeReadingState(undefined);
  try {
    const raw = storage.getItem(READING_STORAGE_KEY);
    if (raw !== null) normalized = normalizeReadingState(JSON.parse(raw) as unknown);
    if (normalized.invalid || normalized.blocked)
      errors[persistenceKey(READING_STORAGE_KEY, "read")] = "invalid";
  } catch (error) {
    errors[persistenceKey(READING_STORAGE_KEY, "read")] =
      error instanceof SyntaxError ? "invalid" : "unavailable";
  }
  return { reading: normalized.reading, errors };
}

interface ReadingStore<State> {
  getState(): State;
  dispatch(
    action:
      | ReturnType<typeof readingActions.hydrated>
      | ReturnType<typeof readingActions.presented>
      | ReturnType<typeof persistenceErrorChanged>
  ): unknown;
}

function localProgressSince(current: ReadingState, baseline: ReadingState): ReadingState {
  const known = new Set(baseline.profile.processedRunIds);
  const historyIds = new Set(baseline.history.map((result) => result.runId ?? result.id));
  const fingerprints = new Set(baseline.presentedFingerprints);
  const intervalRuns = new Set(baseline.intervals.history.map((result) => result.runId));
  const rhythmRuns = new Set(baseline.rhythm.history.map((result) => result.runId));
  const bassRuns = new Set(baseline.bass.history.map((result) => result.runId));
  const coordinationRuns = new Set(baseline.coordination.history.map((result) => result.runId));
  return {
    ...current,
    intervals: {
      ...current.intervals,
      history: current.intervals.history.filter((result) => !intervalRuns.has(result.runId))
    },
    rhythm: {
      ...current.rhythm,
      history: current.rhythm.history.filter((result) => !rhythmRuns.has(result.runId))
    },
    bass: {
      ...current.bass,
      history: current.bass.history.filter((result) => !bassRuns.has(result.runId))
    },
    coordination: {
      ...current.coordination,
      history: current.coordination.history.filter((result) => !coordinationRuns.has(result.runId))
    },
    history: current.history.filter((result) => !historyIds.has(result.runId ?? result.id)),
    profile: {
      observations: current.profile.observations.filter((row) => !known.has(row.runId)),
      lastIndependent: current.profile.lastIndependent.filter(
        (row) =>
          !baseline.profile.lastIndependent.some(
            (previous) =>
              previous.expectedMidi === row.expectedMidi &&
              previous.inputSource === row.inputSource &&
              previous.completedAt >= row.completedAt
          )
      ),
      processedRunIds: current.profile.processedRunIds.filter((id) => !known.has(id)),
      delayedDueAt:
        current.profile.delayedDueAt !== baseline.profile.delayedDueAt
          ? current.profile.delayedDueAt
          : null
    },
    presentedFingerprints: current.presentedFingerprints.filter((key) => !fingerprints.has(key))
  };
}

export function registerReadingPersistence<State extends PreferenceRoot & ReadingRoot>(
  listener: ListenerMiddlewareInstance<State>,
  storage: PreferenceStorage,
  repository: ReadingRepository = defaultReadingRepository
) {
  let allowed = false;
  let initialized = false;
  let releaseReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    releaseReady = resolve;
  });
  let writes = Promise.resolve();
  let initialization: Promise<void> | undefined;
  let initialBaseline: ReadingState | undefined;
  let excludeLegacy = false;
  let activeBeforeHydration = false;
  const persist = (
    store: ReadingStore<State>,
    snapshot: ReadingState,
    fields: readonly ReadingPersistentField[],
    beforeHydration: boolean
  ) => {
    writes = writes.then(async () => {
      await ready;
      if (!allowed) return;
      try {
        await repository.update((saved) => {
          const normalized = normalizeReadingState(saved);
          if (normalized.blocked || normalized.invalid) {
            allowed = false;
            throw new Error("future-schema");
          }
          const incoming =
            beforeHydration && excludeLegacy && initialBaseline
              ? localProgressSince(snapshot, initialBaseline)
              : snapshot;
          return persisted(mergeReadingState(normalized.reading, incoming, fields));
        });
        store.dispatch(persistenceErrorChanged({ key: WRITE_ERROR, error: null }));
      } catch {
        store.dispatch(persistenceErrorChanged({ key: WRITE_ERROR, error: "unavailable" }));
      }
    });
  };
  const unsubscribe = listener.startListening({
    predicate: (action, current, previous) =>
      action.type !== readingActions.hydrated.type && current.reading !== previous.reading,
    effect: (_action, api) => {
      const current = api.getState().reading;
      const previous = api.getOriginalState().reading;
      const fields = changedReadingFields(current, previous);
      if (
        fields.length === 0 &&
        current.history === previous.history &&
        current.profile === previous.profile &&
        current.presentedFingerprints === previous.presentedFingerprints &&
        current.intervals.history === previous.intervals.history &&
        current.rhythm.history === previous.rhythm.history &&
        current.bass.history === previous.bass.history &&
        current.coordination.history === previous.coordination.history
      )
        return;
      const latest = current.presentedFingerprints.at(-1);
      persist(
        api,
        {
          ...current,
          presentedFingerprints:
            current.presentedFingerprints !== previous.presentedFingerprints && latest
              ? [latest]
              : []
        },
        fields,
        !initialized
      );
    }
  });
  return {
    unsubscribe,
    async knownFingerprints(store: ReadingStore<State>): Promise<readonly string[] | null> {
      await ready;
      let pending: Promise<void>;
      do {
        pending = writes;
        await pending;
      } while (pending !== writes);
      if (!allowed) return null;
      try {
        const normalized = normalizeReadingState(await repository.load());
        if (normalized.blocked || normalized.invalid) {
          allowed = false;
          store.dispatch(persistenceErrorChanged({ key: READ_ERROR, error: "invalid" }));
          return null;
        }
        store.dispatch(persistenceErrorChanged({ key: READ_ERROR, error: null }));
        return [
          ...new Set([
            ...normalized.reading.presentedFingerprints,
            ...store.getState().reading.presentedFingerprints
          ])
        ];
      } catch {
        allowed = false;
        store.dispatch(persistenceErrorChanged({ key: READ_ERROR, error: "unavailable" }));
        return null;
      }
    },
    claimMaterial(store: ReadingStore<State>, fingerprint: string): Promise<boolean> {
      if (!initialized) activeBeforeHydration = true;
      let claimed = false;
      const claim = writes.then(async () => {
        await ready;
        if (!allowed) {
          store.dispatch(readingActions.presented(fingerprint));
          return;
        }
        const locallyKnown = store.getState().reading.presentedFingerprints.includes(fingerprint);
        try {
          await repository.update((saved) => {
            const normalized = normalizeReadingState(saved);
            if (normalized.blocked || normalized.invalid) {
              allowed = false;
              throw new Error("future-schema");
            }
            claimed =
              !locallyKnown && !normalized.reading.presentedFingerprints.includes(fingerprint);
            return persisted({
              ...normalized.reading,
              presentedFingerprints: readingJournal([
                ...normalized.reading.presentedFingerprints,
                fingerprint
              ])
            });
          });
          store.dispatch(persistenceErrorChanged({ key: WRITE_ERROR, error: null }));
          store.dispatch(readingActions.presented(fingerprint));
        } catch {
          claimed = false;
          store.dispatch(persistenceErrorChanged({ key: WRITE_ERROR, error: "unavailable" }));
          store.dispatch(readingActions.presented(fingerprint));
        }
      });
      writes = claim;
      return claim.then(() => claimed);
    },
    flushed: async () => {
      await ready;
      let pending: Promise<void>;
      do {
        pending = writes;
        await pending;
      } while (pending !== writes);
    },
    initialize(store: ReadingStore<State>, baseline = store.getState().reading): Promise<void> {
      initialBaseline ??= baseline;
      initialization ??= (async () => {
        try {
          const saved = await repository.load();
          excludeLegacy = saved !== undefined;
          const normalized = normalizeReadingState(saved);
          if (normalized.blocked) {
            store.dispatch(persistenceErrorChanged({ key: READ_ERROR, error: "invalid" }));
            return;
          }
          const legacy = loadReadingState(storage);
          const restored = saved === undefined ? legacy.reading : normalized.reading;
          const current = store.getState().reading;
          const fields = changedReadingFields(current, baseline);
          // A presented series must keep its exact plan even if loading completes late.
          if (
            (activeBeforeHydration ||
              current.presentedFingerprints !== baseline.presentedFingerprints) &&
            !fields.includes("selection")
          )
            fields.push("selection", "activeCourse");
          store.dispatch(
            readingActions.hydrated(
              mergeReadingState(
                restored,
                saved === undefined ? current : localProgressSince(current, baseline),
                fields
              )
            )
          );
          store.dispatch(
            persistenceErrorChanged({
              key: READ_ERROR,
              error: normalized.invalid ? "invalid" : null
            })
          );
          allowed =
            !normalized.invalid && (saved !== undefined || Object.keys(legacy.errors).length === 0);
          if (
            saved === undefined &&
            storage.getItem(READING_STORAGE_KEY) !== null &&
            Object.keys(legacy.errors).length === 0
          ) {
            try {
              await repository.update((latest) => {
                const loaded = normalizeReadingState(latest);
                if (loaded.blocked || loaded.invalid) {
                  allowed = false;
                  throw new Error("future-schema");
                }
                return persisted(
                  mergeReadingState(loaded.reading, restored, latest === undefined ? undefined : [])
                );
              });
              store.dispatch(persistenceErrorChanged({ key: WRITE_ERROR, error: null }));
            } catch {
              store.dispatch(persistenceErrorChanged({ key: WRITE_ERROR, error: "unavailable" }));
            }
          }
        } catch {
          allowed = false;
          store.dispatch(persistenceErrorChanged({ key: READ_ERROR, error: "unavailable" }));
        } finally {
          initialized = true;
          releaseReady();
        }
      })();
      return initialization;
    },
    get initialized() {
      return initialized;
    }
  };
}
