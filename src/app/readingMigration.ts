import type { ReadingPersistentField } from "./readingPersistentFields";
export { changedReadingFields, type ReadingPersistentField } from "./readingPersistentFields";
import { emptyIndependentRhythmState } from "./independentRhythmPersistence";
import { READING_COURSE_STORES, courseSlot, type ReadingCourseStates } from "./courseStores";
import { normalizeReadingCourses } from "./readingCourseMigration";
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingResult,
  type ReadingTask
} from "../reading/types";
import { addReadingResult, emptyReadingProfile, readingPurpose } from "../reading/progress";
import type { ReadingPlan, ReadingSourceFilter } from "../reading/progressTypes";
import type { ReadingState } from "./readingSlice";
import { emptyIntervalState } from "./intervalPersistence";
import { emptyRhythmState } from "./rhythmPersistence";
import { emptyHeldBassState } from "./heldBassPersistence";
import { emptyBassState } from "./bassPersistence";
import { emptyTwoHandState } from "./twoHandPersistence";
import {
  validObservation,
  validIndependentDate,
  mergeReadingProfiles
} from "./readingProfileMigration";
export { mergeReadingProfiles } from "./readingProfileMigration";

export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const task = (value: unknown): value is ReadingTask =>
  ["notes", "phrases", "check"].includes(String(value));
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullableFinite = (value: unknown) => value === null || finite(value);
const pitch = (value: unknown) => finite(value) && Number.isInteger(value) && value <= 127;
const level = (value: unknown) => value === 0 || value === 1 || value === 2;
const source = (value: unknown) => ["midi", "keyboard", "pointer"].includes(String(value));
const purpose = (value: unknown) =>
  ["notes", "phrases", "check", "adaptive", "delayed-check"].includes(String(value));
