import { useMemo, useSyncExternalStore } from "react";
import { songCourseDisplayProfile, type SongCourseDisplayInput } from "./songCourseDisplayProfile";

export const COMPACT_SONG_COURSE_QUERY = "(max-width: 1024px)";
export const SHORT_SONG_COURSE_QUERY = "(max-height: 500px)";

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

function readShort(): boolean {
  return typeof window !== "undefined" && window.matchMedia(SHORT_SONG_COURSE_QUERY).matches;
}

function subscribeShort(listener: () => void): () => void {
  const query = window.matchMedia(SHORT_SONG_COURSE_QUERY);
  query.addEventListener("change", listener);
  return () => {
    query.removeEventListener("change", listener);
  };
}

const serverCompact = () => true;
const serverShort = () => false;

/** A breakpoint subscription changes display only; it never reconnects the course transport. */
export function useSongCourseDisplayProfile({
  active,
  preferred,
  display,
  learnerRange
}: Omit<SongCourseDisplayInput, "compact" | "shortViewport">) {
  const compact = useSyncExternalStore(subscribeCompact, readCompact, serverCompact);
  const shortViewport = useSyncExternalStore(subscribeShort, readShort, serverShort);
  // Consumers use preference identity to avoid rebuilding the rendered score on transport updates.
  return useMemo(
    () =>
      songCourseDisplayProfile({
        active,
        compact,
        shortViewport,
        preferred,
        display,
        learnerRange
      }),
    [active, compact, shortViewport, preferred, display, learnerRange]
  );
}
