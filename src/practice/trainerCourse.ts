import type { KeyEvent } from "../input/midiInput";
import type { SongNote } from "../song/song";
import type { NoteStatus, PracticeEvent, PracticeSession, PracticeStats } from "./session";
import type { TimingConfig } from "./timingConfig";
import type { ReadingAttackGate, TrainerReadingPolicy } from "./readingPolicy";
import type { TrainerRhythmPolicy } from "./rhythmPolicy";
import type { TrainerPairPolicy } from "./twoHandPolicy";
import type { TrainerHeldBassPolicy } from "./heldBassPolicy";
import type { TrainerIndependentRhythmPolicy } from "./independentRhythmPolicy";

export interface CoursePolicies {
  readonly reading: TrainerReadingPolicy;
  readonly rhythm: TrainerRhythmPolicy;
  readonly pair: TrainerPairPolicy;
  readonly heldBass: TrainerHeldBassPolicy;
  readonly independentRhythm: TrainerIndependentRhythmPolicy;
}
export type CourseKind = keyof CoursePolicies;

export interface CourseGuidance {
  readonly lights: readonly number[];
  readonly frame: {
    readonly hintNotes: readonly SongNote[];
    readonly due: readonly SongNote[];
    readonly waitingFor: readonly SongNote[];
    readonly hints: boolean;
    readonly neutralKeys: boolean;
  };
}

/** Raw, device-corrected and received times of one key event, in performance ms. */
export interface KeyTimes {
  readonly raw: number;
  readonly corrected: number;
  readonly received: number;
}

/** What the Trainer lends a course's input route; each route keeps its own order of steps. */
export interface CourseKeyContext {
  readonly session: PracticeSession | undefined;
  readonly playing: () => boolean;
  readonly timing: TimingConfig;
  readonly pressed: Set<number>;
  readonly gate: ReadingAttackGate;
  /** The app's interceptor; true when it consumed the event. */
  readonly intercept: (event: KeyEvent) => boolean;
  /** The allowed-device filter. */
  readonly admits: (event: KeyEvent) => boolean;
  /** Undefined for a non-finite timestamp. */
  readonly times: (event: KeyEvent) => KeyTimes | undefined;
  /** The ordinary piano route, judged by an optional reading policy. */
  readonly ordinary: (event: KeyEvent, reading: TrainerReadingPolicy | null) => void;
  readonly apply: (events: readonly PracticeEvent[]) => void;
  readonly publish: () => void;
}

/** One exclusive course in the Trainer: capabilities instead of per-course branches. */
export interface TrainerCourse {
  readonly kind: CourseKind;
  readonly policy: CoursePolicies[CourseKind];
  /** Input belongs to the course: no take, no pedal, no strike grades on the view. */
  readonly ownsInput: boolean;
  /** The view clock stops at the song's end. */
  readonly smoothClock: boolean;
  /** Hits, misses and the finish reach run completion, combo and stop-on-error. */
  readonly gradesRun: boolean;
  /** Play may start on a finished session. */
  readonly playsAfterFinish: boolean;
  readonly overdrive: boolean;
  readonly inputCompensationMs?: () => number;
  /** A fresh session, or the course's arrival on the current one. */
  readonly attach?: (session: PracticeSession) => void;
  readonly seed?: (held: readonly KeyEvent[], atMs: number) => void;
  /** False refuses the start. */
  readonly start?: (session: PracticeSession, atMs: number, held: readonly KeyEvent[]) => boolean;
  readonly step: (
    session: PracticeSession,
    playing: boolean,
    atMs: number
  ) => readonly PracticeEvent[];
  readonly key: (event: KeyEvent, context: CourseKeyContext) => void;
  readonly guidance: (
    session: PracticeSession,
    playing: boolean,
    performance: boolean
  ) => CourseGuidance;
  readonly cuePresented: (lights: readonly number[], atMs: number) => void;
  readonly cancel?: (atMs: number, resetAll: boolean) => void;
  readonly statusOf?: (noteId: string) => NoteStatus | undefined;
  /** A course with its own stats replaces the session's game board. */
  readonly stats?: () => PracticeStats | undefined;
}

export const NO_EVENTS: readonly PracticeEvent[] = [];