const filter = (value: unknown): value is ReadingSourceFilter => value === "all" || source(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const unique = (values: readonly string[]) => [...new Set(values)];
export const readingJournal = (values: readonly string[]) =>
  unique(values.toReversed()).reverse().slice(-256);

function normalizePreferences(value: unknown) {
  const row = object(value);
  const delay = (value: unknown, fallback: number) =>
    finite(value) ? Math.max(1000, Math.min(60000, value)) : fallback;
  const nameDelayMs = delay(row.nameDelayMs, DEFAULT_READING_PREFERENCES.nameDelayMs);
  return {
    automaticHints: typeof row.automaticHints === "boolean" ? row.automaticHints : true,
    nameDelayMs,
    keyDelayMs: Math.max(nameDelayMs, delay(row.keyDelayMs, DEFAULT_READING_PREFERENCES.keyDelayMs))
  };
}

function normalizePlan(value: unknown, selectedTask?: ReadingTask | null): ReadingPlan | null {
  const row = object(value);
  if (
    !purpose(row.purpose) ||
    !filter(row.source) ||
    ![1, 2].includes(Number(row.generatorVersion)) ||
    typeof row.generatorVersion !== "number" ||
    row.policyVersion !== 1 ||
    !Array.isArray(row.counts) ||
    row.counts.length !== 5 ||
    !row.counts.every((count) => finite(count) && Number.isInteger(count) && count >= 2) ||
    row.counts.reduce((sum: number, count: number) => sum + count, 0) !== 20
  )
    return null;
  if (row.purpose !== "adaptive" && !row.counts.every((count) => count === 4)) return null;
  if (
    selectedTask !== undefined &&
    (selectedTask === null ||
      (selectedTask === "notes" && row.purpose !== "notes" && row.purpose !== "adaptive") ||
      (selectedTask === "phrases" && row.purpose !== "phrases") ||
      (selectedTask === "check" && row.purpose !== "check" && row.purpose !== "delayed-check"))
  )
    return null;
  return row as unknown as ReadingPlan;
}

function validResult(value: unknown): value is ReadingResult {
  const row = object(value);
  if (
    (row.skillId !== undefined && row.skillId !== "note-reading") ||
    !text(row.id) ||
    !text(row.exerciseId) ||
    !task(row.task) ||
    !finite(row.seed) ||
    !finite(row.createdAt) ||
    !Array.isArray(row.notes) ||
    row.notes.length !== 20
  )
    return false;
  if (row.plan !== undefined && row.plan !== null && !normalizePlan(row.plan, row.task))
    return false;
  return row.notes.every((value) => {
    const note = object(value);
    if (
      !text(note.noteId) ||
      !finite(note.expectedMidi) ||
      ![60, 62, 64, 65, 67].includes(note.expectedMidi) ||
      ![note.firstAttemptCorrect, note.independentCorrect, note.unassistedSolved].every(
        (flag) => typeof flag === "boolean"
      ) ||
      !finite(note.responseLatencyMs) ||
      !level(note.hintLevel) ||
      !Array.isArray(note.attempts) ||
      note.attempts.length === 0
    )
      return false;
    if (
      row.provenance === "native" &&
      (!Array.isArray(note.hintHistory) ||
        !note.hintHistory.every((value) => {
          const hint = object(value);
          return finite(hint.atMs) && level(hint.level);
        }))
    )
      return false;
    return note.attempts.every((value) => {
      const attempt = object(value);
      return (
        attempt.noteId === note.noteId &&
        attempt.exerciseId === row.exerciseId &&
        attempt.expectedMidi === note.expectedMidi &&
        pitch(attempt.playedMidi) &&
        finite(attempt.responseLatencyMs) &&
        finite(attempt.atMs) &&
        level(attempt.hintLevel) &&
        source(attempt.inputSource)
      );
    });
  });
}

function migrateResult(value: ReadingResult): ReadingResult {
  const row = object(value);
  const runId = text(row.runId) ? row.runId : value.id;
  const native = row.provenance === "native";
  let attemptIndex = 0;
  return {
    ...value,
    skillId: "note-reading",
    runId,
    startedAt: row.startedAt === null || finite(row.startedAt) ? row.startedAt : null,
    completedAt: finite(row.completedAt) ? row.completedAt : value.createdAt,
    provenance: native ? "native" : "legacy",
    newMaterial: native && row.newMaterial === true,
    plan: normalizePlan(row.plan),
    notes: value.notes.map((note) => {
      const details = object(note);
      const hintHistory =
        Array.isArray(details.hintHistory) &&
        details.hintHistory.every((event) => {
          const hint = object(event);
          return finite(hint.atMs) && level(hint.level);
        })
          ? details.hintHistory
          : null;
      return {
        ...note,
        presentedAtMs:
          details.presentedAtMs === null || finite(details.presentedAtMs)
            ? details.presentedAtMs
            : null,
        hintHistory: hintHistory as Exclude<
          ReadingResult["notes"][number]["hintHistory"],
          undefined
        >,
        attempts: note.attempts.map((attempt) => ({
          ...attempt,
          skillId: "note-reading",
          runId,
          attemptId: text(object(attempt).attemptId)
            ? (object(attempt).attemptId as string)
            : `${runId}:${String(attemptIndex++)}`
        }))
      };
    })
  };
}

export function emptyReadingState(): ReadingState {
  return {
    schemaVersion: 8,
    activeCourse: null,
    intervals: emptyIntervalState(),
    rhythm: emptyRhythmState(),
    bass: emptyBassState(),
    coordination: emptyTwoHandState(),
    heldBass: emptyHeldBassState(),
    independentRhythm: emptyIndependentRhythmState(),
    selectionRevision: 0,
    task: null,
    seed: 1,
    preferences: DEFAULT_READING_PREFERENCES,
    history: [],
    plan: null,
    sourceFilter: "all",
    profile: emptyReadingProfile(),
    presentedFingerprints: []
  };
}

export function normalizeReadingState(value: unknown): {
  reading: ReadingState;
  invalid: boolean;
  blocked: boolean;
} {
  const reading = emptyReadingState();
  if (value === undefined) return { reading, invalid: false, blocked: false };
  const row = object(value);
  if (typeof row.schemaVersion === "number" && row.schemaVersion > 8)
    return { reading, invalid: false, blocked: true };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (row.schemaVersion !== undefined &&
      ![1, 2, 3, 4, 5, 6, 7, 8].includes(row.schemaVersion as number))
  )
    return { reading, invalid: true, blocked: false };
  reading.task = task(row.task) ? row.task : null;
  const modern = [3, 4, 5, 6, 7, 8].includes(row.schemaVersion as number);
  const { invalid: coursesInvalid, ...courses } = normalizeReadingCourses(row, reading.task);
  Object.assign(reading, courses);
  reading.seed = finite(row.seed) ? row.seed >>> 0 : 1;
  reading.preferences = normalizePreferences(row.preferences);
  reading.sourceFilter = filter(row.sourceFilter) ? row.sourceFilter : "all";
  reading.plan = normalizePlan(row.plan, reading.task);
  const history = Array.isArray(row.history) ? row.history : [];
  let invalid =
    coursesInvalid ||
    (row.plan !== undefined && row.plan !== null && reading.plan === null) ||
    history.some((result) => !validResult(result));
  const migrated = history.filter(validResult).map(migrateResult);
  const deduped = [
    ...new Map(migrated.map((result) => [result.runId ?? result.id, result])).values()
  ];
  reading.history = (["notes", "phrases", "check", "adaptive", "delayed-check"] as const).flatMap(
    (purpose) => deduped.filter((result) => readingPurpose(result) === purpose).slice(-20)
  );
  const profile = object(row.profile);
  const observations = Array.isArray(profile.observations) ? profile.observations : [];
  const dates = Array.isArray(profile.lastIndependent) ? profile.lastIndependent : [];
  invalid ||= dates.some((entry) => !validIndependentDate(entry));
  invalid ||= observations.some((entry) => !validObservation(entry));
  reading.profile = mergeReadingProfiles(emptyReadingProfile(), {
    observations: observations.filter(validObservation),
    lastIndependent: dates.filter(validIndependentDate),
    processedRunIds: Array.isArray(profile.processedRunIds)
      ? unique(profile.processedRunIds.filter(text))
      : [],
    delayedDueAt: finite(profile.delayedDueAt) ? profile.delayedDueAt : null
  });
  const preservedProfile =
    (row.schemaVersion === 2 || modern) &&
    Array.isArray(profile.observations) &&
    observations.every(validObservation) &&
    Array.isArray(profile.lastIndependent) &&
    dates.every(validIndependentDate) &&
    Array.isArray(profile.processedRunIds) &&
    profile.processedRunIds.every(text) &&
    nullableFinite(profile.delayedDueAt) &&
    deduped.every((result) => reading.profile.processedRunIds.includes(result.runId ?? result.id));
  if (preservedProfile) {
    reading.profile = {
      observations: observations.filter(validObservation),
      lastIndependent: dates.filter(validIndependentDate),
      processedRunIds: (profile.processedRunIds as string[]).slice(),
      delayedDueAt: profile.delayedDueAt as number | null
    };
  }
  // P2 already has its compact profile; migration must not reassess its completed runs.
  for (const result of deduped) {
    if (!reading.profile.processedRunIds.includes(result.runId ?? result.id))
      reading.profile = addReadingResult(reading.profile, result);
  }
  if (!preservedProfile)
    reading.profile = mergeReadingProfiles(emptyReadingProfile(), reading.profile);
  const fingerprints = Array.isArray(row.presentedFingerprints)
    ? row.presentedFingerprints.filter(text)
    : [];
  for (const result of (row.schemaVersion === 2 || modern) &&
  Array.isArray(row.presentedFingerprints)
    ? []
    : deduped) {
    // The v1 id proves this order was shown, but does not prove its original novelty.
    if (result.exerciseId === `reading-v1-${result.task}-${String(result.seed >>> 0)}`)
      fingerprints.push(result.notes.map((note) => note.expectedMidi).join(","));
  }
  reading.presentedFingerprints = readingJournal(fingerprints);
  return { reading, invalid, blocked: false };
}

