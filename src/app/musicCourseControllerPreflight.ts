import { SightReadingPreview } from "../musicLearning/sightReadingPreview";
import type { MusicControllerState } from "./musicCourseControllerView";
import type { MusicPersistentState } from "./musicPersistence";
import { presentMusicControllerRun } from "./musicCourseControllerCompletion";

export function presentMusicControllerScore(
  state: MusicControllerState,
  saved: MusicPersistentState,
  atMs: number,
  offsetMs: number,
  active: boolean
): void {
  state.presented = true;
  if (state.activity?.sight) beginMusicSightPreview(state, saved, atMs, active);
  else state.status = "ready";
  presentMusicControllerRun(state, atMs, offsetMs);
  if (state.lesson && state.activity)
    state.lesson.setReady(state.lesson.snapshot().identity, {
      reservedFingerprint: state.activity.exercise.fingerprint
    });
}

/** Begin preparation time only after both the score and the required answers are ready. */
export function beginMusicSightPreview(
  state: MusicControllerState,
  saved: MusicPersistentState,
  atMs: number,
  active: boolean
): void {
  if (!state.activity?.sight || !state.presented || state.preview) return;
  if (!state.positionReady || !state.groupReady) {
    state.status = "preflight";
    return;
  }
  state.preview = new SightReadingPreview(atMs, saved.sightPreviewSeconds);
  state.preview.setActive(active, atMs);
  state.feedback = undefined;
  state.status = "preview";
}
