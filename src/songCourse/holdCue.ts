import type { CourseExpectedNote } from "./model";
import { CLAY_NOTES, clayStepForPitch } from "../song/clayNotes";

export interface CourseHoldCue {
  readonly sourceNoteId: string;
  readonly staffBeat: number;
  readonly pitch: number;
  readonly progress: number;
  readonly action: "hold" | "release";
  readonly color: string;
  readonly paused: boolean;
}
export interface SongCourseHoldSnapshot extends CourseHoldCue {
  readonly presentationId: string;
  readonly runId: string;
  readonly sourceHash: string;
}

/** The caller supplies musical held time; this view never advances a clock or decides a grade. */
export function courseHoldCue(
  note: CourseExpectedNote,
  heldSongSeconds: number,
  previousProgress = 0,
  paused = false
): CourseHoldCue | null {
  if (!(note.duration > 0) || !Number.isFinite(heldSongSeconds)) return null;
  const progress = Math.min(1, Math.max(0, previousProgress, heldSongSeconds / note.duration));
  const step = clayStepForPitch(note.pitch);
  return {
    sourceNoteId: note.sourceNoteId,
    staffBeat: note.startBeat,
    pitch: note.pitch,
    progress,
    action: progress >= 1 - 1e-7 ? "release" : "hold",
    color: step ? CLAY_NOTES[step].color : "#70bcef",
    paused
  };
}
