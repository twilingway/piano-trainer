import { physicalCourseOrder } from "./hold";
import type {
  CourseExpectedNote,
  RawCourseInput,
  CoursePause,
  CoursePresentation,
  SongCourseAttemptConfig,
  SongCourseGradeEvidence,
  SongCourseResult,
  SongCourseRunEvidence
} from "./model";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const integer = (value: unknown): value is number =>
  finite(value) && Number.isInteger(value) && value >= 0;
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
function expectedNote(value: unknown): value is CourseExpectedNote {
  if (!record(value)) return false;
  return (
    text(value.sourceNoteId) &&
    text(value.runtimeNoteId) &&
    integer(value.pitch) &&
    value.pitch <= 127 &&
    finite(value.start) &&
    value.start >= 0 &&
    finite(value.duration) &&
    value.duration > 0 &&
    finite(value.startBeat) &&
    text(value.phraseId) &&
    integer(value.measureIndex)
  );
}
function position(value: Record<string, unknown>): boolean {
  return finite(value.performanceMs) && integer(value.stableOrdinal);
}
function rawInput(value: unknown): value is RawCourseInput {
  if (!record(value)) return false;
  return (
    (value.type === "down" || value.type === "up") &&
    position(value) &&
    text(value.source) &&
    integer(value.pitch) &&
    value.pitch <= 127 &&
    finite(value.songTime) &&
    (value.rawPerformanceMs === undefined || finite(value.rawPerformanceMs)) &&
    optionalBoolean(value.admitted) &&
    optionalBoolean(value.synthetic) &&
    optionalBoolean(value.pauseProtocolAttack) &&
    (value.controlRehold === undefined || text(value.controlRehold))
  );
}
function presentation(value: unknown): value is CoursePresentation {
  return record(value) && position(value) && text(value.sourceNoteId);
}
function pause(value: unknown): value is CoursePause {
  return (
    record(value) &&
    value.type === "pause" &&
    position(value) &&
    optionalBoolean(value.requiresRehold) &&
    (value.sourceNoteId === undefined || text(value.sourceNoteId))
  );
}
export function futureSongCourseEvidence(value: unknown): boolean {
  return record(value) && finite(value.schemaVersion) && value.schemaVersion > 1;
}
export function validSongCourseEvidence(value: unknown): value is SongCourseRunEvidence {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.learnerPartIds) ||
    !value.learnerPartIds.length ||
    !value.learnerPartIds.every(text) ||
    new Set(value.learnerPartIds).size !== value.learnerPartIds.length ||
    !Array.isArray(value.expected) ||
    !value.expected.length ||
    !value.expected.every(expectedNote) ||
    !Array.isArray(value.inputs) ||
    !value.inputs.every(rawInput) ||
    !Array.isArray(value.presentations) ||
    !value.presentations.every(presentation) ||
    !Array.isArray(value.pauses) ||
    !value.pauses.every(pause) ||
    !finite(value.musicalEndPerformanceMs) ||
    !finite(value.closedAtPerformanceMs) ||
    value.closedAtPerformanceMs < value.musicalEndPerformanceMs
  )
    return false;
  const ids = new Set(value.expected.map((note) => note.sourceNoteId));
  return (
    ids.size === value.expected.length &&
    new Set(value.expected.map((note) => note.runtimeNoteId)).size === value.expected.length &&
    value.presentations.every((item) => ids.has(item.sourceNoteId)) &&
    value.pauses.every((item) => item.sourceNoteId === undefined || ids.has(item.sourceNoteId)) &&
    value.inputs.every((item) => item.controlRehold === undefined || ids.has(item.controlRehold))
  );
}
const frozenRecords = <T extends object>(values: readonly T[]) =>
  Object.freeze(values.map((value) => Object.freeze({ ...value })));
export function freezeSongCourseEvidence(value: SongCourseRunEvidence): SongCourseRunEvidence {
  return Object.freeze({
    ...value,
    learnerPartIds: Object.freeze([...value.learnerPartIds]),
    expected: frozenRecords(value.expected),
    inputs: frozenRecords([...value.inputs].sort(physicalCourseOrder)),
    presentations: frozenRecords([...value.presentations].sort(physicalCourseOrder)),
    pauses: frozenRecords([...value.pauses].sort(physicalCourseOrder))
  });
}
export function createSongCourseEvidence(
  config: SongCourseAttemptConfig,
  evidence: SongCourseGradeEvidence
): SongCourseRunEvidence {
  return freezeSongCourseEvidence({
    schemaVersion: 1,
    learnerPartIds: config.learnerPartIds,
    expected: config.expected,
    inputs: evidence.inputs,
    presentations: evidence.presentations ?? [],
    pauses: evidence.pauses ?? [],
    musicalEndPerformanceMs: evidence.musicalEndPerformanceMs,
    closedAtPerformanceMs: evidence.closedAtPerformanceMs
  });
}
export function freezeSongCourseResult(result: SongCourseResult): SongCourseResult {
  return Object.freeze({
    ...result,
    evidence: freezeSongCourseEvidence(result.evidence),
    invalidReasons: Object.freeze([...result.invalidReasons]),
    mistakePhraseIds: Object.freeze([...result.mistakePhraseIds]),
    notes: Object.freeze(
      result.notes.map((note) =>
        Object.freeze({ ...note, mistakes: Object.freeze([...note.mistakes]) })
      )
    )
  });
}
export function freezeSongCourseConfig(config: SongCourseAttemptConfig): SongCourseAttemptConfig {
  return Object.freeze({
    ...config,
    learnerPartIds: Object.freeze([...config.learnerPartIds]),
    expected: frozenRecords(config.expected)
  });
}
