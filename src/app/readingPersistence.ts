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
    action: ReturnType<typeof readingActions.hydrated> | ReturnType<typeof persistenceErrorChanged>
  ): unknown;
}

function localProgressSince(current: ReadingState, baseline: ReadingState): ReadingState {
  const known = new Set(baseline.profile.processedRunIds);
  const historyIds = new Set(baseline.history.map((result) => result.runId ?? result.id));
  const fingerprints = new Set(baseline.presentedFingerprints);
  return {
    ...current,
    history: current.history.filter((result) => !historyIds.has(result.runId ?? result.id)),
    profile: {
      observations: current.profile.observations.filter((row) => !known.has(row.runId)),
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
          if (normalized.blocked) {
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
        current.presentedFingerprints === previous.presentedFingerprints
      )
        return;
      persist(api, current, fields, !initialized);
    }
  });
  return {
    unsubscribe,
    flushed: async () => {
      await ready;
      await writes;
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
            current.presentedFingerprints !== baseline.presentedFingerprints &&
            !fields.includes("selection")
          )
            fields.push("selection");
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
          allowed = true;
          if (
            saved === undefined &&
            storage.getItem(READING_STORAGE_KEY) !== null &&
            Object.keys(legacy.errors).length === 0
          ) {
            try {
              await repository.update((latest) => {
                const loaded = normalizeReadingState(latest);
                if (loaded.blocked) {
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
