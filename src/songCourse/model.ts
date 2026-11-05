import type { Hand } from "../fingering/fingering";
import type { Song } from "../song/song";

export const LEGACY_SONG_COURSE_RUBRIC_VERSION = "song-course-v1" as const;
export const SONG_COURSE_RUBRIC_VERSION = "song-course-v2" as const;
export type SongCourseRubricVersion =
  typeof LEGACY_SONG_COURSE_RUBRIC_VERSION | typeof SONG_COURSE_RUBRIC_VERSION;
export type SongCourseMode = "wait" | "tempo";
export type SongCourseNodeKind =
  "notes" | "duration" | "guided-phrase" | "independent-phrase" | "performance" | "review";
export type SongCourseRubricVariant = "normal" | "learning-review";

export interface SongCoursePhrase {
  readonly id: string;
  readonly fromMeasure: number;
  readonly toMeasure: number;
  /** Stable raw XML note IDs; the loader adds the song/revision namespace. */
  readonly sourceNoteIds: readonly string[];
}
export interface SongCourseNode {
  readonly id: string;
  readonly songId: string;
  readonly kind: SongCourseNodeKind;
  readonly title: string;
  readonly instruction: string;
  readonly phraseIds: readonly string[];
  readonly sourceNoteIds: readonly string[];
  readonly repeat?: { readonly originNoteId: string; readonly count: 4 };
  readonly supersededBy?: string;
}
export interface SongCoursePartHand {
  readonly partId: string;
  readonly staff: string;
  readonly hand: Hand;
}
export interface SongCourseSource {
  readonly id: string;
  readonly revision: string;
  readonly sourceHash: string;
  readonly title: string;
  readonly musicXml: string;
  readonly learnerPartIds: readonly string[];
  readonly accompanimentPartIds: readonly string[];
  readonly partHands: readonly SongCoursePartHand[];
  readonly phrases: readonly SongCoursePhrase[];
  readonly nodes: readonly SongCourseNode[];
  readonly legacyNodes?: readonly SongCourseNode[];
}
export interface CourseExpectedNote {
  readonly sourceNoteId: string;
  readonly runtimeNoteId: string;
  readonly pitch: number;
  /** Song seconds and beats are supplied by the source score. */
  readonly start: number;
  readonly duration: number;
  readonly startBeat: number;
  readonly phraseId: string;
  readonly measureIndex: number;
}
export interface CourseMaterial {
  readonly source: SongCourseSource;
  readonly node: SongCourseNode;
  readonly song: Song;
  readonly musicXml: string;
  readonly expected: readonly CourseExpectedNote[];
  readonly runtimeToSource: ReadonlyMap<string, string>;
  readonly sourceToRuntime: ReadonlyMap<string, string>;
}
export interface RawCourseInput {
  readonly type: "down" | "up";
  readonly source: string;
  readonly pitch: number;
  /** Corrected physical timestamp; calibration has already been applied once. */
  readonly performanceMs: number;
  /** Original physical timestamp for hold segments across transport pause markers. */
  readonly rawPerformanceMs?: number;
  readonly stableOrdinal: number;
  /** Read from PracticeSession.songTimeAt(performanceMs), never advanced here. */
  readonly songTime: number;
  readonly admitted?: boolean;
  readonly synthetic?: boolean;
  /** Only the explicit pause/rehold protocol may set this canonical source ID. */
  readonly controlRehold?: string;
  /** A physical attack while the pause protocol is waiting; penalized, never a future primary. */
  readonly pauseProtocolAttack?: boolean;
}
export interface CoursePresentation {
  readonly sourceNoteId: string;
  readonly performanceMs: number;
  readonly stableOrdinal: number;
}
export interface CoursePause {
  readonly type: "pause";
  /** A completed physical segment needs release after pause, but no control rehold. */
  readonly requiresRehold?: boolean;
  readonly performanceMs: number;
  readonly stableOrdinal: number;
  readonly sourceNoteId?: string;
}
export interface SongCourseAttemptConfig {
  readonly learnerPartIds: readonly string[];
  readonly runId: string;
  readonly songId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly nodeId: string;
  readonly mode: SongCourseMode;
  readonly speed: number;
  readonly expected: readonly CourseExpectedNote[];
  readonly rubricVariant?: SongCourseRubricVariant;
}
export type CourseMistakeKind = "pitch" | "onset" | "hold";
export interface CourseNoteGrade {
  readonly sourceNoteId: string;
  readonly phraseId: string;
  readonly pitch: number;
  readonly measureIndex: number;
  readonly matched: boolean;
  readonly onsetOffsetMs: number | null;
  readonly onsetCorrect: boolean | null;
  readonly heldMs: number | null;
  readonly holdCorrect: boolean;
  readonly mistakes: readonly CourseMistakeKind[];
}
export interface SongCourseRunEvidence {
  readonly schemaVersion: 1;
  readonly learnerPartIds: readonly string[];
  readonly expected: readonly CourseExpectedNote[];
  readonly inputs: readonly RawCourseInput[];
  readonly presentations: readonly CoursePresentation[];
  readonly pauses: readonly CoursePause[];
  readonly musicalEndPerformanceMs: number;
  readonly closedAtPerformanceMs: number;
}
export interface SongCourseResult {
  readonly evidence: SongCourseRunEvidence;
  readonly schemaVersion: 1;
  readonly rubricVersion: SongCourseRubricVersion;
  readonly rubricVariant: SongCourseRubricVariant;
  readonly runId: string;
  readonly songId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly nodeId: string;
  readonly mode: SongCourseMode;
  readonly speed: number;
  readonly pitch: number;
  readonly onset: number | null;
  readonly hold: number;
  readonly stars: 0 | 1 | 2 | 3;
  readonly completed: boolean;
  readonly valid: boolean;
  readonly invalidReasons: readonly string[];
  readonly expectedCount: number;
  readonly extraCount: number;
  readonly mistakePhraseIds: readonly string[];
  readonly notes: readonly CourseNoteGrade[];
  /** Provided by the shell; the pure core never reads the wall clock. */
  readonly createdAt: number;
}
export interface SongCourseGradeEvidence {
  readonly inputs: readonly RawCourseInput[];
  readonly presentations?: readonly CoursePresentation[];
  readonly pauses?: readonly CoursePause[];
  readonly invalidReasons?: readonly string[];
  readonly musicalEndPerformanceMs: number;
  readonly closedAtPerformanceMs: number;
  readonly createdAt: number;
}
export interface SongCourseSelection {
  readonly songId: string;
  readonly sourceRevision: string;
  readonly sourceHash: string;
  readonly nodeId: string;
}
export interface SongCourseProgress {
  readonly schemaVersion: 1;
  readonly selection: SongCourseSelection | null;
  readonly results: readonly SongCourseResult[];
}
