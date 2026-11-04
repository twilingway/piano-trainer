import { PATH_STEPS, isPathStepId } from "../learningPath/model";
export const GUIDED_STORAGE_PREFIX = "guided-lesson-step-v1:";
export interface GuidedStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
export function browserGuidedStorage(): GuidedStorage {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
    }
  };
}
/** Per-step records cannot overwrite a different step saved concurrently by another tab. */
export function readGuidedJournal(storage: GuidedStorage) {
  const completed: string[] = [];
  let error = false;
  for (const step of PATH_STEPS) {
    try {
      const raw = storage.getItem(GUIDED_STORAGE_PREFIX + step.id);
      if (raw === null) continue;
      const row: unknown = JSON.parse(raw);
      if (
        row &&
        typeof row === "object" &&
        "schemaVersion" in row &&
        row.schemaVersion === 1 &&
        "completed" in row &&
        row.completed === true
      )
        completed.push(step.id);
      else error = true;
    } catch {
      error = true;
    }
  }
  return { completed, error };
}
export function saveGuidedCompletion(storage: GuidedStorage, id: string): boolean {
  if (!isPathStepId(id)) return false;
  try {
    const key = GUIDED_STORAGE_PREFIX + id;
    const raw = storage.getItem(key);
    if (raw !== null) {
      try {
        const row: unknown = JSON.parse(raw);
        if (row && typeof row === "object" && "schemaVersion" in row && row.schemaVersion !== 1)
          return false;
        if (
          row &&
          typeof row === "object" &&
          "schemaVersion" in row &&
          row.schemaVersion === 1 &&
          "completed" in row &&
          row.completed === true
        )
          return true;
      } catch {
        /* Repair only this malformed entry after new explicit evidence. */
      }
    }
    storage.setItem(key, JSON.stringify({ schemaVersion: 1, completed: true }));
    return true;
  } catch {
    return false;
  }
}

/** Instance-owned external storage adapter with stable snapshots for React subscribers. */
export function createGuidedJournal(storage: GuidedStorage) {
  let snapshot = readGuidedJournal(storage);
  const observed = new Set<string>();
  const dirty = new Set<string>();
  const listeners = new Set<() => void>();
  const refresh = () => {
    for (const id of dirty) if (saveGuidedCompletion(storage, id)) dirty.delete(id);
    const saved = readGuidedJournal(storage);
    const next = {
      completed: [...new Set([...saved.completed, ...observed])],
      error: saved.error || dirty.size > 0
    };
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: () => {
      refresh();
    },
    record: (ids: readonly string[]) => {
      for (const id of ids)
        if (isPathStepId(id)) {
          observed.add(id);
          dirty.add(id);
        }
      refresh();
    }
  };
}
