// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateIntervalExercise } from "./generator";
import { IntervalSession } from "./session";
import type { IntervalMode } from "./types";

function fixture(mode: IntervalMode = "see-and-play") {
  const exercise = generateIntervalExercise(mode, 42);
  const session = new IntervalSession(exercise, { runId: "run-1", startedAt: null });
  const identity = session.identity();
  const pair = exercise.pairs[0];
  if (!identity || !pair) throw new Error("Missing fixture pair");
  session.setActive(true, 0);
  return { exercise, session, identity, pair };
}

describe("visual pair evaluation", () => {
  it("gates delayed input before the musical session can consume an unrecordable attack", () => {
    const { session, identity } = fixture();
    session.present(identity, 100);
    session.setActive(false, 200);
    session.setActive(true, 300);
    expect(session.canAnswerAt(identity, 299)).toBe(false);
    expect(session.canAnswerAt(identity, 300)).toBe(true);
    expect(session.canAnswerAt({ ...identity, runId: "old" }, 400)).toBe(false);
  });
  it("publishes the same snapshot until a state change rather than allocating per frame", () => {
    const { session, identity } = fixture();
    const first = session.snapshot();
    expect(session.snapshot()).toBe(first);
    session.setActive(true, 100);
    expect(session.snapshot()).toBe(first);
    session.present(identity, 100);
    const shown = session.snapshot();
    expect(shown).not.toBe(first);
    expect(session.snapshot()).toBe(shown);
  });
  it("requires confirmed presentation, accepts exactly both notes in order", () => {
    const { session, identity, pair } = fixture();
    expect(session.answerPitch(identity, pair.anchorMidi, "keyboard", 50)).toBeNull();
    session.present(identity, 100);
    expect(session.answerPitch(identity, pair.anchorMidi, "keyboard", 200)?.noteRole).toBe(0);
    expect(session.snapshot().noteRole).toBe(1);
    expect(session.snapshot().expectedNoteId).toBe(pair.noteIds[1]);
    session.answerPitch(identity, pair.targetMidi, "pointer", 500);
    const result = session.snapshot().answers[0];
    expect(result).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: true,
      unassistedSolved: true,
      inputSource: "pointer",
      firstReactionMs: 100,
      solutionMs: 400,
      firstListeningCorrect: null
    });
    expect(session.snapshot().canAnswer).toBe(false);
    expect(session.answerPitch(identity, pair.targetMidi, "keyboard", 600)).toBeNull();
  });
  it.each([0, 1])(
    "retains a wrong attack of role %i and invalidates first attempt for the whole pair",
    (role) => {
      const { session, identity, pair } = fixture();
      session.present(identity, 0);
      if (role === 0) session.answerPitch(identity, 1, "midi", 100);
      session.answerPitch(identity, pair.anchorMidi, "keyboard", 200);
      if (role === 1) session.answerPitch(identity, 1, "midi", 300);
      session.answerPitch(identity, pair.targetMidi, "keyboard", 400);
      expect(session.snapshot().answers[0]).toMatchObject({
        firstAttemptCorrect: false,
        independentCorrect: false,
        unassistedSolved: true,
        inputSource: "keyboard"
      });
      expect(
        session
          .snapshot()
          .answers[0]?.attempts.some(
            (attempt) => !attempt.correct && attempt.inputSource === "midi"
          )
      ).toBe(true);
    }
  );
  it("records help for either note as help for the whole pair", () => {
    const { session, identity, pair } = fixture();
    session.present(identity, 0);
    session.answerPitch(identity, pair.anchorMidi, "keyboard", 100);
    expect(session.showHelp(identity, 150)).toBe(true);
    expect(session.showHelp(identity, 160)).toBe(false);
    session.answerPitch(identity, pair.targetMidi, "keyboard", 200);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: false,
      unassistedSolved: false,
      helpHistory: [{ atMs: 150 }]
    });
  });
  it("excludes pauses and unavailable presentation from reaction and solution", () => {
    const { session, identity, pair } = fixture();
    session.present(identity, 100);
    session.setActive(false, 200);
    session.setActive(true, 1200);
    session.requirePresentation(identity, 1300);
    session.present(identity, 2300);
    session.answerPitch(identity, pair.anchorMidi, "keyboard", 2400);
    session.answerPitch(identity, pair.targetMidi, "keyboard", 2600);
    expect(session.snapshot().answers[0]).toMatchObject({
      presentedAtMs: 100,
      firstReactionMs: 300,
      solutionMs: 500
    });
  });
  it("allows renderer confirmation before activation without counting blocked time", () => {
    const { session, identity, pair } = fixture();
    session.setActive(false, 0);
    session.present(identity, 100);
    session.setActive(true, 1000);
    session.answerPitch(identity, pair.anchorMidi, "keyboard", 1100);
    expect(session.snapshot().attempts[0]?.responseLatencyMs).toBe(100);
  });
  it("rejects stale runs, question identities, backwards timestamps and invalid pitches", () => {
    const { session, identity, pair } = fixture();
    session.present(identity, 100);
    expect(
      session.answerPitch({ ...identity, runId: "old" }, pair.anchorMidi, "keyboard", 200)
    ).toBeNull();
    expect(
      session.answerPitch({ ...identity, questionId: "old" }, pair.anchorMidi, "keyboard", 200)
    ).toBeNull();
    expect(session.answerPitch(identity, pair.anchorMidi, "keyboard", 99)).toBeNull();
    expect(session.answerPitch(identity, 128, "keyboard", 200)).toBeNull();
    expect(session.answerCategory(identity, pair.category, "pointer", 200)).toBeNull();
    expect(session.snapshot().attempts).toHaveLength(0);
  });
});

