import {
  futureSongCourseEvidence,
  freezeSongCourseResult,
  validSongCourseEvidence
} from "./evidence";
import { songCourseEvidenceMatches, songCourseEvidenceMatchesNode } from "./evidenceProof";
import {
  LEGACY_SONG_COURSE_RUBRIC_VERSION,
  ACHIEVEMENT_SONG_COURSE_RUBRIC_VERSION,
  SONG_COURSE_RUBRIC_VERSION,
  type CourseNoteGrade,
  type SongCourseProgress,
  type SongCourseResult,
  type SongCourseSelection,
  type SongCourseSource
} from "./model";
import { starsForCourseAxes } from "./rubric";

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegativeInteger = (value: unknown): value is number =>
  finite(value) && Number.isInteger(value) && value >= 0;
const same = (a: number, b: number) => Math.abs(a - b) < 1e-7;

export function validSongCourseSelection(value: unknown): value is SongCourseSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    text(v.songId) &&
    text(v.sourceRevision) &&
    text(v.sourceHash) &&
    /^[a-f0-9]{64}$/i.test(v.sourceHash) &&
    text(v.nodeId)
  );
}

function validNote(value: unknown): value is CourseNoteGrade {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    text(v.sourceNoteId) &&
    text(v.phraseId) &&
    nonnegativeInteger(v.pitch) &&
    v.pitch <= 127 &&
    nonnegativeInteger(v.measureIndex) &&
    typeof v.matched === "boolean" &&
    (v.onsetOffsetMs === null || finite(v.onsetOffsetMs)) &&
    (v.onsetCorrect === null || typeof v.onsetCorrect === "boolean") &&
    (v.heldMs === null || (finite(v.heldMs) && v.heldMs >= 0)) &&
    typeof v.holdCorrect === "boolean" &&
    Array.isArray(v.mistakes) &&
    v.mistakes.every((kind) => kind === "pitch" || kind === "onset" || kind === "hold") &&
    new Set(v.mistakes).size === v.mistakes.length
  );
}

/** Stored stars are checked against their axes and note-level proof, never trusted alone. */
export function validSongCourseResult(value: unknown): value is SongCourseResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.schemaVersion !== 1 ||
    !validSongCourseEvidence(v.evidence) ||
    (v.rubricVersion !== SONG_COURSE_RUBRIC_VERSION &&
      v.rubricVersion !== LEGACY_SONG_COURSE_RUBRIC_VERSION &&
      v.rubricVersion !== ACHIEVEMENT_SONG_COURSE_RUBRIC_VERSION) ||
    (v.introductory !== undefined &&
      (v.introductory !== true || v.rubricVersion !== SONG_COURSE_RUBRIC_VERSION)) ||
    (v.rubricVariant !== "normal" && v.rubricVariant !== "learning-review") ||
    ![v.runId, v.songId, v.sourceRevision, v.nodeId].every(text) ||
    !text(v.sourceHash) ||
    !/^[a-f0-9]{64}$/i.test(v.sourceHash) ||
    (v.mode !== "wait" && v.mode !== "tempo") ||
    !finite(v.speed) ||
    v.speed <= 0 ||
    !finite(v.createdAt) ||
    v.createdAt < 0 ||
    !nonnegativeInteger(v.expectedCount) ||
    !v.expectedCount ||
    !nonnegativeInteger(v.extraCount) ||
    !Array.isArray(v.notes) ||
    !v.notes.every(validNote) ||
    v.notes.length !== v.expectedCount ||
    !Array.isArray(v.invalidReasons) ||
    !v.invalidReasons.every(text) ||
    !Array.isArray(v.mistakePhraseIds) ||
    !v.mistakePhraseIds.every(text) ||
    typeof v.valid !== "boolean" ||
    typeof v.completed !== "boolean" ||
    !finite(v.pitch) ||
    !finite(v.hold) ||
    (v.onset !== null && !finite(v.onset))
  )
    return false;
  const notes = v.notes;
  const phraseIds = new Set(notes.map((note) => note.phraseId));
  if (
    new Set(notes.map((note) => note.sourceNoteId)).size !== notes.length ||
    new Set(v.invalidReasons).size !== v.invalidReasons.length ||
    new Set(v.mistakePhraseIds).size !== v.mistakePhraseIds.length ||
    !v.mistakePhraseIds.every((id) => phraseIds.has(id))
  )
    return false;
  const windowMs = v.rubricVariant === "normal" ? 150 : 300;
  for (const note of notes) {
    if (!note.sourceNoteId.startsWith(`${String(v.songId)}@${String(v.sourceRevision)}:`))
      return false;
    if (!note.matched && (note.heldMs !== null || note.holdCorrect || note.onsetOffsetMs !== null))
      return false;
    if (note.holdCorrect && note.heldMs === null) return false;
    if (v.mode === "wait") {
      if (note.onsetCorrect !== null || note.onsetOffsetMs !== null) return false;
    } else if (
      note.onsetCorrect !==
      (note.onsetOffsetMs !== null && Math.abs(note.onsetOffsetMs) <= windowMs + 1e-7)
    )
      return false;
    const mistakes = [
      !note.matched && "pitch",
      note.onsetCorrect === false && "onset",
      !note.holdCorrect && "hold"
    ].filter(Boolean);
    if (
      JSON.stringify(note.mistakes) !== JSON.stringify(mistakes) ||
      (mistakes.length && !v.mistakePhraseIds.includes(note.phraseId))
    )
      return false;
  }
  const pitch = (100 * notes.filter((note) => note.matched).length) / (notes.length + v.extraCount);
  const onset =
    v.mode === "wait"
      ? null
      : (100 * notes.filter((note) => note.onsetCorrect).length) / notes.length;
  const hold = (100 * notes.filter((note) => note.holdCorrect).length) / notes.length;
  if (
    !same(v.pitch, pitch) ||
    !same(v.hold, hold) ||
    (onset === null ? v.onset !== null : v.onset === null || !same(v.onset, onset))
  )
    return false;
  const valid = v.invalidReasons.length === 0;
  const stars = valid
    ? starsForCourseAxes(pitch, onset, hold, v.rubricVersion, v.introductory === true)
    : 0;
  return (
    v.valid === valid &&
    v.stars === stars &&
    v.completed === (valid && stars > 0) &&
    songCourseEvidenceMatches(v as unknown as SongCourseResult)
  );
}

