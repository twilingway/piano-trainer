import type { ReadingInputSource } from "../reading/types";
import { rhythmTiming } from "../rhythm/types";
import type {
  IndependentRhythmExtra,
  IndependentRhythmHandSummary,
  IndependentRhythmNoteOutcome,
  IndependentRhythmResult,
  IndependentRhythmSummary
} from "./types";

export function rhythmMedian(values: readonly number[]): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length
    ? ((sorted[middle] ?? 0) + (sorted[(sorted.length - 1) >> 1] ?? 0)) / 2
    : null;
}
export function summarizeIndependentRhythmOutcomes(
  outcomes: readonly IndependentRhythmNoteOutcome[],
  extras: readonly IndependentRhythmExtra[]
): IndependentRhythmSummary {
  const hand = (which: "left" | "right"): IndependentRhythmHandSummary => {
    const notes = outcomes.filter((note) => note.hand === which);
    const hits = notes.filter((note) => note.outcome === "hit");
    const deviations = hits.flatMap((note) =>
      note.deviationMs === null ? [] : [note.deviationMs]
    );
    return {
      expected: notes.length,
      hits: hits.length,
      misses: notes.filter((note) => note.outcome === "miss").length,
      extras: extras.filter((extra) => extra.hand === which).length,
      onTime: deviations.filter((value) => rhythmTiming(value) === "on-time").length,
      early: deviations.filter((value) => rhythmTiming(value) === "early").length,
      late: deviations.filter((value) => rhythmTiming(value) === "late").length,
      signedDeviationMs: rhythmMedian(deviations),
      absoluteDeviationMs: rhythmMedian(deviations.map(Math.abs))
    };
  };
  const onsets = new Map<number, IndependentRhythmNoteOutcome[]>();
  for (const note of outcomes) onsets.set(note.onset, [...(onsets.get(note.onset) ?? []), note]);
  const spreads = [...onsets.values()].flatMap((notes) =>
    notes.length === 2 && notes.every((note) => note.outcome === "hit" && note.deviationMs !== null)
      ? [Math.abs((notes[0]?.deviationMs ?? 0) - (notes[1]?.deviationMs ?? 0))]
      : []
  );
  return {
    left: hand("left"),
    right: hand("right"),
    extras: extras.length,
    unknownExtras: extras.filter((extra) => extra.hand === null).length,
    spreadMs: rhythmMedian(spreads)
  };
}
export function summarizeIndependentRhythmResults(
  results: readonly IndependentRhythmResult[],
  sourceFilter: ReadingInputSource | "all" = "all"
): IndependentRhythmSummary & { readonly resultCount: number } {
  const selected = results.filter(
    (result) => sourceFilter === "all" || result.inputSource === sourceFilter
  );
  const outcomes = selected.flatMap((result, index) =>
    result.series.outcomes.map((note) => ({ ...note, onset: note.onset + index * 100 }))
  );
  const extras = selected.flatMap((result) => result.series.extras);
  return { ...summarizeIndependentRhythmOutcomes(outcomes, extras), resultCount: selected.length };
}
