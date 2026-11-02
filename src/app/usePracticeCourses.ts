import { useState } from "react";
import { createLessonStaffFeedback } from "../staff/lessonStaffFeedback";
import { useReadingCourse } from "./useReadingCourse";
import { useIntervalCourse } from "./useIntervalCourse";
import { useRhythmCourse } from "./useRhythmCourse";
import { useTwoHandCourse } from "./useTwoHandCourse";
import { useHeldBassCourse } from "./useHeldBassCourse";
import { useIndependentRhythmCourse } from "./useIndependentRhythmCourse";
import { useMusicCourse } from "./useMusicCourse";

/** One stable feedback channel belongs to this player's exercise adapters. */
export function usePracticeCourses() {
  const [lessonStaffFeedback] = useState(createLessonStaffFeedback);
  const reading = useReadingCourse(lessonStaffFeedback);
  const intervals = useIntervalCourse(lessonStaffFeedback);
  const rhythm = useRhythmCourse(lessonStaffFeedback);
  const twoHand = useTwoHandCourse(lessonStaffFeedback);
  const heldBass = useHeldBassCourse(lessonStaffFeedback);
  const independentRhythm = useIndependentRhythmCourse(lessonStaffFeedback);
  const music = useMusicCourse(lessonStaffFeedback);
  return {
    reading,
    intervals,
    rhythm,
    twoHand,
    heldBass,
    independentRhythm,
    music,
    lessonStaffFeedback
  };
}
