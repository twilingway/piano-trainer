// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import { createAppStore } from "./store";
import { useSong } from "./useSong";
import { withTestStore } from "./storeTestSupport";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("resolves consecutive song commands from current state and clears seek on source selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const store = createAppStore(),
    root = createRoot(document.createElement("div"));
  const start = { current: 12 as number | null };
  let controls!: ReturnType<typeof useSong>;
  function Harness() {
    const value = useSong(start);
    useLayoutEffect(() => {
      controls = value;
    });
    return null;
  }
  const song: Song = {
    title: "commands",
    source: "midi",
    duration: 1,
    beats: [],
    measures: [],
    notes: [
      { id: "a", pitch: 60, start: 0, startBeat: 0, duration: 1, hand: "right", scoreFinger: 1 }
    ]
  };
  try {
    await act(async () => {
      await Promise.resolve();
      root.render(withTestStore(<Harness />, store));
    });
    await act(async () => {
      await Promise.resolve();
      controls.showSong(song, "my:commands");
    });
    expect(start.current).toBeNull();
    await act(async () => {
      await Promise.resolve();
      controls.cycleFinger("a");
      controls.cycleFinger("a");
      controls.setOctave((previous) => previous + 1);
      controls.setOctave((previous) => previous + 1);
    });
    expect(store.getState().song.overridesByKey["fingering:commands:simplified:written:1"]).toEqual(
      { a: 3 }
    );
    expect(store.getState().song.octave).toBe(2);
    expect(controls.song.notes[0]?.pitch).toBe(84);
    expect(store.getState().preferences.player.librarySource).toBe("my:commands");
  } finally {
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
  }
});
