import type { MusicInputJournalData } from "./evidence";
import { HIT_WINDOW_S } from "../practice/session";
import type { MusicCourse, MusicHelpEvent, MusicNote, MusicPurpose } from "./types";
import type { SightGroupKind, SightReadingLevel } from "./sightReading";
import type { HarmonyTarget } from "./harmony";
import { compareHarmonyChord } from "./harmony";
import type { HarmonyInputAttempt } from "./harmonyInput";
import type { DictationResult } from "./dictationSession";
import type { DictationStartMode } from "./dictation";
import type { IntegratedSavedState } from "./integrated";
import { validateMusicResult } from "./progressValidation";
export { validateMusicResult } from "./progressValidation";

export type MusicInputSource = "midi" | "keyboard" | "pointer";
export type MusicSourceFilter = "all" | MusicInputSource;
export type HarmonyLesson =
  | "tone-semitone"
  | "triads"
  | "inversions"
  | "functions"
  | "progressions"
  | "accompaniment"
  | "voice-leading";
export type HarmonyMode = "build-chord" | "name-chord" | "invert-chord" | "complete-progression";
export interface MusicResultCommon {
  readonly provenance?: "native" | "legacy";
  readonly inputJournal?: MusicInputJournalData;
  readonly id: string;
  readonly runId: string;
  readonly exerciseId: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly bpm: number;
  readonly purpose: MusicPurpose;
  readonly inputSource: MusicInputSource;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly newMaterial: boolean;
  readonly fingerprint: string;
  readonly help: readonly MusicHelpEvent[];
}
export interface MusicGroupAnswer {
  readonly expected: SightGroupKind;
  readonly answer: SightGroupKind;
}
export interface SightReadingMetrics {
  readonly expectedNotes: number;
  readonly playedNotes: number;
  readonly pitchErrors: number;
  readonly missingNotes: number;
  readonly extraNotes: number;
  /** WAIT has no measured rhythmic result. */
  readonly onsetErrors: number | null;
  readonly durationErrors: number | null;
  readonly groupErrors: number | null;
}
export interface SightReadingMusicResult extends MusicResultCommon {
  readonly course: "sight-reading";
  readonly level: SightReadingLevel;
  readonly previewSeconds: number;
  readonly expectedNotes: readonly MusicNote[];
  /** Actual PracticeSession beat coordinates, not quantized to the authored score grid. */
  readonly playedNotes: readonly MusicNote[];
  readonly groupAnswers: readonly MusicGroupAnswer[];
  readonly metrics: SightReadingMetrics;
}
export type HarmonyAnswer =
  | {
      readonly kind: "played";
      readonly startBeat?: number;
      readonly hand?: MusicNote["hand"];
      readonly target: HarmonyTarget;
      readonly playedPitches: readonly number[];
      readonly spreadMs: number | null;
      /** Real metronome offset; omitted for untimed exercises, null when no attack occurred. */
      readonly onsetOffsetMs?: number | null;
      readonly attempts: readonly HarmonyInputAttempt[];
    }
  | { readonly kind: "named"; readonly expected: string; readonly answer: string };
export interface HarmonyMetrics {
  readonly totalAnswers: number;
  readonly correctAnswers: number;
  readonly pitchErrors: number;
  readonly bassErrors: number;
  readonly synchronyErrors: number;
  readonly theoryErrors: number;
}
export interface HarmonyMusicResult extends MusicResultCommon {
  readonly course: "harmony";
  readonly lesson: HarmonyLesson;
  readonly aural: boolean;
  readonly mode: HarmonyMode;
  readonly expectedNotes: readonly MusicNote[];
  readonly answers: readonly HarmonyAnswer[];
  readonly metrics: HarmonyMetrics;
}
export interface DictationMusicResult extends MusicResultCommon {
  readonly course: "dictation";
  readonly expectedNotes: readonly MusicNote[];
  readonly startMode: DictationStartMode;
  readonly level: number;
  readonly result: DictationResult;
}
export interface IntegratedPlanRecipe {
  readonly seed: number;
  readonly version: 1;
  readonly theme: "c-major";
  readonly bpm: number;
}
export interface IntegratedProgress {
  readonly plan: IntegratedPlanRecipe;
  readonly state: IntegratedSavedState;
}
export interface IntegratedMusicResult extends MusicResultCommon, IntegratedProgress {
  readonly course: "integrated";
}
export type MusicResult =
  SightReadingMusicResult | HarmonyMusicResult | DictationMusicResult | IntegratedMusicResult;
export type MutableMusic<T> = { -readonly [K in keyof T]: MutableMusic<T[K]> };
export function copyMusicResult(result: MusicResult): MutableMusic<MusicResult> {
  return JSON.parse(JSON.stringify(result)) as MutableMusic<MusicResult>;
}

