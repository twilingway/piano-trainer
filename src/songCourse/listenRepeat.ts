import type { SongCourseMode, SongCourseNode } from "./model";

/** Learner phrases run continuously; isolated review retains its deliberate note gate. */
export function courseLearnerMode(kind: SongCourseNode["kind"]): SongCourseMode {
  return kind === "review" ? "wait" : "tempo";
}

export type CourseDemoPurpose = "preview" | "repeat";
export type CourseDemoHandoff = "ready" | "release" | "learner";

/** Teaching examples precede the child's new attempt; independent assessment stays direct. */
export function needsCourseDemonstration(kind: SongCourseNode["kind"]): boolean {
  return kind === "notes" || kind === "duration" || kind === "guided-phrase";
}

/** A cancelled or stale example cannot start an answer, including after physical releases. */
export function courseDemoHandoff(
  purpose: CourseDemoPurpose,
  intendedGeneration: number | null,
  currentGeneration: number,
  hasHeldKeys: boolean
): CourseDemoHandoff {
  if (purpose === "preview" || intendedGeneration !== currentGeneration) return "ready";
  return hasHeldKeys ? "release" : "learner";
}
