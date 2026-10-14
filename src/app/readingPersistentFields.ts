import type { ReadingState } from "./readingSlice";

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
  if (
    current.intervals.mode !== baseline.intervals.mode ||
    current.intervals.seed !== baseline.intervals.seed ||
    current.intervals.generatorVersion !== baseline.intervals.generatorVersion
  )
    fields.push("intervalSelection");
  if (current.intervals.sourceFilter !== baseline.intervals.sourceFilter)
    fields.push("intervalSourceFilter");
  if (
    (current.selectionRevision !== baseline.selectionRevision &&
      current.activeCourse === "rhythm-training") ||
    current.rhythm.seed !== baseline.rhythm.seed ||
    current.rhythm.bpm !== baseline.rhythm.bpm ||
    current.rhythm.inputSource !== baseline.rhythm.inputSource ||
    current.rhythm.generatorVersion !== baseline.rhythm.generatorVersion
  )
    fields.push("rhythmSelection");
  if (
    (current.selectionRevision !== baseline.selectionRevision &&
      current.activeCourse === "bass-reading") ||
    current.bass.task !== baseline.bass.task ||
    current.bass.seed !== baseline.bass.seed ||
    current.bass.generatorVersion !== baseline.bass.generatorVersion
  )
    fields.push("bassSelection");
  if (current.bass.sourceFilter !== baseline.bass.sourceFilter) fields.push("bassSourceFilter");
  if (
    (current.selectionRevision !== baseline.selectionRevision &&
      current.activeCourse === "two-hand-coordination") ||
    current.coordination.seed !== baseline.coordination.seed ||
    current.coordination.generatorVersion !== baseline.coordination.generatorVersion
  )
    fields.push("twoHandSelection");
  if (current.coordination.sourceFilter !== baseline.coordination.sourceFilter)
    fields.push("twoHandSourceFilter");
  if (
    (current.selectionRevision !== baseline.selectionRevision &&
      current.activeCourse === "held-bass-reading") ||
    current.heldBass.seed !== baseline.heldBass.seed ||
    current.heldBass.generatorVersion !== baseline.heldBass.generatorVersion
  )
    fields.push("heldBassSelection");
  if (current.heldBass.sourceFilter !== baseline.heldBass.sourceFilter)
    fields.push("heldBassSourceFilter");
  if (
    (current.selectionRevision !== baseline.selectionRevision &&
      current.activeCourse === "independent-rhythm-reading") ||
    current.independentRhythm.seed !== baseline.independentRhythm.seed ||
    current.independentRhythm.generatorVersion !== baseline.independentRhythm.generatorVersion
  )
    fields.push("independentRhythmSelection");
  if (current.independentRhythm.inputSource !== baseline.independentRhythm.inputSource)
    fields.push("independentRhythmSource");
  if (current.independentRhythm.sourceFilter !== baseline.independentRhythm.sourceFilter)
    fields.push("independentRhythmSourceFilter");
  if (current.independentRhythm.showKeyHints !== baseline.independentRhythm.showKeyHints)
    fields.push("independentRhythmKeyHints");
  for (const key of ["automaticHints", "nameDelayMs", "keyDelayMs"] as const) {
    if (current.preferences[key] !== baseline.preferences[key]) fields.push(key);
  }
  if (current.sourceFilter !== baseline.sourceFilter) fields.push("sourceFilter");
  return fields;
}
