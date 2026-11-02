// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import type { ReadingResult } from "../reading/types";
import type { BassReadingResult } from "../reading/bassTypes";
import type { TwoHandAttempt, TwoHandPairResult, TwoHandResult } from "../reading/twoHandTypes";
import type { HeldBassResult } from "../reading/heldBassTypes";
import type {
  IndependentRhythmPhaseResult,
  IndependentRhythmResult
} from "../independentRhythm/types";
import { summarizeIndependentRhythmOutcomes } from "../independentRhythm/progress";
import { LessonReport } from "./LessonReport";
import { LessonWindowContext } from "./LessonWorkspace";
import {
  ReadingLessonSummary,
  BassReadingLessonSummary,
  TwoHandLessonSummary,
  HeldBassLessonSummary,
  IndependentRhythmLessonSummary
} from "./LessonResultSummary";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  setInterfaceLanguage("ru");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
});
function show(summary: ReactNode, language: "ru" | "en" = "ru", open: string | null = null) {
  act(() => {
    setInterfaceLanguage(language);
    root.render(
      <LessonWindowContext value={{ open, onOpen: () => undefined, interruptsAttempt: false }}>
        <LessonReport summary={summary}>
          <table data-details>
            <tbody>
              <tr>
                <td>Details</td>
              </tr>
            </tbody>
          </table>
        </LessonReport>
      </LessonWindowContext>
    );
  });
}
const run = {
  id: "result",
  runId: "run",
  exerciseId: "exercise",
  seed: 1,
  generatorVersion: 1 as const,
  startedAt: 0,
  completedAt: 1000,
  createdAt: 1000
};
function readingResult(pitch = 60): ReadingResult {
  return {
    ...run,
    task: "notes",
    skillId: "note-reading",
    notes: [0, 1].map((index) => {
      const attempt = {
        exerciseId: "exercise",
        noteId: String(index),
        expectedMidi: pitch,
        playedMidi: pitch,
        responseLatencyMs: 1000,
        hintLevel: index === 1 ? (1 as const) : (0 as const),
        inputSource: "keyboard" as const,
        atMs: 1000
      };
      return {
        noteId: String(index),
        expectedMidi: pitch,
        firstAttemptCorrect: index === 1,
        independentCorrect: false,
        unassistedSolved: index === 0,
        responseLatencyMs: 1000,
        hintLevel: attempt.hintLevel,
        attempts: index === 0 ? [{ ...attempt, playedMidi: pitch + 1 }, attempt] : [attempt]
      };
    })
  };
}
function pairAttempt(outcome: TwoHandAttempt["outcome"], spreadMs: number): TwoHandAttempt {
  return {
    attemptId: outcome,
    presentationId: "presentation",
    boundaryAtMs: 0,
    events: [],
    outcome,
    inputSource: "keyboard",
    offsetMs: 0,
    firstDownAtMs: 10,
    secondDownAtMs: 10 + spreadMs,
    releasedAtMs: 1000,
    finalizedAtMs: 1100,
    spreadMs
  };
}
function pair(helped: boolean, spread: number): TwoHandPairResult {
  return {
    pairId: String(spread),
    noteIds: ["l", "r"],
    expectedMidi: [48, 60],
    presentedAtMs: 0,
    activeIntervals: [],
    hintHistory: [],
    attempts: helped
      ? [pairAttempt("too-slow", 250), pairAttempt("success", spread)]
      : [pairAttempt("success", spread)],
    firstAttemptCorrect: !helped,
    independentCorrect: !helped,
    unassistedSolved: !helped,
    hintLevel: helped ? 1 : 0,
    firstLatencyMs: 200,
    responseLatencyMs: 1000,
    spreadMs: spread
  };
}

it("keeps actual reading correctness and help visible while the detailed report stays lazy", () => {
  const result = readingResult();
  show(<ReadingLessonSummary result={result} />);
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "С первой попытки: 1/2 · Ошибок: 1Решено без подсказки: 1/2"
  );
  expect(host.querySelector("table")).toBeNull();
  show(<ReadingLessonSummary result={result} />, "en");
  expect(host.textContent).toContain("First try: 1/2 · Errors: 1");
  expect(host.textContent).toContain("Solved without hints: 1/2");
  show(<ReadingLessonSummary result={result} />, "en", "result");
  expect(host.querySelector("table")).not.toBeNull();
});

it("shows the bass result's own data instead of an empty history source filter", () => {
  const result: BassReadingResult = {
    ...readingResult(48),
    ...run,
    task: "notes",
    skillId: "bass-note-reading",
    generatorVersion: 1,
    provenance: "native",
    newMaterial: false,
    plan: null
  };
  show(<BassReadingLessonSummary result={result} />);
  expect(host.textContent).toContain("С первой попытки: 1/2 · Ошибок: 1");
  expect(host.textContent).toContain("Решено без подсказки: 1/2");
  show(<BassReadingLessonSummary result={result} />, "en");
  expect(host.textContent).toContain("First try: 1/2 · Errors: 1");
});

