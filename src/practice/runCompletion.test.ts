import { describe, expect, it } from "vitest";
import type { Song } from "../song/song";
import type { PracticeOptions } from "./session";
import { RunCompletionTracker } from "./runCompletion";

const song: Song = {
  title: "synthetic exercise",
  source: "musicxml",
  duration: 1,
  notes: [
    { id: "r", hand: "right", pitch: 60, start: 0, startBeat: 0, duration: 1, part: "treble" },
    { id: "l", hand: "left", pitch: 48, start: 0, startBeat: 0, duration: 1, part: "bass" }
  ],
  beats: [],
  measures: []
};
const options: PracticeOptions = { mode: "wait", hands: new Set(["right"]), speed: 1 };

function tracker(overrides: Partial<PracticeOptions> = {}) {
  const run = new RunCompletionTracker();
  run.load(song, { ...options, ...overrides }, "song", "selection-version");
  run.begin(-2);
  return run;
}

describe("run completion evidence", () => {
  it("normalizes lead-in and returns immutable evidence once", () => {
    const run = tracker();
    run.hit();
    const result = run.finish();
    expect(result).toEqual({
      runId: "1",
      songKey: "song",
      context: "selection-version",
      from: 0,
      to: 1,
      mode: "wait",
      hands: ["right"],
      hitCount: 1,
      interrupted: false,
      fullRange: true
    });
    run.hit();
    expect(result?.hitCount).toBe(1);
    expect(run.finish()).toBeUndefined();
  });

  it.each([
    { from: 0.1 },
    { to: 0.5 },
    { playable: { low: 61, high: 88 } },
    { parts: new Set(["bass"]) }
  ])("rejects an incomplete playable exercise %j", (partial) => {
    expect(tracker(partial).finish()?.fullRange).toBe(false);
  });

  it("does not require the unplayed hand to fit the instrument", () => {
    expect(tracker({ playable: { low: 60, high: 88 } }).finish()?.fullRange).toBe(true);
  });

  it("preserves evidence across identical reloads but never erases a seek", () => {
    const run = tracker();
    run.hit();
    run.load(song, options, "song", "selection-version", true);
    run.begin(0.5);
    expect(run.finish()).toMatchObject({ runId: "1", hitCount: 1, interrupted: false });
    run.seek();
    run.load(song, options, "song", "selection-version", true);
    run.begin(0);
    expect(run.finish()).toMatchObject({ interrupted: true });
    run.restart();
    run.begin(0);
    expect(run.finish()).toMatchObject({ interrupted: false, hitCount: 0 });
  });

  it("compares option values rather than insertion order or explicit defaults", () => {
    const run = tracker();
    run.hit();
    run.load(
      song,
      { speed: 1, hands: new Set(["right"]), mode: "wait", from: 0, accompaniment: true },
      "song",
      "selection-version",
      true
    );
    expect(run.finish()).toMatchObject({ hitCount: 1, interrupted: false });
  });

  it.each([
    { speed: 0.5 },
    { hands: new Set(["left"] as const) },
    { mode: "tempo" as const },
    { parts: new Set(["treble"]) },
    { accompaniment: false }
  ])("invalidates an active run when options change %j", (change) => {
    const run = tracker();
    run.hit();
    run.load(song, { ...options, ...change }, "song", "selection-version", true);
    run.load(song, options, "song", "selection-version", true);
    expect(run.finish()).toMatchObject({ runId: "1", interrupted: true, hitCount: 1 });
  });

  it("keeps the original context when content changes mid-run", () => {
    const run = tracker();
    run.load({ ...song, duration: 2 }, options, "new-song", "new-version", true);
    expect(run.finish()).toMatchObject({
      songKey: "song",
      context: "selection-version",
      interrupted: true
    });
  });
});
