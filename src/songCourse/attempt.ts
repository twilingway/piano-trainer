import { freezeSongCourseConfig } from "./evidence";
import { provisionalCourseFeedback, type CourseNoteFeedback } from "./provisional";
import { alignCourseInputs, physicalInputKey } from "./alignment";
import {
  gradeCourseHold,
  holdToleranceMs,
  physicalPerformanceMs,
  physicalCourseOrder
} from "./hold";
import type {
  CourseExpectedNote,
  CoursePause,
  CoursePresentation,
  RawCourseInput,
  SongCourseAttemptConfig,
  SongCourseResult
} from "./model";
import { assertCourseAttemptConfig, gradeSongCourseAttempt } from "./rubric";

export type SongCourseAttemptPhase =
  | "playing"
  | "paused"
  | "awaiting-keys-up"
  | "awaiting-rehold"
  | "awaiting-release"
  | "complete"
  | "aborted";
export interface CourseInputDecision {
  readonly resumeTransport: boolean;
  readonly controlRehold: boolean;
  readonly matchedSourceNoteId?: string;
  readonly feedback?: readonly CourseNoteFeedback[];
}
interface PhysicalPosition {
  readonly performanceMs: number;
  readonly stableOrdinal: number;
}
interface PausedHold {
  readonly note: CourseExpectedNote;
  readonly source: string;
}

/** Evidence and lifecycle only: the shell supplies every timestamp and owns transport. */
export class SongCourseAttempt {
  readonly config: SongCourseAttemptConfig;
  private inputs: RawCourseInput[] = [];
  private presentations: CoursePresentation[] = [];
  private pauses: CoursePause[] = [];
  private held = new Map<string, RawCourseInput>();
  private latestPhysical = new Map<string, RawCourseInput>();
  private pauseWindows: { from: PhysicalPosition; to: PhysicalPosition | null }[] = [];
  private reasons = new Set<string>();
  private pendingHold: PausedHold | null = null;
  private currentPhase: SongCourseAttemptPhase = "playing";
  private endMs: number | null = null;
  private releaseDeadlineMs: number | null = null;
  private completedResult: SongCourseResult | null = null;

  constructor(config: SongCourseAttemptConfig) {
    assertCourseAttemptConfig(config);
    this.config = freezeSongCourseConfig(config);
  }

  get phase(): SongCourseAttemptPhase {
    return this.currentPhase;
  }
  get result(): SongCourseResult | null {
    return this.completedResult;
  }
  get deadlineMs(): number | null {
    return this.releaseDeadlineMs;
  }
  get awaitingSourceNoteId(): string | null {
    return this.pendingHold?.note.sourceNoteId ?? null;
  }
  get invalidReasons(): readonly string[] {
    return [...this.reasons];
  }
  get rawInputs(): readonly RawCourseInput[] {
    return [...this.inputs];
  }

  present(sourceNoteId: string, performanceMs: number, stableOrdinal: number): void {
    if (this.isClosed() || !this.config.expected.some((note) => note.sourceNoteId === sourceNoteId))
      return;
    this.presentations.push({ sourceNoteId, performanceMs, stableOrdinal });
  }

  input(input: RawCourseInput): CourseInputDecision {
    const idle = { resumeTransport: false, controlRehold: false };
    if (this.isClosed() || input.synthetic) return idle;
    const key = physicalInputKey(input);
    const wasHeld = this.held.has(key);
    const previous = this.latestPhysical.get(key);
    const fresh = !previous || physicalCourseOrder(input, previous) > 0;
    if (fresh) {
      this.latestPhysical.set(key, input);
      if (input.type === "up") this.held.delete(key);
      else if (!wasHeld) this.held.set(key, input);
    }
    const pendingHold = this.pendingHold;
    const rehold =
      input.type === "down" &&
      fresh &&
      !wasHeld &&
      this.currentPhase === "awaiting-rehold" &&
      input.admitted !== false &&
      pendingHold !== null &&
      input.pitch === pendingHold.note.pitch &&
      input.source === pendingHold.source &&
      this.held.size === 1;
    const pauseProtocolAttack =
      input.type === "down" &&
      !rehold &&
      this.pauseWindows.some(
        (window) =>
          physicalCourseOrder(input, window.from) >= 0 &&
          (window.to === null || physicalCourseOrder(input, window.to) < 0)
      );
    const captured = {
      ...input,
      ...(pauseProtocolAttack ? { pauseProtocolAttack: true } : {}),
      ...(rehold ? { controlRehold: pendingHold.note.sourceNoteId } : {})
    };
    this.inputs.push(captured);
    if (rehold) {
      this.closePauseWindow(input);
      this.pendingHold = null;
      this.currentPhase = "playing";
      return { resumeTransport: true, controlRehold: true };
    }
    if (this.currentPhase === "awaiting-keys-up" && !this.held.size) {
      this.currentPhase = this.pendingHold ? "awaiting-rehold" : "playing";
      if (!this.pendingHold) this.closePauseWindow(input);
      return { resumeTransport: !this.pendingHold, controlRehold: false };
    }
    const feedback =
      (this.currentPhase === "playing" || this.currentPhase === "awaiting-release") &&
      physicalPerformanceMs(captured) <= (this.releaseDeadlineMs ?? Infinity)
        ? provisionalCourseFeedback(
            this.config,
            {
              inputs: this.inputs,
              presentations: this.presentations,
              pauses: this.pauses,
              musicalEndMs: this.endMs ?? Infinity
            },
            captured
          )
        : [];
    const match =
      input.type === "down" && !wasHeld
        ? [...this.alignment().primary].find(([, down]) => down === captured)
        : undefined;
    return { ...idle, feedback, ...(match ? { matchedSourceNoteId: match[0] } : {}) };
  }

