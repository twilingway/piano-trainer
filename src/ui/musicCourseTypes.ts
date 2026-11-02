import type { MessageParams } from "../i18n/locales";
import type { DictationStartMode } from "../musicLearning/dictation";
import type { HarmonyProgression, TriadInversion, TriadQuality } from "../musicLearning/harmony";
import type {
  HarmonyLesson,
  HarmonyMode,
  MusicInputSource,
  MusicSourceFilter
} from "../musicLearning/progress";
import type { SightReadingLevel } from "../musicLearning/sightReading";
import type { MusicCourse, MusicPurpose, MusicNote } from "../musicLearning/types";
import type { HarmonyTonePitchSet } from "../musicLearning/harmonyTone";

export type MusicCourseCommand =
  "start" | "listen" | "finish" | "next" | "retry" | "new" | "exit" | "hint" | "theory";
export type MusicCourseStatus =
  | "preparation"
  | "preflight"
  | "preview"
  | "ready"
  | "playing"
  | "listening"
  | "reply"
  | "result"
  | "paused"
  | "error"
  | "completed";
export type MusicTaskKind =
  | "sight-reading"
  | "group"
  | "position"
  | "tone-semitone"
  | "build-chord"
  | "name-chord"
  | "invert-chord"
  | "function"
  | "progression"
  | "accompaniment"
  | "voice-leading"
  | "dictation"
  | "auditory-interval"
  | "integrated";
export interface MusicCourseText {
  readonly key: string;
  readonly params?: MessageParams;
}
export interface MusicCourseMetric {
  readonly labelKey: string;
  /** Text values are already localized by the shell; numeric values use the interface locale. */
  readonly value: string | number | null;
  readonly valueKey?: string;
}
export interface MusicCourseResultNotes {
  readonly expectedNotes: readonly MusicNote[];
  readonly playedNotes: readonly MusicNote[];
}
export interface MusicCourseResultView {
  readonly notes?: MusicCourseResultNotes;
  readonly summaryKey?: string;
  readonly metrics: readonly MusicCourseMetric[];
  readonly helped: boolean;
  readonly newMaterial: boolean;
  readonly detailKeys?: readonly string[];
}
export interface MusicCourseChoice {
  readonly pitch?: number;
  readonly value: string;
  readonly labelKey: string;
  readonly params?: MessageParams;
}
export interface MusicCourseView {
  readonly inputSource?: MusicInputSource;
  readonly course: MusicCourse;
  readonly status: MusicCourseStatus;
  readonly taskKind: MusicTaskKind;
  readonly phaseKey?: string;
  readonly instructionKey?: string;
  readonly instructionParams?: MessageParams;
  readonly counter?: { readonly current: number; readonly total: number };
  readonly previewSeconds?: number;
  readonly ready: boolean;
  readonly allReleased: boolean;
  readonly canStart: boolean;
  readonly canListen: boolean;
  readonly canFinish: boolean;
  readonly canNext: boolean;
  readonly canHelp: boolean;
  readonly showHelp: boolean;
  readonly canRetry?: boolean;
  readonly retryCreatesNewMaterial?: boolean;
  readonly canAnswer?: boolean;
  readonly positionLowPitch?: number;
  readonly startPitch?: number;
  readonly choices?: readonly MusicCourseChoice[];
  readonly error?: MusicCourseText;
  readonly helpKeys?: readonly string[];
  readonly result?: MusicCourseResultView;
}
/** A structural UI subset; persistence and the trainer stay in the calling shell. */
export interface MusicCoursePreferences {
  readonly purpose: MusicPurpose;
  readonly inputSource: MusicInputSource;
  readonly sourceFilter: MusicSourceFilter;
  readonly sightPreviewSeconds: number;
  readonly sightLevel: SightReadingLevel;
  readonly harmonyLesson: HarmonyLesson;
  readonly harmonyMode: HarmonyMode;
  readonly harmonyAural: boolean;
  readonly harmonyTonePitchSet: HarmonyTonePitchSet;
  readonly harmonyRoot: number;
  readonly harmonyQuality: TriadQuality;
  readonly harmonyInversion: TriadInversion;
  readonly harmonyProgression: HarmonyProgression;
  readonly dictationLength: number;
  readonly dictationStartMode: DictationStartMode;
}
export interface MusicCourseCardView {
  readonly course: MusicCourse;
  readonly completedRuns: number;
  readonly resumable: boolean;
}
export interface MusicCoursePracticeProps {
  readonly view: MusicCourseView;
  readonly preferences: MusicCoursePreferences;
  readonly onPreferences: (patch: Partial<MusicCoursePreferences>) => void;
  readonly onCommand: (command: MusicCourseCommand) => void;
  readonly onChoose: (value: string, source: "keyboard" | "pointer") => void;
}
