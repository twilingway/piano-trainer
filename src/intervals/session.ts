import { INTERVAL_CATEGORIES } from "./types";
import type {
  IntervalAttempt,
  IntervalCategory,
  IntervalChoiceAttempt,
  IntervalExercise,
  IntervalHelpEvent,
  IntervalIdentity,
  IntervalInputSource,
  IntervalNoteRole,
  IntervalPitchAttempt,
  IntervalQuestionResult,
  IntervalResult,
  IntervalSnapshot
} from "./types";

export interface IntervalSessionMetadata {
  readonly runId: string;
  readonly startedAt: number | null;
}

interface QuestionState {
  noteRole: IntervalNoteRole;
  presentedAtMs: number | null;
  presentationReady: boolean;
  listening: boolean;
  listeningGeneration: number | null;
  lastGeneration: number;
  fullListeningCount: number;
  partialListeningCount: number;
  attempts: IntervalAttempt[];
  helpHistory: IntervalHelpEvent[];
  elapsedMs: number;
  openAtMs: number | null;
}

function emptyQuestion(): QuestionState {
  return {
    noteRole: 0,
    presentedAtMs: null,
    presentationReady: false,
    listening: false,
    listeningGeneration: null,
    lastGeneration: -1,
    fullListeningCount: 0,
    partialListeningCount: 0,
    attempts: [],
    helpHistory: [],
    elapsedMs: 0,
    openAtMs: null
  };
}

/** Evaluation consumes shell timestamps; it never advances the musical session. */
export class IntervalSession {
  private question = emptyQuestion();
  private readonly answers: IntervalQuestionResult[] = [];
  private active = false;
  private lastAtMs = -Infinity;
  private attemptCount = 0;
  private startedAt: number | null;
  private cachedSnapshot: IntervalSnapshot | null = null;

  constructor(
    private readonly exercise: IntervalExercise,
    private readonly metadata: IntervalSessionMetadata
  ) {
    this.startedAt = metadata.startedAt;
  }

  markStarted(at: number): void {
    if (this.startedAt === null && Number.isFinite(at) && at >= 0) this.startedAt = at;
  }

  identity(): IntervalIdentity | null {
    const pair = this.exercise.pairs[this.answers.length];
    return pair ? { runId: this.metadata.runId, questionId: pair.questionId } : null;
  }

  private matches(identity: IntervalIdentity, atMs: number): boolean {
    const current = this.identity();
    return (
      current !== null &&
      identity.runId === current.runId &&
      identity.questionId === current.questionId &&
      Number.isFinite(atMs) &&
      atMs >= 0 &&
      atMs >= this.lastAtMs
    );
  }

  private stamp(atMs: number): void {
    this.lastAtMs = atMs;
    this.cachedSnapshot = null;
  }
  private close(atMs: number): void {
    const q = this.question;
    if (q.openAtMs !== null) {
      q.elapsedMs += Math.max(0, atMs - q.openAtMs);
      q.openAtMs = null;
    }
  }
  private open(atMs: number): void {
    if (this.canAnswer() && this.question.openAtMs === null) this.question.openAtMs = atMs;
  }
  private elapsed(atMs: number): number {
    const q = this.question;
    return q.elapsedMs + (q.openAtMs === null ? 0 : Math.max(0, atMs - q.openAtMs));
  }
  private canAnswer(): boolean {
    return (
      this.active &&
      this.answers.length < this.exercise.pairs.length &&
      this.question.presentationReady &&
      !this.question.listening
    );
  }

  /** The shell uses the same timestamp gate before letting PracticeSession consume an attack. */
  canAnswerAt(identity: IntervalIdentity, atMs: number): boolean {
    return this.canAnswer() && this.matches(identity, atMs);
  }

  setActive(active: boolean, atMs: number): void {
    if (!Number.isFinite(atMs) || atMs < 0 || atMs < this.lastAtMs || active === this.active)
      return;
    this.stamp(atMs);
    this.close(atMs);
    this.active = active;
    if (!active && this.exercise.mode === "hear-and-choose") {
      this.question.presentationReady = false;
      this.question.listening = false;
    }
    this.open(atMs);
  }

