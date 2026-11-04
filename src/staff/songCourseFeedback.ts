import type { CourseMaterial } from "../songCourse/model";
import type { CourseNoteFeedback } from "../songCourse/provisional";
export interface SongCourseFaceNote extends CourseNoteFeedback {
  readonly staffBeat: number;
  readonly pitch: number;
}
export interface SongCourseFaceSnapshot {
  readonly presentationId: string;
  readonly runId: string | null;
  readonly sourceHash: string;
  readonly notes: readonly SongCourseFaceNote[];
}
export interface SongCourseFeedbackSource {
  readonly read: () => SongCourseFaceSnapshot | null;
  readonly subscribe: (listener: () => void) => () => void;
}
export interface SongCourseFeedbackContext {
  readonly presentationId: string;
  readonly runId: string;
  readonly sourceHash: string;
}
/** Ephemeral decoration only. Neither React renders nor musical clocks drive this channel. */
export function createSongCourseFeedback() {
  let current: SongCourseFaceSnapshot | null = null;
  let ordinal = -Infinity;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Decoration cannot interrupt grading. */
      }
    }
  };
  return {
    read: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset(material: CourseMaterial, presentationId: string, runId: string | null): void {
      ordinal = -Infinity;
      current = {
        presentationId,
        runId,
        sourceHash: material.source.sourceHash,
        notes: material.expected.map((note) => ({
          sourceNoteId: note.sourceNoteId,
          staffBeat: note.startBeat,
          pitch: note.pitch,
          state: "neutral"
        }))
      };
      publish();
    },
    clear(): void {
      current = null;
      ordinal = -Infinity;
      publish();
    },
    update(
      context: SongCourseFeedbackContext,
      updates: readonly CourseNoteFeedback[],
      stableOrdinal: number
    ): void {
      if (
        current?.runId !== context.runId ||
        current.presentationId !== context.presentationId ||
        current.sourceHash !== context.sourceHash ||
        stableOrdinal <= ordinal
      )
        return;
      ordinal = stableOrdinal;
      const before = current;
      const notes = before.notes.map((note) => {
        const update = updates.find((item) => item.sourceNoteId === note.sourceNoteId);
        if (!update || (update.state === note.state && update.reason === note.reason)) return note;
        return {
          staffBeat: note.staffBeat,
          pitch: note.pitch,
          ...update
        };
      });
      if (notes.some((note, index) => note !== before.notes[index])) {
        current = { ...current, notes };
        publish();
      }
    }
  };
}
