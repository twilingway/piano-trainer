// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { musicCourseFingerCues } from "./musicCourseFingerCues";
import { makeMusicActivity } from "./musicCourseExercise";
import { createMusicControllerState } from "./musicCourseControllerView";
import { emptyMusicState } from "./musicPersistence";
import { SightReadingPreview } from "../musicLearning/sightReadingPreview";
import type { PracticeSession } from "../practice/session";
import type { MusicCourseStatus } from "../ui/musicCourseTypes";

function stateFor(course: "sight-reading" | "harmony" | "dictation" = "sight-reading") {
  const state = createMusicControllerState();
  state.activity = makeMusicActivity({ ...emptyMusicState(), course, purpose: "training" });
  state.scene = state.activity.exercise;
  state.presented = true;
  state.status = "ready";
  state.hint = true;
  state.helpShown = true;
  return state;
}

describe("music course finger cue permission", () => {
  it("uses the same stable descriptor array for display and repeated frame snapshots", () => {
    const state = stateFor();
    const cues = musicCourseFingerCues(state, false);
    expect(cues.length).toBeGreaterThan(0);
    expect(musicCourseFingerCues(state, false)).toBe(cues);
    expect(
      cues.every((cue) =>
        state.scene?.song.notes.some(
          (note) =>
            note.id === cue.noteId &&
            note.hand === cue.hand &&
            note.finger === cue.recommendedFinger
        )
      )
    ).toBe(true);
    if (!state.scene) throw new Error("Missing cue scene");
    const next = state.scene.song.notes.find((note) => !cues.some((cue) => cue.noteId === note.id));
    if (!next) throw new Error("Missing next cue note");
    state.session = { nextDue: () => [next] } as unknown as PracticeSession;
    expect(musicCourseFingerCues(state, false).map((cue) => cue.noteId)).toEqual([next.id]);
    expect(musicCourseFingerCues(state, false)).not.toBe(cues);
  });

  it.each<MusicCourseStatus>([
    "listening",
    "paused",
    "error",
    "result",
    "completed",
    "preparation"
  ])("clears cues in %s even after explicit help", (status) => {
    const state = stateFor();
    expect(musicCourseFingerCues(state, false).length).toBeGreaterThan(0);
    state.status = status;
    expect(musicCourseFingerCues(state, false)).toEqual([]);
  });

  it("requires explicit key help, current presentation, unblocked visible training and no saved result", () => {
    const state = stateFor("harmony");
    expect(musicCourseFingerCues(state, false).length).toBeGreaterThan(0);
    expect(musicCourseFingerCues(state, true)).toEqual([]);
    state.hint = false;
    expect(musicCourseFingerCues(state, false)).toEqual([]);
    state.hint = true;
    state.helpShown = false;
    expect(musicCourseFingerCues(state, false)).toEqual([]);
    state.helpShown = true;
    state.presented = false;
    expect(musicCourseFingerCues(state, false)).toEqual([]);
    state.presented = true;
    state.savedResult = true;
    expect(musicCourseFingerCues(state, false)).toEqual([]);
    state.savedResult = false;
    if (!state.activity) throw new Error("Missing cue activity");
    state.activity = { ...state.activity, purpose: "control" };
    expect(musicCourseFingerCues(state, false)).toEqual([]);
  });

  it("never leaks hidden auditory replies; an explicitly visible training alternative may show cues", () => {
    const state = stateFor("dictation");
    state.status = "reply";
    expect(musicCourseFingerCues(state, false)).toEqual([]);
    state.visualAlternative = true;
    expect(musicCourseFingerCues(state, false).length).toBeGreaterThan(0);
    state.status = "listening";
    expect(musicCourseFingerCues(state, false)).toEqual([]);
  });

  it("clears P5 cues when the preview closes its score before a manual start", () => {
    const state = stateFor();
    state.preview = new SightReadingPreview(0, 5);
    state.status = "preview";
    expect(musicCourseFingerCues(state, false).length).toBeGreaterThan(0);
    state.preview.step(5000);
    state.status = "ready";
    expect(musicCourseFingerCues(state, false)).toEqual([]);
    state.preview.start(5000, true);
    state.status = "playing";
    expect(musicCourseFingerCues(state, false).length).toBeGreaterThan(0);
  });
});
