import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import type { Take } from "../recording/take";
import { Trainer, type TrainerSnapshot } from "./Trainer";

vi.mock("../audio/pianoSound", () => ({ soundAllOff: vi.fn() }));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = vi.fn();
    reset = vi.fn();
    schedule = vi.fn();
  }
}));
const SONG: Song = {
  title: "timing fixture",
  source: "midi",
  duration: 2,
  notes: [
    { id: "c", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 0.5 },
    { id: "d", pitch: 62, hand: "right", start: 1, startBeat: 1, duration: 0.5 }
  ],
  measures: [],
  beats: []
};
let now = 1000;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
});
function harness(song = SONG) {
  let ticker: (delta: number) => void = () => undefined;
  const view = {
    onTick: (callback: (delta: number) => void) => {
      ticker = callback;
    },
    setSong: vi.fn(),
    draw: vi.fn<FallingNotesView["draw"]>()
  };
  const trainer = new Trainer(view as unknown as FallingNotesView);
  const snapshots: TrainerSnapshot[] = [];
  const takes: Take[] = [];
  trainer.onSnapshot = (snapshot) => {
    snapshots.push(snapshot);
  };
  trainer.onTake = (take) => {
    takes.push(take);
  };
  trainer.load(song, { mode: "tempo", hands: new Set(["right"]), speed: 1 }, "fixture");
  return {
    trainer,
    view,
    takes,
    snapshots,
    latest: () => snapshots.at(-1),
    frame: (at: number, delta = 16) => {
      now = at;
      ticker(delta);
    }
  };
}
function down(trainer: Trainer, timestamp: number, pitch = 60, deviceId = "piano") {
  trainer.key({ type: "down", pitch, velocity: 90, timestamp, source: "midi", deviceId });
}
describe("Trainer input timestamps", () => {
  it("keeps hint time independent of visual offset and records educational late hits", () => {
    const run = harness();
    run.trainer.configureTiming({
      inputOffsets: {},
      manualInputOffsetMs: 0,
      audioOffsetMs: 0,
      visualOffsetMs: 500
    });
    run.trainer.load(
      SONG,
      { mode: "tempo", hands: new Set(["right"]), speed: 1, learningWindow: true },
      "fixture"
    );
    run.trainer.setPlaying(true);
    run.frame(2850);
    expect(run.view.draw.mock.lastCall?.[0]).toMatchObject({
      hintSpeed: 1,
      hintNotes: [SONG.notes[0]]
    });
    expect(run.view.draw.mock.lastCall?.[0].time).toBeCloseTo(-0.65);
    expect(run.view.draw.mock.lastCall?.[0].hintTime).toBeCloseTo(-0.15);
    now = 3200;
    down(run.trainer, 3200);
    run.frame(3200);
    expect(run.view.draw.mock.lastCall?.[0].graded?.[0]).toMatchObject({
      grade: "ok",
      assisted: true
    });
    expect(run.view.draw.mock.lastCall?.[0].graded?.[0]?.offsetMs).toBeCloseTo(200);
    expect(run.latest()?.stats.game?.score).toBe(25);
    run.trainer.seek(0);
    expect(run.takes[0]?.timing).toMatchObject({ rulesVersion: 2, learningWindow: true });
    expect(run.takes[0]?.notes[0]?.start).toBeCloseTo(0.2);
  });
  it("pins hand hints to unplayed wait-mode notes despite a visual offset", () => {
    const run = harness();
    run.trainer.configureTiming({
      inputOffsets: {},
      manualInputOffsetMs: 0,
      audioOffsetMs: 0,
      visualOffsetMs: -750
    });
    run.trainer.load(SONG, { mode: "wait", hands: new Set(["right"]), speed: 1 }, "fixture");
    run.trainer.setPlaying(true);
    run.frame(4000);
    expect(run.view.draw.mock.lastCall?.[0]).toMatchObject({
      time: 0.75,
      waitingFor: [SONG.notes[0]]
    });
    run.frame(5000);
    expect(run.view.draw.mock.lastCall?.[0]).toMatchObject({ waitingFor: [SONG.notes[0]] });
    down(run.trainer, 5000);
    run.frame(5010);
    expect(run.view.draw.mock.lastCall?.[0]).toMatchObject({ waitingFor: [] });
  });
  it("grades the original timestamp when callback arrives 200 ms later", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    now = 3200;
    down(run.trainer, 3000);
    expect(run.latest()?.stats.game?.grades.PERFECT).toBe(1);
    expect(run.latest()?.diagnostic?.raw).toBe(3000);
    expect(run.latest()?.stats.meanOffset).toBe(0);
  });
  it("subtracts device and manual offsets exactly once in scoring and recording", () => {
    const run = harness();
    run.trainer.configureTiming({
      inputOffsets: { piano: 110 },
      manualInputOffsetMs: -10,
      audioOffsetMs: 0,
      visualOffsetMs: 0
    });
    run.trainer.setPlaying(true);
    now = 3200;
    down(run.trainer, 3100);
    expect(run.latest()?.stats.game?.grades.PERFECT).toBe(1);
    expect(run.latest()?.diagnostic).toMatchObject({ raw: 3100, corrected: 3000, offset: 100 });
    run.trainer.seek(0);
    expect(run.takes[0]?.notes[0]?.start).toBe(0);
    expect(run.takes[0]?.notes[0]?.realStart).toBe(2);
  });
  it("ignores input arriving beyond 250 ms and marks the diagnostic expired", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    now = 3251;
    down(run.trainer, 3000);
    expect(run.latest()?.stats.hits).toBe(0);
    expect(run.latest()?.diagnostic?.expired).toBe(true);
    run.trainer.seek(0);
    expect(run.takes).toHaveLength(0);
  });
  it("keeps a pre-pause late callback in the original timing segment", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    now = 3100;
    run.trainer.setPlaying(false);
    now = 3200;
    down(run.trainer, 3050);
    expect(run.latest()?.stats.game?.grades.GREAT).toBe(1);
    run.trainer.seek(0);
    expect(run.takes[0]?.notes[0]?.start).toBeCloseTo(0.05);
    expect(run.takes[0]?.notes[0]?.realStart).toBeCloseTo(2.05);
  });
  it("records release during a pause instead of holding it until the run ends", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    now = 3000;
    down(run.trainer, 3000);
    now = 3100;
    run.trainer.setPlaying(false);
    now = 3500;
    run.trainer.key({
      type: "up",
      pitch: 60,
      velocity: 0,
      timestamp: 3500,
      source: "midi",
      deviceId: "piano"
    });
    now = 4000;
    run.trainer.setPlaying(true);
    run.frame(4800, 800);
    run.trainer.seek(0);
    expect(run.takes[0]?.notes[0]?.end).toBeCloseTo(0.1);
    expect(run.takes[0]?.notes[0]?.realEnd).toBeCloseTo(2.1);
  });
  it("holds the game unchanged when calibration consumes the input", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    const intercepted = vi.fn(() => true);
    run.trainer.onInput = intercepted;
    now = 3000;
    down(run.trainer, 3000);
    expect(intercepted).toHaveBeenCalledOnce();
    expect(run.latest()?.stats.hits).toBe(0);
  });
});
describe("Trainer run boundaries and source gating", () => {
  it("uses absolute elapsed time even when the visual frame delta is tiny", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(3000, 1);
    expect(run.view.draw).toHaveBeenLastCalledWith(expect.objectContaining({ time: 0 }));
    run.frame(4000, 1);
    expect(run.latest()?.time).toBeCloseTo(1);
  });
  it("rejects another device and local keyboard in a MIDI ranked source", () => {
    const run = harness();
    run.trainer.configureControls({
      loop: false,
      stopOnError: false,
      canStart: true,
      allowedDeviceId: "piano"
    });
    run.trainer.setPlaying(true);
    now = 3000;
    down(run.trainer, 3000, 60, "other");
    run.trainer.key({
      type: "down",
      pitch: 60,
      velocity: 90,
      timestamp: 3000,
      source: "keyboard",
      deviceId: "keyboard"
    });
    expect(run.latest()?.stats.hits).toBe(0);
    down(run.trainer, 3000);
    expect(run.latest()?.stats.hits).toBe(1);
  });
  it("does not start an uncalibrated ranked run", () => {
    const run = harness();
    run.trainer.canStart = false;
    run.trainer.setPlaying(true);
    expect(run.latest()?.playing).toBe(false);
  });
  it("starts recording again after a full restart", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    now = 3000;
    down(run.trainer, 3000);
    run.trainer.load(SONG, { mode: "tempo", hands: new Set(["right"]), speed: 1 }, "fixture");
    run.trainer.setPlaying(true);
    now = 5000;
    down(run.trainer, 5000);
    run.trainer.seek(0);
    expect(run.takes).toHaveLength(2);
    expect(run.takes[1]?.notes[0]?.start).toBeCloseTo(0);
  });
  it("starts a fresh recorded take when Loop restarts playback", () => {
    const run = harness();
    run.trainer.loop = true;
    run.trainer.setPlaying(true);
    now = 3000;
    down(run.trainer, 3000);
    run.frame(5500, 2500);
    expect(run.latest()?.playing).toBe(true);
    now = 7500;
    down(run.trainer, 7500);
    run.trainer.seek(0);
    expect(run.takes).toHaveLength(2);
    expect(run.takes[1]?.notes[0]?.start).toBeCloseTo(0);
  });
});
