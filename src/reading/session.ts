import type {
  ReadingAttempt,
  ReadingExercise,
  ReadingHintLevel,
  ReadingInputSource,
  ReadingNoteResult,
  ReadingPreferences,
  ReadingResult,
  ReadingSnapshot
} from "./types";
import { READING_SKILL_ID } from "./progressTypes";

export interface ReadingSessionMetadata {
  readonly runId: string;
  readonly startedAt: number | null;
  readonly newMaterial?: boolean;
}

interface Prompt {
  noteId: string;
  pitch: number;
  presentedAt: number | null;
  intervals: { from: number; to: number | null }[];
  hints: { at: number; level: ReadingHintLevel }[];
  attempts: ReadingAttempt[];
  solved: boolean;
}

/** Presentation time is supplied by the shell; this module owns no clock or timer. */
export class ReadingSession {
  private prompt: Prompt | null = null;
  private enabled = false;
  private answers: ReadingNoteResult[] = [];
  private attemptCount = 0;

  constructor(
    private readonly exercise: ReadingExercise,
    private preferences: ReadingPreferences,
    private readonly metadata?: ReadingSessionMetadata
  ) {}

  configure(preferences: ReadingPreferences): void {
    this.preferences = preferences;
  }

  prepare(noteId: string, expectedMidi: number, atMs: number): void {
    if (this.prompt?.noteId === noteId || !Number.isFinite(atMs)) return;
    this.close(atMs);
    this.prompt = {
      noteId,
      pitch: expectedMidi,
      presentedAt: null,
      intervals: [],
      hints: [],
      attempts: [],
      solved: false
    };
  }

  present(noteId: string, atMs: number): void {
    const prompt = this.prompt;
    if (
      prompt?.noteId !== noteId ||
      prompt.solved ||
      prompt.presentedAt !== null ||
      !Number.isFinite(atMs)
    )
      return;
    prompt.presentedAt = atMs;
    if (this.enabled) prompt.intervals.push({ from: atMs, to: null });
  }

  setActive(active: boolean, atMs: number): void {
    if (active === this.enabled || !Number.isFinite(atMs)) return;
    this.enabled = active;
    if (!active) this.close(atMs);
    else {
      const prompt = this.prompt;
      if (prompt?.presentedAt == null || prompt.solved) return;
      prompt.intervals.push({ from: atMs, to: null });
    }
  }

  requirePresentation(noteId: string, atMs: number): void {
    if (this.prompt?.noteId !== noteId) return;
    this.close(atMs);
    this.prompt.presentedAt = null;
  }

  private close(atMs: number): void {
    const interval = this.prompt?.intervals.at(-1);
    if (interval?.to === null) interval.to = Math.max(interval.from, atMs);
  }

  canAnswer(noteId: string, atMs: number): boolean {
    const p = this.prompt;
    return (
      this.enabled &&
      p?.noteId === noteId &&
      p.presentedAt !== null &&
      !p.solved &&
      Number.isFinite(atMs) &&
      p.intervals.some(({ from, to }) => atMs >= from && (to === null || atMs < to))
    );
  }

  private elapsed(atMs: number): number {
    return (
      this.prompt?.intervals.reduce(
        (sum, { from, to }) => sum + Math.max(0, Math.min(atMs, to ?? atMs) - from),
        0
      ) ?? 0
    );
  }

  private hintAt(atMs: number): ReadingHintLevel {
    return this.prompt?.hints.filter((hint) => hint.at <= atMs).at(-1)?.level ?? 0;
  }

  suggestHint(atMs: number): ReadingHintLevel {
    const p = this.prompt;
    if (!p || !this.canAnswer(p.noteId, atMs) || this.exercise.task === "check") return 0;
    const shown = this.hintAt(atMs);
    if (!this.preferences.automaticHints) return shown;
    const elapsed = this.elapsed(atMs);
    return Math.max(
      shown,
      elapsed >= this.preferences.keyDelayMs ? 2 : elapsed >= this.preferences.nameDelayMs ? 1 : 0
    ) as ReadingHintLevel;
  }

  showHint(noteId: string, level: ReadingHintLevel, atMs: number): void {
    const prompt = this.prompt;
    if (
      this.exercise.task === "check" ||
      prompt?.noteId !== noteId ||
      prompt.solved ||
      prompt.presentedAt === null ||
      !Number.isFinite(atMs) ||
      atMs < prompt.presentedAt ||
      level <= this.hintAt(atMs)
    )
      return;
    this.prompt?.hints.push({ at: atMs, level });
  }

  answer(pitch: number, inputSource: ReadingInputSource, atMs: number): ReadingAttempt | null {
    const p = this.prompt;
    if (
      !p ||
      !this.canAnswer(p.noteId, atMs) ||
      !Number.isInteger(pitch) ||
      pitch < 0 ||
      pitch > 127 ||
      !["midi", "keyboard", "pointer"].includes(inputSource)
    )
      return null;
    const attempt: ReadingAttempt = {
      skillId: READING_SKILL_ID,
      runId: this.metadata?.runId ?? this.exercise.id,
      attemptId: `${this.metadata?.runId ?? this.exercise.id}:${String(this.attemptCount++)}`,
      exerciseId: this.exercise.id,
      noteId: p.noteId,
      expectedMidi: p.pitch,
      playedMidi: pitch,
      responseLatencyMs: this.elapsed(atMs),
      hintLevel: this.hintAt(atMs),
      inputSource,
      atMs
    };
    p.attempts.push(attempt);
    if (pitch === p.pitch) {
      const firstAttemptCorrect = p.attempts.length === 1;
      this.answers.push({
        noteId: p.noteId,
        expectedMidi: p.pitch,
        firstAttemptCorrect,
        independentCorrect: firstAttemptCorrect && attempt.hintLevel === 0,
        unassistedSolved: attempt.hintLevel === 0,
        responseLatencyMs: attempt.responseLatencyMs,
        hintLevel: attempt.hintLevel,
        attempts: [...p.attempts],
        hintHistory: p.hints
          .filter((hint) => hint.at <= atMs)
          .map((hint) => ({ atMs: hint.at, level: hint.level })),
        presentedAtMs: p.presentedAt
      });
      p.solved = true;
      this.close(atMs);
    }
    return attempt;
  }

  snapshot(): ReadingSnapshot {
    return {
      noteId: this.prompt?.noteId ?? null,
      hintLevel: this.prompt?.hints.at(-1)?.level ?? 0,
      answers: [...this.answers],
      active: this.enabled,
      completed: this.answers.length === 20,
      presented: typeof this.prompt?.presentedAt === "number" && !this.prompt.solved
    };
  }

  result(id: string, createdAt: number): ReadingResult | null {
    if (this.answers.length !== 20) return null;
    const runId = this.metadata?.runId ?? id;
    let attemptIndex = 0;
    return {
      id,
      skillId: READING_SKILL_ID,
      runId,
      startedAt: this.metadata?.startedAt ?? null,
      completedAt: createdAt,
      provenance: "native",
      newMaterial: this.metadata?.newMaterial === true,
      plan: this.exercise.plan ?? null,
      exerciseId: this.exercise.id,
      task: this.exercise.task,
      seed: this.exercise.seed,
      createdAt,
      notes: this.answers.map((note) => ({
        ...note,
        attempts: note.attempts.map((attempt) => ({
          ...attempt,
          runId,
          attemptId: `${runId}:${String(attemptIndex++)}`
        }))
      }))
    };
  }
}
