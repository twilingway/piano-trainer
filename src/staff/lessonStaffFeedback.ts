/** A note already accepted by an exercise, in its currently displayed score's coordinates. */
export interface LessonStaffFeedbackNote {
  readonly noteId: string;
  readonly staffBeat: number;
  readonly pitch: number;
}

export interface LessonStaffFeedbackReceipt {
  readonly runId: string;
  readonly presentationId: string;
  readonly receiptId: string;
  readonly notes: readonly LessonStaffFeedbackNote[];
}

export type LessonStaffFeedbackEvent =
  | { readonly type: "accepted"; readonly receipt: LessonStaffFeedbackReceipt }
  | { readonly type: "clear" };

export interface LessonStaffFeedbackSink {
  publish(receipt: LessonStaffFeedbackReceipt): void;
  clear(): void;
}

export interface LessonStaffFeedbackSource {
  subscribe(listener: (event: LessonStaffFeedbackEvent) => void): () => void;
}

/** Ephemeral synchronous delivery. Readiness and bounded dedupe belong to the drawn staff. */
export function createLessonStaffFeedback(): LessonStaffFeedbackSource & LessonStaffFeedbackSink {
  const listeners = new Set<(event: LessonStaffFeedbackEvent) => void>();
  const deliver = (event: LessonStaffFeedbackEvent) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A decorative listener must never interrupt grading or progress.
      }
    }
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(receipt) {
      deliver({ type: "accepted", receipt });
    },
    clear() {
      deliver({ type: "clear" });
    }
  };
}
