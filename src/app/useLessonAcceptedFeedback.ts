import { useLayoutEffect, useRef } from "react";
import type { LessonStaffFeedbackSink } from "../staff/lessonStaffFeedback";

/** Keep the synchronous sink current without rebuilding input policies on each render. */
export function useLessonAcceptedFeedback(
  sink: LessonStaffFeedbackSink | undefined,
  run: object | null
) {
  const ref = useRef(sink);
  useLayoutEffect(() => {
    ref.current = sink;
  }, [sink]);
  useLayoutEffect(() => {
    if (!run) return;
    ref.current?.clear();
    return () => {
      ref.current?.clear();
    };
  }, [run]);
  return ref;
}
