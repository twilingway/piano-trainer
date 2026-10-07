import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import { appendTake, readTakes, takeStorageKey } from "../recording/history";
import {
  browserPreferenceStorage,
  persistenceKey,
  type PreferenceRoot,
  type PreferenceStorage
} from "./preferencePersistence";
import { persistenceErrorChanged } from "./persistenceSlice";
import { reviewActions, type ReviewRoot } from "./reviewSlice";

/** UI visibility/selection is transient; only completed takes write the compatible history. */
export function registerReviewPersistence<State extends PreferenceRoot & ReviewRoot>(
  listener: ListenerMiddlewareInstance<State>,
  storage: PreferenceStorage = browserPreferenceStorage()
) {
  return listener.startListening({
    predicate: (action) =>
      reviewActions.contextChanged.match(action) || reviewActions.takeCompleted.match(action),
    effect: (action, api) => {
      if (reviewActions.contextChanged.match(action)) {
        if (api.getState().review.historyBySong[action.payload] !== undefined) return;
        const { takes, error } = readTakes(action.payload, storage);
        api.dispatch(reviewActions.historyLoaded({ songKey: action.payload, takes }));
        api.dispatch(
          persistenceErrorChanged({
            key: persistenceKey(takeStorageKey(action.payload), "read"),
            error
          })
        );
        return;
      }
      if (!reviewActions.takeCompleted.match(action)) return;
      const { take } = action.payload;
      let previous = api.getOriginalState().review.historyBySong[take.songKey];
      // A take can finish before its context was shown. Merge existing saved history once.
      if (previous === undefined) {
        const { takes, error } = readTakes(take.songKey, storage);
        previous = takes;
        api.dispatch(
          reviewActions.historyLoaded({ songKey: take.songKey, takes: appendTake(take, takes) })
        );
        api.dispatch(
          persistenceErrorChanged({
            key: persistenceKey(takeStorageKey(take.songKey), "read"),
            error
          })
        );
      }
      const key = takeStorageKey(take.songKey);
      const current = api.getState().review.historyBySong[take.songKey] ?? [];
      if (JSON.stringify(previous) === JSON.stringify(current)) return;
      try {
        storage.setItem(key, JSON.stringify(current));
        api.dispatch(persistenceErrorChanged({ key: persistenceKey(key, "write"), error: null }));
      } catch {
        api.dispatch(
          persistenceErrorChanged({ key: persistenceKey(key, "write"), error: "unavailable" })
        );
      }
    }
  });
}
