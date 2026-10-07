import { practiceActions } from "./practiceSlice";
import { useMemo } from "react";
import type { PlayableRange } from "../practice/playableRange";

import type { GamePreferences } from "./gamePreferences";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";
/** `playable` is the player's keyboard; Ranked and the practice-only word mode ask for every note. */
export function useGameOptions(
  songKey: string,
  duration: number,
  practiceOnly = false,
  playable?: PlayableRange
) {
  const preferences = useAppSelector((state) => state.preferences.game);
  const dispatch = useAppDispatch();
  const ranked = preferences.ranked && !practiceOnly;
  const storedRange = useAppSelector((state) => state.practice.range);
  const store = useAppStore();
  const range =
    storedRange.songKey === songKey ? storedRange : { songKey, from: 0, to: duration, loop: false };
  const update = (change: Partial<GamePreferences>) => {
    dispatch(preferencesActions.gameChanged(change));
  };
  const updateRange = (change: Partial<typeof range>) => {
    const current = store.getState().practice.range;
    const next = {
      ...(current.songKey === songKey ? current : { songKey, from: 0, to: duration, loop: false }),
      ...change
    };
    next.from = Math.max(0, Math.min(next.from, Math.max(0, duration - 0.01)));
    next.to = Math.max(next.from + 0.01, Math.min(next.to, duration));
    dispatch(practiceActions.rangeChanged(next));
  };
  const options = useMemo(
    () => ({
      difficulty: preferences.difficulty,
      learningWindow: preferences.learningWindow && !ranked,
      from: ranked ? 0 : range.from,
      to: ranked ? duration : range.to,
      ...(playable && !ranked && !practiceOnly ? { playable } : {})
    }),
    [
      preferences.difficulty,
      preferences.learningWindow,
      ranked,
      range.from,
      range.to,
      duration,
      playable,
      practiceOnly
    ]
  );
  return { ...preferences, ranked, range, options, update, updateRange };
}