  /** Capture pause before the shell generates any cleanup release. */
  pause(performanceMs: number, stableOrdinal: number): void {
    if (this.currentPhase !== "playing") return;
    const alignment = this.alignment();
    this.pendingHold = null;
    const pauseMarkers: CoursePause[] = [];
    for (const note of this.config.expected) {
      const down = alignment.primary.get(note.sourceNoteId);
      if (!down || !this.held.has(physicalInputKey(down))) continue;
      const hold = gradeCourseHold(
        note,
        down,
        alignment.inputs,
        this.pauses,
        this.config.speed,
        this.config.mode,
        performanceMs
      );
      if (!hold.released) {
        const requiresRehold = hold.heldMs < (note.duration * 1000) / this.config.speed;
        pauseMarkers.push({
          type: "pause",
          performanceMs,
          stableOrdinal,
          sourceNoteId: note.sourceNoteId,
          requiresRehold
        });
        if (requiresRehold) this.pendingHold = { note, source: down.source };
      }
    }
    this.pauses.push(
      ...(pauseMarkers.length
        ? pauseMarkers
        : [{ type: "pause" as const, performanceMs, stableOrdinal }])
    );
    this.pauseWindows.push({ from: { performanceMs, stableOrdinal }, to: null });
    this.currentPhase = "paused";
  }

  /** Returns true only when the existing transport can resume immediately. */
  requestResume(performanceMs?: number, stableOrdinal?: number): boolean {
    if (this.currentPhase !== "paused" && this.currentPhase !== "awaiting-keys-up") return false;
    const pause = this.pauses.at(-1);
    if (pause && this.pendingHold) {
      const alignment = this.alignment(),
        note = this.config.expected.find(
          (expected) => expected.sourceNoteId === this.pendingHold?.note.sourceNoteId
        );
      const down = note && alignment.primary.get(note.sourceNoteId);
      if (
        note &&
        down &&
        gradeCourseHold(
          note,
          down,
          alignment.inputs,
          this.pauses,
          this.config.speed,
          this.config.mode,
          pause.performanceMs
        ).released
      )
        this.pendingHold = null;
    }
    this.currentPhase = this.held.size
      ? "awaiting-keys-up"
      : this.pendingHold
        ? "awaiting-rehold"
        : "playing";
    if (this.currentPhase === "playing" && pause)
      this.closePauseWindow({
        performanceMs: performanceMs ?? pause.performanceMs,
        stableOrdinal: stableOrdinal ?? pause.stableOrdinal
      });
    return this.currentPhase === "playing";
  }

  invalidate(reason: string): void {
    if (!this.isClosed()) this.reasons.add(reason);
  }

  abort(reason = "cancel"): void {
    if (this.isClosed()) return;
    this.reasons.add(reason);
    this.currentPhase = "aborted";
    this.pendingHold = null;
  }

  /** The music ends here; physical up collection stays alive until a bounded deadline. */
  finish(performanceMs: number): void {
    if (this.isClosed() || this.endMs !== null) return;
    this.endMs = performanceMs;
    const terminal = this.config.expected[this.config.expected.length - 1];
    if (!terminal) {
      this.abort("empty-material");
      return;
    }
    const tolerance = holdToleranceMs(
      (terminal.duration * 1000) / this.config.speed,
      this.config.mode
    );
    this.releaseDeadlineMs = performanceMs + Math.min(1000, tolerance);
    this.currentPhase = "awaiting-release";
  }

  /** Wait for the deterministic collection watermark so callback delivery cannot rewrite a receipt. */
  tick(performanceMs: number, createdAt: number): SongCourseResult | null {
    if (this.completedResult) return this.completedResult;
    if (
      this.endMs === null ||
      this.releaseDeadlineMs === null ||
      performanceMs < this.releaseDeadlineMs ||
      this.currentPhase === "aborted"
    )
      return null;
    this.completedResult = gradeSongCourseAttempt(this.config, {
      inputs: this.inputs,
      presentations: this.presentations,
      pauses: this.pauses,
      invalidReasons: [...this.reasons],
      musicalEndPerformanceMs: this.endMs,
      closedAtPerformanceMs: this.releaseDeadlineMs,
      createdAt
    });
    this.currentPhase = "complete";
    return this.completedResult;
  }

  private closePauseWindow(
    position: PhysicalPosition & { readonly rawPerformanceMs?: number }
  ): void {
    const window = this.pauseWindows.at(-1);
    if (window?.to === null)
      window.to = {
        performanceMs: physicalPerformanceMs(position),
        stableOrdinal: position.stableOrdinal
      };
  }

  private alignment() {
    return alignCourseInputs(
      this.config.expected,
      this.inputs,
      this.config.mode,
      this.config.speed,
      this.presentations,
      this.endMs ?? Infinity
    );
  }
  private isClosed(): boolean {
    return this.currentPhase === "complete" || this.currentPhase === "aborted";
  }
}
