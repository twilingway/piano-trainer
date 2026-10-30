import type { LessonStaffFeedbackEvent } from "./lessonStaffFeedback";
import { markKey, type NoteIndex } from "./staffNoteIndex";

/** Nested paths belong to one head; independent roots at the same beat/pitch are ambiguous. */
export function uniqueFeedbackHead(shapes: readonly SVGElement[]): SVGElement | undefined {
  const unique = [...new Set(shapes)];
  const roots = unique.filter(
    (shape) => !unique.some((other) => other !== shape && other.contains(shape))
  );
  return roots.length === 1 ? roots[0] : undefined;
}

/** Owns only decoration: captured bounds survive replacement of OSMD's measured SVG. */
export class LessonStaffFeedbackOverlay {
  private readonly layer: HTMLDivElement;
  private readonly seen = new Set<string>();
  private presentationId: string | undefined;
  private blockedId: string | undefined;
  private runId: string | undefined;
  private isReady = false;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly readIndex: () => Pick<NoteIndex, "heads" | "feedbackHeads">
  ) {
    this.layer = document.createElement("div");
    this.layer.className = "staff-feedback";
    this.layer.setAttribute("aria-hidden", "true");
    host.append(this.layer);
    window.addEventListener("scroll", this.refresh, true);
    window.addEventListener("resize", this.refresh);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.refresh();
  }

  /** Fixed positioning cannot add a scroll extent while the score shrinks or scrolls. */
  readonly refresh = (): void => {
    if (this.disposed) return;
    const box = this.host.getBoundingClientRect();
    this.layer.style.left = `${String(box.left + this.host.clientLeft)}px`;
    this.layer.style.top = `${String(box.top + this.host.clientTop)}px`;
    this.layer.style.width = `${String(this.host.clientWidth || box.width)}px`;
    this.layer.style.height = `${String(this.host.clientHeight || box.height)}px`;
  };
  private readonly visibilityChanged = (): void => {
    if (document.visibilityState === "hidden") this.removePulses();
  };

  /** Loading a new drawing must not erase the short pulse captured from its predecessor. */
  invalidate(): void {
    this.isReady = false;
  }
  ready(presentationId: string): void {
    if (this.disposed || presentationId === this.blockedId) return;
    if (presentationId !== this.presentationId) {
      this.seen.clear();
      this.runId = undefined;
      this.presentationId = presentationId;
      this.blockedId = undefined;
    }
    this.isReady = true;
  }
  /** Rendering errors clear decoration without permanently blocking a retry of the same id. */
  fail(): void {
    this.invalidate();
    this.removePulses();
  }
  private removePulses(): void {
    this.layer.replaceChildren();
  }
  private clear(): void {
    this.blockedId = this.presentationId;
    this.invalidate();
    this.seen.clear();
    this.runId = undefined;
    this.removePulses();
  }

  readonly receive = (event: LessonStaffFeedbackEvent): void => {
    if (this.disposed) return;
    if (event.type === "clear") {
      this.clear();
      return;
    }
    const { receipt } = event;
    if (
      !this.isReady ||
      receipt.presentationId !== this.presentationId ||
      document.visibilityState === "hidden" ||
      !this.host.isConnected ||
      (this.runId !== undefined && receipt.runId !== this.runId)
    )
      return;
    this.runId = receipt.runId;
    const hostBox = this.host.getBoundingClientRect();
    const width = this.host.clientWidth || hostBox.width;
    const height = this.host.clientHeight || hostBox.height;
    if (width <= 0 || height <= 0) return;
    this.refresh();
    const index = this.readIndex();
    const heads = index.feedbackHeads ?? index.heads;
    for (const note of receipt.notes) {
      if (this.seen.has(note.noteId)) continue;
      this.seen.add(note.noteId);
      if (!Number.isFinite(note.staffBeat) || !Number.isFinite(note.pitch)) continue;
      const head = uniqueFeedbackHead(heads.get(markKey(note.staffBeat, note.pitch)) ?? []);
      if (!head || !head.isConnected || !this.host.contains(head)) continue;
      const box = head.getBoundingClientRect();
      const x = box.left + box.width / 2 - hostBox.left - this.host.clientLeft;
      const y = box.top + box.height / 2 - hostBox.top - this.host.clientTop;
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        box.width <= 0 ||
        box.height <= 0 ||
        x < 0 ||
        x > width ||
        y < 0 ||
        y > height
      )
        continue;
      const pulse = document.createElement("div");
      pulse.className = "staff-feedback__pulse";
      pulse.dataset.noteId = note.noteId;
      pulse.style.left = `${String(x)}px`;
      pulse.style.top = `${String(y)}px`;
      pulse.style.width = `${String(Math.max(20, box.width + 16))}px`;
      pulse.style.height = `${String(Math.max(20, box.height + 16))}px`;
      pulse.addEventListener("animationend", () => {
        pulse.remove();
      });
      this.layer.append(pulse);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("scroll", this.refresh, true);
    window.removeEventListener("resize", this.refresh);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.layer.remove();
    this.seen.clear();
  }
}
