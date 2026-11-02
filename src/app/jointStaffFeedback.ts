import type { Song } from "../song/song";
import type { LessonStaffFeedbackSink } from "../staff/lessonStaffFeedback";

/** Map only already committed authored notes into the score currently shown by a joint drill. */
export function publishJointStaffFeedback(
  sink: LessonStaffFeedbackSink | undefined,
  identity: { readonly runId: string; readonly presentationId: string; readonly receiptId: string },
  song: Song,
  noteIds: readonly string[],
  staffBeat?: number
): void {
  if (!sink) return;
  const notes = song.notes
    .filter((note) => noteIds.includes(note.id))
    .map((note) => ({
      noteId: note.id,
      pitch: note.pitch,
      staffBeat: staffBeat ?? note.startBeat
    }));
  if (notes.length) sink.publish({ ...identity, notes });
}
