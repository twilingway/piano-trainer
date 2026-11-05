import { selectedPractice } from "./practiceCourseSelection";
import type { StaffPrefs } from "./staffPreferences";
import type { useCourse } from "./useCourse";
import { usePracticeDisplayPrefs } from "./useMusicTrainer";
import type { usePracticeCourses } from "./usePracticeCourses";
import { useSongCourseDisplayProfile } from "./useSongCourseDisplayProfile";

interface Options {
  readonly courses: ReturnType<typeof usePracticeCourses>;
  readonly preferences: StaffPrefs;
  readonly performance: boolean;
  readonly course: Pick<ReturnType<typeof useCourse>, "active" | "saved">;
}

/** Keep display composition outside the player shell while preserving the legacy course profile. */
export function useCourseWorkspaceDisplay({ courses, preferences, performance, course }: Options) {
  const { practiceActive, ear } = selectedPractice(courses);
  const { beginner, songCourse, music } = courses;
  const display = usePracticeDisplayPrefs({
    practiceActive,
    beginner: beginner.active || songCourse.active,
    ear,
    music,
    staffPrefs: preferences,
    performance,
    courseActive: course.active !== null,
    courseView: course.saved.view
  });
  return useSongCourseDisplayProfile({
    active: songCourse.active,
    preferred: preferences,
    display,
    learnerRange: songCourse.displayRange
  });
}
