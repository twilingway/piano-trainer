import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingPreferences,
  type ReadingResult,
  type ReadingTask
} from "../reading/types";
import { songActions } from "./songSlice";
import { addReadingResult, emptyReadingProfile, readingPurpose } from "../reading/progress";
import type { ReadingPlan, ReadingProfile, ReadingSourceFilter } from "../reading/progressTypes";

export interface ReadingState {
  schemaVersion: 2;
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
  schemaVersion: 2,
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
      state.seed = payload.seed >>> 0;
      state.plan = payload.plan ? { ...payload.plan, counts: [...payload.plan.counts] } : null;
      state.selectionRevision++;
    },
    exit(state) {
      state.task = null;
      state.selectionRevision++;
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
      state.task = null;
      state.selectionRevision++;
    });
  }
});
export const readingActions = readingSlice.actions;
export const readingReducer = readingSlice.reducer;
