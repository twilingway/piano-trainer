import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { MySong } from "../library/myLibrary";

export interface LibraryState {
  mySongs: MySong[];
  folder: { name: string; needsAccess: boolean; songs: { path: string; title: string }[] } | null;
  loadError: string | null;
  loading: boolean;
}
const initialState: LibraryState = { mySongs: [], folder: null, loadError: null, loading: false };
const slice = createSlice({
  name: "library",
  initialState,
  reducers: {
    songsLoaded(state, action: PayloadAction<MySong[]>) {
      state.mySongs = action.payload;
    },
    folderLoaded(state, action: PayloadAction<LibraryState["folder"]>) {
      state.folder = action.payload;
    },
    errorChanged(state, action: PayloadAction<string | null>) {
      state.loadError = action.payload;
    },
    loadingChanged(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    }
  }
});
export const libraryActions = slice.actions;
export const libraryReducer = slice.reducer;
