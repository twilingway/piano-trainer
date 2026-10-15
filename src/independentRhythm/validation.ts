const array = (value: unknown): boolean => Array.isArray(value);
import { validHeldBassInput } from "../reading/heldBassOwnership";
import { validRhythmClock } from "./clock";
import { evaluateIndependentRhythm } from "./evidence";
import { generateIndependentRhythmExercise, independentRhythmFingerprint } from "./generator";
import type {
  IndependentRhythmConfig,
  IndependentRhythmPhaseExercise,
  IndependentRhythmPhaseResult,
  IndependentRhythmResult
} from "./types";

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const time = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 512;
const keys = (value: object, allowed: string): boolean =>
  Object.keys(value).every((key) => allowed.split(" ").includes(key));
function validConfig(config: IndependentRhythmConfig): boolean {
  return (
    keys(config, "runId presentationId source deviceId channel offsetMs") &&
    text(config.runId) &&
    text(config.presentationId) &&
    ["keyboard", "pointer", "midi"].includes(config.source) &&
    Number.isFinite(config.offsetMs) &&
    (config.source === "midi"
      ? text(config.deviceId) &&
        (config.channel === undefined ||
          (Number.isInteger(config.channel) && config.channel >= 1 && config.channel <= 16))
      : config.deviceId === undefined && config.channel === undefined)
  );
}
export function validateIndependentRhythmPhase(
  phase: IndependentRhythmPhaseExercise,
  value: IndependentRhythmPhaseResult
): boolean {
  if (
    !keys(
      value,
      "phaseId phase config musicXml scoreFingerprint presentedAtMs startedAtMs finalizedAtMs clock events help channel outcomes extras summary passed"
    ) ||
    value.phaseId !== phase.id ||
    value.phase !== phase.phase ||
    value.musicXml !== phase.musicXml ||
    value.scoreFingerprint !== independentRhythmFingerprint(phase) ||
    !validConfig(value.config) ||
    !time(value.presentedAtMs) ||
    !time(value.startedAtMs) ||
    value.startedAtMs < value.presentedAtMs ||
    !time(value.finalizedAtMs) ||
    value.finalizedAtMs <= value.startedAtMs ||
    !keys(value.clock, "segments atMs songTime startPerformanceMs endPerformanceMs ended") ||
    value.clock.atMs !== value.finalizedAtMs ||
    !validRhythmClock(value.clock, phase.song.duration, value.startedAtMs) ||
    !value.clock.ended ||
    value.clock.endPerformanceMs === null ||
    value.finalizedAtMs <=
      value.clock.endPerformanceMs + Math.max(0, value.config.offsetMs) + 250 ||
    !array(value.events) ||
    value.events.length > 256 ||
    !array(value.help) ||
    value.help.length > 32 ||
    !array(value.outcomes) ||
    !array(value.extras)
  )
    return false;
  let delivery = value.startedAtMs;
  for (let index = 0; index < value.events.length; index++) {
    const event = value.events[index];
    if (
      !event ||
      !keys(
        event,
        "kind pitch source atMs offsetMs deviceId channel ownerId runId presentationId receivedAtMs sequence"
      ) ||
      !validHeldBassInput(event) ||
      event.sequence !== index ||
      !time(event.receivedAtMs) ||
      event.atMs < value.startedAtMs ||
      event.receivedAtMs < delivery ||
      event.receivedAtMs > value.finalizedAtMs ||
      event.receivedAtMs < event.atMs ||
      event.receivedAtMs - event.atMs > 250 ||
      (event.source === value.config.source &&
        (event.source !== "midi" || event.deviceId === value.config.deviceId) &&
        (event.offsetMs ?? 0) !== value.config.offsetMs) ||
      (event.runId !== undefined && event.runId !== value.config.runId) ||
      (event.presentationId !== undefined && event.presentationId !== value.config.presentationId)
    )
      return false;
    delivery = event.receivedAtMs;
  }
  let helpTime = value.presentedAtMs;
  for (const help of value.help) {
    if (
      !keys(help, "presentationId atMs pitches") ||
      help.presentationId !== value.config.presentationId ||
      !time(help.atMs) ||
      help.atMs < helpTime ||
      help.atMs > value.startedAtMs ||
      !array(help.pitches) ||
      !help.pitches.length ||
      new Set(help.pitches).size !== help.pitches.length ||
      help.pitches.some((pitch) => pitch !== 48 && pitch !== 60)
    )
      return false;
    helpTime = help.atMs;
  }
  const evaluation = evaluateIndependentRhythm(phase, value.config, value.events, value.clock);
  return (
    value.channel === evaluation.channel &&
    equal(value.outcomes, evaluation.outcomes) &&
    equal(value.extras, evaluation.extras) &&
    equal(value.summary, evaluation.summary) &&
    value.outcomes.every((note) => note.outcome !== "pending") &&
    value.passed ===
      (evaluation.outcomes.every((note) => note.outcome === "hit") && !evaluation.extras.length)
  );
}
/** Strict replay returns an immutable detached copy, never trusting persisted metrics or permit. */
export function validateIndependentRhythmResult(value: unknown): IndependentRhythmResult | null {
  try {
    const result = JSON.parse(JSON.stringify(value)) as
      | (Omit<IndependentRhythmResult, "skillId" | "task" | "generatorVersion" | "rulesVersion"> & {
          skillId: string;
          task: string;
          generatorVersion: number;
          rulesVersion: number;
        })
      | null;
    if (
      !result ||
      !keys(
        result,
        "id runId skillId task exerciseId seed generatorVersion rulesVersion startedAt completedAt createdAt inputSource pulse series"
      ) ||
      !text(result.runId) ||
      result.id !== `${result.runId}:result` ||
      result.skillId !== "independent-rhythm-reading" ||
      result.task !== "independent-rhythms" ||
      result.generatorVersion !== 1 ||
      result.rulesVersion !== 1 ||
      !Number.isInteger(result.seed) ||
      result.seed < 0 ||
      result.seed > 0xffffffff ||
      result.exerciseId !== `independent-rhythm-v1-${String(result.seed)}` ||
      !time(result.startedAt) ||
      !time(result.completedAt) ||
      result.completedAt < result.startedAt ||
      result.createdAt !== result.completedAt
    )
      return null;
    const exercise = generateIndependentRhythmExercise(result.seed);
    if (
      !validateIndependentRhythmPhase(exercise.pulse, result.pulse) ||
      !validateIndependentRhythmPhase(exercise.series, result.series) ||
      !result.pulse.passed ||
      result.pulse.config.runId !== result.runId ||
      result.series.config.runId !== result.runId ||
      result.inputSource !== result.pulse.config.source ||
      result.series.config.source !== result.inputSource ||
      result.series.config.deviceId !== result.pulse.config.deviceId ||
      result.series.config.offsetMs !== result.pulse.config.offsetMs ||
      result.series.config.channel !==
        (result.inputSource === "midi" ? (result.pulse.channel ?? undefined) : undefined) ||
      result.series.config.presentationId === result.pulse.config.presentationId ||
      result.series.presentedAtMs < result.pulse.finalizedAtMs ||
      result.series.startedAtMs < result.pulse.finalizedAtMs
    )
      return null;
    return result as IndependentRhythmResult;
  } catch {
    return null;
  }
}
