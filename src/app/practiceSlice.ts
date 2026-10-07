import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PartRole } from "../song/midiParts";
import type { Part } from "../wordTyping/types";
import { songActions } from "./songSlice";

/** Shared song-scoped controls are transient and are never persisted. */
export interface PracticeControlsState {
  range: { songKey: string; from: number; to: number; loop: boolean };
  wordSelection: { songKey: string; part: Part };
  partRole: PartRole | null;
}
const initialState: PracticeControlsState = {
  range: { songKey: "", from: 0, to: 0, loop: false },
  wordSelection: { songKey: "", part: "melody" },
  partRole: null
};
const slice = createSlice({
  name: "practiceControls",
  initialState,
  reducers: {
    rangeChanged(state, action: PayloadAction<PracticeControlsState["range"]>) {
      state.range = action.payload;
    },
    wordPartChosen(state, action: PayloadAction<PracticeControlsState["wordSelection"]>) {
      state.wordSelection = action.payload;
    },
    partRoleChosen(state, action: PayloadAction<PartRole | null>) {
      state.partRole = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(songActions.songOpened, (state) => {
      state.partRole = null;
    });
  }
});
export const practiceActions = slice.actions;
export const practiceReducer = slice.reducer;
