import { useMemo, useSyncExternalStore } from "react";
import type { TrainerSnapshot } from "../practice/Trainer";

export interface TrainerSnapshotSource {
  readonly getSnapshot: () => TrainerSnapshot | null;
  readonly subscribe: (listener: () => void) => () => void;
}

/** Delivery adapter owned by one trainer; it never advances the song clock. */
export function createTrainerSnapshotSource() {
  let snapshot: TrainerSnapshot | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next: TrainerSnapshot | null) {
      if (Object.is(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    }
  };
}

/** Cache selected values both across reads and across equivalent publications. */
export function createSnapshotSelector<T>(
  source: TrainerSnapshotSource,
  select: (snapshot: TrainerSnapshot | null) => T,
  equal: (left: T, right: T) => boolean = Object.is
) {
  let initialized = false;
  let previous: TrainerSnapshot | null;
  let selected: T;
  return () => {
    const snapshot = source.getSnapshot();
    if (initialized && snapshot === previous) return selected;
    const next = select(snapshot);
    previous = snapshot;
    if (!initialized || !equal(selected, next)) selected = next;
    initialized = true;
    return selected;
  };
}

const inactiveSource: TrainerSnapshotSource = {
  getSnapshot: () => null,
  subscribe: () => () => undefined
};

export function useTrainerSelector<T>(
  source: TrainerSnapshotSource,
  select: (snapshot: TrainerSnapshot | null) => T,
  equal: (left: T, right: T) => boolean = Object.is,
  enabled = true
) {
  const activeSource = enabled ? source : inactiveSource;
  const getSelection = useMemo(
    () => createSnapshotSelector(activeSource, select, equal),
    [activeSource, select, equal]
  );
  return useSyncExternalStore(activeSource.subscribe, getSelection, getSelection);
}

export function selectTrainerStatus(snapshot: TrainerSnapshot | null) {
  return {
    playing: snapshot?.playing ?? false,
    finished: snapshot?.finished ?? false,
    waiting: snapshot?.waiting ?? false,
    timingPolicy: snapshot?.timingPolicy
  };
}
export const sameTrainerStatus = (
  left: ReturnType<typeof selectTrainerStatus>,
  right: ReturnType<typeof selectTrainerStatus>
) =>
  left.playing === right.playing &&
  left.finished === right.finished &&
  left.waiting === right.waiting &&
  left.timingPolicy === right.timingPolicy;
