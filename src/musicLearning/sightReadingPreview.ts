export type SightPreviewPhase = "preview" | "ready" | "started" | "cancelled";

/** Preparation time only. This does not own, read or advance musical song time. */
export class SightReadingPreview {
  private readonly durationMs: number;
  private remaining: number;
  private lastMs: number;
  private active = true;
  private phase: SightPreviewPhase = "preview";

  constructor(atMs: number, seconds = 10) {
    if (!Number.isFinite(atMs) || !Number.isInteger(seconds) || seconds < 5 || seconds > 15)
      throw new RangeError("Sight preview requires a finite start and 5-15 whole seconds");
    this.lastMs = atMs;
    this.durationMs = seconds * 1000;
    this.remaining = this.durationMs;
  }

  step(atMs: number): void {
    if (!Number.isFinite(atMs) || atMs < this.lastMs) return;
    if (this.active && this.phase === "preview") {
      this.remaining = Math.max(0, this.remaining - (atMs - this.lastMs));
      if (this.remaining === 0) this.phase = "ready";
    }
    this.lastMs = atMs;
  }

  /** Shell calls at visibility/pause boundaries, not only after returning to the frame loop. */
  setActive(active: boolean, atMs: number): void {
    if (!Number.isFinite(atMs) || atMs < this.lastMs) return;
    this.step(atMs);
    this.active = active;
  }

  start(atMs: number, allReleased: boolean): boolean {
    if (!Number.isFinite(atMs) || atMs < this.lastMs) return false;
    this.step(atMs);
    if (!this.active || this.phase !== "ready" || !allReleased) return false;
    this.phase = "started";
    return true;
  }

  cancel(): void {
    this.phase = "cancelled";
  }

  snapshot(): {
    readonly phase: SightPreviewPhase;
    readonly remainingMs: number;
    readonly durationMs: number;
    readonly scoreVisible: boolean;
    readonly canStart: boolean;
  } {
    return {
      phase: this.phase,
      remainingMs: this.remaining,
      durationMs: this.durationMs,
      scoreVisible: this.phase === "preview" || this.phase === "started",
      canStart: this.phase === "ready" && this.active
    };
  }
}
