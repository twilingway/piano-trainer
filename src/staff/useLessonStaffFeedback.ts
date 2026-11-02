import { useLayoutEffect, useRef, type RefObject } from "react";
import type { LessonStaffFeedbackSource } from "./lessonStaffFeedback";
import { LessonStaffFeedbackOverlay } from "./lessonStaffFeedbackOverlay";
import type { NoteIndex } from "./staffNoteIndex";

/** One owner per drawn staff; XML replacement changes readiness, not the overlay's lifetime. */
export function useLessonStaffFeedback(
  source: LessonStaffFeedbackSource | undefined,
  hostRef: RefObject<HTMLElement | null>,
  indexRef: RefObject<NoteIndex>
): RefObject<LessonStaffFeedbackOverlay | null> {
  const ownerRef = useRef<LessonStaffFeedbackOverlay | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!source || !host) return;
    const owner = new LessonStaffFeedbackOverlay(host, () => indexRef.current);
    ownerRef.current = owner;
    const unsubscribe = source.subscribe(owner.receive);
    return () => {
      unsubscribe();
      owner.dispose();
      ownerRef.current = null;
    };
  }, [source, hostRef, indexRef]);
  return ownerRef;
}
