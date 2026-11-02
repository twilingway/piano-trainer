import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import { Trainer } from "./Trainer";
import type { RunCompletion } from "./runCompletion";
import type { PracticeOptions } from "./session";
import type { TrainerMusicPolicy } from "./musicPolicy";

vi.mock("../audio/pianoSound", () => ({ soundAllOff: vi.fn() }));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = vi.fn();
    reset = vi.fn();
  }
}));
const SONG: Song = {
  title: "course run fixture",
  source: "musicxml",
  duration: 1,
  notes: [{ id: "c", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }],
  measures: [],
  beats: []
};
const OPTIONS: PracticeOptions = { mode: "tempo", hands: new Set(["right"]), speed: 1 };
let now = 1000;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

function harness(options: PracticeOptions = OPTIONS) {
  let ticker: (delta: number) => void = () => undefined;
  const view = {
    onTick: (callback: typeof ticker) => {
      ticker = callback;
    },
    setSong: vi.fn(),
    draw: vi.fn()
  };
  const trainer = new Trainer(view as unknown as FallingNotesView);
  const results: RunCompletion[] = [];
  trainer.onRunFinished = (result) => {
    results.push(result);
  };
  trainer.load(SONG, options, "course-phrase", { runContext: "lesson-right-phrase-v1" });
  const frame = (at: number) => {
    now = at;
    ticker(16);
  };
  const hit = (at = 3000) => {
    now = at;
    trainer.key({ type: "down", pitch: 60, velocity: 90, timestamp: at });
  };
  return { trainer, results, frame, hit };
}

