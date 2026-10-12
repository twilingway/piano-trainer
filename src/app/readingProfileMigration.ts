import { readingIndependentDates } from "../reading/progress";
import type {
  ReadingObservation,
  ReadingIndependentDate,
  ReadingProfile
} from "../reading/progressTypes";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullableFinite = (value: unknown) => value === null || finite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const purpose = (value: unknown) =>
  ["notes", "phrases", "check", "adaptive", "delayed-check"].includes(String(value));
const source = (value: unknown) => ["midi", "keyboard", "pointer"].includes(String(value));
const unique = (values: readonly string[]) => [...new Set(values)];
export function validObservation(value: unknown): value is ReadingObservation {
  const row = object(value);
  return (
    text(row.runId) &&
    text(row.noteId) &&
    purpose(row.purpose) &&
    finite(row.completedAt) &&
    finite(row.expectedMidi) &&
    [60, 62, 64, 65, 67].includes(row.expectedMidi) &&
    source(row.inputSource) &&
    [row.firstAttemptCorrect, row.independentCorrect, row.unassistedSolved].every(
      (flag) => typeof flag === "boolean"
    ) &&
    nullableFinite(row.firstLatencyMs) &&
    nullableFinite(row.responseLatencyMs) &&
    finite(row.errorCount) &&
    Number.isInteger(row.errorCount)
  );
}

export function validIndependentDate(value: unknown): value is ReadingIndependentDate {
  const row = object(value);
  return (
    finite(row.expectedMidi) &&
    [60, 62, 64, 65, 67].includes(row.expectedMidi) &&
    source(row.inputSource) &&
    finite(row.completedAt)
  );
}

/** Compact observations survive detailed-history pruning. */
export function mergeReadingProfiles(
  saved: ReadingProfile,
  incoming: ReadingProfile
): ReadingProfile {
  const observations = new Map<string, ReadingObservation>();
  for (const row of [...saved.observations, ...incoming.observations]) {
    const key = JSON.stringify([row.runId, row.noteId]);
    if (!observations.has(key)) observations.set(key, row);
  }
  const groups = new Map<string, ReadingObservation[]>();
  for (const row of [...observations.values()].sort(
    (a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId)
  )) {
    const key = JSON.stringify([row.expectedMidi, row.purpose, row.inputSource]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group.slice(-20));
  }
  const due = [saved.delayedDueAt, incoming.delayedDueAt].filter(finite);
  return {
    observations: [...groups.values()]
      .flat()
      .sort(
        (a, b) =>
          a.completedAt - b.completedAt ||
          a.runId.localeCompare(b.runId) ||
          a.noteId.localeCompare(b.noteId)
      ),
    lastIndependent: readingIndependentDates(
      [...observations.values()],
      [...saved.lastIndependent, ...incoming.lastIndependent]
    ),
    processedRunIds: unique([...saved.processedRunIds, ...incoming.processedRunIds]),
    delayedDueAt: due.length ? Math.max(...due) : null
  };
}
