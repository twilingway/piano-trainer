import { evaluateHeldBassEvents } from "./heldBassEvidence";
import { heldBassReadyAt, validHeldBassClockReceipt } from "./heldBassClock";
import { recordHeldBassOwner, validHeldBassInput } from "./heldBassOwnership";
import { twoHandElapsed, twoHandOwner } from "./twoHandEvidence";
import type { ReadingHintLevel, ReadingPreferences } from "./types";
import type { ClockSegment } from "../practice/timing";
import type {
  HeldBassAttempt,
  HeldBassClockReceipt,
  HeldBassCommit,
  HeldBassEvent,
  HeldBassExercise,
  HeldBassFragment,
  HeldBassFragmentResult,
  HeldBassHint,
  HeldBassInput,
  HeldBassOnset,
  HeldBassResult,
  HeldBassRetry,
  HeldBassSnapshot,
  HeldBassStatus
} from "./heldBassTypes";
import { HELD_BASS_SKILL_ID } from "./heldBassTypes";

interface Prompt {
  fragment: HeldBassFragment;
  presentationId: string;
  presentedAt: number | null;
  boundary: number;
  intervals: { from: number; to: number | null }[];
  hints: HeldBassHint[];
  attempts: HeldBassAttempt[];
  events: HeldBassEvent[];
  clock: readonly ClockSegment[];
  receipt: HeldBassClockReceipt | null;
  onsets: HeldBassOnset[];
  solved: boolean;
}
const time = (value: number): boolean => Number.isFinite(value) && value >= 0;
/** Course journal only. Musical time and clock anchors are always supplied by PracticeSession. */
export class HeldBassSession {
  private prompt: Prompt | null = null;
  private active = false;
  private answers: HeldBassFragmentResult[] = [];
  private pendingCommit: HeldBassCommit | null = null;
  private retryCommand: HeldBassRetry | null = null;
  private needsRetry = false;
  private presentationCount = 0;
  private attemptCount = 0;
  private revision = 0;
  private sequence = 0;
  private now = 0;
  private status: HeldBassStatus = "unpresented";
  private held = new Map<string, HeldBassInput>();
  private releases = new Map<string, number>();
  private startedAt: number | null;
  private readonly runId: string;
  constructor(
    private readonly exercise: HeldBassExercise,
    private preferences: ReadingPreferences,
    metadata?: { readonly runId: string; readonly startedAt: number | null }
  ) {
    this.startedAt = metadata?.startedAt ?? null;
    this.runId = metadata?.runId ?? exercise.id;
  }
  configure(preferences: ReadingPreferences): void {
    this.preferences = preferences;
  }
  markStarted(at: number): void {
    if (this.startedAt === null && time(at)) this.startedAt = at;
  }
  prepare(fragmentId: string, atMs: number): void {
    if (!time(atMs) || this.held.size) return;
    const fragment = this.exercise.fragments[this.answers.length];
    if (
      fragment?.id !== fragmentId ||
      (this.prompt?.fragment.id === fragmentId && !this.retryCommand)
    )
      return;
    const previous = this.prompt?.fragment.id === fragmentId ? this.prompt : null;
    this.close(atMs);
    this.prompt = {
      fragment,
      presentationId: `${this.runId}:presentation:${String(this.presentationCount++)}`,
      presentedAt: null,
      boundary: atMs,
      intervals: [],
      hints: previous?.hints ?? [],
      attempts: previous?.attempts ?? [],
      events: [],
      clock: [],
      receipt: null,
      onsets: [],
      solved: false
    };
    this.pendingCommit = null;
    this.retryCommand = null;
    this.needsRetry = false;
    this.status = "unpresented";
  }
  present(fragmentId: string, atMs: number): void {
    const p = this.prompt;
    if (
      p?.fragment.id !== fragmentId ||
      p.solved ||
      p.presentedAt !== null ||
      !time(atMs) ||
      atMs < p.boundary
    )
      return;
    p.presentedAt = atMs;
    p.boundary = atMs;
    if (this.active) p.intervals.push({ from: atMs, to: null });
    this.status = "ready";
  }
  requirePresentation(fragmentId: string, atMs: number): void {
    if (this.prompt?.fragment.id !== fragmentId || !time(atMs)) return;
    this.cancel(atMs);
    this.prompt.presentedAt = null;
    this.status = "unpresented";
  }
  private close(atMs: number): void {
    const last = this.prompt?.intervals.at(-1);
    if (last?.to === null) last.to = Math.max(last.from, atMs);
  }
  setActive(active: boolean, atMs: number): void {
    if (this.active === active || !time(atMs)) return;
    this.active = active;
    if (!active) {
      this.cancel(atMs);
      this.close(atMs);
    } else if (this.prompt?.presentedAt != null && !this.prompt.solved) {
      this.prompt.intervals.push({ from: atMs, to: null });
      this.prompt.boundary = Math.max(this.prompt.boundary, atMs);
    }
  }
  cancel(atMs: number): void {
    if (!time(atMs)) return;
    if (this.prompt && !this.prompt.solved) {
      const hadCandidate =
        this.prompt.events.some((event) => event.kind === "down") ||
        this.prompt.onsets.length > 0 ||
        this.prompt.clock.length > 0;
      this.prompt.events = [];
      this.pendingCommit = null;
      this.prompt.boundary = Math.max(this.prompt.boundary, atMs);
      if (hadCandidate) this.needsRetry = true;
    }
    this.now = Math.max(this.now, atMs);
    this.issueRetry();
    this.status = this.needsRetry
      ? "retry"
      : this.prompt?.presentedAt == null
        ? "unpresented"
        : "ready";
  }
  resetInput(atMs: number): void {
    this.cancel(atMs);
    this.held.clear();
    this.releases.clear();
    this.issueRetry();
  }
  seedHeld(events: readonly HeldBassInput[], atMs: number): void {
    if (!time(atMs)) return;
    this.cancel(atMs);
    this.held.clear();
    this.releases.clear();
    for (const event of events.slice(0, 256))
      if (event.kind === "down" && validHeldBassInput(event))
        this.held.set(twoHandOwner(event), { ...event });
  }
  private issueRetry(): void {
    if (this.needsRetry && !this.held.size && this.prompt && !this.retryCommand)
      this.retryCommand = { fragmentId: this.prompt.fragment.id, revision: ++this.revision };
  }
  private canUse(atMs: number): boolean {
    const p = this.prompt;
    return (
      !!p &&
      this.active &&
      !p.solved &&
      !this.needsRetry &&
      p.presentedAt !== null &&
      atMs >= p.boundary &&
      p.intervals.some(({ from, to }) => atMs >= from && (to === null || atMs < to))
    );
  }
  private readClock(receipt: HeldBassClockReceipt): boolean {
    const p = this.prompt;
    if (!p || !validHeldBassClockReceipt(p.fragment, p.onsets, receipt, p.clock)) return false;
    p.clock = receipt.segments.map((segment) => ({ ...segment }));
    p.receipt = receipt;
    return true;
  }
  input(
    event: HeldBassInput,
    receivedAtMs: number,
    receipt?: HeldBassClockReceipt
  ): HeldBassSnapshot {
    const p = this.prompt;
    if (
      !time(receivedAtMs) ||
      !validHeldBassInput(event) ||
      (event.runId !== undefined && event.runId !== this.runId) ||
      (event.presentationId !== undefined && event.presentationId !== p?.presentationId)
    )
      return this.snapshot();
    const age = receivedAtMs - event.atMs;
    const owner = twoHandOwner(event);
    if (age < 0) return this.snapshot();
    const previous = this.held.get(owner);
    if (age > 250) {
      if (event.kind === "up" && previous && event.atMs >= previous.atMs) {
        this.cancel(receivedAtMs);
        this.held.delete(owner);
        this.issueRetry();
      }
      return this.snapshot();
    }
    recordHeldBassOwner(this.held, this.releases, event, receivedAtMs);
    if (this.needsRetry) {
      this.issueRetry();
      return this.snapshot();
    }
    if (!p || !this.canUse(event.atMs)) return this.snapshot();
    if (
      !p.events.some((item) => item.kind === "down") &&
      event.kind === "down" &&
      (previous || [...this.held.keys()].some((id) => id !== owner))
    )
      return this.snapshot();
    if (receipt && !this.readClock(receipt)) {
      this.cancel(receivedAtMs);
      return this.snapshot();
    }
    if (p.events.length >= 256) {
      this.cancel(receivedAtMs);
      this.status = "overflow";
      return this.snapshot();
    }
    p.events.push({ ...event, receivedAtMs, sequence: this.sequence++ });
    return this.tick(receivedAtMs);
  }
  tick(nowMs: number, receipt?: HeldBassClockReceipt): HeldBassSnapshot {
    if (!time(nowMs)) return this.snapshot();
    this.now = Math.max(this.now, nowMs);
    const p = this.prompt;
    if (receipt && p && !this.needsRetry && !p.solved && !this.readClock(receipt)) {
      this.cancel(nowMs);
      this.status = "overflow";
    }
    this.issueRetry();
    if (!p || !this.active || p.solved || this.needsRetry || !p.events.length || !p.clock.length)
      return this.snapshot();
    const evaluation = evaluateHeldBassEvents(p.fragment, p.events, p.clock, p.onsets, this.now);
    if (!evaluation.first) return this.snapshot();
    const step = p.onsets.length;
    const attack = evaluation.attacks[step];
    this.status =
      evaluation.reason ??
      (!evaluation.second
        ? "waiting-second"
        : step === p.fragment.steps.length
          ? "hold"
          : "travelling");
    if (!evaluation.reason && attack && this.now > attack.atMs + 250) {
      this.pendingCommit = {
        runId: this.runId,
        fragmentId: p.fragment.id,
        presentationId: p.presentationId,
        step,
        noteIds: p.fragment.steps[step] ?? [],
        atMs: this.now
      };
    } else if (evaluation.reason) this.pendingCommit = null;
    if (
      !evaluation.reason &&
      evaluation.second &&
      step < p.fragment.steps.length &&
      heldBassReadyAt(
        p.fragment,
        p.clock,
        p.onsets,
        step,
        this.now - (evaluation.first.offsetMs ?? 0)
      )
    )
      this.status = "ready";
    const end = evaluation.rawEndAtMs;
    if (
      !evaluation.reason &&
      step === p.fragment.steps.length &&
      p.receipt?.ended &&
      end !== null &&
      this.now >= end
    )
      this.status = "release";
    if (
      evaluation.held.size ||
      this.held.size ||
      evaluation.releasedAtMs === null ||
      this.now <= evaluation.releasedAtMs + 250
    )
      return this.snapshot();
    const success =
      !evaluation.reason &&
      evaluation.second &&
      step === p.fragment.steps.length &&
      p.receipt?.ended &&
      end !== null &&
      this.now > end + 250;
    if (!evaluation.reason && !success) return this.snapshot();
    const attempt: HeldBassAttempt = {
      attemptId: `${this.runId}:attempt:${String(this.attemptCount++)}`,
      presentationId: p.presentationId,
      presentedAtMs: p.presentedAt ?? p.boundary,
      boundaryAtMs: p.boundary,
      activeIntervals: p.intervals.map(({ from, to }) => ({ from, to: to ?? this.now })),
      events: [...p.events],
      clock: [...p.clock],
      onsets: [...p.onsets],
      outcome: evaluation.reason ?? "success",
      inputSource: evaluation.first.source,
      offsetMs: evaluation.first.offsetMs ?? 0,
      firstDownAtMs: evaluation.first.atMs,
      secondDownAtMs: evaluation.second?.atMs ?? null,
      spreadMs: evaluation.spreadMs,
      rawEndAtMs: end,
      releasedAtMs: evaluation.releasedAtMs,
      finalizedAtMs: this.now
    };
    p.attempts.push(attempt);
    p.events = [];
    this.pendingCommit = null;
    if (!success) {
      this.needsRetry = true;
      this.issueRetry();
      return this.snapshot();
    }
    p.solved = true;
    this.close(this.now);
    const hintLevel = Math.max(0, ...p.hints.map((hint) => hint.level)) as ReadingHintLevel;
    const first = p.attempts[0] ?? attempt;
    this.answers.push({
      fragmentId: p.fragment.id,
      bassPitch: p.fragment.bassPitch,
      melodyPitches: p.fragment.melodyPitches,
      hintHistory: [...p.hints],
      attempts: [...p.attempts],
      firstAttemptCorrect: p.attempts.length === 1,
      independentCorrect: p.attempts.length === 1 && hintLevel === 0,
      unassistedSolved: hintLevel === 0,
      hintLevel,
      firstLatencyMs: twoHandElapsed(first.activeIntervals, first.firstDownAtMs),
      responseLatencyMs: twoHandElapsed(
        attempt.activeIntervals,
        evaluation.attacks.at(-1)?.atMs ?? evaluation.first.atMs
      ),
      spreadMs: evaluation.spreadMs ?? 0,
      heldDurationMs: end - (evaluation.bassDownAtMs ?? evaluation.first.atMs)
    });
    return this.snapshot();
  }
  acknowledgeOnset(
    request: HeldBassCommit,
    accepted: boolean,
    receipt: HeldBassClockReceipt
  ): void {
    const p = this.prompt;
    if (!p || JSON.stringify(request) !== JSON.stringify(this.pendingCommit)) return;
    if (!accepted) {
      this.cancel(receipt.atMs);
      return;
    }
    const evaluation = evaluateHeldBassEvents(p.fragment, p.events, p.clock, p.onsets, this.now);
    const attack = evaluation.attacks[request.step];
    if (!attack || evaluation.reason || receipt.atMs !== request.atMs) {
      this.cancel(receipt.atMs);
      return;
    }
    p.onsets.push({ ...request, attackAtMs: attack.atMs });
    this.pendingCommit = null;
    if (!this.readClock(receipt)) this.cancel(receipt.atMs);
  }
  suggestHint(atMs: number): ReadingHintLevel {
    const p = this.prompt;
    const current = this.snapshot().hintLevel;
    if (!p || !this.canUse(atMs) || !this.preferences.automaticHints || !this.snapshot().ready)
      return current;
    const segment = p.clock.findLast(
      (item) => item.speed === 0 && item.songSeconds === p.onsets.length * 0.5
    );
    const offset =
      p.events
        .toSorted((a, b) => a.atMs - b.atMs || a.sequence - b.sequence)
        .find((event) => event.kind === "down")?.offsetMs ?? 0;
    const elapsed = Math.max(
      0,
      atMs - Math.max(p.boundary, (segment?.performanceMs ?? atMs) + offset)
    );
    return Math.max(
      current,
      elapsed >= this.preferences.keyDelayMs ? 2 : elapsed >= this.preferences.nameDelayMs ? 1 : 0
    ) as ReadingHintLevel;
  }
  showHint(fragmentId: string, step: number, level: ReadingHintLevel, atMs: number): void {
    const p = this.prompt;
    if (
      p?.fragment.id !== fragmentId ||
      p.onsets.length !== step ||
      !time(atMs) ||
      !this.canUse(atMs) ||
      ![1, 2].includes(level) ||
      !this.snapshot().ready ||
      level <= this.snapshot().hintLevel ||
      p.hints.length >= 64 ||
      p.onsets.length >= p.fragment.steps.length
    )
      return;
    p.hints.push({
      presentationId: p.presentationId,
      presentedAtMs: p.presentedAt ?? p.boundary,
      step: p.onsets.length,
      atMs,
      level,
      clock: p.clock.map((segment) => ({ ...segment })),
      onsets: p.onsets.map((onset) => ({ ...onset, noteIds: [...onset.noteIds] })),
      offsetMs:
        p.events
          .toSorted((a, b) => a.atMs - b.atMs || a.sequence - b.sequence)
          .find((event) => event.kind === "down")?.offsetMs ?? 0
    });
  }
  snapshot(): HeldBassSnapshot {
    const p = this.prompt;
    const step = p?.onsets.length ?? 0;
    const events = p?.events ?? [];
    const offset =
      events
        .toSorted((a, b) => a.atMs - b.atMs || a.sequence - b.sequence)
        .find((event) => event.kind === "down")?.offsetMs ?? 0;
    const ready =
      !!p &&
      this.canUse(this.now) &&
      (step > 0 || !this.held.size) &&
      step < p.fragment.steps.length &&
      heldBassReadyAt(p.fragment, p.clock, p.onsets, step, this.now - offset);
    const hintLevel = Math.max(
      0,
      ...(p?.hints.filter((hint) => hint.step === step).map((hint) => hint.level) ?? [])
    ) as ReadingHintLevel;
    return {
      fragmentId: p?.fragment.id ?? null,
      fragmentIndex: p
        ? this.exercise.fragments.findIndex((fragment) => fragment.id === p.fragment.id)
        : this.answers.length,
      presentationId: p?.presentationId ?? null,
      step,
      status: this.status,
      ready,
      bassPitch: p?.fragment.bassPitch ?? null,
      targetPitch: p?.fragment.melodyPitches[step] ?? null,
      hintLevel,
      active: this.active,
      presented: p?.presentedAt != null,
      completed: this.answers.length === this.exercise.fragments.length,
      answers: this.answers,
      pendingCommit: this.pendingCommit,
      retryCommand: this.retryCommand
    };
  }
  result(createdAt: number): HeldBassResult | null {
    if (
      !this.snapshot().completed ||
      this.startedAt === null ||
      !time(createdAt) ||
      createdAt < this.startedAt
    )
      return null;
    return {
      id: `${this.runId}:result`,
      runId: this.runId,
      skillId: HELD_BASS_SKILL_ID,
      task: "held-bass",
      exerciseId: this.exercise.id,
      seed: this.exercise.seed,
      generatorVersion: 1,
      startedAt: this.startedAt,
      completedAt: createdAt,
      createdAt,
      fragments: [...this.answers]
    };
  }
}
