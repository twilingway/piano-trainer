import { useEffect, useMemo, useSyncExternalStore, type RefObject } from "react";
import type { FallingNotesView } from "../render/FallingNotesView";
import { StaffWorldSource } from "../staff/staffWorldSnapshot";

export function useWorldScorePoster(
  viewRef: RefObject<FallingNotesView | null> | undefined,
  ready: boolean,
  enabled: boolean,
  readBeat: () => number
) {
  const source = useMemo(() => new StaffWorldSource(), []);
  const status = useSyncExternalStore(source.subscribeStatus, source.getStatus, source.getStatus);
  useEffect(() => {
    source.configure(enabled, readBeat);
  }, [source, enabled, readBeat]);
  useEffect(() => {
    const view = ready ? viewRef?.current : undefined;
    view?.setWorldScoreSource(source);
    return () => view?.setWorldScoreSource(undefined);
  }, [source, viewRef, ready]);
  return { source, hidden: enabled && status === "ready", error: enabled && status === "error" };
}
