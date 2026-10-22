import { BASS_READING_PITCHES } from "./bassGenerator";
import { BASS_READING_SKILL_ID } from "./bassTypes";
import type { BassReadingTask } from "./bassTypes";
import type { ReadingResult } from "./types";
import { readingResultObservation, summarizeReadingObservations } from "./progress";
import type { ReadingObservation, ReadingSourceFilter, ReadingSummary } from "./progressTypes";

export const BASS_READING_HISTORY_LIMIT = 20;

/** Each task has its own twenty-series window; full attempts and hints remain in history. */
export function summarizeBassReadingResults(
  results: readonly ReadingResult[],
  source: ReadingSourceFilter = "all",
  task?: BassReadingTask
): ReadingSummary {
  const seen = new Set<string>();
  const retained: ReadingResult[] = [];
  const counts = { notes: 0, phrases: 0 };
  for (const result of [...results].sort((a, b) => b.createdAt - a.createdAt)) {
    if (
      result.skillId !== BASS_READING_SKILL_ID ||
      (result.task !== "notes" && result.task !== "phrases")
    )
      continue;
    const runId = result.runId ?? result.id;
    if (seen.has(runId)) continue;
    seen.add(runId);
    if (counts[result.task] >= BASS_READING_HISTORY_LIMIT) continue;
    counts[result.task]++;
    retained.push(result);
  }
  const entries: ReadingObservation[] = [];
  for (const result of retained)
    for (const note of result.notes) {
      const entry = readingResultObservation(result, note);
      if (entry) entries.push({ ...entry, purpose: result.task, newMaterial: false });
    }
  return summarizeReadingObservations(entries, source, task, BASS_READING_PITCHES, [
    "notes",
    "phrases"
  ]);
}