  present(identity: IntervalIdentity, atMs: number): void {
    if (
      this.exercise.mode !== "see-and-play" ||
      !this.matches(identity, atMs) ||
      this.question.presentationReady
    )
      return;
    this.stamp(atMs);
    this.question.presentedAtMs ??= atMs;
    this.question.presentationReady = true;
    this.open(atMs);
  }

  /** Hide/replace a visual prompt without losing the pair's previous active reaction time. */
  requirePresentation(identity: IntervalIdentity, atMs: number): void {
    if (!this.matches(identity, atMs) || this.exercise.mode !== "see-and-play") return;
    this.stamp(atMs);
    this.close(atMs);
    this.question.presentationReady = false;
  }

  showHelp(identity: IntervalIdentity, atMs: number): boolean {
    if (!this.active || !this.matches(identity, atMs) || this.question.helpHistory.length > 0)
      return false;
    if (this.exercise.mode === "see-and-play" && !this.question.presentationReady) return false;
    this.stamp(atMs);
    this.question.helpHistory.push({ atMs });
    return true;
  }

  listeningStarted(identity: IntervalIdentity, generation: number, atMs: number): boolean {
    const q = this.question;
    if (
      this.exercise.mode !== "hear-and-choose" ||
      !this.active ||
      !this.matches(identity, atMs) ||
      q.listening ||
      !Number.isInteger(generation) ||
      generation <= q.lastGeneration
    )
      return false;
    this.stamp(atMs);
    this.close(atMs);
    q.presentationReady = false;
    q.listening = true;
    q.listeningGeneration = generation;
    q.lastGeneration = generation;
    return true;
  }

  listeningCompleted(identity: IntervalIdentity, generation: number, atMs: number): boolean {
    const q = this.question;
    if (
      !this.active ||
      !q.listening ||
      !this.matches(identity, atMs) ||
      generation !== q.listeningGeneration
    )
      return false;
    this.stamp(atMs);
    q.listening = false;
    q.listeningGeneration = null;
    q.fullListeningCount++;
    q.presentedAtMs ??= atMs;
    q.presentationReady = true;
    this.open(atMs);
    return true;
  }

  listeningCancelled(
    identity: IntervalIdentity,
    generation: number,
    atMs: number,
    noteStarted: boolean
  ): boolean {
    const q = this.question;
    if (!this.matches(identity, atMs) || generation !== q.listeningGeneration) return false;
    this.stamp(atMs);
    this.close(atMs);
    q.listening = false;
    q.listeningGeneration = null;
    q.presentationReady = false;
    if (noteStarted) q.partialListeningCount++;
    return true;
  }

  answerPitch(
    identity: IntervalIdentity,
    pitch: number,
    inputSource: IntervalInputSource,
    atMs: number
  ): IntervalPitchAttempt | null {
    const pair = this.exercise.pairs[this.answers.length];
    if (
      this.exercise.mode !== "see-and-play" ||
      !pair ||
      !this.canAnswer() ||
      !this.matches(identity, atMs) ||
      !Number.isInteger(pitch) ||
      pitch < 0 ||
      pitch > 127 ||
      !["midi", "keyboard", "pointer"].includes(inputSource)
    )
      return null;
    const expectedMidi = this.question.noteRole === 0 ? pair.anchorMidi : pair.targetMidi;
    const attempt: IntervalPitchAttempt = {
      ...this.attemptBase(identity, inputSource, atMs, pitch === expectedMidi),
      responseKind: "piano-pair",
      noteRole: this.question.noteRole,
      expectedMidi,
      playedMidi: pitch
    };
    this.question.attempts.push(attempt);
    if (attempt.correct) {
      if (this.question.noteRole === 0) this.question.noteRole = 1;
      else this.finish(attempt, atMs);
    }
    return attempt;
  }

  answerCategory(
    identity: IntervalIdentity,
    category: IntervalCategory,
    inputSource: "keyboard" | "pointer",
    atMs: number
  ): IntervalChoiceAttempt | null {
    const pair = this.exercise.pairs[this.answers.length];
    if (
      this.exercise.mode !== "hear-and-choose" ||
      !pair ||
      !this.canAnswer() ||
      !this.matches(identity, atMs) ||
      !INTERVAL_CATEGORIES.includes(category) ||
      !["keyboard", "pointer"].includes(inputSource)
    )
      return null;
    const attempt: IntervalChoiceAttempt = {
      ...this.attemptBase(identity, inputSource, atMs, category === pair.category),
      inputSource,
      responseKind: "category-choice",
      expectedCategory: pair.category,
      chosenCategory: category
    };
    this.question.attempts.push(attempt);
    if (attempt.correct) this.finish(attempt, atMs);
    return attempt;
  }

