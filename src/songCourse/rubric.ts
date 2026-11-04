import { createSongCourseEvidence, freezeSongCourseResult } from "./evidence";
import { alignCourseInputs, type CourseAlignment } from "./alignment";
import { gradeCourseHold, physicalPerformanceMs } from "./hold";
import {
  SONG_COURSE_RUBRIC_VERSION,
  type CourseMistakeKind,
  type CourseExpectedNote,
  type CoursePause,
  type SongCourseAttemptConfig,
  type SongCourseGradeEvidence,
  type SongCourseResult
} from "./model";

export function starsForCourseAxes(
  pitch: number,
  onset: number | null,
  hold: number
): 0 | 1 | 2 | 3 {
  if (pitch >= 95 && hold >= 90 && (onset === null || onset >= 90)) return 3;
  const minimum = Math.min(pitch, hold, onset ?? 100);
  return minimum >= 80 ? 2 : minimum >= 60 ? 1 : 0;
}

export function assertCourseAttemptConfig(config: SongCourseAttemptConfig): void {
  if (
    ![config.runId, config.songId, config.sourceRevision, config.nodeId].every(
      (id) => typeof id === "string" && id.length > 0
    ) ||
    !/^[a-f0-9]{64}$/i.test(config.sourceHash) ||
    !config.learnerPartIds.length ||
    config.learnerPartIds.some((id) => !id) ||
    new Set(config.learnerPartIds).size !== config.learnerPartIds.length ||
    !Number.isFinite(config.speed) ||
    config.speed <= 0 ||
    !config.expected.length
  )
    throw new Error("Invalid song course attempt");
  const ids = new Set<string>();
  let previousEnd = -Infinity;
  for (const note of config.expected) {
    if (
      !note.sourceNoteId ||
      ids.has(note.sourceNoteId) ||
      !Number.isInteger(note.pitch) ||
      note.pitch < 0 ||
      note.pitch > 127 ||
      !Number.isFinite(note.start) ||
      note.start < 0 ||
      !Number.isFinite(note.duration) ||
      note.duration <= 0 ||
      note.start + 1e-7 < previousEnd
    )
      throw new Error("Invalid monophonic song course score");
    ids.add(note.sourceNoteId);
    previousEnd = note.start + note.duration;
  }
}

/** Grades the complete evidence stream, independently of the transport's hit window. */
export function gradeSongCourseAttempt(
  config: SongCourseAttemptConfig,
  evidence: SongCourseGradeEvidence
): SongCourseResult {
  assertCourseAttemptConfig(config);
  const invalidReasons = [...new Set(evidence.invalidReasons ?? [])];
  if (
    !Number.isFinite(evidence.musicalEndPerformanceMs) ||
    !Number.isFinite(evidence.closedAtPerformanceMs) ||
    evidence.closedAtPerformanceMs < evidence.musicalEndPerformanceMs ||
    !Number.isFinite(evidence.createdAt) ||
    evidence.createdAt < 0
  )
    invalidReasons.push("invalid-evidence");
  const variant = config.rubricVariant ?? "normal";
  const alignment = alignCourseInputs(
    config.expected,
    evidence.inputs.filter(
      (input) => physicalPerformanceMs(input) <= evidence.closedAtPerformanceMs
    ),
    config.mode,
    config.speed,
    evidence.presentations,
    evidence.musicalEndPerformanceMs
  );
  const notes = config.expected.map((expected) =>
    gradeCourseNote(
      config,
      expected,
      alignment,
      evidence.pauses ?? [],
      evidence.closedAtPerformanceMs
    )
  );
  const count = config.expected.length;
  const pitch = (100 * alignment.primary.size) / (count + alignment.extra.length);
  const onset =
    config.mode === "wait"
      ? null
      : (100 * notes.filter((note) => note.onsetCorrect).length) / count;
  const hold = (100 * notes.filter((note) => note.holdCorrect).length) / count;
  const mistakePhraseIds = new Set(
    notes.filter((note) => note.mistakes.length).map((note) => note.phraseId)
  );
  for (const extra of alignment.extra) {
    const nearest = config.expected.reduce((before, note) =>
      Math.abs(extra.songTime - note.start) < Math.abs(extra.songTime - before.start)
        ? note
        : before
    );
    mistakePhraseIds.add(nearest.phraseId);
  }
  const valid = invalidReasons.length === 0;
  const stars = valid ? starsForCourseAxes(pitch, onset, hold) : 0;
  return freezeSongCourseResult({
    evidence: createSongCourseEvidence(config, evidence),
    schemaVersion: 1,
    rubricVersion: SONG_COURSE_RUBRIC_VERSION,
    rubricVariant: variant,
    runId: config.runId,
    songId: config.songId,
    sourceRevision: config.sourceRevision,
    sourceHash: config.sourceHash,
    nodeId: config.nodeId,
    mode: config.mode,
    speed: config.speed,
    pitch,
    onset,
    hold,
    stars,
    completed: valid && stars > 0,
    valid,
    invalidReasons,
    expectedCount: count,
    extraCount: alignment.extra.length,
    mistakePhraseIds: [...mistakePhraseIds],
    notes,
    createdAt: evidence.createdAt
  });
}

/** One source of truth for both provisional expression and the final immutable result. */
export function gradeCourseNote(
  config: SongCourseAttemptConfig,
  expected: CourseExpectedNote,
  alignment: CourseAlignment,
  pauses: readonly CoursePause[],
  closedAtMs: number
) {
  const timingWindowMs = config.rubricVariant === "learning-review" ? 300 : 150;
  const down = alignment.primary.get(expected.sourceNoteId);
  const onsetOffsetMs =
    config.mode === "tempo" && down
      ? ((down.songTime - expected.start) * 1000) / config.speed
      : null;
  const onsetCorrect =
    config.mode === "wait"
      ? null
      : onsetOffsetMs !== null && Math.abs(onsetOffsetMs) <= timingWindowMs + 1e-7;
  const hold = down
    ? gradeCourseHold(
        expected,
        down,
        alignment.inputs,
        pauses,
        config.speed,
        config.mode,
        closedAtMs
      )
    : null;
  const mistakes: CourseMistakeKind[] = [];
  if (!down) mistakes.push("pitch");
  if (onsetCorrect === false) mistakes.push("onset");
  if (!hold?.correct) mistakes.push("hold");
  return {
    sourceNoteId: expected.sourceNoteId,
    phraseId: expected.phraseId,
    pitch: expected.pitch,
    measureIndex: expected.measureIndex,
    matched: !!down,
    onsetOffsetMs,
    onsetCorrect,
    heldMs: hold?.heldMs ?? null,
    holdCorrect: hold?.correct ?? false,
    mistakes
  };
}
