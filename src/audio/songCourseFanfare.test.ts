import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSongCourseFanfare } from "./songCourseFanfare";
import { gradeSongCourseAttempt } from "../songCourse/rubric";
import { courseConfig, gradeEvidence, rawInput } from "../songCourse/testFixtures";
import type { SongCourseResult } from "../songCourse/model";

const audio = vi.hoisted(() => ({
  state: "running",
  time: 10,
  context: vi.fn(),
  construct: vi.fn(),
  destination: vi.fn(),
  trigger: vi.fn(),
  dispose: vi.fn()
}));
vi.mock("tone", () => ({
  getContext: () => {
    audio.context();
    return { state: audio.state };
  },
  now: () => audio.time,
  Synth: Symbol("Synth"),
  PolySynth: class {
    constructor(voice: unknown, options: unknown) {
      audio.construct(voice, options);
    }
    toDestination() {
      audio.destination();
      return this;
    }
    triggerAttackRelease(...args: unknown[]) {
      audio.trigger(...args);
    }
    dispose() {
      audio.dispose();
    }
  }
}));
beforeEach(() => {
  audio.state = "running";
  audio.time = 10;
  for (const mock of [
    audio.context,
    audio.construct,
    audio.destination,
    audio.trigger,
    audio.dispose
  ])
    mock.mockReset();
});
function result(runId: string, overrides: Partial<SongCourseResult> = {}): SongCourseResult {
  return {
    ...gradeSongCourseAttempt(
      courseConfig(undefined, { runId }),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
    ),
    ...overrides
  };
}

describe("song-course result fanfare", () => {
  it("schedules exactly one original cadence for a run and reuses its voice for a new run", () => {
    const fanfare = createSongCourseFanfare();
    fanfare.play(result("first"));
    expect(audio.trigger.mock.calls).toEqual([
      ["C5", 0.12, 10],
      ["E5", 0.12, 10 + 0.14],
      ["G5", 0.12, 10 + 0.28],
      [["C5", "E5", "G5", "C6"], 0.35, 10 + 0.45]
    ]);
    fanfare.play(result("first"));
    expect(audio.trigger).toHaveBeenCalledTimes(4);
    audio.time = 20;
    fanfare.play(result("second"));
    expect(audio.trigger).toHaveBeenCalledTimes(8);
    expect(audio.trigger).toHaveBeenNthCalledWith(5, "C5", 0.12, 20);
    expect(audio.construct).toHaveBeenCalledOnce();
  });
  it("disposes its voice once and does not replay an old run when a later run recreates it", () => {
    const fanfare = createSongCourseFanfare();
    fanfare.play(result("first"));
    fanfare.dispose();
    fanfare.dispose();
    expect(audio.dispose).toHaveBeenCalledOnce();
    fanfare.play(result("first"));
    expect(audio.trigger).toHaveBeenCalledTimes(4);
    fanfare.play(result("second"));
    expect(audio.construct).toHaveBeenCalledTimes(2);
    expect(audio.trigger).toHaveBeenCalledTimes(8);
  });
  it.each(["muted", "incomplete", "invalid", "suspended"] as const)(
    "keeps %s results silent without replaying them later",
    (kind) => {
      const fanfare = createSongCourseFanfare();
      if (kind === "suspended") audio.state = "suspended";
      fanfare.play(
        result("skipped", {
          ...(kind === "incomplete" ? { completed: false } : {}),
          ...(kind === "invalid" ? { valid: false } : {})
        }),
        kind === "muted"
      );
      expect(audio.construct).not.toHaveBeenCalled();
      expect(audio.trigger).not.toHaveBeenCalled();
      audio.state = "running";
      fanfare.play(result("skipped"));
      expect(audio.trigger).not.toHaveBeenCalled();
      fanfare.play(result("new"));
      expect(audio.trigger).toHaveBeenCalledTimes(4);
    }
  );
  it.each(["context", "construct", "destination", "trigger"] as const)(
    "does not interrupt the visual result when %s is unavailable",
    (operation) => {
      const fanfare = createSongCourseFanfare();
      audio[operation].mockImplementationOnce(() => {
        throw new Error("Audio unavailable");
      });
      expect(() => {
        fanfare.play(result("failed-audio"));
      }).not.toThrow();
      const attempted = audio.trigger.mock.calls.length;
      expect(() => {
        fanfare.play(result("failed-audio"));
      }).not.toThrow();
      expect(audio.trigger).toHaveBeenCalledTimes(attempted);
      fanfare.play(result("next"));
      expect(audio.trigger).toHaveBeenCalledTimes(attempted + 4);
    }
  );
});