describe("Trainer natural exercise completion", () => {
  it("emits once before onTake and never on further frames", () => {
    const run = harness();
    const order: string[] = [];
    run.trainer.onRunFinished = (result) => {
      run.results.push(result);
      order.push("run");
    };
    run.trainer.onTake = () => order.push("take");
    run.trainer.setPlaying(true);
    run.hit();
    run.frame(4300);
    run.frame(5000);
    expect(order).toEqual(["run", "take"]);
    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toMatchObject({
      songKey: "course-phrase",
      context: "lesson-right-phrase-v1",
      from: 0,
      to: 1,
      fullRange: true,
      hitCount: 1,
      noteResult: { expectedNotes: 1, hitNotes: 1, hitPercent: 30, holdPercent: 70, percent: 100 },
      interrupted: false
    });
  });

  it("accepts waiting practice and an ordinary pause", () => {
    const run = harness({ ...OPTIONS, mode: "wait" });
    run.trainer.setPlaying(true);
    run.frame(3500);
    run.trainer.setPlaying(false);
    now = 5000;
    run.trainer.setPlaying(true);
    run.hit(5000);
    run.frame(6500);
    expect(run.results[0]).toMatchObject({ mode: "wait", hitCount: 1, interrupted: false });
  });

  it("counts human learning-window hits, including assisted late presses", () => {
    const run = harness({ ...OPTIONS, learningWindow: true });
    run.trainer.setPlaying(true);
    run.hit(3200);
    run.frame(4300);
    expect(run.results[0]?.hitCount).toBe(1);
  });

  it.each(["seek", "load", "destroy"] as const)(
    "%s does not emit a natural-end signal",
    (command) => {
      const run = harness();
      run.trainer.setPlaying(true);
      run.hit();
      if (command === "seek") run.trainer.seek(0);
      else if (command === "load") run.trainer.load(SONG, OPTIONS, "other");
      else run.trainer.destroy();
      expect(run.results).toHaveLength(0);
    }
  );

  it("keeps a seek interrupted through a preserved reload and permits an explicit restart", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.hit();
    run.trainer.seek(0);
    run.trainer.load(SONG, OPTIONS, "course-phrase", {
      preservePosition: true,
      runContext: "lesson-right-phrase-v1"
    });
    run.hit(5000);
    run.frame(6300);
    expect(run.results[0]).toMatchObject({ interrupted: true });
    run.trainer.restart();
    run.trainer.setPlaying(true);
    run.hit(8300);
    run.frame(9600);
    expect(run.results[1]).toMatchObject({ interrupted: false, hitCount: 1 });
  });

  it("preserves original evidence on an unchanged reload", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.hit();
    run.trainer.load(SONG, OPTIONS, "course-phrase", {
      preservePosition: true,
      runContext: "lesson-right-phrase-v1"
    });
    run.frame(4300);
    expect(run.results[0]).toMatchObject({ hitCount: 1, interrupted: false, from: 0 });
    expect(run.results[0]?.noteResult?.percent).toBe(100);
  });

  it("passes precise release evidence rather than hit-only accuracy to completion", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.hit();
    now = 3500;
    run.trainer.key({ type: "up", pitch: 60, velocity: 0, timestamp: now });
    run.frame(4300);
    expect(run.results[0]?.noteResult).toMatchObject({
      expectedNotes: 1,
      hitNotes: 1,
      hitPercent: 30,
      holdPercent: 35,
      percent: 65
    });
  });

  it("invalidates changed options despite position preservation", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.hit();
    run.trainer.load(SONG, { ...OPTIONS, speed: 0.5 }, "course-phrase", {
      preservePosition: true,
      runContext: "lesson-right-phrase-v1"
    });
    run.frame(5600);
    expect(run.results[0]).toMatchObject({ interrupted: true });
  });

  it.each([{ to: 0.5 }, { playable: { low: 61, high: 88 } }, { parts: new Set(["excluded"]) }])(
    "marks incomplete ranges %j",
    (change) => {
      const run = harness({ ...OPTIONS, ...change });
      run.trainer.setPlaying(true);
      run.frame(4500);
      run.frame(4600);
      expect(run.results[0]?.fullRange).toBe(false);
    }
  );

  it.each([new Set(["right"] as const), new Set<"right">()])(
    "never counts automated notes or misses as player hits %j",
    (hands) => {
      const run = harness({ ...OPTIONS, hands });
      run.trainer.setPlaying(true);
      run.frame(4500);
      expect(run.results[0]?.hitCount).toBe(0);
      expect(run.results[0]?.noteResult?.percent).toBe(hands.size === 0 ? null : 0);
    }
  );

  it("emits separate immutable results before each loop restarts", () => {
    const run = harness();
    run.trainer.loop = true;
    run.trainer.setPlaying(true);
    run.hit();
    run.frame(4300);
    run.hit(6300);
    run.frame(7600);
    expect(run.results).toHaveLength(2);
    expect(run.results.map((result) => result.runId)).toEqual(["1", "2"]);
    expect(run.results.every((result) => result.hitCount === 1 && !result.interrupted)).toBe(true);
    expect(run.results.every((result) => result.noteResult?.percent === 100)).toBe(true);
  });
});

