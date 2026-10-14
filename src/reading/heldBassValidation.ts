const array = (value: unknown): boolean => Array.isArray(value);
import { heldBassFragmentsForSeed } from "./heldBassGenerator";
import { evaluateHeldBassEvents } from "./heldBassEvidence";
import { validHeldBassClock } from "./heldBassClock";
import { twoHandElapsed } from "./twoHandEvidence";
import type {
  HeldBassAttempt,
  HeldBassEvent,
  HeldBassFragment,
  HeldBassResult
} from "./heldBassTypes";

const time = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 512;
const keys = (value: object, allowed: string): boolean =>
  Object.keys(value).every((key) => allowed.split(" ").includes(key));
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function validEvent(event: HeldBassEvent): boolean {
  return (
    keys(
      event,
      "kind pitch source atMs offsetMs deviceId channel ownerId runId presentationId receivedAtMs sequence"
    ) &&
    ["up", "down"].includes(event.kind) &&
    ["keyboard", "pointer", "midi"].includes(event.source) &&
    Number.isInteger(event.pitch) &&
    event.pitch >= 0 &&
    event.pitch <= 127 &&
    time(event.atMs) &&
    time(event.receivedAtMs) &&
    event.receivedAtMs >= event.atMs &&
    event.receivedAtMs - event.atMs <= 250 &&
    Number.isInteger(event.sequence) &&
    event.sequence >= 0 &&
    (event.offsetMs === undefined ||
      (typeof event.offsetMs === "number" && Number.isFinite(event.offsetMs))) &&
    (event.ownerId === undefined || text(event.ownerId)) &&
    (event.deviceId === undefined || text(event.deviceId)) &&
    (event.channel === undefined ||
      (Number.isInteger(event.channel) && event.channel >= 1 && event.channel <= 16))
  );
}
function validateAttempt(
  fragment: HeldBassFragment,
  attempt: HeldBassAttempt,
  runId: string
): boolean {
  if (
    !keys(
      attempt,
      "attemptId presentationId presentedAtMs boundaryAtMs activeIntervals events clock onsets outcome inputSource offsetMs firstDownAtMs secondDownAtMs spreadMs rawEndAtMs releasedAtMs finalizedAtMs"
    ) ||
    !text(attempt.presentationId) ||
    !attempt.presentationId.startsWith(`${runId}:presentation:`) ||
    !time(attempt.presentedAtMs) ||
    !time(attempt.boundaryAtMs) ||
    attempt.boundaryAtMs < attempt.presentedAtMs ||
    !time(attempt.finalizedAtMs) ||
    !time(attempt.releasedAtMs) ||
    attempt.finalizedAtMs <= attempt.releasedAtMs + 250 ||
    !array(attempt.activeIntervals) ||
    !attempt.activeIntervals.length ||
    attempt.activeIntervals.length > 64 ||
    !array(attempt.events) ||
    !attempt.events.length ||
    attempt.events.length > 256 ||
    !array(attempt.onsets) ||
    !array(attempt.clock)
  )
    return false;
  let intervalEnd = attempt.presentedAtMs;
  for (const interval of attempt.activeIntervals) {
    if (
      !keys(interval, "from to") ||
      !time(interval.from) ||
      !time(interval.to) ||
      interval.from < intervalEnd ||
      interval.to < interval.from
    )
      return false;
    intervalEnd = interval.to;
  }
  const active = (at: number): boolean =>
    attempt.activeIntervals.some((interval) => at >= interval.from && at <= interval.to);
  if (intervalEnd !== attempt.finalizedAtMs || !active(attempt.finalizedAtMs)) return false;
  let sequence = -1;
  let delivery = attempt.boundaryAtMs;
  for (const event of attempt.events) {
    if (
      !validEvent(event) ||
      event.sequence <= sequence ||
      event.atMs < attempt.boundaryAtMs ||
      !active(event.atMs) ||
      event.receivedAtMs < delivery ||
      event.receivedAtMs > attempt.finalizedAtMs ||
      (event.runId !== undefined && event.runId !== runId) ||
      (event.presentationId !== undefined && event.presentationId !== attempt.presentationId)
    )
      return false;
    sequence = event.sequence;
    delivery = event.receivedAtMs;
  }
  for (const segment of attempt.clock)
    if (!keys(segment, "performanceMs songSeconds speed acceptsInput")) return false;
  if (!validHeldBassClock(fragment, attempt.clock, attempt.onsets, attempt.finalizedAtMs))
    return false;
  const evaluation = evaluateHeldBassEvents(
    fragment,
    attempt.events,
    attempt.clock,
    attempt.onsets,
    attempt.finalizedAtMs
  );
  const firstAttack = evaluation.first;
  if (
    firstAttack &&
    attempt.clock.some(
      (segment) =>
        !segment.acceptsInput &&
        segment.performanceMs >= firstAttack.atMs - (firstAttack.offsetMs ?? 0)
    )
  )
    return false;
  for (let step = 0; step < attempt.onsets.length; step++) {
    const onset = attempt.onsets[step];
    const attack = evaluation.attacks[step];
    if (
      !onset ||
      !attack ||
      !keys(onset, "runId fragmentId presentationId step noteIds atMs attackAtMs") ||
      onset.runId !== runId ||
      onset.fragmentId !== fragment.id ||
      onset.presentationId !== attempt.presentationId ||
      onset.step !== step ||
      !equal(onset.noteIds, fragment.steps[step]) ||
      onset.attackAtMs !== attack.atMs ||
      !time(onset.atMs) ||
      onset.atMs <= attack.atMs + 250 ||
      !active(onset.atMs) ||
      onset.atMs > attempt.finalizedAtMs ||
      (step > 0 && onset.atMs <= (attempt.onsets[step - 1]?.atMs ?? 0))
    )
      return false;
  }
  const success =
    !evaluation.reason &&
    evaluation.second &&
    evaluation.attacks.length === fragment.steps.length &&
    attempt.onsets.length === fragment.steps.length &&
    evaluation.rawEndAtMs !== null &&
    attempt.finalizedAtMs > evaluation.rawEndAtMs + 250;
  return (
    !!evaluation.first &&
    evaluation.held.size === 0 &&
    evaluation.releasedAtMs === attempt.releasedAtMs &&
    evaluation.first.atMs === attempt.firstDownAtMs &&
    (evaluation.second?.atMs ?? null) === attempt.secondDownAtMs &&
    evaluation.first.source === attempt.inputSource &&
    (evaluation.first.offsetMs ?? 0) === attempt.offsetMs &&
    evaluation.spreadMs === attempt.spreadMs &&
    evaluation.rawEndAtMs === attempt.rawEndAtMs &&
    attempt.outcome === (evaluation.reason ?? (success ? "success" : null))
  );
}
/** Returns detached bounded evidence; unknown runtime fields and fabricated clock jumps are rejected. */
export function validateHeldBassResult(value: unknown): HeldBassResult | null {
  try {
    const result = JSON.parse(JSON.stringify(value)) as
      | (Omit<HeldBassResult, "skillId" | "task" | "generatorVersion"> & {
          skillId: string;
          task: string;
          generatorVersion: number;
        })
      | null;
    if (
      !result ||
      !keys(
        result,
        "id runId skillId task exerciseId seed generatorVersion startedAt completedAt createdAt fragments"
      ) ||
      result.skillId !== "held-bass-reading" ||
      result.task !== "held-bass" ||
      result.generatorVersion !== 1 ||
      !text(result.id) ||
      !text(result.runId) ||
      result.id !== `${result.runId}:result` ||
      !Number.isInteger(result.seed) ||
      result.seed < 0 ||
      result.seed > 0xffffffff ||
      result.exerciseId !== `held-bass-v1-${String(result.seed)}` ||
      !time(result.startedAt) ||
      !time(result.completedAt) ||
      result.completedAt < result.startedAt ||
      result.createdAt !== result.completedAt ||
      !array(result.fragments) ||
      result.fragments.length !== 10
    )
      return null;
    const expected = heldBassFragmentsForSeed(result.seed);
    let lastFinal = -1;
    let attemptIndex = 0;
    let sequence = -1;
    const presentations = new Set<string>();
    for (let index = 0; index < 10; index++) {
      const fragment = result.fragments[index];
      const source = expected[index];
      if (
        !source ||
        fragment?.fragmentId !== source.id ||
        !keys(
          fragment,
          "fragmentId bassPitch melodyPitches hintHistory attempts firstAttemptCorrect independentCorrect unassistedSolved hintLevel firstLatencyMs responseLatencyMs spreadMs heldDurationMs"
        ) ||
        fragment.bassPitch !== source.bassPitch ||
        !equal(fragment.melodyPitches, source.melodyPitches) ||
        !array(fragment.attempts) ||
        !fragment.attempts.length ||
        fragment.attempts.length > 1000 ||
        !array(fragment.hintHistory) ||
        fragment.hintHistory.length > 64
      )
        return null;
      const fragmentStart = lastFinal;
      for (let index = 0; index < fragment.attempts.length; index++) {
        const attempt = fragment.attempts[index];
        if (
          attempt?.attemptId !== `${result.runId}:attempt:${String(attemptIndex++)}` ||
          attempt.presentedAtMs < lastFinal ||
          presentations.has(attempt.presentationId) ||
          !validateAttempt(source, attempt, result.runId) ||
          (index === fragment.attempts.length - 1
            ? attempt.outcome !== "success"
            : attempt.outcome === "success")
        )
          return null;
        presentations.add(attempt.presentationId);
        for (const event of attempt.events) {
          if (event.sequence <= sequence) return null;
          sequence = event.sequence;
        }
        lastFinal = attempt.finalizedAtMs;
      }
      let hintTime = fragmentStart;
      let hintLevel = 0;
      const shown = new Map<string, number>();
      for (const hint of fragment.hintHistory) {
        const key = `${hint.presentationId}:${String(hint.step)}`;
        const attempt = fragment.attempts.find(
          (item) => item.presentationId === hint.presentationId
        );
        if (
          !keys(hint, "presentationId presentedAtMs step atMs level") ||
          !text(hint.presentationId) ||
          !hint.presentationId.startsWith(`${result.runId}:presentation:`) ||
          !time(hint.presentedAtMs) ||
          hint.presentedAtMs < fragmentStart ||
          !time(hint.atMs) ||
          hint.atMs < hint.presentedAtMs ||
          hint.atMs < hintTime ||
          hint.atMs > lastFinal ||
          !Number.isInteger(hint.step) ||
          hint.step < 0 ||
          hint.step >= source.steps.length ||
          ![1, 2].includes(hint.level) ||
          hint.level <= (shown.get(key) ?? 0) ||
          (attempt &&
            (hint.presentedAtMs !== attempt.presentedAtMs ||
              !attempt.activeIntervals.some(
                (interval) => hint.atMs >= interval.from && hint.atMs <= interval.to
              ) ||
              hint.atMs > (attempt.onsets[hint.step]?.atMs ?? attempt.finalizedAtMs)))
        )
          return null;
        shown.set(key, hint.level);
        hintTime = hint.atMs;
        hintLevel = Math.max(hintLevel, hint.level);
      }
      const first = fragment.attempts[0];
      const last = fragment.attempts.at(-1);
      if (!first || !last) return null;
      const evaluation = evaluateHeldBassEvents(
        source,
        last.events,
        last.clock,
        last.onsets,
        last.finalizedAtMs
      );
      if (
        evaluation.rawEndAtMs === null ||
        evaluation.bassDownAtMs === null ||
        fragment.hintLevel !== hintLevel ||
        fragment.firstAttemptCorrect !== (fragment.attempts.length === 1) ||
        fragment.independentCorrect !== (fragment.attempts.length === 1 && hintLevel === 0) ||
        fragment.unassistedSolved !== (hintLevel === 0) ||
        fragment.firstLatencyMs !== twoHandElapsed(first.activeIntervals, first.firstDownAtMs) ||
        fragment.responseLatencyMs !==
          twoHandElapsed(
            last.activeIntervals,
            evaluation.attacks.at(-1)?.atMs ?? last.firstDownAtMs
          ) ||
        fragment.spreadMs !== last.spreadMs ||
        fragment.heldDurationMs !== evaluation.rawEndAtMs - evaluation.bassDownAtMs
      )
        return null;
    }
    return result as HeldBassResult;
  } catch {
    return null;
  }
}
