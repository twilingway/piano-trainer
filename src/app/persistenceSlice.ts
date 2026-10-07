import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface PersistenceState {
  errors: Record<string, string>;
}
const initialState: PersistenceState = { errors: {} };
const slice = createSlice({
  name: "persistence",
  initialState,
  reducers: {
    persistenceErrorChanged(state, action: PayloadAction<{ key: string; error: string | null }>) {
      const { key, error } = action.payload;
      if (error === null) {
        const { [key]: removed, ...remaining } = state.errors;
        state.errors = remaining;
      } else state.errors[key] = error;
    }
  }
});
export const { persistenceErrorChanged } = slice.actions;
export const persistenceReducer = slice.reducer;