function musicPolicy(overrides: Partial<TrainerMusicPolicy> = {}): TrainerMusicPolicy {
  return {
    inputCompensationMs: () => 0,
    onStart: vi.fn(() => true),
    onFrame: vi.fn(() => []),
    onInput: vi.fn<TrainerMusicPolicy["onInput"]>((event, session, playing, times) => {
      if (!playing || !times.admitted) return [];
      return event.type === "down"
        ? session.pressKeyAt(event.pitch, times.corrected, times.received)
        : session.releaseKeyAt(event.pitch, times.corrected);
    }),
    seedHeld: vi.fn(),
    cancel: vi.fn(),
    guidance: () => ({
      lights: [],
      frame: { hintNotes: [], due: [], waitingFor: [], hints: false, neutralKeys: true }
    }),
    ...overrides
  };
}
describe("Trainer music course isolation", () => {
  it.each(["wait", "tempo"] as const)(
    "routes actual %s input without ordinary takes or run completion",
    (mode) => {
      const run = harness({ ...OPTIONS, mode });
      const policy = musicPolicy();
      const take = vi.fn();
      run.trainer.onTake = take;
      run.trainer.configureCourse("music", policy);
      run.trainer.setPlaying(true);
      run.hit();
      run.frame(4500);
      run.trainer.setPlaying(false);
      expect(policy.onInput).toHaveBeenCalled();
      expect(run.results).toEqual([]);
      expect(take).not.toHaveBeenCalled();
      expect(policy.onFrame).toHaveBeenCalled();
    }
  );
  it("refuses a start before readiness and keeps music when other hooks configure null", () => {
    const run = harness();
    const policy = musicPolicy({ onStart: vi.fn(() => false) });
    const snapshots: { playing: boolean }[] = [];
    run.trainer.onSnapshot = (snapshot) => snapshots.push(snapshot);
    run.trainer.configureCourse("music", policy);
    run.trainer.configureCourse("reading", null);
    run.trainer.configureCourse("rhythm", null);
    run.trainer.configureCourse("pair", null);
    run.trainer.configureCourse("heldBass", null);
    run.trainer.configureCourse("independentRhythm", null);
    run.trainer.setPlaying(true);
    expect(policy.onStart).toHaveBeenCalledOnce();
    expect(snapshots.at(-1)?.playing).toBe(false);
    run.hit(1200);
    expect(policy.onInput).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false,
      expect.objectContaining({ admitted: true })
    );
  });
  it("preserves per-device compensation and original source/channel even for rejected input", () => {
    const run = harness();
    const policy = musicPolicy();
    run.trainer.configureTiming({
      inputOffsets: { "piano-a": 25, "piano-b": 70 },
      manualInputOffsetMs: 10,
      audioOffsetMs: 0,
      visualOffsetMs: 0
    });
    run.trainer.configureCourse("music", policy);
    run.trainer.setPlaying(true);
    now = 3100;
    const event = {
      type: "down" as const,
      pitch: 60,
      velocity: 91,
      timestamp: 3000,
      source: "midi" as const,
      deviceId: "piano-a",
      channel: 4
    };
    run.trainer.key(event);
    expect(policy.onInput).toHaveBeenLastCalledWith(event, expect.anything(), true, {
      raw: 3000,
      corrected: 2965,
      received: 3100,
      admitted: true
    });
    run.trainer.onInput = () => true;
    now = 3200;
    const other = { ...event, timestamp: 3100, deviceId: "piano-b", channel: 7 };
    run.trainer.key(other);
    expect(policy.onInput).toHaveBeenLastCalledWith(other, expect.anything(), true, {
      raw: 3100,
      corrected: 3020,
      received: 3200,
      admitted: false
    });
  });
  it("seeds preheld owners without cancelling preparation and cancels them on song load", () => {
    const run = harness();
    run.trainer.key({
      type: "down",
      pitch: 48,
      velocity: 90,
      timestamp: now,
      source: "midi",
      deviceId: "piano",
      channel: 2
    });
    const policy = musicPolicy();
    run.trainer.configureCourse("music", policy);
    expect(policy.cancel).not.toHaveBeenCalled();
    expect(policy.seedHeld).toHaveBeenCalledWith(
      [expect.objectContaining({ pitch: 48, deviceId: "piano", channel: 2 })],
      now
    );
    run.trainer.load(SONG, OPTIONS, "new-music");
    expect(policy.cancel).toHaveBeenCalled();
    run.trainer.setPlaying(true);
    expect(policy.onStart).toHaveBeenCalledWith(expect.anything(), now, [
      expect.objectContaining({ pitch: 48 })
    ]);
  });
  it("does not stop or grade music-policy misses and can play after the song clock ends", () => {
    const run = harness();
    const policy = musicPolicy({
      onFrame: () => [{ type: "wrong", pitch: 61 }, { type: "finished" }]
    });
    const snapshots: { playing: boolean }[] = [];
    run.trainer.onSnapshot = (snapshot) => snapshots.push(snapshot);
    run.trainer.stopOnError = true;
    run.trainer.configureCourse("music", policy);
    run.trainer.setPlaying(true);
    run.frame(4500);
    expect(snapshots.at(-1)?.playing).toBe(true);
    expect(run.results).toEqual([]);
    run.trainer.setPlaying(false);
    run.trainer.setPlaying(true);
    expect(snapshots.at(-1)?.playing).toBe(true);
  });
});
