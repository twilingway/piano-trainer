import type { RhythmAttack, RhythmMiss, RhythmResult, RhythmSummary } from "./types";

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

export function summarizeRhythm(
  expected: number,
  attacks: readonly RhythmAttack[],
  misses: readonly RhythmMiss[]
): RhythmSummary {
  const deviations = attacks.flatMap((attack) =>
    attack.kind === "hit" && attack.deviationMs !== null ? [attack.deviationMs] : []
  );
  const extras = attacks.filter((attack) => attack.kind === "extra");
  return {
    expected,
    hits: deviations.length,
    early: deviations.filter((value) => value < 0).length,
    late: deviations.filter((value) => value > 0).length,
    misses: misses.length,
    extras: extras.length,
    restExtras: extras.filter((attack) => attack.inRest).length,
    hitRate: expected > 0 ? deviations.length / expected : 0,
    signedMedianMs: median(deviations),
    absoluteMedianMs: median(deviations.map(Math.abs))
  };
}

/** This key deliberately prevents mixing tempos, input sources or compensation snapshots. */
export function rhythmSummaryKey(result: RhythmResult): string {
  const offsets = result.offsets;
  return JSON.stringify([
    result.bpm,
    result.source,
    result.rulesVersion,
    offsets.inputOffsetMs,
    offsets.manualInputOffsetMs,
    offsets.audioOutputOffsetMs,
    offsets.visualOffsetMs,
    offsets.status
  ]);
}

export interface RhythmProgressGroup {
  readonly key: string;
  readonly results: readonly RhythmResult[];
  readonly summary: RhythmSummary;
}

export function summarizeRhythmHistory(history: readonly RhythmResult[]): RhythmProgressGroup[] {
  const groups = new Map<string, RhythmResult[]>();
  for (const result of history) {
    const key = rhythmSummaryKey(result);
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  return [...groups].map(([key, results]) => ({
    key,
    results,
    summary: summarizeRhythm(
      results.reduce((count, result) => count + result.summary.expected, 0),
      results.flatMap((result) => result.attacks),
      results.flatMap((result) => result.misses)
    )
  }));
}