export function mergeReadingState(
  saved: ReadingState,
  incoming: ReadingState,
  fields: readonly ReadingPersistentField[] = [
    "selection",
    "activeCourse",
    "intervalSelection",
    "intervalSourceFilter",
    "rhythmSelection",
    "bassSelection",
    "bassSourceFilter",
    "twoHandSelection",
    "twoHandSourceFilter",
    "heldBassSelection",
    "heldBassSourceFilter",
    "independentRhythmSelection",
    "independentRhythmSource",
    "independentRhythmSourceFilter",
    "independentRhythmKeyHints",
    "automaticHints",
    "nameDelayMs",
    "keyDelayMs",
    "sourceFilter"
  ]
): ReadingState {
  const selection = fields.includes("selection") ? incoming : saved;
  const courses: Record<string, unknown> = {};
  for (const course of READING_COURSE_STORES) {
    const own = courseSlot(saved, course.key);
    const theirs = courseSlot(incoming, course.key);
    const merged = { ...(fields.includes(course.selection.field) ? theirs : own) };
    for (const { field, key } of course.preferences)
      merged[key as string] = fields.includes(field) ? theirs[key as string] : own[key as string];
    merged.history = course.mergeHistory(own.history as never, theirs.history as never);
    courses[course.key] = merged;
  }
  const preferences = { ...saved.preferences };
  for (const key of ["automaticHints", "nameDelayMs", "keyDelayMs"] as const) {
    if (fields.includes(key)) Object.assign(preferences, { [key]: incoming.preferences[key] });
  }
  const history = [
    ...new Map(
      [...saved.history, ...incoming.history].map((result) => [result.runId ?? result.id, result])
    ).values()
  ].sort((a, b) => (a.completedAt ?? a.createdAt) - (b.completedAt ?? b.createdAt));
  return {
    schemaVersion: 8,
    activeCourse: fields.includes("activeCourse") ? incoming.activeCourse : saved.activeCourse,
    ...(courses as unknown as ReadingCourseStates),
    selectionRevision: incoming.selectionRevision,
    task: selection.task,
    seed: selection.seed,
    plan: selection.plan,
    preferences: normalizePreferences(preferences),
    sourceFilter: fields.includes("sourceFilter") ? incoming.sourceFilter : saved.sourceFilter,
    history: (["notes", "phrases", "check", "adaptive", "delayed-check"] as const).flatMap(
      (purpose) => history.filter((result) => readingPurpose(result) === purpose).slice(-20)
    ),
    profile: mergeReadingProfiles(saved.profile, incoming.profile),
    presentedFingerprints: readingJournal([
      ...saved.presentedFingerprints,
      ...incoming.presentedFingerprints
    ])
  };
}
