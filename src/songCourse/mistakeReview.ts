import type { SongCourseResult, SongCourseSource } from "./model";

export interface SongCourseReviewPlan {
  readonly id: string;
  readonly sourceRunId: string;
  readonly songId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly phraseIds: readonly string[];
  /** Keeps an early single-note exercise from introducing other notes in its source phrase. */
  readonly sourceNoteIds: readonly string[];
  /** Full-source, zero-based measure interval, end exclusive. */
  readonly fromMeasure: number;
  readonly toMeasure: number;
}

/** Review keeps the actual source phrases; it never invents a random replacement series. */
export function songCourseMistakeReview(
  source: SongCourseSource,
  result: SongCourseResult
): SongCourseReviewPlan[] {
  if (
    result.songId !== source.id ||
    result.sourceRevision !== source.revision ||
    result.sourceHash !== source.sourceHash
  )
    return [];
  const wanted = new Set(result.mistakePhraseIds);
  const plans: SongCourseReviewPlan[] = [];
  for (const phrase of source.phrases) {
    if (!wanted.has(phrase.id)) continue;
    const mistakes = result.notes.filter(
      (note) => note.phraseId === phrase.id && note.mistakes.length
    );
    for (let from = phrase.fromMeasure; from < phrase.toMeasure; from += 4) {
      const to = Math.min(from + 4, phrase.toMeasure);
      const context = result.notes.filter(
        (note) => note.phraseId === phrase.id && note.measureIndex >= from && note.measureIndex < to
      );
      if (!context.length) continue;
      if (
        mistakes.length &&
        !mistakes.some((note) => note.measureIndex >= from && note.measureIndex < to)
      )
        continue;
      plans.push({
        id: `${result.runId}:review:${phrase.id}:${String(from)}`,
        sourceRunId: result.runId,
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        phraseIds: [phrase.id],
        sourceNoteIds: context.map((note) => note.sourceNoteId),
        fromMeasure: from,
        toMeasure: to
      });
    }
  }
  return plans;
}
