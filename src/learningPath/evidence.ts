import type { ReadingResult } from "../reading/types";
import type { BassReadingResult } from "../reading/bassTypes";
import type { IntervalResult } from "../intervals/types";
import type { RhythmResult } from "../rhythm/types";
import type { TwoHandResult } from "../reading/twoHandTypes";
import type { HeldBassResult } from "../reading/heldBassTypes";
import type { IndependentRhythmResult } from "../independentRhythm/types";
import type { MusicResult } from "../musicLearning/progress";
export interface PathHistories {
  readonly right: readonly ReadingResult[];
  readonly left: readonly BassReadingResult[];
  readonly intervals: readonly IntervalResult[];
  readonly rhythm: readonly RhythmResult[];
  readonly twoHand: readonly TwoHandResult[];
  readonly heldBass: readonly HeldBassResult[];
  readonly independent: readonly IndependentRhythmResult[];
  readonly music: readonly MusicResult[];
}
const finished = (at: number | undefined) =>
  typeof at === "number" && Number.isFinite(at) && at >= 0;
/** Histories have already passed each course's persistence validator; check exact task completion. */
export function completedPathSteps(h: PathHistories): string[] {
  const ids = new Set<string>();
  for (const r of h.right)
    if (r.notes.length === 20 && (!r.plan || r.plan.purpose === r.task)) ids.add(`right-${r.task}`);
  for (const r of h.left)
    if (finished(r.completedAt) && r.notes.length === 20) ids.add(`left-${r.task}`);
  for (const r of h.intervals)
    if (finished(r.completedAt) && r.questions.length === 10)
      ids.add(r.mode === "see-and-play" ? "interval-see" : "interval-hear");
  if (h.rhythm.some((r) => finished(r.completedAt))) ids.add("rhythm");
  if (h.twoHand.some((r) => finished(r.completedAt))) ids.add("two-hand");
  if (h.heldBass.some((r) => finished(r.completedAt))) ids.add("held-bass");
  if (h.independent.some((r) => finished(r.completedAt))) ids.add("two-rhythms");
  for (const r of h.music)
    if (
      finished(r.completedAt) &&
      (r.course !== "integrated" || r.state.completedPhases.length === 7)
    )
      ids.add(r.course);
  return [...ids];
}
