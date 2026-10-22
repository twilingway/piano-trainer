import { recordHeldBassOwner, validHeldBassInput } from "../reading/heldBassOwnership";
import { twoHandOwner } from "../reading/twoHandEvidence";
import { validRhythmClock } from "./clock";
import { evaluateIndependentRhythm } from "./evidence";
import { independentRhythmFingerprint } from "./generator";
import { summarizeIndependentRhythmOutcomes } from "./progress";
import type {
  IndependentRhythmClockReceipt,
  IndependentRhythmConfig,
  IndependentRhythmEvent,
  IndependentRhythmHelpReceipt,
  IndependentRhythmInput,
  IndependentRhythmPhaseExercise,
  IndependentRhythmPhaseResult,
  IndependentRhythmSnapshot,
  IndependentRhythmStatus
} from "./types";

const time = (value: number): boolean => Number.isFinite(value) && value >= 0;
/** A bounded journal; only PracticeSession receipts determine musical time. */
export class IndependentRhythmPhaseSession {
  private readonly config: IndependentRhythmConfig;
  private presentedAt: number | null = null;
  private startedAt: number | null = null;
  private finishedAt: number | null = null;
  private cancelled = false;
  private overflow = false;
  private now = 0;
  private events: IndependentRhythmEvent[] = [];
  private help: IndependentRhythmHelpReceipt[] = [];
  private clock: IndependentRhythmClockReceipt | null = null;
  private held = new Map<string, IndependentRhythmInput>();
  private releases = new Map<string, number>();
  constructor(
    private readonly phase: IndependentRhythmPhaseExercise,
    config: IndependentRhythmConfig
  ) {
    if (
      !Number.isFinite(config.offsetMs) ||
      !config.runId ||
      !config.presentationId ||
      !["keyboard", "midi", "pointer"].includes(config.source) ||
      (config.source === "midi" &&
        (!config.deviceId ||
          (config.channel !== undefined &&
            (!Number.isInteger(config.channel) || config.channel < 1 || config.channel > 16)))) ||
      (config.source !== "midi" && (config.deviceId !== undefined || config.channel !== undefined))
    )
      throw new RangeError("Invalid independent rhythm configuration");
    this.config = { ...config };
  }
  present(atMs: number): void {
    if (time(atMs) && this.presentedAt === null && this.startedAt === null && !this.cancelled) {
      this.presentedAt = atMs;
      this.now = Math.max(this.now, atMs);
    }
  }
  start(atMs: number): boolean {
    if (
      !time(atMs) ||
      this.presentedAt === null ||
      atMs < this.presentedAt ||
      this.startedAt !== null ||
      this.held.size ||
      this.cancelled
    )
      return false;
    this.startedAt = atMs;
    this.now = atMs;
    return true;
  }
  seedHeld(events: readonly IndependentRhythmInput[], now: number): void {
    if (!time(now) || this.startedAt !== null) return;
    this.held.clear();
    this.releases.clear();
    if (events.length > 256) {
      this.cancel(now);
      this.overflow = true;
      return;
    }
    for (const event of events)
      if (event.kind === "down" && validHeldBassInput(event))
        this.held.set(twoHandOwner(event), { ...event });
    this.now = Math.max(this.now, now);
  }
  cancel(now: number): void {
    if (!time(now) || this.finishedAt !== null) return;
    this.cancelled = true;
    this.now = Math.max(this.now, now);
  }
  resetInput(now: number): void {
    this.cancel(now);
    this.held.clear();
    this.releases.clear();
  }
  private readClock(receipt: IndependentRhythmClockReceipt, now: number): boolean {
    if (
      this.startedAt === null ||
      receipt.atMs !== now ||
      !validRhythmClock(receipt, this.phase.song.duration, this.startedAt, this.clock?.segments)
    )
      return false;
    this.clock = { ...receipt, segments: receipt.segments.map((segment) => ({ ...segment })) };
    return true;
  }
  input(
    event: IndependentRhythmInput,
    receivedAtMs: number,
    receipt?: IndependentRhythmClockReceipt
  ): IndependentRhythmSnapshot {
    if (
      !time(receivedAtMs) ||
      receivedAtMs < this.now ||
      !validHeldBassInput(event) ||
      (event.runId !== undefined && event.runId !== this.config.runId) ||
      (event.presentationId !== undefined && event.presentationId !== this.config.presentationId)
    )
      return this.snapshot();
    const age = receivedAtMs - event.atMs;
    if (age < 0) return this.snapshot();
    const owner = twoHandOwner(event);
    const previous = this.held.get(owner);
    if (age > 250) {
      if (event.kind === "up" && previous && event.atMs >= previous.atMs) {
        this.cancel(receivedAtMs);
        this.held.delete(owner);
      }
      return this.snapshot();
    }
    recordHeldBassOwner(this.held, this.releases, event, receivedAtMs);
    if (this.held.size > 256 || this.releases.size > 256) {
      this.cancel(receivedAtMs);
      this.overflow = true;
      return this.snapshot();
    }
    if (
      event.source === this.config.source &&
      (event.source !== "midi" || event.deviceId === this.config.deviceId) &&
      (event.offsetMs ?? 0) !== this.config.offsetMs
    ) {
      this.cancel(receivedAtMs);
      return this.snapshot();
    }
    if (
      this.startedAt === null ||
      this.cancelled ||
      this.finishedAt !== null ||
      event.atMs < this.startedAt
    )
      return this.snapshot();
    if (receipt && !this.readClock(receipt, receivedAtMs)) {
      this.cancel(receivedAtMs);
      return this.snapshot();
    }
    if (this.events.length >= 256) {
      this.cancel(receivedAtMs);
      this.overflow = true;
      return this.snapshot();
    }
    this.events.push({ ...event, receivedAtMs, sequence: this.events.length });
    return this.tick(receivedAtMs);
  }
  tick(now: number, receipt?: IndependentRhythmClockReceipt): IndependentRhythmSnapshot {
    if (
      !time(now) ||
      now < this.now ||
      this.cancelled ||
      this.finishedAt !== null ||
      this.startedAt === null
    )
      return this.snapshot();
    this.now = now;
    if (receipt && !this.readClock(receipt, now)) {
      this.cancel(now);
      this.overflow = receipt.segments.length > 64;
      return this.snapshot();
    }
    if (
      this.clock?.atMs === now &&
      this.clock.ended &&
      this.clock.endPerformanceMs !== null &&
      now > this.clock.endPerformanceMs + Math.max(0, this.config.offsetMs) + 250
    )
      this.finishedAt = now;
    return this.snapshot();
  }
  showKeys(pitches: readonly number[], now: number): void {
    if (
      !time(now) ||
      this.presentedAt === null ||
      now < this.presentedAt ||
      this.startedAt !== null ||
      this.cancelled ||
      !pitches.length ||
      new Set(pitches).size !== pitches.length ||
      pitches.some((pitch) => pitch !== 48 && pitch !== 60)
    )
      return;
    if (this.help.length >= 32) {
      this.cancel(now);
      this.overflow = true;
      return;
    }
    this.help.push({
      presentationId: this.config.presentationId,
      atMs: now,
      pitches: [...pitches]
    });
  }
  snapshot(): IndependentRhythmSnapshot {
    const evaluation = this.clock
      ? evaluateIndependentRhythm(this.phase, this.config, this.events, this.clock)
      : null;
    const outcomes =
      evaluation?.outcomes ??
      this.phase.song.notes.map((note) => ({
        noteId: note.id,
        pitch: note.pitch,
        hand: note.hand,
        onset: note.start,
        outcome: "pending" as const,
        eventSequence: null,
        deviationMs: null
      }));
    const summary = evaluation?.summary ?? summarizeIndependentRhythmOutcomes(outcomes, []);
    const finished = this.finishedAt !== null;
    const passed =
      finished && outcomes.every((note) => note.outcome === "hit") && summary.extras === 0;
    let status: IndependentRhythmStatus = this.overflow
      ? "overflow"
      : this.cancelled
        ? "cancelled"
        : this.presentedAt === null
          ? "unpresented"
          : this.startedAt === null
            ? this.held.size
              ? "blocked"
              : "preparation"
            : this.clock?.ended
              ? "finalizing"
              : (this.clock?.songTime ?? -4) < 0
                ? "count-in"
                : "playing";
    if (finished) status = this.phase.phase === "pulse" ? (passed ? "passed" : "failed") : "result";
    return {
      phase: this.phase.phase,
      status,
      prepared: this.presentedAt !== null && this.startedAt === null && !this.cancelled,
      presented: this.presentedAt !== null,
      active: this.startedAt !== null && !finished && !this.cancelled,
      blocked: this.held.size > 0,
      finished,
      passed,
      countInBeat:
        status === "count-in"
          ? Math.max(1, Math.min(4, Math.floor((this.clock?.songTime ?? -4) + 4) + 1))
          : null,
      channel: evaluation?.channel ?? this.config.channel ?? null,
      outcomes,
      extras: evaluation?.extras ?? [],
      summary
    };
  }
  result(): IndependentRhythmPhaseResult | null {
    if (
      this.finishedAt === null ||
      this.presentedAt === null ||
      this.startedAt === null ||
      !this.clock ||
      this.cancelled
    )
      return null;
    const snapshot = this.snapshot();
    return JSON.parse(
      JSON.stringify({
        phaseId: this.phase.id,
        phase: this.phase.phase,
        config: this.config,
        musicXml: this.phase.musicXml,
        scoreFingerprint: independentRhythmFingerprint(this.phase),
        presentedAtMs: this.presentedAt,
        startedAtMs: this.startedAt,
        finalizedAtMs: this.finishedAt,
        clock: this.clock,
        events: this.events,
        help: this.help,
        channel: snapshot.channel,
        outcomes: snapshot.outcomes,
        extras: snapshot.extras,
        summary: snapshot.summary,
        passed: snapshot.passed
      })
    ) as IndependentRhythmPhaseResult;
  }
}
