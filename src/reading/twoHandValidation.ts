const array = (value: unknown): boolean => Array.isArray(value);
import { evaluateTwoHandEvents, twoHandElapsed } from "./twoHandEvidence";
import { twoHandPairsForSeed } from "./twoHandGenerator";
import type { TwoHandEvent, TwoHandResult } from "./twoHandTypes";

const time = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 512;
/** Strict proof validation returns a detached JSON value, including when input is an Immer proxy. */
export function validateTwoHandResult(value: unknown): TwoHandResult | null {
  try {
    const r = JSON.parse(JSON.stringify(value)) as
      | (Omit<TwoHandResult, "skillId" | "task" | "generatorVersion"> & {
          skillId: string;
          task: string;
          generatorVersion: number;
        })
      | null;
    if (
      r?.skillId !== "two-hand-coordination" ||
      r.task !== "simultaneous" ||
      r.generatorVersion !== 1 ||
      !text(r.id) ||
      !text(r.runId) ||
      !Number.isInteger(r.seed) ||
      r.seed < 0 ||
      r.seed > 0xffffffff ||
      r.exerciseId !== `two-hand-v1-${String(r.seed)}` ||
      !time(r.startedAt) ||
      !time(r.completedAt) ||
      r.completedAt < r.startedAt ||
      r.createdAt !== r.completedAt ||
      !array(r.pairs) ||
      r.pairs.length !== 10
    )
      return null;
    const expected = twoHandPairsForSeed(r.seed);
    let lastFinal = -1;
    let nextAttempt = 0;
    let lastSequence = -1;
    for (let index = 0; index < 10; index++) {
      const pair = r.pairs[index];
      const source = expected[index];
      if (
        !source ||
        pair?.pairId !== source.id ||
        JSON.stringify(pair.noteIds) !== JSON.stringify(source.noteIds) ||
        JSON.stringify(pair.expectedMidi) !== JSON.stringify(source.pitches) ||
        !time(pair.presentedAtMs) ||
        pair.presentedAtMs < lastFinal ||
        !array(pair.attempts) ||
        !pair.attempts.length ||
        pair.attempts.length > 1000 ||
        !array(pair.activeIntervals) ||
        !pair.activeIntervals.length ||
        !array(pair.hintHistory)
      )
        return null;
      let intervalEnd = pair.presentedAtMs;
      for (const interval of pair.activeIntervals) {
        if (
          !time(interval.from) ||
          !time(interval.to) ||
          interval.from < intervalEnd ||
          interval.to < interval.from
        )
          return null;
        intervalEnd = interval.to;
      }
      const active = (at: number): boolean =>
        pair.activeIntervals.some((interval) => at >= interval.from && at <= interval.to);
      let hintLevel = 0;
      let hintTime = pair.presentedAtMs;
      for (const hint of pair.hintHistory) {
        if (
          !time(hint.atMs) ||
          hint.atMs < hintTime ||
          hint.atMs > intervalEnd ||
          ![1, 2].includes(hint.level) ||
          hint.level <= hintLevel
        )
          return null;
        hintLevel = hint.level;
        hintTime = hint.atMs;
      }
      let previousFinal = pair.presentedAtMs;
      for (let attemptIndex = 0; attemptIndex < pair.attempts.length; attemptIndex++) {
        const attempt = pair.attempts[attemptIndex];
        if (
          attempt?.attemptId !== `${r.runId}:attempt:${String(nextAttempt++)}` ||
          !text(attempt.presentationId) ||
          !attempt.presentationId.startsWith(`${r.runId}:presentation:`) ||
          !time(attempt.boundaryAtMs) ||
          attempt.boundaryAtMs < previousFinal ||
          !time(attempt.finalizedAtMs) ||
          !time(attempt.releasedAtMs) ||
          attempt.finalizedAtMs <= attempt.releasedAtMs + 250 ||
          !active(attempt.finalizedAtMs) ||
          !array(attempt.events) ||
          !attempt.events.length ||
          attempt.events.length > 256 ||
          !Number.isFinite(attempt.offsetMs)
        )
          return null;
        for (const event of attempt.events) {
          if (
            !validEvent(event) ||
            event.sequence <= lastSequence ||
            event.atMs < attempt.boundaryAtMs ||
            !active(event.atMs) ||
            event.receivedAtMs > attempt.finalizedAtMs ||
            (event.offsetMs ?? 0) !== attempt.offsetMs ||
            (event.runId !== undefined && event.runId !== r.runId) ||
            (event.presentationId !== undefined && event.presentationId !== attempt.presentationId)
          )
            return null;
          lastSequence = event.sequence;
        }
        const evaluation = evaluateTwoHandEvents(source, attempt.events, attempt.finalizedAtMs);
        const outcome = evaluation.reason ?? (evaluation.second ? "success" : null);
        if (
          !evaluation.first ||
          evaluation.held.size ||
          evaluation.releasedAtMs !== attempt.releasedAtMs ||
          evaluation.first.atMs !== attempt.firstDownAtMs ||
          (evaluation.second?.atMs ?? null) !== attempt.secondDownAtMs ||
          evaluation.first.source !== attempt.inputSource ||
          evaluation.spreadMs !== attempt.spreadMs ||
          outcome !== attempt.outcome ||
          (attemptIndex === pair.attempts.length - 1
            ? outcome !== "success"
            : outcome === "success")
        )
          return null;
        previousFinal = attempt.finalizedAtMs;
      }
      const first = pair.attempts[0];
      const last = pair.attempts.at(-1);
      if (!first || last?.secondDownAtMs == null) return null;
      const independent = pair.attempts.length === 1 && hintLevel === 0;
      if (
        intervalEnd !== last.finalizedAtMs ||
        pair.hintLevel !== hintLevel ||
        pair.firstAttemptCorrect !== (pair.attempts.length === 1) ||
        pair.independentCorrect !== independent ||
        pair.unassistedSolved !== (hintLevel === 0) ||
        pair.firstLatencyMs !== twoHandElapsed(pair.activeIntervals, first.firstDownAtMs) ||
        pair.responseLatencyMs !== twoHandElapsed(pair.activeIntervals, last.secondDownAtMs) ||
        pair.spreadMs !== last.spreadMs
      )
        return null;
      lastFinal = last.finalizedAtMs;
    }
    return r as TwoHandResult;
  } catch {
    return null;
  }
}
function validEvent(event: TwoHandEvent): boolean {
  return (
    ["down", "up"].includes(event.kind) &&
    ["keyboard", "midi", "pointer"].includes(event.source) &&
    Number.isInteger(event.pitch) &&
    event.pitch >= 0 &&
    event.pitch <= 127 &&
    time(event.atMs) &&
    time(event.receivedAtMs) &&
    event.receivedAtMs >= event.atMs &&
    event.receivedAtMs - event.atMs <= 250 &&
    Number.isInteger(event.sequence) &&
    event.sequence >= 0 &&
    (event.ownerId === undefined || text(event.ownerId)) &&
    (event.deviceId === undefined || text(event.deviceId)) &&
    (event.channel === undefined ||
      (Number.isInteger(event.channel) && event.channel >= 0 && event.channel <= 15))
  );
}
