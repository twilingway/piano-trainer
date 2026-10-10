import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import { Trainer, type TrainerSnapshot } from "./Trainer";
import type { TrainerReadingPolicy } from "./readingPolicy";

vi.mock("../audio/pianoSound", () => ({ soundAllOff: vi.fn() }));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = vi.fn();
    reset = vi.fn();
    schedule = vi.fn();
  }
}));
const SONG: Song = {
  title: "reading",
  source: "musicxml",
  duration: 1,
  notes: [
    { id: "first", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 0.5 },
    { id: "second", pitch: 60, hand: "right", start: 0.5, startBeat: 1, duration: 0.5 }
  ],
  beats: [],
  measures: []
};
let now = 1000;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());
function fixture() {
  let ticker: (ms: number) => void = () => undefined;
  const view = {
    onTick: (fn: (ms: number) => void) => {
      ticker = fn;
    },
    setSong: vi.fn(),
    draw: vi.fn<FallingNotesView["draw"]>()
  };
  const trainer = new Trainer(view as unknown as FallingNotesView);
  const snapshots: TrainerSnapshot[] = [];
  trainer.onSnapshot = (snapshot) => snapshots.push(snapshot);
  trainer.load(
    SONG,
    { mode: "wait", hands: new Set(["right"]), speed: 1, accompaniment: false },
    "reading"
  );
  let ready = false;
  let cue: number | undefined;
  const policy: TrainerReadingPolicy = {
    onFrame: vi.fn(),
    allowInput: () => ready,
    onJudgement: vi.fn(),
    cuePitch: () => cue
  };
  trainer.configureReading(policy);
  trainer.setPlaying(true);
  const frame = (at: number) => {
    now = at;
    ticker(160);
  };
  const key = (
    type: "up" | "down",
    pitch = 60,
    source: "midi" | "keyboard" | "pointer" = "midi",
    timestamp = now
  ) => {
    trainer.key({ type, pitch, velocity: 90, source, deviceId: source, channel: 1, timestamp });
  };
  return {
    trainer,
    view,
    policy,
    frame,
    key,
    ready: () => {
      ready = true;
    },
    cue: () => {
      cue = 60;
    },
    latest: () => snapshots.at(-1)
  };
}
describe("reading input policy", () => {
  it("does not accept an unseen note or a held key after readiness", () => {
    const run = fixture();
    run.frame(3000);
    run.key("down");
    run.ready();
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(0);
    expect(run.view.draw.mock.lastCall?.[0].neutralKeys).toBe(true);
    run.key("up");
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(1);
    run.frame(3500);
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(1);
    run.key("up");
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(2);
    expect(run.policy.onJudgement).toHaveBeenCalledTimes(2);
  });
  it("rejects early wait-window and paused presses but retains physical feedback", () => {
    const run = fixture();
    run.ready();
    run.frame(2900);
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(0);
    run.frame(3000);
    run.trainer.setPlaying(false);
    run.key("up");
    run.key("down");
    run.trainer.setPlaying(true);
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(0);
    run.key("up");
    run.key("down");
    expect(run.latest()?.stats.hits).toBe(1);
  });
  it("accepts wrong→correct and applies standard timestamp/source checks first", () => {
    const run = fixture();
    run.ready();
    run.frame(3000);
    run.key("down", 62, "keyboard");
    expect(run.latest()?.stats.wrong).toBe(1);
    run.key("down", 60, "pointer");
    expect(run.latest()?.stats.hits).toBe(1);
    expect(run.policy.onJudgement).toHaveBeenCalledTimes(2);
    run.frame(3500);
    run.key("down", 60, "midi", 3000);
    expect(run.policy.onJudgement).toHaveBeenCalledTimes(2);
  });
  it("suppresses future MIDI cues and reveals only the requested key", () => {
    const run = fixture();
    const lights = vi.fn();
    run.trainer.onLights = lights;
    run.frame(3000);
    expect(lights).toHaveBeenLastCalledWith([]);
    expect(run.view.draw.mock.lastCall?.[0].hintNotes).toEqual([]);
    run.cue();
    run.frame(3100);
    expect(lights).toHaveBeenLastCalledWith([60]);
    expect(run.view.draw.mock.lastCall?.[0].hintNotes).toHaveLength(1);
    run.trainer.setPlaying(false);
    run.frame(3200);
    expect(lights).toHaveBeenLastCalledWith([]);
  });
});
