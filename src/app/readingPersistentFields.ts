import type { ReadingState } from "./readingSlice";
import { READING_COURSE_STORES, courseSlot } from "./courseStores";

export type ReadingPersistentField =
  | "selection"
  | "activeCourse"
  | "intervalSelection"
  | "intervalSourceFilter"
  | "rhythmSelection"
  | "bassSelection"
  | "bassSourceFilter"
  | "twoHandSelection"
  | "twoHandSourceFilter"
  | "heldBassSelection"
  | "heldBassSourceFilter"
  | "independentRhythmSelection"
  | "independentRhythmSource"
  | "independentRhythmSourceFilter"
  | "independentRhythmKeyHints"
  | "automaticHints"
  | "nameDelayMs"
  | "keyDelayMs"
  | "sourceFilter";
export function changedReadingFields(
  current: ReadingState,
  baseline: ReadingState
): ReadingPersistentField[] {
  const fields: ReadingPersistentField[] = [];
  if (
    current.task !== baseline.task ||
    current.seed !== baseline.seed ||
    current.plan !== baseline.plan
  )
    fields.push("selection");
  if (
    current.activeCourse !== baseline.activeCourse ||
    current.selectionRevision !== baseline.selectionRevision
  )
    fields.push("activeCourse");
  const revised = current.selectionRevision !== baseline.selectionRevision;
  for (const course of READING_COURSE_STORES) {
    const now = courseSlot(current, course.key);
    const before = courseSlot(baseline, course.key);
    const { field, keys, followsRevision } = course.selection;
    if (
      (followsRevision && revised && current.activeCourse === course.course) ||
      keys.some((key) => now[key as string] !== before[key as string])
    )
      fields.push(field);
    for (const preference of course.preferences)
      if (now[preference.key as string] !== before[preference.key as string])
        fields.push(preference.field);
  }
  for (const key of ["automaticHints", "nameDelayMs", "keyDelayMs"] as const) {
    if (current.preferences[key] !== baseline.preferences[key]) fields.push(key);
  }
  if (current.sourceFilter !== baseline.sourceFilter) fields.push("sourceFilter");
  return fields;
}
