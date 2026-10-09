import type { Hand } from "../fingering/fingering";

export type CourseStage = "right" | "left" | "both";
export interface CoursePhrase {
  readonly id: string;
  readonly title?: string;
  readonly version: string;
  readonly musicXml: string;
}
export interface CourseTask {
  readonly stage: CourseStage;
  readonly phraseId: string;
}
export interface CourseLesson {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly goal: string;
  readonly stages: readonly CourseStage[];
  readonly phrases: readonly CoursePhrase[];
  readonly tasks?: readonly CourseTask[];
  readonly finalTask?: CourseTask;
}
export interface CourseSelection extends CourseTask {
  readonly lessonId: string;
}
export type CourseProgress = Record<string, true>;

/** Include the score itself so correcting content always invalidates its old credit. */
export function phraseVersion(phrase: CoursePhrase): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < phrase.musicXml.length; index++) {
    hash ^= BigInt(phrase.musicXml.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${phrase.version}:${hash.toString(16).padStart(16, "0")}`;
}

export function progressKey(
  lesson: CourseLesson,
  stage: CourseStage,
  phrase: CoursePhrase
): string {
  return JSON.stringify([lesson.id, stage, phrase.id, phraseVersion(phrase)]);
}

export function phraseCompleted(
  lesson: CourseLesson,
  stage: CourseStage,
  phrase: CoursePhrase,
  progress: CourseProgress
): boolean {
  return (
    stagePhrases(lesson, stage).some((candidate) => candidate.id === phrase.id) &&
    progress[progressKey(lesson, stage, phrase)] === true
  );
}

export function stageCompleted(
  lesson: CourseLesson,
  stage: CourseStage,
  progress: CourseProgress
): boolean {
  const phrases = stagePhrases(lesson, stage);
  return (
    phrases.length > 0 &&
    phrases.every((phrase) => phraseCompleted(lesson, stage, phrase, progress))
  );
}

export function stageProgress(
  lesson: CourseLesson,
  stage: CourseStage,
  progress: CourseProgress
): { done: number; total: number } {
  const phrases = stagePhrases(lesson, stage);
  return {
    done: phrases.filter((phrase) => phraseCompleted(lesson, stage, phrase, progress)).length,
    total: phrases.length
  };
}

/** Missing lessons and missing final metadata fail closed, without deleting old credit. */
export function blockingLessonNumber(
  lesson: CourseLesson,
  lessons: readonly CourseLesson[],
  progress: CourseProgress
): number | null {
  for (let number = 1; number < lesson.number; number++) {
    const predecessors = lessons.filter((candidate) => candidate.number === number);
    const previous = predecessors.length === 1 ? predecessors[0] : undefined;
    if (previous?.finalTask?.stage !== "both") return number;
    const final = resolveSelection([previous], { lessonId: previous.id, ...previous.finalTask });
    if (!final || !phraseCompleted(previous, "both", final.phrase, progress)) return number;
  }
  return null;
}

export function lessonUnlocked(
  lesson: CourseLesson,
  lessons: readonly CourseLesson[],
  progress: CourseProgress
): boolean {
  return (
    lesson.phrases.length > 0 &&
    lesson.stages.length > 0 &&
    blockingLessonNumber(lesson, lessons, progress) === null
  );
}

export function lessonCompleted(lesson: CourseLesson, progress: CourseProgress): boolean {
  return (
    lesson.stages.length > 0 &&
    lesson.stages.every((stage) => stageCompleted(lesson, stage, progress))
  );
}

export function courseSelections(lesson: CourseLesson): CourseSelection[] {
  if (lesson.tasks) return lesson.tasks.map((task) => ({ lessonId: lesson.id, ...task }));
  return lesson.stages.flatMap((stage) =>
    lesson.phrases.map((phrase) => ({ lessonId: lesson.id, stage, phraseId: phrase.id }))
  );
}

export function stagePhrases(lesson: CourseLesson, stage: CourseStage): readonly CoursePhrase[] {
  if (!lesson.stages.includes(stage)) return [];
  if (!lesson.tasks) return lesson.phrases;
  return lesson.tasks.flatMap((task) => {
    if (task.stage !== stage) return [];
    const phrase = lesson.phrases.find((candidate) => candidate.id === task.phraseId);
    return phrase ? [phrase] : [];
  });
}

export function resolveSelection(
  lessons: readonly CourseLesson[],
  selection: CourseSelection | null
): { lesson: CourseLesson; phrase: CoursePhrase; selection: CourseSelection } | null {
  if (!selection) return null;
  const lesson = lessons.find((candidate) => candidate.id === selection.lessonId);
  if (!lesson?.stages.includes(selection.stage)) return null;
  const phrase = stagePhrases(lesson, selection.stage).find(
    (candidate) => candidate.id === selection.phraseId
  );
  return phrase ? { lesson, phrase, selection } : null;
}

export function firstIncompleteSelection(
  lesson: CourseLesson,
  progress: CourseProgress
): CourseSelection | null {
  const ordered = courseSelections(lesson);
  return (
    ordered.find((selection) => {
      const resolved = resolveSelection([lesson], selection);
      return (
        resolved !== null && !phraseCompleted(lesson, selection.stage, resolved.phrase, progress)
      );
    }) ??
    ordered[0] ??
    null
  );
}

export function nextSelection(
  lesson: CourseLesson,
  selection: CourseSelection
): CourseSelection | null {
  const ordered = courseSelections(lesson);
  const index = ordered.findIndex(
    (candidate) =>
      candidate.lessonId === selection.lessonId &&
      candidate.stage === selection.stage &&
      candidate.phraseId === selection.phraseId
  );
  return index === -1 ? null : (ordered[index + 1] ?? null);
}

export interface CourseRunResult {
  readonly context?: string | undefined;
  readonly songKey: string;
  readonly mode: "wait" | "tempo";
  readonly from: number;
  readonly to: number;
  readonly hands: readonly Hand[];
  readonly hitCount: number;
  readonly interrupted: boolean;
  /** True only for a naturally finished run covering the whole playable score. */
  readonly fullRange: boolean;
}

export function runContext(lesson: CourseLesson, selection: CourseSelection): string | null {
  const resolved = resolveSelection([lesson], selection);
  return resolved ? progressKey(lesson, selection.stage, resolved.phrase) : null;
}

/** This policy receives natural-finish results, never a closed or replayed take. */
export function canCreditCourseRun(
  lesson: CourseLesson,
  selection: CourseSelection,
  result: CourseRunResult,
  expectedSongKey: string
): boolean {
  const expectedContext = runContext(lesson, selection);
  if (!expectedContext) return false;
  const hands: readonly Hand[] = selection.stage === "both" ? ["left", "right"] : [selection.stage];
  return (
    result.context === expectedContext &&
    expectedSongKey.length > 0 &&
    result.songKey === expectedSongKey &&
    result.from === 0 &&
    Number.isFinite(result.to) &&
    result.to > 0 &&
    result.fullRange &&
    !result.interrupted &&
    Number.isInteger(result.hitCount) &&
    result.hitCount > 0 &&
    result.hands.length === hands.length &&
    hands.every((hand) => result.hands.includes(hand))
  );
}
