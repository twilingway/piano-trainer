import { evaluateTwoHandEvents, twoHandElapsed, twoHandOwner } from "./twoHandEvidence";
import type { ReadingHintLevel, ReadingPreferences } from "./types";
import type {
  TwoHandAttempt,
  TwoHandCommit,
  TwoHandEvent,
  TwoHandExercise,
  TwoHandHint,
  TwoHandInput,
  TwoHandPair,
  TwoHandPairResult,
  TwoHandResult,
  TwoHandSnapshot,
  TwoHandStatus
} from "./twoHandTypes";

interface Prompt {
  pair: TwoHandPair;
  presentationId: string;
  presentedAt: number | null;
  firstPresentedAt: number | null;
  boundary: number;
  intervals: { from: number; to: number | null }[];
  hints: TwoHandHint[];
  attempts: TwoHandAttempt[];
  events: TwoHandEvent[];
  solved: boolean;
}
const validTime = (value: number): boolean => Number.isFinite(value) && value >= 0;
/** No clock: raw event time, receipt time, and frame time are supplied by the shell. */
export class TwoHandSession {
  private prompt: Prompt | null = null;
  private active = false;
  private answers: TwoHandPairResult[] = [];
  private lastCommit: TwoHandCommit | null = null;
  private presentationCount = 0;
  private attemptCount = 0;
  private sequence = 0;
  private now = 0;
  private status: TwoHandStatus = "unpresented";
  private held = new Map<string, TwoHandInput>();
  private startedAt: number | null;
  private readonly runId: string;
  constructor(
    private readonly exercise: TwoHandExercise,
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
    if (this.startedAt === null && validTime(at)) this.startedAt = at;
  }
  prepare(pairId: string, atMs: number): void {
    if (!validTime(atMs) || this.prompt?.pair.id === pairId) return;
    const pair = this.exercise.pairs[this.answers.length];
    if (pair?.id !== pairId) return;
    this.cancel(atMs);
    this.prompt = {
      pair,
      presentationId: `${this.runId}:presentation:${String(this.presentationCount++)}`,
      presentedAt: null,
      firstPresentedAt: null,
      boundary: atMs,
      intervals: [],
      hints: [],
      attempts: [],
      events: [],
      solved: false
    };
    this.status = "unpresented";
  }
  present(pairId: string, atMs: number): void {
    const p = this.prompt;
    if (p?.pair.id !== pairId || p.solved || p.presentedAt !== null || !validTime(atMs)) return;
    p.presentedAt = atMs;
    p.firstPresentedAt ??= atMs;
    p.boundary = Math.max(p.boundary, atMs);
    if (this.active) p.intervals.push({ from: atMs, to: null });
    this.status = "ready";
  }
  requirePresentation(pairId: string, atMs: number): void {
    if (this.prompt?.pair.id !== pairId || !validTime(atMs)) return;
    this.cancel(atMs);
    this.close(atMs);
    this.prompt.presentedAt = null;
    this.prompt.presentationId = `${this.runId}:presentation:${String(this.presentationCount++)}`;
    this.status = "unpresented";
  }
  private close(atMs: number): void {
    const last = this.prompt?.intervals.at(-1);
    if (last?.to === null) last.to = Math.max(last.from, atMs);
  }
  setActive(active: boolean, atMs: number): void {
    if (this.active === active || !validTime(atMs)) return;
    this.active = active;
    if (!active) {
      this.cancel(atMs);
      this.close(atMs);
    } else if (this.prompt?.presentedAt !== null && this.prompt && !this.prompt.solved) {
      this.prompt.intervals.push({ from: atMs, to: null });
      this.prompt.boundary = Math.max(this.prompt.boundary, atMs);
    }
  }
  cancel(atMs: number): void {
    if (!validTime(atMs)) return;
    if (this.prompt) {
      this.prompt.events = [];
      this.prompt.boundary = Math.max(this.prompt.boundary, atMs);
    }
    this.status = this.prompt?.presentedAt == null ? "unpresented" : "ready";
    this.now = Math.max(this.now, atMs);
  }
  /** Explicit reset follows loss of input; its synthetic ups never prove a solved pair. */
  resetInput(atMs: number): void {
    this.cancel(atMs);
    this.held.clear();
  }
  private canUse(atMs: number): boolean {
    const p = this.prompt;
    return (
      !!p &&
      this.active &&
      !p.solved &&
      p.presentedAt !== null &&
      atMs >= p.boundary &&
      p.intervals.some(({ from, to }) => atMs >= from && (to === null || atMs < to))
    );
  }
  input(event: TwoHandInput, receivedAtMs: number): TwoHandSnapshot {
    const p = this.prompt;
    if (
      !validTime(receivedAtMs) ||
      !validTime(event.atMs) ||
      !Number.isInteger(event.pitch) ||
      event.pitch < 0 ||
      event.pitch > 127 ||
      !["midi", "keyboard", "pointer"].includes(event.source) ||
      !["up", "down"].includes(event.kind) ||
      (event.runId !== undefined && event.runId !== this.runId) ||
      (event.presentationId !== undefined && event.presentationId !== p?.presentationId) ||
      !Number.isFinite(event.offsetMs ?? 0) ||
      (event.channel !== undefined &&
        (!Number.isInteger(event.channel) || event.channel < 0 || event.channel > 15))
    )
      return this.snapshot();
    const age = receivedAtMs - event.atMs;
    const owner = twoHandOwner(event);
    if (age < 0) return this.snapshot();
    if (age > 250) {
      if (event.kind === "up" && this.held.has(owner)) this.resetInput(receivedAtMs);
      return this.snapshot();
    }
    const previous = this.held.get(owner);
    if (event.kind === "up" && previous && event.atMs >= previous.atMs) this.held.delete(owner);
    if (event.kind === "down" && !previous) this.held.set(owner, event);
    if (!p || !this.canUse(event.atMs)) return this.snapshot();
    if (p.events.length === 0 && (event.kind !== "down" || previous || this.held.size !== 1))
      return this.snapshot();
    const first = p.events.find((item) => item.kind === "down");
    if (first && (event.offsetMs ?? 0) !== (first.offsetMs ?? 0)) {
      this.cancel(receivedAtMs);
      return this.snapshot();
    }
    if (p.events.length >= 256) {
      this.cancel(receivedAtMs);
      this.status = "overflow";
      return this.snapshot();
    }
    p.events.push({ ...event, receivedAtMs, sequence: this.sequence++ });
    this.tick(receivedAtMs);
    return this.snapshot();
  }
  tick(nowMs: number): TwoHandSnapshot {
    if (!validTime(nowMs)) return this.snapshot();
    this.now = Math.max(this.now, nowMs);
    const p = this.prompt;
    if (!p || !this.active || p.solved || !p.events.length) return this.snapshot();
    const evaluation = evaluateTwoHandEvents(p.pair, p.events, this.now);
    this.held = new Map(evaluation.held);
    this.status = evaluation.reason ?? (evaluation.second ? "release" : "waiting-second");
    if (
      !evaluation.first ||
      evaluation.held.size ||
      this.held.size ||
      evaluation.releasedAtMs === null ||
      this.now <= evaluation.releasedAtMs + 250
    )
      return this.snapshot();
    const outcome = evaluation.reason ?? (evaluation.second ? "success" : null);
    if (!outcome) return this.snapshot();
    const attempt: TwoHandAttempt = {
      attemptId: `${this.runId}:attempt:${String(this.attemptCount++)}`,
      presentationId: p.presentationId,
      boundaryAtMs: p.boundary,
      events: [...p.events],
      outcome,
      inputSource: evaluation.first.source,
      offsetMs: evaluation.first.offsetMs ?? 0,
      firstDownAtMs: evaluation.first.atMs,
      secondDownAtMs: evaluation.second?.atMs ?? null,
      releasedAtMs: evaluation.releasedAtMs,
      finalizedAtMs: this.now,
      spreadMs: evaluation.spreadMs
    };
    p.attempts.push(attempt);
    p.events = [];
    p.boundary = this.now;
    if (
      outcome === "success" &&
      evaluation.second &&
      evaluation.spreadMs !== null &&
      p.firstPresentedAt !== null
    ) {
      p.solved = true;
      this.close(this.now);
      const hints = p.hints.filter((hint) => hint.atMs <= this.now);
      const hintLevel = hints.at(-1)?.level ?? 0;
      this.answers.push({
        pairId: p.pair.id,
        noteIds: p.pair.noteIds,
        expectedMidi: p.pair.pitches,
        presentedAtMs: p.firstPresentedAt,
        activeIntervals: p.intervals.map(({ from, to }) => ({ from, to: to ?? this.now })),
        hintHistory: [...hints],
        attempts: [...p.attempts],
        firstAttemptCorrect: p.attempts.length === 1,
        independentCorrect: p.attempts.length === 1 && hintLevel === 0,
        unassistedSolved: hintLevel === 0,
        hintLevel,
        firstLatencyMs: twoHandElapsed(
          p.intervals,
          p.attempts[0]?.firstDownAtMs ?? evaluation.first.atMs
        ),
        responseLatencyMs: twoHandElapsed(p.intervals, evaluation.second.atMs),
        spreadMs: evaluation.spreadMs
      });
      this.lastCommit = {
        pairId: p.pair.id,
        presentationId: p.presentationId,
        noteIds: p.pair.noteIds,
        atMs: this.now
      };
    } else this.status = "ready";
    return this.snapshot();
  }
  suggestHint(atMs: number): ReadingHintLevel {
    const current = this.prompt?.hints.at(-1)?.level ?? 0;
    if (!this.canUse(atMs) || !this.preferences.automaticHints) return current;
    const elapsed = twoHandElapsed(this.prompt?.intervals ?? [], atMs);
    return Math.max(
      current,
      elapsed >= this.preferences.keyDelayMs ? 2 : elapsed >= this.preferences.nameDelayMs ? 1 : 0
    ) as ReadingHintLevel;
  }
  showHint(pairId: string, level: ReadingHintLevel, atMs: number): void {
    const p = this.prompt;
    if (
      p?.pair.id !== pairId ||
      !validTime(atMs) ||
      p.solved ||
      p.presentedAt === null ||
      atMs < p.presentedAt ||
      ![1, 2].includes(level) ||
      level <= (p.hints.at(-1)?.level ?? 0)
    )
      return;
    p.hints.push({ atMs, level });
  }
  snapshot(): TwoHandSnapshot {
    return {
      pairId: this.prompt?.pair.id ?? null,
      pairIndex: this.answers.length,
      presentationId: this.prompt?.presentationId ?? null,
      status: this.status,
      hintLevel: this.prompt?.hints.at(-1)?.level ?? 0,
      active: this.active,
      presented: this.prompt?.presentedAt !== null && !!this.prompt && !this.prompt.solved,
      completed: this.answers.length === 10,
      answers: [...this.answers],
      lastCommit: this.lastCommit
    };
  }
  result(id: string, createdAt: number): TwoHandResult | null {
    if (
      this.answers.length !== 10 ||
      this.startedAt === null ||
      !validTime(createdAt) ||
      createdAt < this.startedAt ||
      !id
    )
      return null;
    return {
      id,
      runId: this.runId,
      skillId: "two-hand-coordination",
      task: "simultaneous",
      exerciseId: this.exercise.id,
      seed: this.exercise.seed,
      generatorVersion: 1,
      startedAt: this.startedAt,
      completedAt: createdAt,
      createdAt,
      pairs: [...this.answers]
    };
  }
}
