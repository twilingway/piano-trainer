import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { usePlayerRuntime } from "./usePlayerRuntime";

type PlayerRuntime = ReturnType<typeof usePlayerRuntime>;

/** Delivery of runtime view models, not another owner of product state or song time. */
export function createRuntimeSource(initial: PlayerRuntime) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next: PlayerRuntime) {
      if (next === current) return;
      current = next;
      for (const listener of listeners) listener();
    }
  };
}
const RuntimeContext = createContext<ReturnType<typeof createRuntimeSource> | null>(null);

export function PlayerRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = usePlayerRuntime();
  const [source] = useState(() => createRuntimeSource(runtime));
  useLayoutEffect(() => {
    source.publish(runtime);
  }, [source, runtime]);
  return <RuntimeContext.Provider value={source}>{children}</RuntimeContext.Provider>;
}

/** Select only runtime information/commands needed by a mounted connected component. */
export function useRuntimeSelector<T>(
  select: (runtime: PlayerRuntime) => T,
  equal: (left: T, right: T) => boolean = Object.is
): T {
  const source = useContext(RuntimeContext);
  if (!source) throw new Error("PlayerRuntimeProvider is missing");
  const getSelection = useMemo(
    () => createRuntimeSelector(source, select, equal),
    [source, select, equal]
  );
  return useSyncExternalStore(source.subscribe, getSelection, getSelection);
}

export function createRuntimeSelector<T>(
  source: ReturnType<typeof createRuntimeSource>,
  select: (runtime: PlayerRuntime) => T,
  equal: (left: T, right: T) => boolean = Object.is
) {
  let previous = source.getSnapshot();
  let selected = select(previous);
  return () => {
    const next = source.getSnapshot();
    if (next !== previous) {
      const value = select(next);
      if (!equal(selected, value)) selected = value;
      previous = next;
    }
    return selected;
  };
}
