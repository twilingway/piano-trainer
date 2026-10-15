import type { ReadingState } from "./readingSlice";
import type { ReadingTask } from "../reading/types";
import { READING_COURSE_STORES, type ReadingCourseStates } from "./courseStores";

const COURSE_SCHEMAS: readonly unknown[] = [3, 4, 5, 6, 7, 8];

/** Schema-specific siblings are normalized together; P2 stays outside this boundary. */
export function normalizeReadingCourses(
  row: Record<string, unknown>,
  selectedTask: ReadingTask | null
) {
  const modern = COURSE_SCHEMAS.includes(row.schemaVersion);
  const stored = (since: number) => modern && (row.schemaVersion as number) >= since;
  const states: Record<string, unknown> = {};
  let invalid = false;
  let activeCourse: ReadingState["activeCourse"] = modern
    ? row.activeCourse === "note-reading" && selectedTask
      ? "note-reading"
      : null
    : selectedTask
      ? "note-reading"
      : null;
  const known: unknown[] = [null, "note-reading"];
  for (const course of READING_COURSE_STORES) {
    const present = stored(course.since);
    const { state, invalid: malformed } = course.normalize(present ? row[course.key] : undefined);
    states[course.key] = state;
    const chosen = present && row.activeCourse === course.course;
    const resumable = course.resumable?.(state) ?? true;
    if (chosen && resumable) activeCourse = course.course;
    if (present) known.push(course.course);
    invalid ||= malformed || (present && row[course.key] === undefined) || (chosen && !resumable);
  }
  invalid ||=
    (modern && row.activeCourse === "note-reading" && selectedTask === null) ||
    (modern && !known.includes(row.activeCourse));
  return { ...(states as unknown as ReadingCourseStates), activeCourse, invalid };
}
