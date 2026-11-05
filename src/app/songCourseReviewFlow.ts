import type {
  CourseMaterial,
  CourseMistakeKind,
  SongCourseResult,
  SongCourseSelection
} from "../songCourse/model";
import { buildSongCourseReviewMaterial } from "../songCourse/material";
import { songCourseMistakeReview, type SongCourseReviewPlan } from "../songCourse/mistakeReview";

interface ReviewEntry {
  readonly source: CourseMaterial["source"];
  readonly plan: SongCourseReviewPlan;
  readonly result: SongCourseResult;
}

const INSTRUCTIONS: Readonly<Record<string, string> & { pitch: string }> = {
  pitch: "Повторим ноты этой фразы. Сначала найдите нужные клавиши.",
  onset: "Повторим ритм этой фразы. Нажимайте клавиши вовремя.",
  hold: "Повторим длину звуков. Держите каждую клавишу до конца ноты.",
  "onset,pitch": "Повторим ноты и ритм этой фразы. Найдите нужные клавиши и нажимайте вовремя.",
  "hold,pitch": "Повторим ноты и длину звуков. Найдите нужные клавиши и держите до конца ноты.",
  "hold,onset": "Повторим ритм и длину звуков. Нажимайте вовремя и держите до конца ноты.",
  "hold,onset,pitch": "Повторим эту фразу: нужные клавиши, ритм и длину каждого звука."
};

function reviewMaterial(entry: ReviewEntry): CourseMaterial {
  const material = buildSongCourseReviewMaterial(entry.source, entry.plan, entry.plan.id);
  const ids = new Set(entry.plan.sourceNoteIds);
  const mistakes = new Set<CourseMistakeKind>();
  for (const note of entry.result.notes) {
    if (ids.has(note.sourceNoteId)) for (const mistake of note.mistakes) mistakes.add(mistake);
  }
  // A wrong extra attack can mark a phrase even when every expected note was correct.
  if (!mistakes.size) mistakes.add("pitch");
  const instruction = INSTRUCTIONS[[...mistakes].sort().join(",")] ?? INSTRUCTIONS.pitch;
  return { ...material, node: { ...material.node, instruction } };
}

/** Keeps actual source blocks queued while retries stay on the current material. */
export class SongCourseReviewFlow {
  private pending: ReviewEntry[] = [];
  private returnSelection: SongCourseSelection | null = null;

  canReview(material: CourseMaterial | null, result: SongCourseResult | null): boolean {
    return !!(
      material &&
      !material.node.repeat &&
      result &&
      songCourseMistakeReview(material.source, result).length
    );
  }
  get returnTo(): SongCourseSelection | null {
    return this.returnSelection;
  }
  get hasPending(): boolean {
    return this.pending.length > 0;
  }
  clear(): void {
    this.pending = [];
    this.returnSelection = null;
  }
  start(
    material: CourseMaterial,
    result: SongCourseResult,
    selection: SongCourseSelection | null
  ): CourseMaterial | null {
    if (material.node.repeat) return null;
    const entries = songCourseMistakeReview(material.source, result).map((plan) => ({
      source: material.source,
      plan,
      result
    }));
    if (!entries.length) return null;
    // Reviewing a failed review block must preserve later blocks from the original run.
    const tail = material.node.kind === "review" ? this.pending : [];
    this.returnSelection =
      material.node.kind === "review" ? (this.returnSelection ?? selection) : selection;
    this.pending = [...entries, ...tail];
    return this.takeNext();
  }
  takeNext(): CourseMaterial | null {
    const entry = this.pending.shift();
    return entry ? reviewMaterial(entry) : null;
  }
}
