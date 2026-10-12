import type { RhythmBpm, RhythmInputSource, RhythmResult } from "../rhythm/types";

export interface RhythmPersistentState {
  seed: number;
  generatorVersion: number;
  bpm: RhythmBpm;
  inputSource: RhythmInputSource;
  history: RhythmResult[];
}
export const emptyRhythmState = (): RhythmPersistentState => ({
  seed: 1,
  generatorVersion: 1,
  bpm: 60,
  inputSource: "keyboard",
  history: []
});
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const source = (value: unknown): value is RhythmInputSource =>
  value === "midi" || value === "keyboard" || value === "pointer";
const bpm = (value: unknown): value is RhythmBpm => value === 60 || value === 80 || value === 100;
const device = (value: unknown) => value === undefined || typeof value === "string";
const median = (values: number[]): number | null => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return null;
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Reject one malformed run while leaving its course siblings intact. */
export function validRhythmResult(value: unknown): value is RhythmResult {
  const row = object(value);
  const offsets = object(row.offsets);
  if (
    !text(row.id) ||
    !text(row.runId) ||
    !text(row.exerciseId) ||
    row.skillId !== "rhythm-onsets" ||
    !integer(row.seed) ||
    row.generatorVersion !== 1 ||
    row.rulesVersion !== 1 ||
    row.windowMs !== 150 ||
    !bpm(row.bpm) ||
    !source(row.source) ||
    !device(row.deviceId) ||
    !nonnegative(row.startedAt) ||
    !nonnegative(row.completedAt) ||
    row.completedAt < row.startedAt ||
    !["calibrated", "uncalibrated"].includes(String(offsets.status)) ||
    ![
      offsets.inputOffsetMs,
      offsets.manualInputOffsetMs,
      offsets.audioOutputOffsetMs,
      offsets.visualOffsetMs
    ].every(finite) ||
    !Array.isArray(row.attacks) ||
    !Array.isArray(row.misses)
  )
    return false;
  const attemptIds = new Set<string>();
  const onsetIds = new Set<string>();
  const deviations: number[] = [];
  let extras = 0;
  let restExtras = 0;
  for (const value of row.attacks) {
    const attack = object(value);
    if (
      !text(attack.attemptId) ||
      attemptIds.has(attack.attemptId) ||
      attack.runId !== row.runId ||
      attack.source !== row.source ||
      attack.deviceId !== row.deviceId ||
      ![attack.rawAtMs, attack.receivedAtMs].every(nonnegative) ||
      !finite(attack.correctedAtMs) ||
      (attack.receivedAtMs as number) < (attack.rawAtMs as number) ||
      (attack.receivedAtMs as number) - (attack.rawAtMs as number) > 250.000001 ||
      !finite(attack.songTimeS) ||
      attack.songTimeS < -0.150000001 ||
      attack.songTimeS >= (16 * 60) / row.bpm ||
      !finite(attack.receivedSongTimeS) ||
      typeof attack.inRest !== "boolean" ||
      !(attack.pitch === undefined || (integer(attack.pitch) && attack.pitch <= 127)) ||
      !(
        attack.channel === undefined ||
        (integer(attack.channel) && attack.channel >= 1 && attack.channel <= 16)
      )
    )
      return false;
    attemptIds.add(attack.attemptId);
    if (attack.kind === "hit") {
      if (
        !text(attack.onsetId) ||
        onsetIds.has(attack.onsetId) ||
        attack.inRest ||
        !finite(attack.deviationMs) ||
        Math.abs(attack.deviationMs) > 150.000001
      )
        return false;
      onsetIds.add(attack.onsetId);
      deviations.push(attack.deviationMs);
    } else if (attack.kind === "extra") {
      if (attack.onsetId !== null || attack.deviationMs !== null) return false;
      extras++;
      if (attack.inRest) restExtras++;
    } else return false;
  }
  for (const value of row.misses) {
    const miss = object(value);
    if (
      !text(miss.onsetId) ||
      onsetIds.has(miss.onsetId) ||
      !nonnegative(miss.timeS) ||
      miss.timeS >= (16 * 60) / row.bpm ||
      miss.source !== row.source
    )
      return false;
    onsetIds.add(miss.onsetId);
  }
  const summary = object(row.summary);
  return (
    onsetIds.size === 10 &&
    summary.expected === 10 &&
    summary.hits === deviations.length &&
    summary.misses === row.misses.length &&
    summary.early === deviations.filter((value) => value < 0).length &&
    summary.late === deviations.filter((value) => value > 0).length &&
    summary.extras === extras &&
    summary.restExtras === restExtras &&
    summary.hitRate === deviations.length / 10 &&
    summary.signedMedianMs === median(deviations) &&
    summary.absoluteMedianMs === median(deviations.map(Math.abs))
  );
}

function cloneRhythmResult(result: RhythmResult) {
  return {
    ...result,
    offsets: { ...result.offsets },
    attacks: result.attacks.map((attack) => ({ ...attack })),
    misses: result.misses.map((miss) => ({ ...miss })),
    summary: { ...result.summary }
  };
}
export function mergeRhythmHistory(
  saved: readonly RhythmResult[],
  incoming: readonly RhythmResult[]
): ReturnType<typeof cloneRhythmResult>[] {
  const unique = new Map<string, RhythmResult>();
  // Committed evidence wins over a stale tab's copy of the same run.
  for (const result of [...saved, ...incoming]) {
    if (!unique.has(result.runId)) unique.set(result.runId, result);
  }
  return [...unique.values()]
    .sort((a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId))
    .slice(-20)
    .map(cloneRhythmResult);
}
export function normalizeRhythmState(value: unknown): {
  rhythm: RhythmPersistentState;
  invalid: boolean;
} {
  const rhythm = emptyRhythmState();
  if (value === undefined) return { rhythm, invalid: false };
  const row = object(value);
  const history = Array.isArray(row.history) ? row.history : [];
  const invalid =
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !integer(row.seed) ||
    row.generatorVersion !== 1 ||
    !bpm(row.bpm) ||
    !source(row.inputSource) ||
    !Array.isArray(row.history) ||
    history.some((result) => !validRhythmResult(result));
  rhythm.seed = integer(row.seed) ? row.seed >>> 0 : 1;
  rhythm.bpm = bpm(row.bpm) ? row.bpm : 60;
  rhythm.inputSource = source(row.inputSource) ? row.inputSource : "keyboard";
  rhythm.history = mergeRhythmHistory([], history.filter(validRhythmResult));
  return { rhythm, invalid };
}
