// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import { createAppStore } from "./store";
import { practiceActions, practiceReducer } from "./practiceSlice";
import { songActions } from "./songSlice";

const song: Song = {
  title: "fixture",
  source: "midi",
  duration: 1,
  notes: [],
  beats: [],
  measures: []
};
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("shared transient practice controls", () => {
  it("clears the selected MIDI role on another source and preserves it during transposition", () => {
    const chosen = practiceReducer(undefined, practiceActions.partRoleChosen("bass"));
    const transposed = practiceReducer(chosen, songActions.transposeChanged(2));
    expect(transposed.partRole).toBe("bass");
    expect(transposed).toBe(chosen);
    const opened = practiceReducer(
      transposed,
      songActions.songOpened({ song, lesson: null, librarySource: "my:fixture" })
    );
    expect(opened.partRole).toBeNull();
  });

  it("updates each control without replacing the other transient selections", () => {
    const store = createAppStore();
    store.dispatch(
      practiceActions.rangeChanged({ songKey: "fixture", from: 1, to: 8, loop: true })
    );
    store.dispatch(practiceActions.wordPartChosen({ songKey: "fixture", part: "bass" }));
    store.dispatch(practiceActions.partRoleChosen("melody"));
    expect(store.getState().practice).toEqual({
      range: { songKey: "fixture", from: 1, to: 8, loop: true },
      wordSelection: { songKey: "fixture", part: "bass" },
      partRole: "melody"
    });
  });

  it("does not persist or restore range, word-part selection or MIDI role", () => {
    const store = createAppStore(),
      initial = store.getState().practice;
    const write = vi.spyOn(localStorage, "setItem");
    store.dispatch(
      practiceActions.rangeChanged({ songKey: "fixture", from: 1, to: 8, loop: true })
    );
    store.dispatch(practiceActions.wordPartChosen({ songKey: "fixture", part: "bass" }));
    store.dispatch(practiceActions.partRoleChosen("bass"));
    expect(write).not.toHaveBeenCalled();
    expect(createAppStore().getState().practice).toEqual(initial);
  });
});
