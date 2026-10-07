// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Take } from "../recording/take";
import { createAppStore } from "./store";
import { reviewActions } from "./reviewSlice";
import { persistenceKey } from "./preferencePersistence";
import { persistenceErrorChanged } from "./persistenceSlice";

const fixture = (id = "take", songKey = "song"): Take => ({
  id,
  songKey,
  createdAt: "2026-10-07T10:00:00.000Z",
  mode: "tempo",
  speed: 1,
  hands: ["right"],
  from: 0,
  pedal: [],
  notes: [{ pitch: 60, velocity: 80, start: 0, end: 1, realStart: 0, realEnd: 1 }]
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});
describe("review persistence", () => {
  it("loads a song's history without persisting transient review controls", () => {
    localStorage.setItem("takes:song", JSON.stringify([fixture()]));
    const write = vi.spyOn(localStorage, "setItem"),
      store = createAppStore();
    store.dispatch(reviewActions.contextChanged("song"));
    store.dispatch(reviewActions.takeSelected("take"));
    store.dispatch(reviewActions.reviewShownChanged(true));
    store.dispatch(reviewActions.comparingChanged(true));
    store.dispatch(reviewActions.takeStaffChanged("column"));
    store.dispatch(reviewActions.splitDirectionChanged("column"));
    store.dispatch(reviewActions.replayRequested());
    expect(store.getState().review).toMatchObject({
      selectedId: "take",
      comparing: true,
      reviewShown: true,
      replayCount: 1
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("clears the selected take on every context transition while retaining histories", () => {
    const store = createAppStore();
    store.dispatch(reviewActions.contextChanged("song"));
    store.dispatch(reviewActions.takeCompleted({ take: fixture(), autoReview: true }));
    store.dispatch(reviewActions.comparingChanged(true));
    store.dispatch(reviewActions.contextChanged("other"));
    expect(store.getState().review).toMatchObject({
      selectedId: null,
      comparing: false,
      reviewShown: false
    });
    store.dispatch(reviewActions.contextChanged("song"));
    expect(store.getState().review.selectedId).toBeNull();
    expect(store.getState().review.historyBySong.song).toEqual([fixture()]);
    store.dispatch(reviewActions.takeSelected("missing"));
    expect(store.getState().review.selectedId).toBeNull();
  });

  it("merges cold saved history, persists once, deduplicates and reloads completed takes", () => {
    localStorage.setItem("takes:song", JSON.stringify([fixture("older")]));
    const store = createAppStore(),
      write = vi.spyOn(localStorage, "setItem");
    store.dispatch(reviewActions.takeCompleted({ take: fixture("new"), autoReview: false }));
    expect(store.getState().review.historyBySong.song?.map((take) => take.id)).toEqual([
      "new",
      "older"
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    store.dispatch(reviewActions.takeCompleted({ take: fixture("new"), autoReview: true }));
    expect(write).toHaveBeenCalledTimes(1);
    const reloaded = createAppStore();
    reloaded.dispatch(reviewActions.contextChanged("song"));
    expect(reloaded.getState().review.historyBySong.song?.map((take) => take.id)).toEqual([
      "new",
      "older"
    ]);
  });

  it("keeps new takes in memory when storage is full and retains unrelated errors", () => {
    const store = createAppStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Full", "QuotaExceededError");
        }
      }
    });
    store.dispatch(reviewActions.contextChanged("song"));
    store.dispatch(persistenceErrorChanged({ key: "indexedDB:folder:write", error: "aborted" }));
    store.dispatch(reviewActions.takeCompleted({ take: fixture(), autoReview: true }));
    expect(store.getState().review.historyBySong.song).toEqual([fixture()]);
    expect(store.getState().review.selectedId).toBe("take");
    expect(store.getState().persistence.errors).toMatchObject({
      [persistenceKey("takes:song", "write")]: "unavailable",
      "indexedDB:folder:write": "aborted"
    });
  });

  it("reports malformed saved takes and does not let a different song's take replace selection", () => {
    localStorage.setItem("takes:song", "broken json");
    const store = createAppStore();
    store.dispatch(reviewActions.contextChanged("song"));
    expect(store.getState().persistence.errors[persistenceKey("takes:song", "read")]).toBe(
      "invalid"
    );
    store.dispatch(
      reviewActions.takeCompleted({ take: fixture("old", "other"), autoReview: true })
    );
    expect(store.getState().review.selectedId).toBeNull();
    expect(store.getState().review.historyBySong.other?.[0]?.id).toBe("old");
  });
});
