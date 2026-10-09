import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CourseProgress, CourseSelection } from "../course/model";

export interface CourseState {
  progress: CourseProgress;
  selection: CourseSelection | null;
  view: "tabs" | "staff" | "hidden";
  accompaniment: boolean;
  listenOnly: boolean;
}
export interface CourseRoot {
  course: CourseState;
}
export const initialCourseState: CourseState = {
  progress: {},
  selection: null,
  view: "tabs",
  accompaniment: false,
  listenOnly: false
};
const slice = createSlice({
  name: "course",
  initialState: initialCourseState,
  reducers: {
    selectionChosen(state, action: PayloadAction<CourseSelection>) {
      state.selection = action.payload;
    },
    /** The caller validates an immutable natural-finish result before dispatching its key. */
    phraseCredited(state, action: PayloadAction<string>) {
      state.progress[action.payload] = true;
    },
    viewChanged(state, action: PayloadAction<CourseState["view"]>) {
      state.view = action.payload;
    },
    accompanimentChanged(state, action: PayloadAction<boolean>) {
      state.accompaniment = action.payload;
    },
    listenOnlyChanged(state, action: PayloadAction<boolean>) {
      state.listenOnly = action.payload;
    }
  }
});
export const courseReducer = slice.reducer;
export const courseActions = slice.actions;
