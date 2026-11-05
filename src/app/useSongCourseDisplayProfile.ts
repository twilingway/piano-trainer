import { useMemo, useSyncExternalStore } from "react";
import { songCourseDisplayProfile, type SongCourseDisplayInput } from "./songCourseDisplayProfile";

export const COMPACT_SONG_COURSE_QUERY = "(max-width: 1024px)";

function readCompact(): boolean {
  return typeof window === "undefined" || window.matchMedia(COMPACT_SONG_COURSE_QUERY).matches;
}

function subscribeCompact(listener: () => void): () => void {
  const query = window.matchMedia(COMPACT_SONG_COURSE_QUERY);
  query.addEventListener("change", listener);
  return () => {
    query.removeEventListener("change", listener);
  };
}

const serverCompact = () => true;

/** A breakpoint subscription changes display only; it never reconnects the course transport. */
export function useSongCourseDisplayProfile({
  active,
  preferred,
  display,
  learnerRange
}: Omit<SongCourseDisplayInput, "compact">) {
  const compact = useSyncExternalStore(subscribeCompact, readCompact, serverCompact);
  // Consumers use preference identity to avoid rebuilding the rendered score on transport updates.
  return useMemo(
    () => songCourseDisplayProfile({ active, compact, preferred, display, learnerRange }),
    [active, compact, preferred, display, learnerRange]
  );
}
