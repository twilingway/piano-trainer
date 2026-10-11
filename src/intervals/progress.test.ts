// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateIntervalExercise } from "./generator";
import { IntervalSession } from "./session";
import { summarizeIntervals } from "./progress";
import type { IntervalMode } from "./types";

function run(mode: IntervalMode, help = false) {
  const exercise = generateIntervalExercise(mode, 42);
  const session = new IntervalSession(exercise, { runId: mode, startedAt: 1 });
  session.setActive(true, 0);
  let at = 0;
  for (const pair of exercise.pairs) {
    const identity = session.identity();
    if (!identity) throw new Error("Missing identity");
    if (mode === "see-and-play") {
      session.present(identity, at++);
      if (help) session.showHelp(identity, at++);
      session.answerPitch(identity, 1, "midi", at++);
      session.answerPitch(identity, pair.anchorMidi, "keyboard", at++);
      session.answerPitch(identity, pair.targetMidi, "keyboard", at++);
    } else {
      session.listeningStarted(identity, 1, at++);
      session.listeningCompleted(identity, 1, at++);
      if (help) session.showHelp(identity, at++);
      session.answerCategory(identity, pair.category, "pointer", at++);
    }
  }
  const result = session.result(mode, 1000);
  if (!result) throw new Error("Missing result");
  return result;
}

describe("separate interval progress", () => {
  it("groups by mode/category and preserves mixed-source errors under source filtering", () => {
    const visual = run("see-and-play");
    const ear = run("hear-and-choose");
    const summary = summarizeIntervals([visual, ear], "see-and-play", "keyboard");
    expect(summary).toMatchObject({
      questionCount: 10,
      firstAttemptCorrectCount: 0,
      independentCorrectCount: 0,
      unassistedSolvedCount: 10,
      errorCount: 10,
      firstListeningCorrectCount: null
    });
    expect(
      summary.categories.every(
        (category) => category.questionCount === 2 && category.errorCount === 2
      )
    ).toBe(true);
    expect(summarizeIntervals([visual], "see-and-play", "midi").questionCount).toBe(0);
    expect(visual.questions.every((question) => question.attempts[0]?.inputSource === "midi")).toBe(
      true
    );
    expect(summarizeIntervals([visual, ear], "hear-and-choose")).toMatchObject({
      questionCount: 10,
      firstListeningCorrectCount: 10,
      fullListeningCount: 10
    });
  });
  it("deduplicates replayed run results", () => {
    const result = run("hear-and-choose");
    expect(summarizeIntervals([result, result], result.mode).questionCount).toBe(10);
  });
  it("returns no-data medians rather than zero latency and excludes helped independence", () => {
    expect(summarizeIntervals([], "see-and-play")).toMatchObject({
      medianFirstReactionMs: null,
      medianSolutionMs: null,
      medianIndependentReactionMs: null
    });
    const summary = summarizeIntervals([run("hear-and-choose", true)], "hear-and-choose");
    expect(summary).toMatchObject({
      independentCorrectCount: 0,
      unassistedSolvedCount: 0,
      helpedCount: 10,
      medianIndependentReactionMs: null,
      firstListeningCorrectCount: 0
    });
    expect(summary.medianFirstReactionMs).toBeGreaterThan(0);
  });
});
