import { READING_PITCHES } from "./generator";
import type { ReadingNoteResult, ReadingResult } from "./types";
import type {
  ReadingMetrics,
  ReadingIndependentDate,
  ReadingObservation,
  ReadingProfile,
  ReadingPurpose,
  ReadingSourceFilter,
  ReadingSummary
} from "./progressTypes";

export const READING_REPEAT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1_000;
export const READING_OBSERVATION_WINDOW = 20;
export const READING_PURPOSES: readonly ReadingPurpose[] = [
  "notes",
  "phrases",
  "check",
  "adaptive",
  "delayed-check"
];

export function emptyReadingProfile(): ReadingProfile {
  return { observations: [], lastIndependent: [], processedRunIds: [], delayedDueAt: null };
}

/** Calendar evidence survives the bounded observations used to estimate difficulty. */
export function readingIndependentDates(
  observations: readonly ReadingObservation[],
  previous: readonly ReadingIndependentDate[] = []
): readonly ReadingIndependentDate[] {
  const dates = new Map<string, ReadingIndependentDate>();
  const add = (entry: ReadingIndependentDate): void => {
    const key = `${String(entry.expectedMidi)}:${entry.inputSource}`;
    const existing = dates.get(key);
    if (!existing || entry.completedAt > existing.completedAt) dates.set(key, entry);
  };
  previous.forEach(add);
  for (const entry of observations) {
    if (entry.independentCorrect && entry.purpose !== "phrases") {
      add({
        expectedMidi: entry.expectedMidi,
        inputSource: entry.inputSource,
        completedAt: entry.completedAt
      });
    }
  }
  return [...dates.values()].sort(
    (a, b) => a.expectedMidi - b.expectedMidi || a.inputSource.localeCompare(b.inputSource)
  );
}

export function readingPurpose(result: ReadingResult): ReadingPurpose {
  return result.plan?.purpose ?? result.task;
}