describe("aural interval evaluation", () => {
  it("keeps choices blocked until a current complete pair and retains wrong choices", () => {
    const { session, identity, pair } = fixture("hear-and-choose");
    expect(session.answerCategory(identity, pair.category, "keyboard", 0)).toBeNull();
    expect(session.listeningStarted(identity, 1, 100)).toBe(true);
    expect(session.listeningStarted(identity, 2, 150)).toBe(false);
    expect(session.answerCategory(identity, pair.category, "keyboard", 200)).toBeNull();
    expect(session.listeningCompleted(identity, 2, 500)).toBe(false);
    expect(session.listeningCompleted(identity, 1, 500)).toBe(true);
    const wrong = pair.category === "repeat" ? "step-up" : "repeat";
    session.answerCategory(identity, wrong, "pointer", 600);
    expect(session.snapshot().questionIndex).toBe(0);
    session.answerCategory(identity, pair.category, "keyboard", 800);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: false,
      unassistedSolved: true,
      inputSource: "keyboard",
      firstReactionMs: 100,
      solutionMs: 300,
      fullListeningCount: 1,
      firstListeningCorrect: false
    });
  });
  it("excludes replay sounding time and distinguishes replay from explicit help", () => {
    const { session, identity, pair } = fixture("hear-and-choose");
    session.listeningStarted(identity, 1, 0);
    session.listeningCompleted(identity, 1, 1000);
    session.listeningStarted(identity, 2, 2000);
    expect(session.answerCategory(identity, pair.category, "pointer", 2500)).toBeNull();
    session.listeningCompleted(identity, 2, 6000);
    session.answerCategory(identity, pair.category, "pointer", 8000);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstReactionMs: 3000,
      solutionMs: 3000,
      independentCorrect: true,
      unassistedSolved: true,
      fullListeningCount: 2,
      firstListeningCorrect: false,
      helpHistory: []
    });
  });
  it("marks the first correct independent choice after one uninterrupted complete listen", () => {
    const { session, identity, pair } = fixture("hear-and-choose");
    session.listeningStarted(identity, 1, 0);
    session.listeningCompleted(identity, 1, 100);
    session.answerCategory(identity, pair.category, "keyboard", 200);
    expect(session.snapshot().answers[0]?.firstListeningCorrect).toBe(true);
  });
  it("excludes actual explicit help from independence and first-listening correctness", () => {
    const { session, identity, pair } = fixture("hear-and-choose");
    session.listeningStarted(identity, 1, 0);
    session.listeningCompleted(identity, 1, 100);
    session.showHelp(identity, 150);
    session.answerCategory(identity, pair.category, "pointer", 200);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: false,
      unassistedSolved: false,
      firstListeningCorrect: false
    });
  });
  it.each([true, false])(
    "counts partial cancellation only when a note actually started (%s)",
    (noteStarted) => {
      const { session, identity, pair } = fixture("hear-and-choose");
      session.listeningStarted(identity, 1, 0);
      session.setActive(false, 100);
      expect(session.listeningCancelled(identity, 1, 100, noteStarted)).toBe(true);
      expect(session.listeningCancelled(identity, 1, 100, noteStarted)).toBe(false);
      expect(session.listeningCompleted(identity, 1, 200)).toBe(false);
      session.setActive(true, 1000);
      expect(session.snapshot().canAnswer).toBe(false);
      session.listeningStarted(identity, 2, 1000);
      session.listeningCompleted(identity, 2, 1100);
      session.answerCategory(identity, pair.category, "keyboard", 1200);
      expect(session.snapshot().answers[0]).toMatchObject({
        fullListeningCount: 1,
        partialListeningCount: noteStarted ? 1 : 0,
        firstListeningCorrect: !noteStarted,
        firstReactionMs: 100
      });
    }
  );
  it("requires a new complete listen after hidden/pause even if the previous listen was complete", () => {
    const { session, identity, pair } = fixture("hear-and-choose");
    session.listeningStarted(identity, 1, 0);
    session.listeningCompleted(identity, 1, 100);
    session.setActive(false, 200);
    session.setActive(true, 1000);
    expect(session.answerCategory(identity, pair.category, "keyboard", 1100)).toBeNull();
    expect(session.listeningStarted(identity, 1, 1100)).toBe(false);
    session.listeningStarted(identity, 2, 1100);
    session.listeningCompleted(identity, 2, 1500);
    session.answerCategory(identity, pair.category, "keyboard", 1600);
    expect(session.snapshot().answers[0]).toMatchObject({ solutionMs: 200, fullListeningCount: 2 });
  });
});

