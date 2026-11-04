import { validSongCourseEvidence } from "./evidence";
import { gradeSongCourseAttempt } from "./rubric";
import type { CourseNoteGrade, SongCourseResult, SongCourseSource, SongCourseNode } from "./model";
const noteProof = (note: CourseNoteGrade) => [
  note.sourceNoteId,
  note.phraseId,
  note.pitch,
  note.measureIndex,
  note.matched,
  note.onsetOffsetMs,
  note.onsetCorrect,
  note.heldMs,
  note.holdCorrect,
  note.mistakes
];
/** Evidence is replayed with its stored rubric context; aggregate percentages cannot replace it. */
export function songCourseEvidenceMatches(result: SongCourseResult): boolean {
  const evidence = result.evidence;
  if (!validSongCourseEvidence(evidence)) return false;
  try {
    const replay = gradeSongCourseAttempt(
      {
        runId: result.runId,
        songId: result.songId,
        sourceRevision: result.sourceRevision,
        sourceHash: result.sourceHash,
        nodeId: result.nodeId,
        mode: result.mode,
        speed: result.speed,
        rubricVariant: result.rubricVariant,
        learnerPartIds: evidence.learnerPartIds,
        expected: evidence.expected
      },
      { ...evidence, createdAt: result.createdAt, invalidReasons: result.invalidReasons }
    );
    return (
      result.expectedCount === replay.expectedCount &&
      result.extraCount === replay.extraCount &&
      result.notes.length === replay.notes.length &&
      result.notes.every(
        (note, index) =>
          JSON.stringify(noteProof(note)) ===
          JSON.stringify(replay.notes[index] && noteProof(replay.notes[index]))
      ) &&
      JSON.stringify(result.mistakePhraseIds) === JSON.stringify(replay.mistakePhraseIds)
    );
  } catch {
    return false;
  }
}
/** Completion belongs to the exact registered node and learner roles, never a valid subset. */
export function songCourseEvidenceMatchesNode(
  result: SongCourseResult,
  source: SongCourseSource,
  node: SongCourseNode
): boolean {
  const evidence = result.evidence;
  if (
    !validSongCourseEvidence(evidence) ||
    evidence.learnerPartIds.length !== source.learnerPartIds.length ||
    !evidence.learnerPartIds.every((part) => source.learnerPartIds.includes(part))
  )
    return false;
  const expectedIds = new Set(
    node.sourceNoteIds.map((id) => `${source.id}@${source.revision}:${id}`)
  );
  return (
    evidence.expected.length === expectedIds.size &&
    evidence.expected.every((note) => expectedIds.has(note.sourceNoteId))
  );
}