/** Score-beat matching is wider than timing grading, and never limits reaction wall time in WAIT. */
export const SIGHT_READING_MATCH_WINDOW_BEATS = 0.5;
export const SIGHT_READING_TIMING_TOLERANCE_BEATS = 0.125;
interface SightPair {
  readonly expectedIndex: number;
  readonly playedIndex: number;
}
/** Maximize one-to-one pitch/hand matches first, then minimize their total beat distance. */
export function matchSightReadingNotes(
  expected: readonly MusicNote[],
  played: readonly MusicNote[]
): readonly SightPair[] {
  const keys = new Set(expected.map((note) => `${note.hand}:${String(note.pitch)}`));
  const pairs: SightPair[] = [];
  for (const key of keys) {
    const owed = expected
      .map((note, index) => ({ note, index }))
      .filter(({ note }) => `${note.hand}:${String(note.pitch)}` === key)
      .sort((a, b) => a.note.startBeat - b.note.startBeat || a.index - b.index);
    const actual = played
      .map((note, index) => ({ note, index }))
      .filter(({ note }) => `${note.hand}:${String(note.pitch)}` === key)
      .sort((a, b) => a.note.startBeat - b.note.startBeat || a.index - b.index);
    const width = actual.length + 1;
    const counts = new Int32Array((owed.length + 1) * width);
    const costs = new Float64Array(counts.length);
    const actions = new Uint8Array(counts.length);
    for (let i = 1; i <= owed.length; i++)
      for (let j = 1; j <= actual.length; j++) {
        const cell = i * width + j,
          up = cell - width,
          left = cell - 1,
          diagonal = up - 1;
        const takeUp =
          (counts[up] ?? 0) > (counts[left] ?? 0) ||
          ((counts[up] ?? 0) === (counts[left] ?? 0) && (costs[up] ?? 0) <= (costs[left] ?? 0));
        const best = takeUp ? up : left;
        counts[cell] = counts[best] ?? 0;
        costs[cell] = costs[best] ?? 0;
        actions[cell] = takeUp ? 1 : 2;
        const target = owed[i - 1],
          note = actual[j - 1];
        if (!target || !note) continue;
        const distance = Math.abs(target.note.startBeat - note.note.startBeat);
        const count = (counts[diagonal] ?? 0) + 1,
          cost = (costs[diagonal] ?? 0) + distance;
        if (
          distance <= SIGHT_READING_MATCH_WINDOW_BEATS &&
          (count > (counts[cell] ?? 0) ||
            (count === (counts[cell] ?? 0) && cost <= (costs[cell] ?? 0)))
        ) {
          counts[cell] = count;
          costs[cell] = cost;
          actions[cell] = 3;
        }
      }
    let i = owed.length,
      j = actual.length;
    while (i > 0 && j > 0) {
      const action = actions[i * width + j];
      if (action === 3) {
        const target = owed[i - 1],
          note = actual[j - 1];
        if (target && note) pairs.push({ expectedIndex: target.index, playedIndex: note.index });
        i--;
        j--;
      } else if (action === 1) i--;
      else j--;
    }
  }
  return pairs.sort((a, b) => a.expectedIndex - b.expectedIndex);
}
export function computeSightReadingMetrics(
  expected: readonly MusicNote[],
  played: readonly MusicNote[],
  groups: readonly MusicGroupAnswer[] = [],
  purpose: MusicPurpose = "control"
): SightReadingMetrics {
  const pairs = matchSightReadingNotes(expected, played);
  let onsetErrors = 0,
    durationErrors = 0;
  for (const pair of pairs) {
    const note = expected[pair.expectedIndex],
      actual = played[pair.playedIndex];
    if (!note || !actual) continue;
    if (Math.abs(note.startBeat - actual.startBeat) > SIGHT_READING_TIMING_TOLERANCE_BEATS)
      onsetErrors++;
    if (Math.abs(note.durationBeats - actual.durationBeats) > SIGHT_READING_TIMING_TOLERANCE_BEATS)
      durationErrors++;
  }
  // Unassigned attacks are content errors; missing score notes and extra attacks remain separate.
  return {
    expectedNotes: expected.length,
    playedNotes: played.length,
    pitchErrors: played.length - pairs.length,
    missingNotes: expected.length - pairs.length,
    extraNotes: played.length - pairs.length,
    onsetErrors: purpose === "control" && pairs.length > 0 ? onsetErrors : null,
    durationErrors: purpose === "control" && pairs.length > 0 ? durationErrors : null,
    groupErrors: groups.length
      ? groups.filter((group) => group.answer !== group.expected).length
      : null
  };
}