describe("completed run identity", () => {
  it.each(["see-and-play", "hear-and-choose"] as const)(
    "finishes exactly ten questions and keeps identities for %s",
    (mode) => {
      const { session, exercise } = fixture(mode);
      expect(session.result("result", 1000)).toBeNull();
      session.markStarted(123);
      session.markStarted(456);
      let at = 0;
      for (const pair of exercise.pairs) {
        const identity = session.identity();
        if (!identity) throw new Error("Missing current identity");
        if (mode === "see-and-play") {
          session.present(identity, at++);
          session.answerPitch(identity, pair.anchorMidi, "keyboard", at++);
          session.answerPitch(identity, pair.targetMidi, "keyboard", at++);
        } else {
          session.listeningStarted(identity, 1, at++);
          session.listeningCompleted(identity, 1, at++);
          session.answerCategory(identity, pair.category, "pointer", at++);
        }
      }
      expect(session.snapshot().completed).toBe(true);
      expect(session.identity()).toBeNull();
      const result = session.result("result", 1000);
      expect(result).toMatchObject({
        runId: "run-1",
        startedAt: 123,
        completedAt: 1000,
        mode,
        generatorVersion: 1,
        seed: 42,
        exerciseId: exercise.id
      });
      expect(result?.questions).toHaveLength(10);
      const attempts = result?.questions.flatMap((question) => question.attempts) ?? [];
      expect(new Set(attempts.map((attempt) => attempt.attemptId)).size).toBe(attempts.length);
      expect(
        attempts.every((attempt) => attempt.runId === "run-1" && attempt.exerciseId === exercise.id)
      ).toBe(true);
      expect(session.result("result", 1000)).toEqual(result);
    }
  );
});
