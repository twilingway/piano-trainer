import { useCallback, useLayoutEffect, useRef } from "react";
import { useRuntimeSource, type PlayerRuntime } from "./PlayerRuntimeProvider";

/** Stable command identity; resolve its owner against the latest committed runtime on invocation. */
export function useRuntimeCommand<Args extends unknown[], Result>(
  select: (runtime: PlayerRuntime) => (...args: Args) => Result
): (...args: Args) => Result {
  const source = useRuntimeSource();
  const selectRef = useRef(select);
  useLayoutEffect(() => {
    selectRef.current = select;
  }, [select]);
  return useCallback((...args: Args) => selectRef.current(source.getSnapshot())(...args), [source]);
}
