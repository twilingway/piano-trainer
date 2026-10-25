import { IntegratedLesson } from "../musicLearning/integrated";
import type { IntegratedPlan, IntegratedPhaseId } from "../musicLearning/integrated";
import type { MusicActivity } from "./musicCourseExercise";
import type { MusicPersistentState } from "./musicPersistence";
import type { MusicCourseCallbacks } from "./musicCourseContracts";
import { reserveMusicActivity } from "./musicCourseControllerMaterial";

export interface MusicControllerReplacement {
  readonly saved: MusicPersistentState;
  readonly lesson: IntegratedLesson | null;
  readonly activity: MusicActivity;
  readonly newMaterial: boolean;
}
/** Keep the old session alive until the shared journal has committed its replacement. */
export async function prepareMusicControllerReplacement(
  saved: MusicPersistentState,
  lesson: IntegratedLesson | null,
  plan: IntegratedPlan | null,
  advance: boolean,
  callbacks: MusicCourseCallbacks,
  current: () => boolean,
  phase?: IntegratedPhaseId
): Promise<MusicControllerReplacement | null> {
  const nextSaved = { ...saved, seed: lesson && plan ? plan.seed : (saved.seed + 1) >>> 0 };
  let nextLesson: IntegratedLesson | null = null;
  if (lesson && plan) {
    const previous = lesson.save();
    nextLesson = new IntegratedLesson({ lessonId: previous.lessonId, plan, saved: previous });
    const snapshot = nextLesson.snapshot();
    const accepted = advance
      ? nextLesson.next(snapshot.identity)
      : nextLesson.repeat(phase ?? snapshot.phaseId);
    if (!accepted) return null;
  }
  const reserved = await reserveMusicActivity(
    nextSaved,
    nextLesson,
    { ...callbacks, rememberSeed: () => undefined },
    current
  );
  if (!reserved || !current()) return null;
  return {
    saved: nextLesson ? nextSaved : { ...nextSaved, seed: reserved.activity.exercise.seed },
    lesson: nextLesson,
    ...reserved
  };
}
