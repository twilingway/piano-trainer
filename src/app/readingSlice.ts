import type { MusicCourse, MusicPurpose } from "../musicLearning/types";
import type { MusicResult, IntegratedProgress } from "../musicLearning/progress";
import { validateIntegratedProgress } from "../musicLearning/progressIntegrated";
import {
  emptyMusicState,
  mergeMusicHistory,
  validMusicSelection,
  validMusicPreference,
  copyMusicIntegrated,
  MUSIC_PREFERENCE_FIELDS,
  type MusicPersistentState,
  type MusicPreferences
} from "./musicPersistence";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingPreferences,
  type ReadingInputSource,
  type ReadingResult,
  type ReadingTask
} from "../reading/types";
import { songActions } from "./songSlice";
import { addReadingResult, emptyReadingProfile, readingPurpose } from "../reading/progress";
import type { ReadingPlan, ReadingProfile, ReadingSourceFilter } from "../reading/progressTypes";
import type { IntervalMode, IntervalResult } from "../intervals/types";
import type { RhythmBpm, RhythmInputSource, RhythmResult } from "../rhythm/types";
import type { BassReadingResult, BassReadingTask } from "../reading/bassTypes";
import { emptyBassState, mergeBassHistory, type BassPersistentState } from "./bassPersistence";
import type { HeldBassResult } from "../reading/heldBassTypes";
import {
  emptyHeldBassState,
  mergeHeldBassHistory,
  type HeldBassPersistentState
} from "./heldBassPersistence";
import type { TwoHandResult } from "../reading/twoHandTypes";
import {
  emptyTwoHandState,
  mergeTwoHandHistory,
  type TwoHandPersistentState
} from "./twoHandPersistence";
import {
  emptyRhythmState,
  mergeRhythmHistory,
  type RhythmPersistentState
} from "./rhythmPersistence";
import {
  emptyIntervalState,
  mergeIntervalHistory,
  type IntervalPersistentState
} from "./intervalPersistence";

import type { IndependentRhythmResult } from "../independentRhythm/types";
import {
  emptyIndependentRhythmState,
  mergeIndependentRhythmHistory,
  type IndependentRhythmPersistentState
} from "./independentRhythmPersistence";

export interface ReadingState {
  schemaVersion: 9;
  activeCourse:
    | "music-learning"
    | "note-reading"
    | "interval-training"
    | "rhythm-training"
    | "bass-reading"
    | "two-hand-coordination"
    | "held-bass-reading"
    | "independent-rhythm-reading"
    | null;
  music: MusicPersistentState;
  intervals: IntervalPersistentState;
  rhythm: RhythmPersistentState;
  bass: BassPersistentState;
  coordination: TwoHandPersistentState;
  heldBass: HeldBassPersistentState;
  independentRhythm: IndependentRhythmPersistentState;
  task: ReadingTask | null;
  seed: number;
  preferences: ReadingPreferences;
  history: ReadingResult[];
  plan: ReadingPlan | null;
  sourceFilter: ReadingSourceFilter;
  profile: ReadingProfile;
  presentedFingerprints: string[];
  /** Runtime selection identity; never restores active answers. */
  selectionRevision: number;
}
export interface ReadingRoot {
  reading: ReadingState;
}
export const initialReadingState: ReadingState = {
  schemaVersion: 9,
  activeCourse: null,
  music: emptyMusicState(),
  intervals: emptyIntervalState(),
  rhythm: emptyRhythmState(),
  bass: emptyBassState(),
  coordination: emptyTwoHandState(),
  heldBass: emptyHeldBassState(),
  independentRhythm: emptyIndependentRhythmState(),
  task: null,
  seed: 1,
  preferences: DEFAULT_READING_PREFERENCES,
  history: [],
  plan: null,
  sourceFilter: "all",
  profile: emptyReadingProfile(),
  presentedFingerprints: [],
  selectionRevision: 0
};