export const HARMONY_ONSET_WINDOW_MS = HIT_WINDOW_S * 1000;
export function computeHarmonyMetrics(answers: readonly HarmonyAnswer[]): HarmonyMetrics {
  let correctAnswers = 0,
    pitchErrors = 0,
    bassErrors = 0,
    synchronyErrors = 0,
    theoryErrors = 0;
  for (const answer of answers) {
    if (answer.kind === "named") {
      if (answer.expected === answer.answer) correctAnswers++;
      else theoryErrors++;
      continue;
    }
    const chord = compareHarmonyChord(answer.target, answer.playedPitches);
    const synchronous = answer.spreadMs !== null && answer.spreadMs <= 200;
    const onTime =
      answer.onsetOffsetMs === undefined ||
      (answer.onsetOffsetMs !== null && Math.abs(answer.onsetOffsetMs) <= HARMONY_ONSET_WINDOW_MS);
    if (chord.correct && synchronous && onTime) correctAnswers++;
    if (!chord.correct) {
      if (chord.reason === "wrong-bass") bassErrors++;
      else pitchErrors++;
    }
    if (answer.spreadMs !== null && !synchronous) synchronyErrors++;
    for (const attempt of answer.attempts) {
      if (attempt.reason === "wrong-bass") bassErrors++;
      else if (attempt.reason === "too-slow" || attempt.reason === "early-release")
        synchronyErrors++;
      else pitchErrors++;
    }
  }
  return {
    totalAnswers: answers.length,
    correctAnswers,
    pitchErrors,
    bassErrors,
    synchronyErrors,
    theoryErrors
  };
}

const COURSES: readonly MusicCourse[] = ["sight-reading", "harmony", "dictation", "integrated"];
const SOURCES: readonly MusicInputSource[] = ["midi", "keyboard", "pointer"];
const PURPOSES: readonly MusicPurpose[] = ["training", "control"];
/** Existing committed evidence wins over stale/edited copies; cap each independent cohort. */
export function mergeMusicHistory(
  saved: readonly MusicResult[],
  incoming: readonly MusicResult[]
): MutableMusic<MusicResult>[] {
  const runs = new Map<string, MusicResult>();
  const ids = new Set<string>();
  for (const raw of [...saved, ...incoming]) {
    const result = validateMusicResult(raw);
    if (!result || runs.has(result.runId) || ids.has(result.id)) continue;
    runs.set(result.runId, result);
    ids.add(result.id);
  }
  const sorted = [...runs.values()].sort(
    (a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId)
  );
  return COURSES.flatMap((course) =>
    SOURCES.flatMap((source) =>
      PURPOSES.flatMap((purpose) =>
        sorted
          .filter((r) => r.course === course && r.inputSource === source && r.purpose === purpose)
          .slice(-20)
      )
    )
  ).map(copyMusicResult);
}
export interface MusicProgressFilter {
  readonly course?: MusicCourse;
  readonly source?: MusicSourceFilter;
  readonly purpose?: MusicPurpose | "all";
}
export interface MusicProgressSummary {
  readonly course: MusicCourse;
  readonly inputSource: MusicInputSource;
  readonly purpose: MusicPurpose;
  readonly completedRuns: number;
  readonly nonemptyRuns: number;
  readonly helpedRuns: number;
  readonly newMaterialRuns: number;
  readonly auditoryRuns: number;
  readonly recentRunIds: readonly string[];
}
/** Cohorts remain separate: there is deliberately no cross-skill accuracy or finger grade. */
export function summarizeMusicProgress(
  history: readonly MusicResult[],
  filter: MusicProgressFilter = {}
): readonly MusicProgressSummary[] {
  const valid = mergeMusicHistory([], history).filter(
    (result) =>
      (!filter.course || result.course === filter.course) &&
      (!filter.source || filter.source === "all" || result.inputSource === filter.source) &&
      (!filter.purpose || filter.purpose === "all" || result.purpose === filter.purpose)
  );
  return COURSES.flatMap((course) =>
    SOURCES.flatMap((inputSource) =>
      PURPOSES.flatMap((purpose): MusicProgressSummary[] => {
        const results = valid.filter(
          (r) => r.course === course && r.inputSource === inputSource && r.purpose === purpose
        );
        if (!results.length) return [];
        return [
          {
            course,
            inputSource,
            purpose,
            completedRuns: results.length,
            nonemptyRuns: results.filter((r) =>
              r.course === "sight-reading"
                ? r.playedNotes.length > 0
                : r.course === "dictation"
                  ? r.result.notes.length > 0
                  : r.course === "harmony"
                    ? r.answers.length > 0
                    : r.state.completedPhases.length > 0
            ).length,
            helpedRuns: results.filter(
              (r) =>
                r.help.length > 0 ||
                (r.course === "integrated" &&
                  r.state.results.some((child) => child.help.length > 0 || child.visualAlternative))
            ).length,
            newMaterialRuns: results.filter((r) => r.newMaterial).length,
            auditoryRuns: results.filter(
              (r) =>
                r.course === "dictation" ||
                (r.course === "harmony" && r.aural) ||
                (r.course === "integrated" &&
                  r.state.results.some(
                    (child) => child.auditoryVerified && !child.visualAlternative
                  ))
            ).length,
            recentRunIds: results.map((r) => r.runId)
          }
        ];
      })
    )
  );
}