it("shows independent pairs, help, errors and measured attack spread rather than generic completion", () => {
  const result: TwoHandResult = {
    ...run,
    skillId: "two-hand-coordination",
    task: "simultaneous",
    pairs: [pair(true, 72), pair(false, 28)]
  };
  show(<TwoHandLessonSummary result={result} />);
  expect(host.textContent).toContain("С первого раза без помощи: 1/2 · С помощью: 1");
  expect(host.textContent).toContain("Ошибок: 1 · Медиана разрыва: 50 мс");
  expect(host.querySelector("table")).toBeNull();
  show(<TwoHandLessonSummary result={result} />, "en");
  expect(host.textContent).toContain("First try without help: 1/2 · With help: 1");
  expect(host.textContent).toContain("Errors: 1 · Median attack gap: 50 ms");
});

it("shows held-bass help, retry errors and the actual median hold duration", () => {
  const result: HeldBassResult = {
    ...run,
    skillId: "held-bass-reading",
    task: "held-bass",
    fragments: [pair(true, 72), pair(false, 28)].map((value, index) => ({
      fragmentId: value.pairId,
      bassPitch: 48,
      melodyPitches: [60, 62],
      hintHistory: [],
      attempts: value.attempts.map((attempt) => ({
        ...attempt,
        presentedAtMs: 0,
        activeIntervals: [],
        clock: [],
        onsets: [],
        rawEndAtMs: 1000
      })),
      firstAttemptCorrect: value.firstAttemptCorrect,
      independentCorrect: value.independentCorrect,
      unassistedSolved: value.unassistedSolved,
      hintLevel: value.hintLevel,
      firstLatencyMs: 200,
      responseLatencyMs: 1000,
      spreadMs: value.spreadMs,
      heldDurationMs: index === 0 ? 800 : 1200
    }))
  };
  show(<HeldBassLessonSummary result={result} />);
  expect(host.textContent).toContain("С первого раза без помощи: 1/2 · С помощью: 1");
  expect(host.textContent).toContain("Ошибок: 1 · Медиана удержания баса: 1 000 мс");
  show(<HeldBassLessonSummary result={result} />, "en");
  expect(host.textContent).toContain("Errors: 1 · Median bass hold: 1,000 ms");
});

it("shows each rhythm hand, extras and actual synchrony without a universal accuracy score", () => {
  const outcomes = [
    {
      noteId: "l",
      pitch: 48,
      hand: "left" as const,
      onset: 0,
      outcome: "hit" as const,
      eventSequence: 1,
      deviationMs: 0
    },
    {
      noteId: "r",
      pitch: 60,
      hand: "right" as const,
      onset: 0,
      outcome: "hit" as const,
      eventSequence: 2,
      deviationMs: 40
    },
    {
      noteId: "miss",
      pitch: 48,
      hand: "left" as const,
      onset: 1,
      outcome: "miss" as const,
      eventSequence: null,
      deviationMs: null
    }
  ];
  const extras = [{ eventSequence: 3, pitch: 36, hand: null, songTime: 2 }];
  const phase: IndependentRhythmPhaseResult = {
    phaseId: "phase",
    phase: "two-hands",
    config: { runId: "run", presentationId: "p", source: "keyboard", offsetMs: 0 },
    musicXml: "",
    scoreFingerprint: "f",
    presentedAtMs: 0,
    startedAtMs: 0,
    finalizedAtMs: 1000,
    clock: {
      segments: [],
      atMs: 1000,
      songTime: 1,
      startPerformanceMs: 0,
      endPerformanceMs: 1000,
      ended: true
    },
    events: [],
    help: [],
    channel: null,
    outcomes,
    extras,
    summary: summarizeIndependentRhythmOutcomes(outcomes, extras),
    passed: false
  };
  const result: IndependentRhythmResult = {
    ...run,
    skillId: "independent-rhythm-reading",
    task: "independent-rhythms",
    rulesVersion: 1,
    inputSource: "keyboard",
    pulse: { ...phase, phase: "pulse", passed: true },
    series: phase
  };
  show(<IndependentRhythmLessonSummary result={result} />);
  expect(host.textContent).toContain("Попадания: Л 1/2, П 1/1");
  expect(host.textContent).toContain("Лишних атак: 1 · Медиана разрыва: 40 мс");
  show(<IndependentRhythmLessonSummary result={result} />, "en");
  expect(host.textContent).toContain("Hits: L 1/2, R 1/1");
  expect(host.textContent).toContain("Extra attacks: 1 · Median attack gap: 40 ms");
});