export function normalizeReadingPreferences(
  value: Partial<ReadingPreferences>
): ReadingPreferences {
  const delay = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(1000, Math.min(60000, value))
      : fallback;
  const nameDelayMs = delay(value.nameDelayMs, 5000);
  return {
    automaticHints: typeof value.automaticHints === "boolean" ? value.automaticHints : true,
    nameDelayMs,
    keyDelayMs: Math.max(nameDelayMs, delay(value.keyDelayMs, 10000))
  };
}
const readingSlice = createSlice({
  name: "reading",
  initialState: initialReadingState,
  reducers: {
    select(
      state,
      { payload }: PayloadAction<{ task: ReadingTask; seed: number; plan?: ReadingPlan }>
    ) {
      state.task = payload.task;
      state.activeCourse = "note-reading";
      state.seed = payload.seed >>> 0;
      state.plan = payload.plan ? { ...payload.plan, counts: [...payload.plan.counts] } : null;
      state.selectionRevision++;
    },
    exit(state) {
      state.activeCourse = null;
      state.selectionRevision++;
    },
    musicSelected(
      state,
      {
        payload
      }: PayloadAction<{
        course: MusicCourse;
        seed: number;
        purpose?: MusicPurpose;
        generatorVersion?: number;
      }>
    ) {
      if (
        !validMusicSelection(payload) ||
        (payload.generatorVersion !== undefined && payload.generatorVersion !== 1)
      )
        return;
      state.activeCourse = "music-learning";
      state.music.course = payload.course;
      state.music.seed = payload.seed;
      state.music.generatorVersion = 1;
      if (payload.purpose !== undefined) state.music.purpose = payload.purpose;
      state.selectionRevision++;
    },
    musicMaterialPrepared(
      state,
      { payload }: PayloadAction<{ seed: number; selectionRevision: number }>
    ) {
      if (
        state.activeCourse !== "music-learning" ||
        payload.selectionRevision !== state.selectionRevision ||
        !Number.isInteger(payload.seed) ||
        payload.seed < 0 ||
        payload.seed > 0xffffffff
      )
        return;
      state.music.seed = payload.seed;
    },
    musicPreferencesChanged(state, { payload }: PayloadAction<Partial<MusicPreferences>>) {
      let changesInputSource = false;
      for (const { key } of MUSIC_PREFERENCE_FIELDS) {
        if (
          payload[key] === undefined ||
          !validMusicPreference(key, payload[key]) ||
          state.music[key] === payload[key]
        )
          continue;
        Object.assign(state.music, { [key]: payload[key] });
        if (key === "inputSource") changesInputSource = true;
      }
      if (changesInputSource && state.activeCourse === "music-learning") state.selectionRevision++;
    },
    musicResultAdded(state, { payload }: PayloadAction<MusicResult>) {
      state.music.history = mergeMusicHistory(state.music.history, [payload]);
    },
    musicIntegratedChanged(state, { payload }: PayloadAction<IntegratedProgress | null>) {
      if (payload !== null && !validateIntegratedProgress(payload)) return;
      state.music.integrated = payload === null ? null : copyMusicIntegrated(payload);
    },
    intervalSelected(
      state,
      { payload }: PayloadAction<{ mode: IntervalMode; seed: number; generatorVersion?: number }>
    ) {
      state.activeCourse = "interval-training";
      state.intervals.mode = payload.mode;
      state.intervals.seed = payload.seed >>> 0;
      state.intervals.generatorVersion = payload.generatorVersion ?? 1;
      state.selectionRevision++;
    },
    intervalSourceFilterChanged(state, { payload }: PayloadAction<ReadingSourceFilter>) {
      state.intervals.sourceFilter = payload;
    },
    intervalResultAdded(state, { payload }: PayloadAction<IntervalResult>) {
      state.intervals.history = mergeIntervalHistory(state.intervals.history, [payload]);
    },
    rhythmSelected(
      state,
      {
        payload
      }: PayloadAction<{
        seed: number;
        bpm: RhythmBpm;
        inputSource: RhythmInputSource;
        generatorVersion?: number;
      }>
    ) {
      state.activeCourse = "rhythm-training";
      state.rhythm.seed = payload.seed >>> 0;
      state.rhythm.bpm = payload.bpm;
      state.rhythm.inputSource = payload.inputSource;
      state.rhythm.generatorVersion = payload.generatorVersion ?? 1;
      state.selectionRevision++;
    },
    rhythmResultAdded(state, { payload }: PayloadAction<RhythmResult>) {
      state.rhythm.history = mergeRhythmHistory(state.rhythm.history, [payload]);
    },
    bassSelected(
      state,
      { payload }: PayloadAction<{ task: BassReadingTask; seed: number; generatorVersion?: number }>
    ) {
      state.activeCourse = "bass-reading";
      state.bass.task = payload.task;
      state.bass.seed = payload.seed >>> 0;
      state.bass.generatorVersion = payload.generatorVersion ?? 1;
      state.selectionRevision++;
    },
    bassSourceFilterChanged(state, { payload }: PayloadAction<ReadingSourceFilter>) {
      state.bass.sourceFilter = payload;
    },
    bassResultAdded(state, { payload }: PayloadAction<BassReadingResult>) {
      state.bass.history = mergeBassHistory(state.bass.history, [payload]);
    },
    twoHandSelected(
      state,
      { payload }: PayloadAction<{ seed: number; generatorVersion?: number }>
    ) {
      if (payload.generatorVersion !== undefined && payload.generatorVersion !== 1) return;
      state.activeCourse = "two-hand-coordination";
      state.coordination.seed = payload.seed >>> 0;
      state.coordination.generatorVersion = payload.generatorVersion ?? 1;
      state.selectionRevision++;
    },
    twoHandSourceFilterChanged(state, { payload }: PayloadAction<ReadingSourceFilter>) {
      state.coordination.sourceFilter = payload;
    },
    twoHandResultAdded(state, { payload }: PayloadAction<TwoHandResult>) {
      state.coordination.history = mergeTwoHandHistory(state.coordination.history, [payload]);
    },
    heldBassSelected(
      state,
      { payload }: PayloadAction<{ seed: number; generatorVersion?: number }>
    ) {
      if (payload.generatorVersion !== undefined && payload.generatorVersion !== 1) return;
      state.activeCourse = "held-bass-reading";
      state.heldBass.seed = payload.seed >>> 0;
      state.heldBass.generatorVersion = payload.generatorVersion ?? 1;
      state.selectionRevision++;
    },
    heldBassSourceFilterChanged(state, { payload }: PayloadAction<ReadingSourceFilter>) {
      state.heldBass.sourceFilter = payload;
    },
    heldBassResultAdded(state, { payload }: PayloadAction<HeldBassResult>) {
      state.heldBass.history = mergeHeldBassHistory(state.heldBass.history, [payload]);
    },
    independentRhythmSelected(
      state,
      { payload }: PayloadAction<{ seed: number; generatorVersion?: number }>
    ) {
      if (payload.generatorVersion !== undefined && payload.generatorVersion !== 1) return;
      state.activeCourse = "independent-rhythm-reading";
      state.independentRhythm.seed = payload.seed >>> 0;
      state.independentRhythm.generatorVersion = payload.generatorVersion ?? 1;
      state.selectionRevision++;
    },
    independentRhythmResultAdded(state, { payload }: PayloadAction<IndependentRhythmResult>) {
      state.independentRhythm.history = mergeIndependentRhythmHistory(
        state.independentRhythm.history,
        [payload]
      );
    },
    independentRhythmSourceChanged(state, { payload }: PayloadAction<ReadingInputSource>) {
      if (state.independentRhythm.inputSource === payload) return;
      state.independentRhythm.inputSource = payload;
      if (state.activeCourse === "independent-rhythm-reading") state.selectionRevision++;
    },
    independentRhythmSourceFilterChanged(state, { payload }: PayloadAction<ReadingSourceFilter>) {
      state.independentRhythm.sourceFilter = payload;
    },
    independentRhythmKeyHintsChanged(state, { payload }: PayloadAction<boolean>) {
      state.independentRhythm.showKeyHints = payload;
    },
    hydrated(state, { payload }: PayloadAction<ReadingState>) {
      return { ...payload, selectionRevision: state.selectionRevision };
    },
    sourceFilterChanged(state, { payload }: PayloadAction<ReadingSourceFilter>) {
      state.sourceFilter = payload;
    },
    presented(state, { payload }: PayloadAction<string>) {
      state.presentedFingerprints = state.presentedFingerprints.filter((key) => key !== payload);
      state.presentedFingerprints.push(payload);
      state.presentedFingerprints = state.presentedFingerprints.slice(-256);
    },
    preferencesChanged(state, { payload }: PayloadAction<Partial<ReadingPreferences>>) {
      state.preferences = normalizeReadingPreferences({ ...state.preferences, ...payload });
    },
    resultAdded(state, { payload }: PayloadAction<ReadingResult>) {
      if (payload.skillId !== undefined && payload.skillId !== "note-reading") return;
      if (payload.notes.some((note) => ![60, 62, 64, 65, 67].includes(note.expectedMidi))) return;
      if (
        state.history.some((result) => result.id === payload.id) ||
        state.profile.processedRunIds.includes(payload.runId ?? payload.id)
      )
        return;
      const profile = addReadingResult(state.profile, payload);
      state.profile = {
        ...profile,
        observations: [...profile.observations],
        lastIndependent: [...profile.lastIndependent],
        processedRunIds: [...profile.processedRunIds]
      };
      state.history.push({
        ...payload,
        plan: payload.plan ? { ...payload.plan, counts: [...payload.plan.counts] } : null,
        notes: payload.notes.map((note) => ({
          ...note,
          attempts: [...note.attempts],
          hintHistory: note.hintHistory?.map((hint) => ({ ...hint })) ?? null
        }))
      });
      const purpose = readingPurpose(payload);
      const same = state.history.filter((result) => readingPurpose(result) === purpose);
      const keep = new Set(same.slice(-20).map((result) => result.id));
      state.history = state.history.filter(
        (result) => readingPurpose(result) !== purpose || keep.has(result.id)
      );
    }
  },
  extraReducers: (builder) => {
    builder.addCase(songActions.songOpened, (state) => {
      state.activeCourse = null;
      state.selectionRevision++;
    });
  }
});
export const readingActions = readingSlice.actions;
export const readingReducer = readingSlice.reducer;
