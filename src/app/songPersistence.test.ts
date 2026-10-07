// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import { FIRST_LESSON } from "./lessons";
import { createAppStore } from "./store";
import { preferencesActions } from "./preferencesSlice";
import { songActions } from "./songSlice";
import { selectBaseSong, selectOverrides, selectSong, selectSongKey } from "./songSelectors";
import { readOverrides } from "./songPersistence";
import { persistenceKey } from "./preferencePersistence";

const fixture: Song = {
  title: "fixture",
  source: "midi",
  duration: 1,
  beats: [],
  measures: [],
  notes: [{ id: "a", pitch: 60, start: 0, startBeat: 0, duration: 1, hand: "right" }]
};
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("selected song persistence", () => {
  it("preserves the preferred library source while bootstrapping a lesson, without writing defaults", () => {
    localStorage.setItem(
      "player-prefs",
      JSON.stringify({ lesson: FIRST_LESSON, librarySource: "my:saved" })
    );
    const write = vi.spyOn(localStorage, "setItem");
    const state = createAppStore().getState();
    expect(state.song.lesson).toEqual(FIRST_LESSON);
    expect(state.song.librarySource).toBe("my:saved");
    expect(state.preferences.player.librarySource).toBe("my:saved");
    expect(write).not.toHaveBeenCalled();
  });

  it("reads legacy array pairs at startup, rejecting invalid fingers", () => {
    const key = selectSongKey(createAppStore().getState());
    localStorage.setItem(
      key,
      JSON.stringify([
        ["valid", 3],
        ["bad", 7],
        ["other", "2"],
        ["__proto__", 4]
      ])
    );
    const state = createAppStore().getState();
    expect(Object.entries(state.song.overridesByKey[key] ?? {})).toEqual([
      ["valid", 3],
      ["__proto__", 4]
    ]);
    expect(state.persistence.errors[persistenceKey(key, "read")]).toBe("invalid");
    expect(Object.getPrototypeOf(state.song.overridesByKey[key])).toBe(Object.prototype);
  });

  it("increments selection revision without saving, then persists the actual selected source", () => {
    const store = createAppStore(),
      write = vi.spyOn(localStorage, "setItem");
    store.dispatch(songActions.beginSongSelection());
    expect(store.getState().song.revision).toBe(1);
    expect(write).not.toHaveBeenCalled();
    store.dispatch(
      songActions.songOpened({ song: fixture, lesson: null, librarySource: "my:new" })
    );
    expect(store.getState().song.revision).toBe(2);
    expect(store.getState().preferences.player.librarySource).toBe("my:new");
    expect(JSON.parse(localStorage.getItem("player-prefs") ?? "null")).toMatchObject({
      librarySource: "my:new"
    });
  });

  it("hydrates corrections on a source/key change without rewriting the correction record", () => {
    localStorage.setItem("fingering:fixture:simplified:written:1", JSON.stringify([["a", 4]]));
    const store = createAppStore(),
      write = vi.spyOn(localStorage, "setItem");
    store.dispatch(songActions.songOpened({ song: fixture, lesson: null, librarySource: null }));
    expect(selectOverrides(store.getState()).get("a")).toBe(4);
    expect(selectSong(store.getState()).notes[0]?.finger).toBe(4);
    expect(write.mock.calls.some(([key]) => key === "fingering:fixture:simplified:written:1")).toBe(
      false
    );
    store.dispatch(
      songActions.fingerChanged({ key: selectSongKey(store.getState()), noteId: "a", finger: 5 })
    );
    expect(
      JSON.parse(localStorage.getItem("fingering:fixture:simplified:written:1") ?? "null")
    ).toEqual([["a", 5]]);
    store.dispatch(songActions.transposeChanged(2));
    const transposedKey = selectSongKey(store.getState());
    expect(transposedKey).not.toBe("fingering:fixture:simplified:written:1");
    expect(selectOverrides(store.getState()).size).toBe(0);
    expect(selectBaseSong(store.getState()).notes[0]?.pitch).toBe(62);
    store.dispatch(songActions.transposeChanged(0));
    expect(selectOverrides(store.getState()).get("a")).toBe(5);
    store.dispatch(songActions.fingersReset("fingering:fixture:simplified:written:1"));
    expect(localStorage.getItem("fingering:fixture:simplified:written:1")).toBe("[]");
  });

  it("keeps derived songs stable on unrelated settings and revision changes", () => {
    const store = createAppStore();
    const base = selectBaseSong(store.getState()),
      song = selectSong(store.getState());
    store.dispatch(preferencesActions.playerChanged({ speed: 0.5 }));
    store.dispatch(songActions.beginSongSelection());
    expect(selectBaseSong(store.getState())).toBe(base);
    expect(selectSong(store.getState())).toBe(song);
  });

  it("keeps corrections in memory on quota failures and records the affected operation", () => {
    const store = createAppStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Full", "QuotaExceededError");
        }
      }
    });
    const key = selectSongKey(store.getState());
    store.dispatch(songActions.fingerChanged({ key, noteId: "a", finger: 2 }));
    expect(selectOverrides(store.getState()).get("a")).toBe(2);
    expect(store.getState().persistence.errors[persistenceKey(key, "write")]).toBe("unavailable");
  });

  it("tolerates corrupt or inaccessible correction storage", () => {
    expect(readOverrides("key", { getItem: () => "{}", setItem: () => undefined })).toEqual({
      overrides: {},
      error: "invalid"
    });
    expect(
      readOverrides("key", {
        getItem: () => {
          throw new DOMException("Denied", "SecurityError");
        },
        setItem: () => undefined
      })
    ).toEqual({ overrides: {}, error: "unavailable" });
  });
});
