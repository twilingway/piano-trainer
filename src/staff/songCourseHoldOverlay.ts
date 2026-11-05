import rewardStar from "../ui/lesson-art/reward-star.webp";
import type { SongCourseHoldSnapshot } from "../songCourse/holdCue";
import { uniqueFeedbackHead } from "./lessonStaffFeedbackOverlay";
import { markKey, type NoteIndex } from "./staffNoteIndex";

export interface SongCourseHoldLabels {
  readonly hold: string;
  readonly release: string;
  readonly track: string;
}

/** One HTML decoration beside the SVG: no note geometry, score export or musical clock is changed. */
export class SongCourseHoldOverlay {
  private layer: HTMLDivElement | null = null;
  private label: HTMLSpanElement | null = null;
  private fill: HTMLSpanElement | null = null;
  private disposed = false;
  constructor(
    private readonly host: HTMLElement,
    private readonly index: () => NoteIndex,
    private readonly read: () => SongCourseHoldSnapshot | null,
    private readonly presentationId: string,
    private readonly labels: SongCourseHoldLabels
  ) {}
  readonly frame = (): void => {
    if (this.disposed) return;
    const snapshot = this.read();
    const parent =
      this.host.closest<HTMLElement>(".song-course-lesson__score") ?? this.host.parentElement;
    if (
      !snapshot?.runId ||
      snapshot.presentationId !== this.presentationId ||
      !snapshot.runId ||
      !parent ||
      document.visibilityState === "hidden"
    ) {
      this.clear();
      return;
    }
    const index = this.index();
    const head = uniqueFeedbackHead(
      (index.feedbackHeads ?? index.heads).get(markKey(snapshot.staffBeat, snapshot.pitch)) ?? []
    );
    if (!head || !this.host.contains(head)) {
      this.clear();
      return;
    }
    const note = head.getBoundingClientRect();
    const box = parent.getBoundingClientRect();
    const width = Math.min(180, box.width - 16);
    if (
      !(note.width > 0 && note.height > 0 && width > 60 && box.height > 42) ||
      note.right <= box.left ||
      note.left >= box.right ||
      note.bottom <= box.top ||
      note.top >= box.bottom
    ) {
      this.clear();
      return;
    }
    if (this.layer?.parentElement !== parent) {
      this.clear();
      const layer = document.createElement("div");
      layer.className = "song-course-hold";
      layer.setAttribute("role", "progressbar");
      layer.setAttribute("aria-label", this.labels.track);
      layer.setAttribute("aria-valuemin", "0");
      layer.setAttribute("aria-valuemax", "100");
      this.label = document.createElement("span");
      this.label.className = "song-course-hold__label";
      const track = document.createElement("span");
      track.className = "song-course-hold__track";
      this.fill = document.createElement("span");
      this.fill.className = "song-course-hold__fill";
      track.append(this.fill);
      const end = document.createElement("span");
      end.className = "song-course-hold__end";
      const star = document.createElement("img");
      star.src = rewardStar;
      star.alt = "";
      star.width = 16;
      star.height = 16;
      end.append(star);
      end.setAttribute("aria-hidden", "true");
      layer.append(this.label, track, end);
      parent.append(layer);
      this.layer = layer;
    }
    const text = snapshot.action === "release" ? this.labels.release : this.labels.hold;
    if (this.label && this.label.textContent !== text) this.label.textContent = text;
    this.layer.dataset.state = snapshot.paused ? "paused" : snapshot.action;
    this.layer.dataset.sourceNoteId = snapshot.sourceNoteId;
    this.layer.dataset.runId = snapshot.runId;
    this.layer.setAttribute("aria-valuenow", String(Math.round(snapshot.progress * 100)));
    this.layer.setAttribute("aria-valuetext", text);
    this.layer.style.setProperty("--hold-color", snapshot.color);
    if (this.fill) this.fill.style.transform = `scaleX(${String(snapshot.progress)})`;
    const left = Math.max(
      8,
      Math.min(box.width - width - 8, note.left + note.width / 2 - box.left - width / 2)
    );
    const below = note.bottom - box.top + 8;
    const top = Math.max(
      2,
      Math.min(box.height - 42, below + 42 <= box.height ? below : note.top - box.top - 46)
    );
    this.layer.style.left = `${String(left)}px`;
    this.layer.style.top = `${String(top)}px`;
    this.layer.style.width = `${String(width)}px`;
  };
  clear(): void {
    this.layer?.remove();
    this.layer = null;
    this.label = null;
    this.fill = null;
  }
  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}
