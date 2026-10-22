import { bassReadingSequenceForSeed } from "./bassGenerator";
import type { ReadingResult } from "./types";

export const BASS_READING_SKILL_ID = "bass-note-reading";
export type BassReadingTask = "notes" | "phrases";

export interface BassReadingResult extends ReadingResult {
  readonly skillId: typeof BASS_READING_SKILL_ID;
  readonly task: BassReadingTask;
  readonly generatorVersion: 1;
  readonly runId: string;
  readonly startedAt: number | null;
  readonly completedAt: number;
  readonly provenance: "native";
  readonly newMaterial: false;
  readonly plan: null;
}

/** Narrow a completed shared-session result without parsing XML or discarding evidence. */
export function toBassReadingResult(result: ReadingResult | null): BassReadingResult | null {
  if (
    result?.skillId !== BASS_READING_SKILL_ID ||
    result.generatorVersion !== 1 ||
    (result.task !== "notes" && result.task !== "phrases") ||
    !Number.isInteger(result.seed) ||
    result.seed < 0 ||
    result.seed > 0xffffffff ||
    result.exerciseId !== `bass-reading-v1-${result.task}-${String(result.seed)}` ||
    result.notes.length !== 20 ||
    !result.runId ||
    result.startedAt === undefined ||
    result.completedAt === undefined ||
    result.provenance !== "native" ||
    result.newMaterial !== false ||
    result.plan !== null
  )
    return null;
  const sequence = bassReadingSequenceForSeed(result.seed);
  const runId = result.runId;
  const attemptIds = new Set<string>();
  for (const [index, note] of result.notes.entries()) {
    const final = note.attempts.at(-1);
    if (
      note.noteId !== `p0n${String(index)}` ||
      note.expectedMidi !== sequence[index] ||
      final?.playedMidi !== note.expectedMidi ||
      note.responseLatencyMs !== final.responseLatencyMs ||
      note.hintLevel !== final.hintLevel ||
      note.firstAttemptCorrect !== (note.attempts.length === 1) ||
      note.independentCorrect !== (note.attempts.length === 1 && final.hintLevel === 0) ||
      note.unassistedSolved !== (final.hintLevel === 0)
    )
      return null;
    let previousAt = note.presentedAtMs ?? 0;
    let previousLatency = 0;
    for (const [attackIndex, attack] of note.attempts.entries()) {
      if (
        attack.skillId !== BASS_READING_SKILL_ID ||
        attack.runId !== runId ||
        attack.exerciseId !== result.exerciseId ||
        attack.noteId !== note.noteId ||
        attack.expectedMidi !== note.expectedMidi ||
        !attack.attemptId ||
        attemptIds.has(attack.attemptId) ||
        !Number.isInteger(attack.playedMidi) ||
        attack.playedMidi < 0 ||
        attack.playedMidi > 127 ||
        !["midi", "keyboard", "pointer"].includes(attack.inputSource) ||
        !Number.isFinite(attack.atMs) ||
        attack.atMs < previousAt ||
        !Number.isFinite(attack.responseLatencyMs) ||
        attack.responseLatencyMs < previousLatency ||
        ![0, 1, 2].includes(attack.hintLevel) ||
        (attackIndex < note.attempts.length - 1 && attack.playedMidi === note.expectedMidi)
      )
        return null;
      attemptIds.add(attack.attemptId);
      previousAt = attack.atMs;
      previousLatency = attack.responseLatencyMs;
    }
  }
  return {
    ...result,
    skillId: BASS_READING_SKILL_ID,
    task: result.task,
    generatorVersion: 1,
    runId,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    provenance: "native",
    newMaterial: false,
    plan: null
  };
}
