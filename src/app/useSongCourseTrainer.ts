import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Trainer } from "../practice/Trainer";
import type { SongCourseHook } from "./useSongCourse";

/** Install the raw route before the staff announces readiness. */
export function useSongCourseTrainer(
  course: SongCourseHook,
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean,
  prepare: () => Promise<boolean>
) {
  const prepareRef = useRef(prepare);
  useLayoutEffect(() => {
    prepareRef.current = prepare;
  }, [prepare]);
  useLayoutEffect(() => {
    course.controller.refreshConnection({
      trainer: ready ? trainerRef.current : null,
      blocked,
      prepare: () => prepareRef.current()
    });
  }, [course.controller, ready, trainerRef, blocked]);
  useLayoutEffect(() => {
    if (!course.active || !ready) return;
    const trainer = trainerRef.current;
    trainer?.configureCourse("songCourse", course.policy);
    return () => {
      trainer?.configureCourse("songCourse", null);
    };
  }, [course.active, course.policy, ready, trainerRef]);
}
