import type { PracticeSession } from "./session";
import type { TrainerInputHolds } from "./trainerInputHolds";
import type { CourseKind, CoursePolicies, TrainerCourse } from "./trainerCourse";
import { readingCourse } from "./readingPolicy";
import { rhythmCourse } from "./rhythmPolicy";
import { pairCourse } from "./twoHandPolicy";
import { heldBassCourse } from "./heldBassPolicy";
import { independentRhythmCourse } from "./independentRhythmPolicy";

const COURSES: { readonly [K in CourseKind]: (policy: CoursePolicies[K]) => TrainerCourse } = {
  reading: readingCourse,
  rhythm: rhythmCourse,
  pair: pairCourse,
  heldBass: heldBassCourse,
  independentRhythm: independentRhythmCourse
};

/** One exclusive course; physical ownership crosses load and phase boundaries. */
export class TrainerCoursePolicies {
  current: TrainerCourse | null = null;

  constructor(
    private readonly inputHolds: TrainerInputHolds,
    private readonly pressed: Set<number>,
    private readonly onLights: () => ((pitches: readonly number[]) => void) | undefined,
    private readonly session: () => PracticeSession | undefined
  ) {}

  clear(): void {
    this.current = null;
  }

  /** Null removes the course only when it is of this kind: every course hook sends its own null. */
  configure<K extends CourseKind>(kind: K, policy: CoursePolicies[K] | null): void {
    const current = this.current;
    if (policy === null ? current?.kind !== kind : current?.policy === policy) return;
    this.cancelInput();
    const next = policy === null ? null : COURSES[kind](policy);
    this.current = next;
    if (!next) return;
    const session = this.session();
    if (session) next.attach?.(session);
    next.seed?.(this.inputHolds.snapshot(), performance.now());
  }

  /** Loss of physical input cancels before any cleanup-generated releases arrive. */
  cancelInput(resetAll = false): void {
    if (resetAll) this.inputHolds.clear();
    const cancel = this.current?.cancel;
    if (!cancel) return;
    cancel(performance.now(), resetAll);
    this.pressed.clear();
    this.onLights()?.([]);
  }
}
