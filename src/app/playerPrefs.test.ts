// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadPlayerPrefs,
  normalizeCountdownSeconds,
  normalizePlayerPrefs,
  savePlayerPrefs
} from "./playerPrefs";
import { createAppStore } from "./store";
import { preferencesActions } from "./preferencesSlice";
beforeEach(() => {
  localStorage.clear();
});
describe("count-in preference", () => {
  it.each([undefined, null, "3", NaN, Infinity])(
    "defaults malformed %s to three without resetting other preferences",
    (value) => {
      expect(
        normalizePlayerPrefs({ countdownSeconds: value, speed: 0.5, metronome: true })
      ).toMatchObject({ countdownSeconds: 3, speed: 0.5, metronome: true });
    }
  );
  it.each([
    [0, 0],
    [10, 10],
    [-1, 0],
    [12, 10],
    [2.6, 3]
  ])("bounds %s to %s whole seconds", (value, expected) => {
    expect(normalizeCountdownSeconds(value)).toBe(expected);
  });
  it("persists zero through the store and reloads", () => {
    const store = createAppStore();
    store.dispatch(preferencesActions.playerChanged({ countdownSeconds: 0 }));
    expect(createAppStore().getState().preferences.player.countdownSeconds).toBe(0);
    savePlayerPrefs({ countdownSeconds: 7 });
    expect(loadPlayerPrefs().countdownSeconds).toBe(7);
  });
});