export function emptySongCourseProgress(): SongCourseProgress {
  return { schemaVersion: 1, selection: null, results: [] };
}
export function futureSongCourseProgress(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return (
    (typeof raw.schemaVersion === "number" && raw.schemaVersion > 1) ||
    (Array.isArray(raw.results) &&
      raw.results.some(
        (result: unknown) =>
          !!result &&
          typeof result === "object" &&
          "evidence" in result &&
          futureSongCourseEvidence(result.evidence)
      ))
  );
}
export function readSongCourseProgress(value: unknown): SongCourseProgress {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1
  )
    return emptySongCourseProgress();
  const v = value as Record<string, unknown>;
  const results = new Map<string, SongCourseResult>();
  if (Array.isArray(v.results))
    for (const result of v.results) {
      if (validSongCourseResult(result) && !results.has(result.runId))
        results.set(result.runId, freezeSongCourseResult(result));
    }
  return {
    schemaVersion: 1,
    selection: validSongCourseSelection(v.selection) ? v.selection : null,
    results: [...results.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.runId.localeCompare(b.runId)
    )
  };
}

export function songCourseCompletionKey(
  result: Pick<
    SongCourseResult,
    | "songId"
    | "sourceRevision"
    | "sourceHash"
    | "nodeId"
    | "rubricVersion"
    | "rubricVariant"
    | "mode"
  >
): string {
  return JSON.stringify([
    result.songId,
    result.sourceRevision,
    result.sourceHash,
    result.nodeId,
    result.rubricVersion,
    result.rubricVariant,
    result.mode
  ]);
}

export function mergeSongCourseProgress(
  saved: unknown,
  local: SongCourseProgress,
  selectionChanged = false
): SongCourseProgress {
  if (futureSongCourseProgress(saved)) throw new Error("Unsupported song course schema");
  const previous = readSongCourseProgress(saved);
  const results = new Map(previous.results.map((result) => [result.runId, result]));
  for (const result of readSongCourseProgress(local).results)
    if (!results.has(result.runId)) results.set(result.runId, result);
  const history = [...results.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.runId.localeCompare(b.runId)
  );
  const proofs = new Map<string, SongCourseResult>();
  for (const result of history)
    if (result.completed) {
      const key = songCourseCompletionKey(result);
      const before = proofs.get(key);
      if (!before || result.stars > before.stars) proofs.set(key, result);
    }
  const retained = new Set([...history.slice(-96), ...proofs.values()]);
  return {
    schemaVersion: 1,
    selection: selectionChanged ? readSongCourseProgress(local).selection : previous.selection,
    results: history.filter((result) => retained.has(result))
  };
}

export function completedSongCourseNodes(
  progress: SongCourseProgress,
  source: SongCourseSource
): readonly string[] {
  return source.nodes
    .filter((node) =>
      progress.results.some(
        (result) =>
          validSongCourseResult(result) &&
          songCourseEvidenceMatchesNode(result, source, node) &&
          result.completed &&
          result.songId === source.id &&
          result.sourceRevision === source.revision &&
          result.sourceHash === source.sourceHash &&
          result.nodeId === node.id &&
          result.rubricVariant === "normal" &&
          (node.kind === "performance"
            ? result.mode === "tempo"
            : node.kind === "review"
              ? result.mode === "wait"
              : true)
      )
    )
    .map((node) => node.id);
}
