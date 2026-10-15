import type { ReadingState } from "./readingSlice";
import type { ReadingPersistentField } from "./readingPersistentFields";
import { mergeIntervalHistory, normalizeIntervalState } from "./intervalPersistence";
import { mergeRhythmHistory, normalizeRhythmState } from "./rhythmPersistence";
import { mergeBassHistory, normalizeBassState } from "./bassPersistence";
import { mergeTwoHandHistory, normalizeTwoHandState } from "./twoHandPersistence";
import { mergeHeldBassHistory, normalizeHeldBassState } from "./heldBassPersistence";
import {
  mergeIndependentRhythmHistory,
  normalizeIndependentRhythmState
} from "./independentRhythmPersistence";

export type CourseStateKey =
  "intervals" | "rhythm" | "bass" | "coordination" | "heldBass" | "independentRhythm";
type CourseId = Exclude<NonNullable<ReadingState["activeCourse"]>, "note-reading">;
type History<K extends CourseStateKey> = ReadingState[K]["history"];

/** A course stored beside P2: its slot in the reading state and how a tab saves it. */
export interface ReadingCourseStore<K extends CourseStateKey = CourseStateKey> {
  readonly key: K;
  readonly course: CourseId;
  /** The first reading schema version that stores this course. */
  readonly since: number;
  readonly normalize: (value: unknown) => { state: ReadingState[K]; invalid: boolean };
  readonly mergeHistory: (saved: History<K>, incoming: History<K>) => History<K>;
  /** The run selection: a tab that changed any of these keys owns all of them. */
  readonly selection: {
    readonly field: ReadingPersistentField;
    readonly keys: readonly (keyof ReadingState[K])[];
    /** A new run of the active course changes the selection too. */
    readonly followsRevision: boolean;
  };
  /** Preferences a tab owns one by one. */
  readonly preferences: readonly {
    readonly field: ReadingPersistentField;
    readonly key: keyof ReadingState[K];
  }[];
  /** A stored active course resumes only from a state that can start it. */
  readonly resumable?: (state: ReadingState[K]) => boolean;
}

const store = <K extends CourseStateKey>(value: ReadingCourseStore<K>) =>
  value as unknown as ReadingCourseStore;

export const READING_COURSE_STORES: readonly ReadingCourseStore[] = [
  store({
    key: "intervals",
    course: "interval-training",
    since: 3,
    normalize: (value) => {
      const { intervals, invalid } = normalizeIntervalState(value);
      return { state: intervals, invalid };
    },
    mergeHistory: mergeIntervalHistory,
    selection: {
      field: "intervalSelection",
      keys: ["mode", "seed", "generatorVersion"],
      followsRevision: false
    },
    preferences: [{ field: "intervalSourceFilter", key: "sourceFilter" }],
    resumable: (state) => state.mode !== null
  }),
  store({
    key: "rhythm",
    course: "rhythm-training",
    since: 4,
    normalize: (value) => {
      const { rhythm, invalid } = normalizeRhythmState(value);
      return { state: rhythm, invalid };
    },
    mergeHistory: mergeRhythmHistory,
    selection: {
      field: "rhythmSelection",
      keys: ["seed", "bpm", "inputSource", "generatorVersion"],
      followsRevision: true
    },
    preferences: []
  }),
  store({
    key: "bass",
    course: "bass-reading",
    since: 5,
    normalize: (value) => {
      const { bass, invalid } = normalizeBassState(value);
      return { state: bass, invalid };
    },
    mergeHistory: mergeBassHistory,
    selection: {
      field: "bassSelection",
      keys: ["task", "seed", "generatorVersion"],
      followsRevision: true
    },
    preferences: [{ field: "bassSourceFilter", key: "sourceFilter" }]
  }),
  store({
    key: "coordination",
    course: "two-hand-coordination",
    since: 6,
    normalize: (value) => {
      const { coordination, invalid } = normalizeTwoHandState(value);
      return { state: coordination, invalid };
    },
    mergeHistory: mergeTwoHandHistory,
    selection: {
      field: "twoHandSelection",
      keys: ["seed", "generatorVersion"],
      followsRevision: true
    },
    preferences: [{ field: "twoHandSourceFilter", key: "sourceFilter" }]
  }),
  store({
    key: "heldBass",
    course: "held-bass-reading",
    since: 7,
    normalize: (value) => {
      const { heldBass, invalid } = normalizeHeldBassState(value);
      return { state: heldBass, invalid };
    },
    mergeHistory: mergeHeldBassHistory,
    selection: {
      field: "heldBassSelection",
      keys: ["seed", "generatorVersion"],
      followsRevision: true
    },
    preferences: [{ field: "heldBassSourceFilter", key: "sourceFilter" }]
  }),
  store({
    key: "independentRhythm",
    course: "independent-rhythm-reading",
    since: 8,
    normalize: (value) => {
      const { independentRhythm, invalid } = normalizeIndependentRhythmState(value);
      return { state: independentRhythm, invalid };
    },
    mergeHistory: mergeIndependentRhythmHistory,
    selection: {
      field: "independentRhythmSelection",
      keys: ["seed", "generatorVersion"],
      followsRevision: true
    },
    preferences: [
      { field: "independentRhythmSource", key: "inputSource" },
      { field: "independentRhythmSourceFilter", key: "sourceFilter" },
      { field: "independentRhythmKeyHints", key: "showKeyHints" }
    ]
  })
];

/** The six course slots of a reading state, in store order. */
export type ReadingCourseStates = Pick<ReadingState, CourseStateKey>;

/** A field-by-field view of one course slot, for code that walks every store. */
export const courseSlot = (states: ReadingCourseStates, key: CourseStateKey) =>
  states[key] as unknown as Record<string, unknown> & { history: unknown[] };
