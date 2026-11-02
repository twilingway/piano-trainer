import { lessonFingerCues, NO_FINGER_CUES, type LessonFingerCue } from "../reading/fingerCues";
import type { MusicControllerState } from "./musicCourseControllerView";
import type { MusicExercise } from "../musicLearning/types";
import type { PracticeSession } from "../practice/session";
import type { CourseGuidance } from "../practice/trainerCourse";

const cached = new WeakMap<
  MusicControllerState,
  {
    readonly scene: MusicExercise;
    readonly key: string;
    readonly cues: readonly LessonFingerCue[];
  }
>();

/** Existing explicit help is the only authority; hidden sound exercises never reveal keys. */
export function musicCourseFingerCues(
  state: MusicControllerState,
  blocked: boolean
): readonly LessonFingerCue[] {
  const activity = state.activity;
  const scene = state.scene;
  if (
    blocked ||
    !scene ||
    activity?.purpose !== "training" ||
    !state.hint ||
    !state.helpShown ||
    !state.presented ||
    state.error ||
    state.savedResult ||
    state.controlGroup ||
    !["preflight", "preview", "ready", "playing", "reply"].includes(state.status) ||
    (activity.auditory && !state.visualAlternative) ||
    (state.preview && !state.preview.snapshot().scoreVisible)
  )
    return NO_FINGER_CUES;
  const first = scene.song.notes[0]?.start;
  const notes = state.session?.nextDue() ?? scene.song.notes.filter((note) => note.start === first);
  const key = notes.map((note) => `${note.id}:${note.hand}:${String(note.finger)}`).join("|");
  const previous = cached.get(state);
  if (previous?.scene === scene && previous.key === key) return previous.cues;
  const cues = lessonFingerCues(notes);
  cached.set(state, { scene, key, cues });
  return cues;
}

export function musicCourseGuidance(
  state: MusicControllerState,
  session: PracticeSession,
  blocked: boolean
): CourseGuidance {
  const fingerCues = musicCourseFingerCues(state, blocked);
  const notes = session
    .nextDue()
    .filter((note) => fingerCues.some((cue) => cue.noteId === note.id && cue.hand === note.hand));
  return {
    lights: notes.map((note) => note.pitch),
    frame: {
      hintNotes: notes,
      due: notes,
      waitingFor: notes,
      hints: notes.length > 0,
      neutralKeys: true,
      fingerCues
    }
  };
}
