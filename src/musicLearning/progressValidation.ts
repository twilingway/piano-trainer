import {
  validateNativeMusicResult,
  validateMusicInputJournal,
  dictationFollowsRawListening
} from "./evidenceValidation";
import { compareDictation } from "./dictation";
import type { DictationExercise } from "./dictation";
import { summarizeDictationListening } from "./dictationListening";
import { validateHarmonyTarget } from "./harmony";
import { validHarmonyToneRecipe } from "./harmonyTone";
import { musicFingerprint, normalizeMusicNotes } from "./material";
import { computeHarmonyMetrics, computeSightReadingMetrics } from "./progress";
import type { MusicResult } from "./progress";
import type { MusicHelpEvent, MusicNote } from "./types";
import { validateIntegratedProgress } from "./progressIntegrated";

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
export const finite = (value: unknown, low = 0, high = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
export const integer = (value: unknown, low = 0, high = Number.MAX_SAFE_INTEGER): value is number =>
  finite(value, low, high) && Number.isInteger(value);
export const text = (value: unknown, max = 512): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
export const oneOf = (value: unknown, values: readonly unknown[]): boolean =>
  values.includes(value);
export const SOURCES = ["midi", "keyboard", "pointer"] as const;
export const PURPOSES = ["training", "control"] as const;
export function plainMusicJson(value: unknown, depth = 0, ancestors = new Set<object>()): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return typeof value !== "string" || value.length <= 20000;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.length <= 4096 && value.every((entry) => plainMusicJson(entry, depth + 1, ancestors))
    : record(value) &&
      Object.keys(value).length <= 128 &&
      Object.values(value).every((entry) => plainMusicJson(entry, depth + 1, ancestors));
  ancestors.delete(value);
  return valid;
}
export function validMusicHelp(value: unknown): value is readonly MusicHelpEvent[] {
  return (
    Array.isArray(value) &&
    value.length <= 2048 &&
    value.every(
      (help) =>
        record(help) &&
        finite(help.atMs) &&
        oneOf(help.kind, [
          "note-name",
          "key-light",
          "position",
          "fingering",
          "explanation",
          "replay"
        ])
    )
  );
}
export function validNotes(value: unknown, authored: boolean): value is readonly MusicNote[] {
  if (!Array.isArray(value) || value.length > (authored ? 128 : 512) || (authored && !value.length))
    return false;
  if (
    !value.every(
      (note, index) =>
        record(note) &&
        integer(note.pitch, 0, 127) &&
        finite(note.startBeat, authored ? 0 : -Number.MAX_SAFE_INTEGER) &&
        finite(note.durationBeats, authored ? Number.EPSILON : 0) &&
        oneOf(note.hand, ["left", "right"]) &&
        (index === 0 || note.startBeat >= (value[index - 1] as MusicNote).startBeat)
    )
  )
    return false;
  if (authored) {
    try {
      normalizeMusicNotes(value as MusicNote[]);
    } catch {
      return false;
    }
  }
  return true;
}
function validCommon(row: Record<string, unknown>): boolean {
  return (
    (row.provenance === undefined || oneOf(row.provenance, ["native", "legacy"])) &&
    text(row.id) &&
    text(row.runId) &&
    text(row.exerciseId) &&
    integer(row.seed, 0, 0xffffffff) &&
    row.generatorVersion === 1 &&
    finite(row.bpm, 30, 240) &&
    oneOf(row.purpose, PURPOSES) &&
    oneOf(row.inputSource, SOURCES) &&
    finite(row.startedAt) &&
    finite(row.completedAt) &&
    row.completedAt >= row.startedAt &&
    typeof row.newMaterial === "boolean" &&
    text(row.fingerprint, 16384) &&
    validMusicHelp(row.help) &&
    !(row.purpose === "control" && row.help.length > 0)
  );
}
function validReading(row: Record<string, unknown>): boolean {
  if (
    !oneOf(row.level, ["notes", "steps", "triads", "two-hands"]) ||
    !integer(row.previewSeconds, 5, 15) ||
    !validNotes(row.expectedNotes, true) ||
    !validNotes(row.playedNotes, false) ||
    !Array.isArray(row.groupAnswers) ||
    row.groupAnswers.length > 32
  )
    return false;
  const groups = ["repeated", "scalar", "triadic", "mixed"];
  return row.groupAnswers.every(
    (answer) => record(answer) && oneOf(answer.expected, groups) && oneOf(answer.answer, groups)
  );
}
export function validHarmony(row: Record<string, unknown>): boolean {
  if (
    typeof row.aural !== "boolean" ||
    !oneOf(row.lesson, [
      "tone-semitone",
      "triads",
      "inversions",
      "functions",
      "progressions",
      "accompaniment",
      "voice-leading"
    ]) ||
    !oneOf(row.mode, ["build-chord", "name-chord", "invert-chord", "complete-progression"]) ||
    !validNotes(row.expectedNotes, true) ||
    !Array.isArray(row.answers) ||
    !row.answers.length ||
    row.answers.length > 128
  )
    return false;
  if (
    row.toneRecipe !== undefined &&
    (row.lesson !== "tone-semitone" || !validHarmonyToneRecipe(row.toneRecipe, row.expectedNotes))
  )
    return false;
  if (row.toneRecipe !== undefined) {
    const notes = row.expectedNotes;
    const expected = String((notes[1]?.pitch ?? 0) - (notes[0]?.pitch ?? 0));
    if (
      !row.answers.every(
        (answer) => record(answer) && answer.kind === "named" && answer.expected === expected
      )
    )
      return false;
  }
  return row.answers.every((answer) => {
    if (!record(answer)) return false;
    if (answer.kind === "named") return text(answer.expected) && text(answer.answer);
    if (
      answer.kind !== "played" ||
      !record(answer.target) ||
      !Array.isArray(answer.playedPitches) ||
      answer.playedPitches.length > 128 ||
      !answer.playedPitches.every((pitch) => integer(pitch, 0, 127)) ||
      !(answer.spreadMs === null || finite(answer.spreadMs, 0, 60000)) ||
      !(
        answer.onsetOffsetMs === undefined ||
        answer.onsetOffsetMs === null ||
        finite(answer.onsetOffsetMs, -60000, 60000)
      ) ||
      !Array.isArray(answer.attempts) ||
      answer.attempts.length > 512
    )
      return false;
    try {
      validateHarmonyTarget(
        answer.target as unknown as Parameters<typeof validateHarmonyTarget>[0]
      );
      const target = answer.target as unknown as Parameters<typeof validateHarmonyTarget>[0];
      if (
        (answer.hand !== undefined && !oneOf(answer.hand, ["left", "right"])) ||
        (answer.startBeat !== undefined && !finite(answer.startBeat, 0, 64))
      )
        return false;
      const expectedNotes = row.expectedNotes as readonly MusicNote[];
      const expectedGroups = expectedNotes
        .filter(
          (note, index, notes) =>
            (answer.hand === undefined || answer.hand === note.hand) &&
            (answer.startBeat === undefined || answer.startBeat === note.startBeat) &&
            !notes
              .slice(0, index)
              .some(
                (previous) => previous.hand === note.hand && previous.startBeat === note.startBeat
              )
        )
        .map((first) =>
          expectedNotes
            .filter((note) => note.startBeat === first.startBeat && note.hand === first.hand)
            .map((note) => note.pitch)
        );
      if (
        !expectedGroups.some(
          (pitches) =>
            pitches.length === target.pitches.length &&
            pitches.every((pitch) => target.pitches.includes(pitch))
        )
      )
        return false;
    } catch {
      return false;
    }
    return answer.attempts.every(
      (attempt) =>
        record(attempt) &&
        finite(attempt.firstAtMs) &&
        finite(attempt.failedAtMs) &&
        attempt.failedAtMs >= attempt.firstAtMs &&
        oneOf(attempt.reason, [
          "invalid-input",
          "extra-note",
          "octave-duplicate",
          "missing-note",
          "wrong-position",
          "wrong-bass",
          "too-slow",
          "early-release",
          "mixed-origin"
        ])
    );
  });
}
export function validDictation(row: Record<string, unknown>): boolean {
  if (
    !validNotes(row.expectedNotes, true) ||
    row.expectedNotes.length < 2 ||
    row.expectedNotes.length > 8 ||
    !oneOf(row.startMode, ["known", "relative"]) ||
    !integer(row.level, 1, 100) ||
    !record(row.result)
  )
    return false;
  const result = row.result;
  if (
    result.attemptId !== row.runId ||
    result.exerciseId !== row.exerciseId ||
    result.purpose !== row.purpose ||
    !text(result.presentationId) ||
    !validMusicHelp(result.help) ||
    JSON.stringify(result.help) !== JSON.stringify(row.help) ||
    !Array.isArray(result.notes) ||
    result.notes.length > 512 ||
    !record(result.listening)
  )
    return false;
  if (
    !result.notes.every(
      (note, index) =>
        record(note) &&
        integer(note.pitch, 0, 127) &&
        finite(note.startBeat) &&
        finite(note.durationBeats) &&
        finite(note.downAtMs) &&
        finite(note.upAtMs) &&
        note.upAtMs >= note.downAtMs &&
        record(note.origin) &&
        note.origin.source === row.inputSource &&
        (note.origin.deviceId === undefined || text(note.origin.deviceId)) &&
        (note.origin.channel === undefined || integer(note.origin.channel, 1, 16)) &&
        (note.origin.ownerId === undefined || text(note.origin.ownerId)) &&
        (row.inputSource !== "midi" ||
          (text(note.origin.deviceId) && integer(note.origin.channel, 1, 16))) &&
        (index === 0 ||
          note.startBeat >=
            Number((result.notes as Record<string, unknown>[])[index - 1]?.startBeat))
    )
  )
    return false;
  const listening = result.listening;
  if (
    listening.attemptId !== row.runId ||
    listening.presentationId !== result.presentationId ||
    listening.purpose !== row.purpose ||
    !Array.isArray(listening.receipts) ||
    listening.receipts.length > 256
  )
    return false;
  const playbackIds = new Set<string>();
  if (
    !listening.receipts.every((receipt) => {
      if (
        !record(receipt) ||
        !text(receipt.playbackId) ||
        playbackIds.has(receipt.playbackId) ||
        !finite(receipt.requestedAtMs) ||
        !finite(receipt.endedAtMs) ||
        receipt.endedAtMs < receipt.requestedAtMs
      )
        return false;
      playbackIds.add(receipt.playbackId);
      if (receipt.outcome === "failed-before-start") return receipt.startedAtMs === null;
      return (
        oneOf(receipt.outcome, ["full", "partial"]) &&
        finite(receipt.startedAtMs) &&
        receipt.startedAtMs >= receipt.requestedAtMs &&
        receipt.endedAtMs >= receipt.startedAtMs
      );
    })
  )
    return false;
  const typed = result as unknown as Extract<MusicResult, { course: "dictation" }>["result"];
  const summary = summarizeDictationListening(typed.listening);
  if (!summary.canReply || (row.purpose === "control" && summary.started > 2)) return false;
  // Legacy rows lack the raw-to-corrected receipt relation, so no cross-domain timing is inferred.
  if (row.inputJournal === undefined) return true;
  return (
    validateMusicInputJournal(row.inputJournal, {
      runId: typed.attemptId,
      presentationId: typed.presentationId
    }) && dictationFollowsRawListening(typed, row.inputJournal)
  );
}
/** Unknown/future variants are rejected individually. Computed counters are rebuilt from raw evidence. */
export function validateMusicResult(value: unknown): MusicResult | null {
  if (!plainMusicJson(value) || !record(value) || !validCommon(value)) return null;
  const common = [
    "id",
    "runId",
    "exerciseId",
    "seed",
    "generatorVersion",
    "bpm",
    "purpose",
    "inputSource",
    "startedAt",
    "completedAt",
    "newMaterial",
    "fingerprint",
    "help",
    "course",
    "provenance",
    "inputJournal"
  ];
  const fields: Record<string, readonly string[]> = {
    "sight-reading": [
      "level",
      "previewSeconds",
      "expectedNotes",
      "playedNotes",
      "groupAnswers",
      "metrics"
    ],
    harmony: ["lesson", "mode", "aural", "expectedNotes", "answers", "metrics", "toneRecipe"],
    dictation: ["expectedNotes", "startMode", "level", "result"],
    integrated: ["plan", "state"]
  };
  const own = typeof value.course === "string" ? fields[value.course] : undefined;
  if (!own || Object.keys(value).some((key) => !common.includes(key) && !own.includes(key)))
    return null;
  try {
    if (value.course === "sight-reading" && validReading(value)) {
      const row = value as unknown as Extract<MusicResult, { course: "sight-reading" }>;
      if (
        musicFingerprint(row.expectedNotes) !== row.fingerprint ||
        !validateNativeMusicResult(row)
      )
        return null;
      return {
        ...row,
        metrics: computeSightReadingMetrics(
          row.expectedNotes,
          row.playedNotes,
          row.groupAnswers,
          row.purpose
        )
      };
    }
    if (value.course === "harmony" && validHarmony(value)) {
      const row = value as unknown as Extract<MusicResult, { course: "harmony" }>;
      if (
        musicFingerprint(row.expectedNotes) !== row.fingerprint ||
        !validateNativeMusicResult(row)
      )
        return null;
      return { ...row, metrics: computeHarmonyMetrics(row.answers) };
    }
    if (value.course === "dictation" && validDictation(value)) {
      const row = value as unknown as Extract<MusicResult, { course: "dictation" }>;
      if (
        musicFingerprint(row.expectedNotes) !== row.fingerprint ||
        !validateNativeMusicResult(row)
      )
        return null;
      const exercise = { notes: row.expectedNotes, startMode: row.startMode } as DictationExercise;
      return {
        ...row,
        result: { ...row.result, comparison: compareDictation(exercise, row.result.notes) }
      };
    }
    if (value.course === "integrated" && validateIntegratedProgress(value)) {
      const row = value as unknown as Extract<MusicResult, { course: "integrated" }>;
      if (
        row.seed !== row.plan.seed ||
        row.bpm !== row.plan.bpm ||
        row.runId !== row.state.lessonId ||
        row.state.completedPhases.length !== 7 ||
        row.fingerprint !== row.state.planId ||
        !validateNativeMusicResult(row)
      )
        return null;
      if (row.purpose === "control") {
        const finalIds = ["final-reading", "final-rhythm", "final-harmony"].map(
          (suffix) => `${row.state.planId}-${suffix}`
        );
        if (
          finalIds.some((id) => {
            const result = row.state.results.findLast((child) => child.activityId === id);
            return (
              result?.purpose !== "control" ||
              result.help.length > 0 ||
              result.visualAlternative ||
              (id.endsWith("final-rhythm") && !result.auditoryVerified)
            );
          }) ||
          row.state.results
            .filter((child) => child.skill === "rhythm" || child.skill === "interval")
            .some(
              (child, index, rows) =>
                rows.findLastIndex((other) => other.activityId === child.activityId) === index &&
                (!child.auditoryVerified || child.visualAlternative)
            )
        )
          return null;
      }
      return row;
    }
  } catch {
    return null;
  }
  return null;
}