  private attemptBase(
    identity: IntervalIdentity,
    inputSource: IntervalInputSource,
    atMs: number,
    correct: boolean
  ) {
    this.stamp(atMs);
    return {
      ...identity,
      skillId:
        this.exercise.mode === "see-and-play"
          ? ("interval-pair-playing" as const)
          : ("aural-interval" as const),
      exerciseId: this.exercise.id,
      attemptId: `${this.metadata.runId}:${String(this.attemptCount++)}`,
      inputSource,
      atMs,
      responseLatencyMs: this.elapsed(atMs),
      helpShown: this.question.helpHistory.length > 0,
      correct
    };
  }

  private finish(attempt: IntervalAttempt, atMs: number): void {
    const pair = this.exercise.pairs[this.answers.length];
    if (!pair) return;
    const q = this.question;
    const firstAttemptCorrect =
      this.exercise.mode === "see-and-play"
        ? [0, 1].every(
            (role) =>
              q.attempts.find(
                (value) => value.responseKind === "piano-pair" && value.noteRole === role
              )?.correct === true
          )
        : q.attempts[0]?.correct === true;
    const unassistedSolved = q.helpHistory.length === 0;
    this.answers.push({
      questionId: pair.questionId,
      category: pair.category,
      anchorMidi: pair.anchorMidi,
      targetMidi: pair.targetMidi,
      inputSource: attempt.inputSource,
      responseKind: attempt.responseKind,
      firstAttemptCorrect,
      independentCorrect: firstAttemptCorrect && unassistedSolved,
      unassistedSolved,
      firstListeningCorrect:
        this.exercise.mode === "hear-and-choose"
          ? firstAttemptCorrect &&
            unassistedSolved &&
            q.fullListeningCount === 1 &&
            q.partialListeningCount === 0
          : null,
      firstReactionMs: q.attempts[0]?.responseLatencyMs ?? 0,
      solutionMs: this.elapsed(atMs),
      fullListeningCount: q.fullListeningCount,
      partialListeningCount: q.partialListeningCount,
      presentedAtMs: q.presentedAtMs,
      attempts: [...q.attempts],
      helpHistory: [...q.helpHistory]
    });
    this.question = emptyQuestion();
  }

  snapshot(): IntervalSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    const pair = this.exercise.pairs[this.answers.length];
    const q = this.question;
    this.cachedSnapshot = {
      questionIndex: this.answers.length,
      questionId: pair?.questionId ?? null,
      noteRole: q.noteRole,
      expectedNoteId: pair?.noteIds[q.noteRole] ?? null,
      expectedMidi: pair ? (q.noteRole === 0 ? pair.anchorMidi : pair.targetMidi) : null,
      answers: [...this.answers],
      active: this.active,
      presented: q.presentationReady,
      canAnswer: this.canAnswer(),
      attempts: [...q.attempts],
      errorCount: q.attempts.filter((attempt) => !attempt.correct).length,
      helpShown: q.helpHistory.length > 0,
      listening: q.listening,
      fullListeningCount: q.fullListeningCount,
      partialListeningCount: q.partialListeningCount,
      completed: this.answers.length === this.exercise.pairs.length
    };
    return this.cachedSnapshot;
  }

  result(id: string, completedAt: number): IntervalResult | null {
    if (this.answers.length !== 10 || !Number.isFinite(completedAt) || completedAt < 0) return null;
    return {
      id,
      skillId: this.exercise.mode === "see-and-play" ? "interval-pair-playing" : "aural-interval",
      runId: this.metadata.runId,
      exerciseId: this.exercise.id,
      mode: this.exercise.mode,
      seed: this.exercise.seed,
      generatorVersion: this.exercise.generatorVersion,
      startedAt: this.startedAt,
      completedAt,
      createdAt: completedAt,
      questions: [...this.answers]
    };
  }
}
