import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { appendTake } from "../recording/history";
import type { Take } from "../recording/take";

export type SplitDirection = "row" | "column";
export type TakeStaff = "off" | SplitDirection;
export interface ReviewState {
  songKey: string | null;
  historyBySong: Record<string, readonly Take[]>;
  selectedId: string | null;
  reviewShown: boolean;
  comparing: boolean;
  splitDirection: SplitDirection;
  replayCount: number;
  takeStaff: TakeStaff;
}
export interface ReviewRoot {
  review: ReviewState;
}
const initialState: ReviewState = {
  songKey: null,
  historyBySong: {},
  selectedId: null,
  reviewShown: false,
  comparing: false,
  splitDirection: "row",
  replayCount: 0,
  takeStaff: "off"
};
const slice = createSlice({
  name: "review",
  initialState,
  reducers: {
    contextChanged(state, action: PayloadAction<string>) {
      if (state.songKey === action.payload) return;
      state.songKey = action.payload;
      state.selectedId = null;
      state.reviewShown = false;
      state.comparing = false;
    },
    historyLoaded(state, action: PayloadAction<{ songKey: string; takes: readonly Take[] }>) {
      return {
        ...state,
        historyBySong: { ...state.historyBySong, [action.payload.songKey]: action.payload.takes }
      };
    },
    takeCompleted(state, action: PayloadAction<{ take: Take; autoReview: boolean }>) {
      const { take, autoReview } = action.payload;
      return {
        ...state,
        historyBySong: {
          ...state.historyBySong,
          [take.songKey]: appendTake(take, state.historyBySong[take.songKey] ?? [])
        },
        ...(state.songKey === take.songKey ? { selectedId: take.id, reviewShown: autoReview } : {})
      };
    },
    takeSelected(state, action: PayloadAction<string>) {
      if (
        state.songKey !== null &&
        state.historyBySong[state.songKey]?.some((take) => take.id === action.payload)
      )
        state.selectedId = action.payload;
    },
    reviewShownChanged(state, action: PayloadAction<boolean>) {
      state.reviewShown = action.payload;
    },
    comparingChanged(state, action: PayloadAction<boolean>) {
      state.comparing = action.payload && state.selectedId !== null;
    },
    splitDirectionChanged(state, action: PayloadAction<SplitDirection>) {
      state.splitDirection = action.payload;
    },
    takeStaffChanged(state, action: PayloadAction<TakeStaff>) {
      state.takeStaff = action.payload;
    },
    replayRequested(state) {
      state.replayCount++;
    },
    reviewHidden(state) {
      state.selectedId = null;
      state.comparing = false;
      state.reviewShown = false;
    }
  }
});
export const reviewReducer = slice.reducer;
export const reviewActions = slice.actions;
