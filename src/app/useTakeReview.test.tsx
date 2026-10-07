// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import type { Take } from "../recording/take";
import { createAppStore } from "./store";
import { useTakeReview } from "./useTakeReview";
import { withTestStore } from "./storeTestSupport";

const song: Song = {
  title: "Song",
  source: "midi",
  duration: 1,
  beats: [],
  measures: [],
  notes: [{ id: "a", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }]
};
const take: Take = {
  id: "recorded",
  songKey: "song",
  createdAt: "2026-10-07T10:00:00.000Z",
  mode: "tempo",
  speed: 1,
  hands: ["right"],
  from: 0,
  notes: [{ pitch: 60, velocity: 80, start: 0, end: 1, realStart: 0, realEnd: 1 }],
  pedal: []
};
const withNames = (xml: string) => xml;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("review runtime facade", () => {
  it("derives a review from the selected take and clears selection on a song change", async () => {
    const store = createAppStore(),
      root = createRoot(document.createElement("div"));
    let controls!: ReturnType<typeof useTakeReview>;
    function Harness({ songKey = "song" }: { songKey?: string }) {
      const value = useTakeReview(song, songKey, () => Promise.resolve(), {
        withNames,
        fixedLines: false,
        measuresPerLine: 4,
        autoReview: false
      });
      useLayoutEffect(() => {
        controls = value;
      });
      return null;
    }
    try {
      await act(async () => {
        await Promise.resolve();
        root.render(withTestStore(<Harness />, store));
      });
      await act(async () => {
        await Promise.resolve();
        controls.recordTake(take);
      });
      expect(controls.takes).toEqual([take]);
      expect(controls.canReview).toBe(true);
      expect(controls.review).toBeUndefined();
      await act(async () => {
        await Promise.resolve();
        controls.showReview();
      });
      expect(controls.review?.summary.good).toBe(1);
      expect(controls.reviewMarks?.size).toBe(1);
      expect(store.getState().review).not.toHaveProperty("lastTake");
      expect(store.getState().review).not.toHaveProperty("review");
      await act(async () => {
        await Promise.resolve();
        controls.setTakeStaff("column");
      });
      expect(controls.transcription?.musicXml).toContain("score-partwise");
      await act(async () => {
        await Promise.resolve();
        root.render(withTestStore(<Harness songKey="other" />, store));
      });
      expect(controls.lastTake).toBeNull();
      expect(controls.canReview).toBe(false);
      expect(controls.reviewMarks).toBeUndefined();
      expect(controls.transcription).toBeUndefined();
      await act(async () => {
        await Promise.resolve();
        root.render(withTestStore(<Harness />, store));
      });
      expect(controls.takes).toEqual([take]);
      expect(controls.lastTake).toBeNull();
      await act(async () => {
        await Promise.resolve();
        controls.selectTake(take.id);
      });
      expect(controls.canReview).toBe(true);
    } finally {
      await act(async () => {
        await Promise.resolve();
        root.unmount();
      });
    }
  });

  it("ignores a pending comparison if its song or selected take changed during sound initialization", async () => {
    const store = createAppStore(),
      root = createRoot(document.createElement("div"));
    let controls!: ReturnType<typeof useTakeReview>, resolve!: () => void;
    const ensureSound = () =>
      new Promise<void>((done) => {
        resolve = done;
      });
    function Harness({ songKey = "song" }: { songKey?: string }) {
      const value = useTakeReview(song, songKey, ensureSound, {
        withNames,
        fixedLines: false,
        measuresPerLine: 4,
        autoReview: true
      });
      useLayoutEffect(() => {
        controls = value;
      });
      return null;
    }
    try {
      await act(async () => {
        await Promise.resolve();
        root.render(withTestStore(<Harness />, store));
      });
      await act(async () => {
        await Promise.resolve();
        controls.recordTake(take);
      });
      let pending!: Promise<void>;
      await act(async () => {
        await Promise.resolve();
        pending = controls.startComparing();
      });
      await act(async () => {
        await Promise.resolve();
        root.render(withTestStore(<Harness songKey="other" />, store));
      });
      await act(async () => {
        resolve();
        await pending;
      });
      expect(store.getState().review.comparing).toBe(false);
      expect(controls.compareSong).toBeUndefined();
    } finally {
      await act(async () => {
        await Promise.resolve();
        root.unmount();
      });
    }
  });
});
