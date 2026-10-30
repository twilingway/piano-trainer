import type { Hand } from "../fingering/fingering";
import type { PracticeEvent } from "../practice/session";
import type {
  LessonStaffFeedbackNote,
  LessonStaffFeedbackSink,
  LessonStaffFeedbackReceipt
} from "../staff/lessonStaffFeedback";
import type { MusicActivity } from "./musicCourseExercise";
import type { MusicRunIdentity } from "./musicCourseRun";

/** Receipts describe accepted displayed targets; they never infer correctness from input pitches. */
export class MusicStaffFeedback {
  constructor(
    private readonly activity: MusicActivity,
    private readonly identity: MusicRunIdentity,
    private readonly publish?: (receipt: LessonStaffFeedbackReceipt) => void
  ) {}

  input(events: readonly PracticeEvent[]): void {
    const ids = events.flatMap((event) => (event.type === "hit" ? [event.noteId] : []));
    this.notes(
      this.activity.exercise.song.notes
        .filter((note) => ids.includes(note.id))
        .map((note) => ({
          noteId: note.id,
          pitch: note.pitch,
          staffBeat: note.startBeat
        }))
    );
  }

  chord(startBeat: number, hand: Hand): void {
    this.notes(
      this.activity.exercise.song.notes
        .filter((note) => note.startBeat === startBeat && note.hand === hand)
        .map((note) => ({ noteId: note.id, pitch: note.pitch, staffBeat: note.startBeat }))
    );
  }

  private notes(notes: readonly LessonStaffFeedbackNote[]): void {
    if (notes.length && this.publish)
      this.publish({
        ...this.identity,
        receiptId: `${this.identity.presentationId}:${notes.map((note) => note.noteId).join(",")}`,
        notes
      });
  }
}

/** The current controller, rather than a captured run, owns display and input readiness. */
export function musicStaffReceiver(
  sink: LessonStaffFeedbackSink | undefined,
  available: () => boolean,
  state: () => { readonly identity: MusicRunIdentity | null; readonly presented: boolean },
  visible: () => boolean
): (receipt: LessonStaffFeedbackReceipt) => void {
  return (receipt) => {
    if (
      available() &&
      visible() &&
      state().presented &&
      state().identity?.presentationId === receipt.presentationId
    )
      sink?.publish(receipt);
  };
}