function knownLatency(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

export function readingResultObservation(
  result: ReadingResult,
  note: ReadingNoteResult
): ReadingObservation | null {
  const correct = note.attempts.findLast((attempt) => attempt.playedMidi === note.expectedMidi);
  if (!correct) return null;
  return {
    runId: result.runId ?? result.id,
    noteId: note.noteId,
    purpose: readingPurpose(result),
    completedAt: result.completedAt ?? result.createdAt,
    expectedMidi: note.expectedMidi,
    inputSource: correct.inputSource,
    firstAttemptCorrect: note.firstAttemptCorrect,
    independentCorrect: note.independentCorrect,
    unassistedSolved: note.unassistedSolved,
    newMaterial:
      result.provenance === "native" &&
      result.newMaterial === true &&
      (readingPurpose(result) === "check" || readingPurpose(result) === "delayed-check"),
    firstLatencyMs: knownLatency(note.attempts[0]?.responseLatencyMs),
    responseLatencyMs: knownLatency(note.responseLatencyMs),
    errorCount: note.attempts.filter((attempt) => attempt.playedMidi !== note.expectedMidi).length
  };
}

/** Idempotent reduction; detailed history can be trimmed without deleting the profile. */
export function addReadingResult(profile: ReadingProfile, result: ReadingResult): ReadingProfile {
  if (result.skillId && result.skillId !== "note-reading") return profile;
  const runId = result.runId ?? result.id;
  if (profile.processedRunIds.includes(runId)) return profile;
  const observations = [...profile.observations];
  for (const note of result.notes) {
    const entry = readingResultObservation(result, note);
    if (entry) observations.push(entry);
  }
  observations.sort((a, b) => a.completedAt - b.completedAt);
  const kept: ReadingObservation[] = [];
  const counts = new Map<string, number>();
  for (const entry of observations.toReversed()) {
    const key = `${String(entry.expectedMidi)}:${entry.purpose}:${entry.inputSource}`;
    const count = counts.get(key) ?? 0;
    if (count >= READING_OBSERVATION_WINDOW) continue;
    counts.set(key, count + 1);
    kept.push(entry);
  }
  const purpose = readingPurpose(result);
  const check = purpose === "check" || purpose === "delayed-check";
  const balanced = !result.plan || result.plan.counts.every((count) => count === 4);
  const dueAt = (result.completedAt ?? result.createdAt) + READING_REPEAT_INTERVAL_MS;
  return {
    observations: kept.reverse(),
    lastIndependent: readingIndependentDates(observations, profile.lastIndependent),
    processedRunIds: [...profile.processedRunIds, runId],
    delayedDueAt:
      check && balanced ? Math.max(profile.delayedDueAt ?? dueAt, dueAt) : profile.delayedDueAt
  };
}

export function readingMedian(values: readonly (number | null)[]): number | null {
  const sorted = values
    .filter((value): value is number => value !== null)
    .toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

interface SummaryEntry extends ReadingObservation {
  readonly newMaterial?: boolean;
}

function metrics(entries: readonly SummaryEntry[]): ReadingMetrics {
  const independent = entries.filter((entry) => entry.independentCorrect);
  return {
    observationCount: entries.length,
    errorCount: entries.reduce((sum, entry) => sum + entry.errorCount, 0),
    firstAttemptCorrectCount: entries.filter((entry) => entry.firstAttemptCorrect).length,
    independentCorrectCount: independent.length,
    unassistedSolvedCount: entries.filter((entry) => entry.unassistedSolved).length,
    independentRate: entries.length ? independent.length / entries.length : null,
    firstLatencyMs: readingMedian(entries.map((entry) => entry.firstLatencyMs)),
    responseLatencyMs: readingMedian(entries.map((entry) => entry.responseLatencyMs)),
    independentLatencyMs: readingMedian(independent.map((entry) => entry.firstLatencyMs)),
    newMaterialCount: entries.filter((entry) => entry.newMaterial).length
  };
}

export function summarizeReadingObservations(
  observations: readonly SummaryEntry[],
  source: ReadingSourceFilter,
  purpose?: ReadingPurpose,
  pitches: readonly number[] = READING_PITCHES,
  purposes: readonly ReadingPurpose[] = READING_PURPOSES
): ReadingSummary {
  const entries = observations.filter((entry) => source === "all" || entry.inputSource === source);
  const rows = (selected: readonly SummaryEntry[]) =>
    pitches.map((expectedMidi) => ({
      expectedMidi,
      ...metrics(selected.filter((entry) => entry.expectedMidi === expectedMidi))
    }));
  // Phrase notes are visible in advance, so their latency is never a recognition aggregate.
  const selected = entries.filter((entry) =>
    purpose ? entry.purpose === purpose : entry.purpose !== "phrases"
  );
  return {
    source,
    purpose: purpose ?? null,
    rows: rows(selected),
    totals: metrics(selected),
    byPurpose: purposes.map((current) => {
      const grouped = entries.filter((entry) => entry.purpose === current);
      return { purpose: current, rows: rows(grouped), totals: metrics(grouped) };
    })
  };
}

export function summarizeReadingProfile(
  profile: ReadingProfile,
  source: ReadingSourceFilter = "all",
  purpose?: ReadingPurpose
): ReadingSummary {
  return summarizeReadingObservations(profile.observations, source, purpose);
}

export function summarizeReadingResults(
  results: readonly ReadingResult[],
  source: ReadingSourceFilter = "all",
  purpose?: ReadingPurpose
): ReadingSummary {
  const seen = new Set<string>();
  const entries: SummaryEntry[] = [];
  for (const result of results) {
    if (result.skillId && result.skillId !== "note-reading") continue;
    const runId = result.runId ?? result.id;
    if (seen.has(runId)) continue;
    seen.add(runId);
    for (const note of result.notes) {
      const entry = readingResultObservation(result, note);
      if (entry) entries.push(entry);
    }
  }
  return summarizeReadingObservations(entries, source, purpose);
}
