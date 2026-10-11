import { generateReadingExercise, readingSequenceForSeed, READING_PITCHES } from "./generator";
import {
  READING_OBSERVATION_WINDOW,
  READING_REPEAT_INTERVAL_MS,
  readingMedian,
  readingIndependentDates
} from "./progress";
import type { ReadingExercise, ReadingTask } from "./types";
import type {
  ReadingPlan,
  ReadingProfile,
  ReadingPurpose,
  ReadingSourceFilter
} from "./progressTypes";

export interface ReadingAdaptationPolicy {
  readonly version: number;
  readonly window: number;
  readonly minimumObservations: number;
  readonly latencyReferenceMs: number;
  readonly baselineCount: number;
  readonly difficultySlots: number;
  readonly overdueSlots: number;
  readonly repeatIntervalMs: number;
}

export const DEFAULT_READING_POLICY: ReadingAdaptationPolicy = {
  version: 1,
  window: READING_OBSERVATION_WINDOW,
  minimumObservations: 4,
  latencyReferenceMs: 5_000,
  baselineCount: 2,
  difficultySlots: 6,
  overdueSlots: 4,
  repeatIntervalMs: READING_REPEAT_INTERVAL_MS
};

export function balancedReadingPlan(
  task: ReadingTask,
  purpose: ReadingPurpose = task,
  source: ReadingSourceFilter = "all"
): ReadingPlan {
  return {
    purpose,
    source,
    generatorVersion: 2,
    policyVersion: DEFAULT_READING_POLICY.version,
    counts: [4, 4, 4, 4, 4]
  };
}

/** Hamilton allocation with stable ascending MIDI tie-breaking. */
export function readingQuota(weights: readonly number[], slots: number): number[] {
  if (
    !weights.length ||
    !Number.isInteger(slots) ||
    slots < 0 ||
    weights.some((weight) => !Number.isFinite(weight) || weight < 0)
  ) {
    throw new RangeError("Invalid reading quota");
  }
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const exact = weights.map((weight) => slots * (sum ? weight / sum : 1 / weights.length));
  const counts = exact.map(Math.floor);
  const ranked = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = slots - counts.reduce((total, count) => total + count, 0);
  for (const entry of ranked.slice(0, remaining))
    counts[entry.index] = (counts[entry.index] ?? 0) + 1;
  return counts;
}

export function buildAdaptivePlan(
  profile: ReadingProfile,
  source: ReadingSourceFilter,
  now: number,
  policy: ReadingAdaptationPolicy = DEFAULT_READING_POLICY
): ReadingPlan {
  if (
    !Number.isFinite(now) ||
    policy.baselineCount * 5 + policy.difficultySlots + policy.overdueSlots !== 20 ||
    !Number.isInteger(policy.baselineCount) ||
    policy.baselineCount < 2 ||
    !Number.isInteger(policy.minimumObservations) ||
    policy.minimumObservations < 1 ||
    !Number.isInteger(policy.window) ||
    policy.window < policy.minimumObservations ||
    !Number.isFinite(policy.latencyReferenceMs) ||
    policy.latencyReferenceMs <= 0 ||
    !Number.isFinite(policy.repeatIntervalMs) ||
    policy.repeatIntervalMs <= 0
  )
    throw new RangeError("Invalid reading adaptation policy");
  const selected = profile.observations.filter(
    (entry) => entry.purpose !== "phrases" && (source === "all" || entry.inputSource === source)
  );
  const windows = READING_PITCHES.map((pitch) =>
    selected
      .filter((entry) => entry.expectedMidi === pitch)
      .toSorted((a, b) => b.completedAt - a.completedAt)
      .slice(0, policy.window)
  );
  if (windows.some((entries) => entries.length < policy.minimumObservations)) {
    return { ...balancedReadingPlan("notes", "adaptive", source), policyVersion: policy.version };
  }
  const weights = windows.map((entries) => {
    const independent = entries.filter((entry) => entry.independentCorrect);
    const median = readingMedian(independent.map((entry) => entry.firstLatencyMs));
    return (
      1 -
      independent.length / entries.length +
      (median === null ? 0 : Math.min(1, median / policy.latencyReferenceMs))
    );
  });
  const difficulty = readingQuota(weights, policy.difficultySlots);
  const independentDates = readingIndependentDates(profile.observations, profile.lastIndependent);
  const overdue = READING_PITCHES.map((pitch, index) => ({
    index,
    lastIndependentAt: independentDates
      .filter(
        (entry) =>
          entry.expectedMidi === pitch && (source === "all" || entry.inputSource === source)
      )
      .reduce<number | null>(
        (last, entry) => (last === null ? entry.completedAt : Math.max(last, entry.completedAt)),
        null
      )
  }))
    .filter(
      (entry) =>
        entry.lastIndependentAt === null || now - entry.lastIndependentAt >= policy.repeatIntervalMs
    )
    .sort(
      (a, b) =>
        (a.lastIndependentAt ?? -Infinity) - (b.lastIndependentAt ?? -Infinity) || a.index - b.index
    );
  const repeat = overdue.length
    ? [0, 0, 0, 0, 0]
    : readingQuota([1, 1, 1, 1, 1], policy.overdueSlots);
  for (let slot = 0; overdue.length && slot < policy.overdueSlots; slot++) {
    const index = overdue[slot % overdue.length]?.index;
    if (index !== undefined) repeat[index] = (repeat[index] ?? 0) + 1;
  }
  return {
    purpose: "adaptive",
    source,
    generatorVersion: 2,
    policyVersion: policy.version,
    counts: READING_PITCHES.map(
      (_, index) => policy.baselineCount + (difficulty[index] ?? 0) + (repeat[index] ?? 0)
    )
  };
}

export function readingFingerprint(exercise: ReadingExercise): string {
  return exercise.song.notes.map((note) => String(note.pitch)).join(",");
}

export const READING_NOVELTY_CANDIDATES = 4_096;

export function chooseNewReadingCheck(
  seed: number,
  fingerprints: readonly string[],
  purpose: "check" | "delayed-check" = "check",
  source: ReadingSourceFilter = "all"
): { seed: number; plan: ReadingPlan; exercise: ReadingExercise } | null {
  if (!Number.isFinite(seed)) throw new RangeError("Reading seed must be finite");
  const known = new Set(fingerprints);
  const plan = balancedReadingPlan("check", purpose, source);
  for (let offset = 1; offset <= READING_NOVELTY_CANDIDATES; offset++) {
    const candidate = ((seed >>> 0) + offset) >>> 0;
    const fingerprint = readingSequenceForSeed(candidate, plan).join(",");
    if (!known.has(fingerprint))
      return { seed: candidate, plan, exercise: generateReadingExercise("check", candidate, plan) };
  }
  return null;
}
