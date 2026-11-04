import type { SongCourseFeedbackSource } from "./songCourseFeedback";
import { uniqueFeedbackHead } from "./lessonStaffFeedbackOverlay";
import { markKey, type NoteIndex } from "./staffNoteIndex";
import { setClayNoteExpression } from "./staffClayFaces";

/** Changes expression primitives only: the engraved head, duration, stem and colour stay intact. */
export class SongCourseFaceOverlay {
  private runId: string | null | undefined;
  constructor(
    private readonly host: HTMLElement,
    private readonly index: () => NoteIndex,
    private readonly source: SongCourseFeedbackSource,
    private readonly presentationId: string
  ) {}
  readonly refresh = (): void => {
    const snapshot = this.source.read();
    if (snapshot && snapshot.presentationId !== this.presentationId) return;
    if (!snapshot || snapshot.runId !== this.runId) {
      for (const head of this.host.querySelectorAll<SVGElement>("[data-clay-face-placement]"))
        setClayNoteExpression(head, "neutral", head.dataset.clayFacePlacement === "outside");
      this.runId = snapshot?.runId;
    }
    if (!snapshot) return;
    const index = this.index();
    for (const note of snapshot.notes) {
      const head = uniqueFeedbackHead(
        (index.feedbackHeads ?? index.heads).get(markKey(note.staffBeat, note.pitch)) ?? []
      );
      if (!head || !this.host.contains(head) || !head.dataset.clayFacePlacement) continue;
      setClayNoteExpression(head, note.state, head.dataset.clayFacePlacement === "outside");
    }
  };
}
