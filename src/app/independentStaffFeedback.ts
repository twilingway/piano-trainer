import type {
  IndependentRhythmPhaseExercise,
  IndependentRhythmSnapshot
} from "../independentRhythm/types";
import type { LessonStaffFeedbackSink } from "../staff/lessonStaffFeedback";
import { publishJointStaffFeedback } from "./jointStaffFeedback";

/** Outcomes are authored grading results, unlike raw key events or the trainer's empty event list. */
export function publishIndependentStaffFeedback(
  sink: LessonStaffFeedbackSink | undefined,
  runId: string,
  presentationId: string,
  phase: IndependentRhythmPhaseExercise,
  previous: IndependentRhythmSnapshot | null,
  snapshot: IndependentRhythmSnapshot | null
): void {
  if (!sink || !snapshot?.presented || ["cancelled", "overflow"].includes(snapshot.status)) return;
  const hits = snapshot.outcomes.filter(
    (note) =>
      note.outcome === "hit" &&
      previous?.outcomes.find((old) => old.noteId === note.noteId)?.outcome !== "hit"
  );
  if (hits.length)
    publishJointStaffFeedback(
      sink,
      {
        runId,
        presentationId,
        receiptId: `${presentationId}:${hits.map((note) => `${note.noteId}:${String(note.eventSequence)}`).join(",")}`
      },
      phase.song,
      hits.map((note) => note.noteId)
    );
}
