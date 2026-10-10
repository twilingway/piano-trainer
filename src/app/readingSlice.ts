import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingPreferences,
  type ReadingResult,
  type ReadingTask
} from "../reading/types";
import { songActions } from "./songSlice";

export interface ReadingState {
  task: ReadingTask | null;
  seed: number;
  preferences: ReadingPreferences;
  history: ReadingResult[];
}
export interface ReadingRoot {
  reading: ReadingState;
}
export const initialReadingState: ReadingState = {
  task: null,
  seed: 1,
  preferences: DEFAULT_READING_PREFERENCES,
  history: []
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
    select(state, { payload }: PayloadAction<{ task: ReadingTask; seed: number }>) {
      state.task = payload.task;
      state.seed = payload.seed >>> 0;
    },
    exit(state) {
      state.task = null;
    },
    preferencesChanged(state, { payload }: PayloadAction<Partial<ReadingPreferences>>) {
      state.preferences = normalizeReadingPreferences({ ...state.preferences, ...payload });
    },
    resultAdded(state, { payload }: PayloadAction<ReadingResult>) {
      if (state.history.some((result) => result.id === payload.id)) return;
      state.history.push({
        ...payload,
        notes: payload.notes.map((note) => ({ ...note, attempts: [...note.attempts] }))
      });
      const same = state.history.filter((result) => result.task === payload.task);
      const keep = new Set(same.slice(-20).map((result) => result.id));
      state.history = state.history.filter(
        (result) => result.task !== payload.task || keep.has(result.id)
      );
    }
  },
  extraReducers: (builder) => {
    builder.addCase(songActions.songOpened, (state) => {
      state.task = null;
    });
  }
});
export const readingActions = readingSlice.actions;
export const readingReducer = readingSlice.reducer;
