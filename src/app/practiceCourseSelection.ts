import type { usePracticeCourses } from "./usePracticeCourses";
type Courses = ReturnType<typeof usePracticeCourses>;

/** Course priority is explicit and shared by the song and transport composition. */
export function selectedPractice(courses: Courses) {
  const { songCourse, music, independentRhythm, heldBass, twoHand, rhythm, intervals, reading } =
    courses;
  return {
    practiceActive:
      songCourse.active ||
      music.active ||
      independentRhythm.active ||
      heldBass.active ||
      twoHand.active ||
      rhythm.active ||
      intervals.active ||
      reading.active,
    ear: intervals.active && intervals.mode === "hear-and-choose",
    practiceExercise:
      songCourse.scene ??
      music.scene ??
      independentRhythm.scene ??
      heldBass.scene ??
      twoHand.exercise ??
      rhythm.exercise ??
      intervals.exercise ??
      reading.exercise
  };
}
export function practiceDialogsOpen(
  courses: Courses,
  library: boolean,
  settings: boolean,
  lesson: string | null
): boolean {
  return (
    courses.beginner.intro ||
    lesson !== null ||
    library ||
    settings ||
    courses.twoHand.intro ||
    courses.heldBass.intro ||
    courses.independentRhythm.intro
  );
}
