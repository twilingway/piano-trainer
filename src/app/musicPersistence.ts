import type { HarmonyProgression, TriadQuality, TriadInversion } from "../musicLearning/harmony";
import type { MusicCourse, MusicPurpose } from "../musicLearning/types";
import type { DictationStartMode } from "../musicLearning/dictation";
import type { SightReadingLevel } from "../musicLearning/sightReading";
import type {
  HarmonyLesson,
  HarmonyMode,
  IntegratedProgress,
  MusicInputSource,
  MusicResult,
  MusicSourceFilter,
  MutableMusic
} from "../musicLearning/progress";
import { mergeMusicHistory } from "../musicLearning/progress";
import {
  validateMusicResult,
  finite,
  integer,
  oneOf,
  plainMusicJson,
  record,
  SOURCES,
  PURPOSES
} from "../musicLearning/progressValidation";
import { validateIntegratedProgress } from "../musicLearning/progressIntegrated";
export { mergeMusicHistory } from "../musicLearning/progress";

export interface MusicPreferences {
  purpose: MusicPurpose;
  inputSource: MusicInputSource;
  sourceFilter: MusicSourceFilter;
  sightPreviewSeconds: number;
  sightLevel: SightReadingLevel;
  harmonyLesson: HarmonyLesson;
  harmonyMode: HarmonyMode;
  harmonyAural: boolean;
  harmonyRoot: number;
  harmonyQuality: TriadQuality;
  harmonyInversion: TriadInversion;
  harmonyProgression: HarmonyProgression;
  dictationLength: number;
  dictationStartMode: DictationStartMode;
}
export interface MusicPersistentState extends MusicPreferences {
  course: MusicCourse | null;
  seed: number;
  generatorVersion: 1;
  integrated: MutableMusic<IntegratedProgress> | null;
  history: MutableMusic<MusicResult>[];
}
export const MUSIC_PREFERENCE_FIELDS = [
  { key: "purpose", field: "musicPurpose" },
  { key: "inputSource", field: "musicInputSource" },
  { key: "sourceFilter", field: "musicSourceFilter" },
  { key: "sightPreviewSeconds", field: "musicSightPreviewSeconds" },
  { key: "sightLevel", field: "musicSightLevel" },
  { key: "harmonyLesson", field: "musicHarmonyLesson" },
  { key: "harmonyMode", field: "musicHarmonyMode" },
  { key: "harmonyAural", field: "musicHarmonyAural" },
  { key: "harmonyRoot", field: "musicHarmonyRoot" },
  { key: "harmonyQuality", field: "musicHarmonyQuality" },
  { key: "harmonyInversion", field: "musicHarmonyInversion" },
  { key: "harmonyProgression", field: "musicHarmonyProgression" },
  { key: "dictationLength", field: "musicDictationLength" },
  { key: "dictationStartMode", field: "musicDictationStartMode" }
] as const;
export function emptyMusicState(): MusicPersistentState {
  return {
    course: null,
    seed: 1,
    generatorVersion: 1,
    purpose: "training",
    inputSource: "keyboard",
    sourceFilter: "all",
    sightPreviewSeconds: 10,
    sightLevel: "notes",
    harmonyLesson: "tone-semitone",
    harmonyMode: "build-chord",
    harmonyAural: false,
    harmonyRoot: 60,
    harmonyQuality: "major",
    harmonyInversion: 0,
    harmonyProgression: "I-IV-V-I",
    dictationLength: 2,
    dictationStartMode: "known",
    integrated: null,
    history: []
  };
}
export function validMusicPreference(key: keyof MusicPreferences, value: unknown): boolean {
  switch (key) {
    case "purpose":
      return oneOf(value, PURPOSES);
    case "inputSource":
      return oneOf(value, SOURCES);
    case "sourceFilter":
      return oneOf(value, ["all", ...SOURCES]);
    case "sightPreviewSeconds":
      return integer(value, 5, 15);
    case "sightLevel":
      return oneOf(value, ["notes", "steps", "triads", "two-hands"]);
    case "harmonyLesson":
      return oneOf(value, [
        "tone-semitone",
        "triads",
        "inversions",
        "functions",
        "progressions",
        "accompaniment",
        "voice-leading"
      ]);
    case "harmonyMode":
      return oneOf(value, ["build-chord", "name-chord", "invert-chord", "complete-progression"]);
    case "harmonyAural":
      return typeof value === "boolean";
    case "harmonyRoot":
      return integer(value, 48, 72);
    case "harmonyQuality":
      return oneOf(value, ["major", "minor"]);
    case "harmonyInversion":
      return oneOf(value, [0, 1, 2]);
    case "harmonyProgression":
      return oneOf(value, ["I-IV-V-I", "I-V-vi-IV"]);
    case "dictationLength":
      return integer(value, 2, 8);
    case "dictationStartMode":
      return oneOf(value, ["known", "relative"]);
  }
}
export function copyMusicIntegrated(value: IntegratedProgress): MutableMusic<IntegratedProgress> {
  return JSON.parse(JSON.stringify(value)) as MutableMusic<IntegratedProgress>;
}
/** Malformed rows lose only their invalid fields/results. Unsupported generator material is rejected. */
export function normalizeMusicState(value: unknown): {
  music: MusicPersistentState;
  invalid: boolean;
} {
  const music = emptyMusicState();
  if (value === undefined) return { music, invalid: false };
  if (!record(value)) return { music, invalid: true };
  let invalid = false;
  if (oneOf(value.course, [null, "sight-reading", "harmony", "dictation", "integrated"]))
    music.course = value.course as MusicCourse | null;
  else invalid = true;
  if (integer(value.seed, 0, 0xffffffff)) music.seed = value.seed;
  else invalid = true;
  if (value.generatorVersion !== 1) {
    music.course = null;
    invalid = true;
  }
  if (oneOf(value.purpose, PURPOSES)) music.purpose = value.purpose as MusicPurpose;
  else invalid = true;
  for (const { key } of MUSIC_PREFERENCE_FIELDS) {
    if (validMusicPreference(key, value[key])) Object.assign(music, { [key]: value[key] });
    else invalid = true;
  }
  if (value.integrated !== null) {
    if (validateIntegratedProgress(value.integrated))
      music.integrated = copyMusicIntegrated(value.integrated);
    else invalid = true;
  }
  const history = Array.isArray(value.history) ? value.history : [];
  if (!Array.isArray(value.history)) invalid = true;
  const valid = history.flatMap((row) => {
    const result = validateMusicResult(row);
    if (!result) {
      invalid = true;
      return [];
    }
    return [result];
  });
  music.history = mergeMusicHistory([], valid);
  // Detect non-JSON top-level preferences without losing unrelated valid history entries.
  for (const key of Object.keys(value))
    if (key !== "history" && !plainMusicJson(value[key])) invalid = true;
  return { music, invalid };
}
export function validMusicSelection(value: {
  course: unknown;
  seed: unknown;
  purpose?: unknown;
}): boolean {
  return (
    oneOf(value.course, ["sight-reading", "harmony", "dictation", "integrated"]) &&
    integer(value.seed, 0, 0xffffffff) &&
    (value.purpose === undefined || oneOf(value.purpose, PURPOSES))
  );
}
/** Calendar bounds are shared, but musical metrics stay in their course-specific result. */
export const musicCalendarTime = (value: unknown): value is number => finite(value);
