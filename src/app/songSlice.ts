import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Finger } from "../fingering/fingering";
import type { Song } from "../song/song";
import type { LessonChoice } from "./lessons";

export interface SongState {
  sourceSong: Song;
  lesson: LessonChoice | null;
  librarySource: string | null;
  transpose: number;
  octave: number;
  simplified: boolean;
  revision: number;
  overridesByKey: Record<string, Record<string, Finger>>;
}
const initialState: SongState = {
  sourceSong: { title: "", source: "midi", notes: [], beats: [], measures: [], duration: 0 },
  lesson: null,
  librarySource: null,
  transpose: 0,
  octave: 0,
  simplified: true,
  revision: 0,
  overridesByKey: {}
};
const slice = createSlice({
  name: "song",
  initialState,
  reducers: {
    beginSongSelection(state) {
      state.revision++;
    },
    songOpened(
      state,
      action: PayloadAction<{
        song: Song;
        lesson: LessonChoice | null;
        librarySource: string | null;
      }>
    ) {
      return {
        ...state,
        sourceSong: action.payload.song,
        lesson: action.payload.lesson,
        librarySource: action.payload.librarySource,
        transpose: 0,
        octave: 0,
        simplified: true,
        revision: state.revision + 1
      };
    },
    librarySourceChanged(state, action: PayloadAction<string | null>) {
      state.librarySource = action.payload;
    },
    transposeChanged(state, action: PayloadAction<number>) {
      state.transpose = action.payload;
    },
    octaveChanged(state, action: PayloadAction<number>) {
      state.octave = action.payload;
    },
    simplifiedChanged(state, action: PayloadAction<boolean>) {
      state.simplified = action.payload;
    },
    overridesLoaded(
      state,
      action: PayloadAction<{ key: string; overrides: Record<string, Finger> }>
    ) {
      state.overridesByKey[action.payload.key] = action.payload.overrides;
    },
    fingerChanged(state, action: PayloadAction<{ key: string; noteId: string; finger: Finger }>) {
      const { key, noteId, finger } = action.payload;
      state.overridesByKey[key] = { ...state.overridesByKey[key], [noteId]: finger };
    },
    fingersReset(state, action: PayloadAction<string>) {
      state.overridesByKey[action.payload] = {};
    }
  }
});
export const songReducer = slice.reducer;
export const songActions = slice.actions;
