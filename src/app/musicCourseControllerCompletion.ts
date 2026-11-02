import type { MusicPersistentState } from "./musicPersistence";
import type { MusicCourseCallbacks } from "./musicCourseContracts";
import type { MusicControllerState } from "./musicCourseControllerView";
import { musicControllerChildView } from "./musicCourseControllerView";
import {
  createMusicStandaloneResult,
  createMusicResultView,
  createMusicIntegratedChild,
  createMusicIntegratedResult
} from "./musicCourseResults";
import type { MusicResultContext } from "./musicCourseResults";
import { deferMusicControlGroup } from "./musicCourseControllerGroups";

export function presentMusicControllerRun(
  state: MusicControllerState,
  atMs: number,
  offsetMs: number
): void {
  state.run?.presented(atMs, "staff");
  state.run?.setReady(true, Math.max(0, atMs - offsetMs));
}

export function saveMusicControllerLesson(
  state: MusicControllerState,
  callbacks: MusicCourseCallbacks
): void {
  if (state.lesson && state.plan)
    callbacks.saveIntegrated({
      plan: { seed: state.plan.seed, version: 1, theme: state.plan.theme, bpm: state.plan.bpm },
      state: state.lesson.save()
    });
}
/** Restores an existing result boundary without performing or saving another child. */
export function restoreMusicControllerBoundary(
  state: MusicControllerState,
  saved: MusicPersistentState
): void {
  const lesson = state.lesson;
  if (!lesson) return;
  const snapshot = lesson.snapshot();
  const complete = snapshot.status === "lesson-complete";
  state.status = complete ? "completed" : "result";
  state.savedResult = true;
  state.canNext = !complete;
  state.run = null;
  state.scene = null;
  state.activity = null;
  state.identity = null;
  state.session = null;
  state.preview = null;
  state.controlGroup = null;
  if (complete) {
    const lessonId = lesson.save().lessonId;
    const result = saved.history.findLast(
      (entry) => entry.course === "integrated" && entry.state.lessonId === lessonId
    );
    state.result = result
      ? createMusicResultView(result)
      : {
          summaryKey: "Музыкальный урок завершён",
          metrics: [
            { labelKey: "Завершено этапов", value: snapshot.completedPhases.length },
            {
              labelKey: "Выполнено заданий",
              value: new Set(snapshot.results.map((child) => child.activityId)).size
            }
          ],
          helped: snapshot.results.some(
            (child) => child.help.length > 0 || child.visualAlternative
          ),
          newMaterial: false
        };
  } else {
    const child = snapshot.results.findLast(
      (entry) => entry.activityId === snapshot.activity.id && entry.phaseId === snapshot.phaseId
    );
    state.result = child ? musicControllerChildView(child, true, false) : undefined;
  }
}
export function completeMusicController(
  state: MusicControllerState,
  saved: MusicPersistentState,
  callbacks: MusicCourseCallbacks,
  stop: () => void,
  publish: () => void
): void {
  if (state.savedResult || !state.run?.snapshot().allReleased || !state.activity || !state.identity)
    return;
  if (deferMusicControlGroup(state, stop, publish)) return;
  const evidence = state.run.finish();
  if (!evidence) return;
  const context: MusicResultContext = {
    activity: state.activity,
    saved,
    identity: state.identity,
    startedAt: state.startedAt || Date.now(),
    completedAt: Date.now(),
    newMaterial: state.newMaterial,
    evidence,
    groupAnswers: state.groupAnswers,
    previewSeconds: saved.sightPreviewSeconds,
    visualAlternative: state.visualAlternative,
    ...(state.choiceSource &&
    state.activity.expectedChoice !== undefined &&
    !state.activity.integrated
      ? { inputSource: state.choiceSource }
      : {})
  };
  const result = createMusicStandaloneResult(context);
  state.savedResult = true;
  if (result) callbacks.save(result);
  state.result = createMusicResultView(result, context);
  state.status = "result";
  state.canNext = !!result;
  const lesson = state.lesson;
  if (lesson) {
    const child = createMusicIntegratedChild(context, lesson.snapshot());
    state.canNext = lesson.complete(child);
    state.result = musicControllerChildView(child, state.canNext, state.newMaterial);
    saveMusicControllerLesson(state, callbacks);
    if (lesson.snapshot().status === "lesson-complete" && state.plan) {
      const snapshot = lesson.snapshot();
      const aggregate = createMusicIntegratedResult(context, {
        plan: state.plan,
        state: lesson.save(),
        independentControl: snapshot.independentControl,
        auditoryVerified: snapshot.auditoryVerified
      });
      callbacks.save(aggregate);
      state.result = createMusicResultView(aggregate);
      state.status = "completed";
      state.canNext = false;
    }
  }
  stop();
  publish();
}
