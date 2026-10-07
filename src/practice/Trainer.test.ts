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
  it("publishes the applied policy rather than a stored learning preference", () => {
    const run = harness();
    expect(run.latest()?.timingPolicy).toBe("strict");
    run.trainer.load(
      SONG,
      { mode: "tempo", hands: new Set(["right"]), speed: 1, learningWindow: true },
      "fixture"
    );
    expect(run.latest()?.timingPolicy).toBe("learning");
    run.trainer.load(
      SONG,
      { mode: "wait", hands: new Set(["right"]), speed: 1, learningWindow: true },
      "fixture"
    );
    expect(run.latest()?.timingPolicy).toBe("waiting");
    run.trainer.load(
      SONG,
      { mode: "tempo", hands: new Set(), speed: 1, learningWindow: true },
      "fixture"
    );
    expect(run.latest()?.timingPolicy).toBe("listening");
  });
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
describe("Trainer option changes", () => {
  const options = { mode: "tempo" as const, hands: new Set(["right"] as const), speed: 0.5 };

  it("preserves the exact between-frame position before applying the new speed and key", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(3250, 150);
    expect(run.latest()?.time).toBeCloseTo(0.25);
    const count = run.snapshots.length;
    now = 3375;
    run.trainer.load(SONG, options, "another-variant", { preservePosition: true });
    expect(run.snapshots.slice(count)).toHaveLength(1);
    expect(run.latest()?.playing).toBe(true);
    expect(run.latest()?.time).toBeCloseTo(0.375);
    run.frame(3575, 200);
    expect(run.latest()?.time).toBeCloseTo(0.475);
  });

  it("keeps a paused run paused at its exact position", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(3250);
    run.trainer.setPlaying(false);
    now = 4000;
    run.trainer.load(SONG, options, "fixture", { preservePosition: true });
    expect(run.latest()?.playing).toBe(false);
    expect(run.latest()?.time).toBeCloseTo(0.25);
    run.frame(6000, 2000);
    expect(run.view.draw.mock.lastCall?.[0].time).toBeCloseTo(0.25);
    run.trainer.setPlaying(true);
    run.frame(6200, 200);
    expect(run.latest()?.time).toBeCloseTo(0.35);
  });

  it("continues at the owed wait-mode note when switching to tempo", () => {
    const run = harness();
    run.trainer.load(SONG, { ...options, mode: "wait", speed: 1 }, "fixture");
    run.trainer.setPlaying(true);
    run.frame(4000, 150);
    expect(run.latest()).toMatchObject({ time: 0, waiting: true });
    run.trainer.load(SONG, { ...options, speed: 1 }, "fixture", { preservePosition: true });
    expect(run.latest()).toMatchObject({ time: 0, playing: true, waiting: false });
    run.frame(4100, 150);
    expect(run.latest()?.time).toBeCloseTo(0.1);
  });

  it("preserves position when changing hands to listening and back", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(3250);
    run.trainer.load(SONG, { ...options, hands: new Set(), speed: 1 }, "fixture", {
      preservePosition: true
    });
    expect(run.latest()).toMatchObject({ playing: true, timingPolicy: "listening" });
    expect(run.latest()?.time).toBeCloseTo(0.25);
    run.frame(3450, 200);
    run.trainer.load(SONG, options, "fixture", { preservePosition: true });
    expect(run.latest()?.playing).toBe(true);
    expect(run.latest()?.time).toBeCloseTo(0.45);
  });

  it("preserves negative count-in time without adding another lead-in", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(1500);
    now = 1625;
    run.trainer.load(SONG, options, "fixture", { preservePosition: true });
    expect(run.latest()?.time).toBeCloseTo(-1.375);
    run.frame(4375, 2750);
    down(run.trainer, 4375);
    run.trainer.seek(0);
    expect(run.takes).toHaveLength(1);
    expect(run.takes[0]?.from).toBe(0);
  });

  it("keeps old take metadata and starts the next take from the exact positive position", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    now = 3000;
    down(run.trainer, 3000);
    now = 3375;
    run.trainer.load(SONG, { ...options, difficulty: "hard" }, "another-variant", {
      preservePosition: true
    });
    expect(run.takes[0]).toMatchObject({ songKey: "fixture", speed: 1, from: 0 });
    expect(run.takes[0]?.notes[0]?.end).toBeCloseTo(0.375);
    now = 4625;
    down(run.trainer, 4625, 62);
    run.trainer.seek(0);
    expect(run.takes).toHaveLength(2);
    expect(run.takes[1]).toMatchObject({ songKey: "another-variant", speed: 0.5, from: 0.375 });
    expect(run.takes[1]?.notes[0]?.start).toBeCloseTo(1);
  });

  it("resets to a paused count-in unless preservation is requested", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(3250);
    run.trainer.load(SONG, options, "fixture");
    expect(run.latest()).toMatchObject({ playing: false, time: -2 });
  });

  it("does not resume after the preserved position finishes the new session", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.frame(4900);
    now = 5200;
    run.trainer.load(SONG, options, "fixture", { preservePosition: true });
    expect(run.latest()).toMatchObject({ playing: false, finished: true });
    expect(run.latest()?.time).toBeCloseTo(2.2);
  });
});

describe("Trainer temporary readiness", () => {
  const ready = { loop: false, stopOnError: false, canStart: true, resumeWhenReady: true };
  const options = { mode: "tempo" as const, hands: new Set(["right"] as const), speed: 0.5 };

  it("pauses a blocked non-ranked run exactly between frames and resumes when ready", () => {
    const run = harness();
    run.trainer.configureControls(ready);
    run.trainer.setPlaying(true);
    run.frame(3250);
    now = 3375;
    run.trainer.configureControls({ ...ready, canStart: false });
    expect(run.latest()?.playing).toBe(false);
    expect(run.latest()?.time).toBeCloseTo(0.375);
    run.frame(5000, 1750);
    expect(run.view.draw.mock.lastCall?.[0].time).toBeCloseTo(0.375);
    run.trainer.configureControls(ready);
    expect(run.latest()?.playing).toBe(true);
    run.frame(5100, 150);
    expect(run.latest()?.time).toBeCloseTo(0.475);
  });

  it("does not enable an already paused run when readiness changes", () => {
    const run = harness();
    run.trainer.configureControls({ ...ready, canStart: false });
    run.trainer.configureControls(ready);
    expect(run.latest()?.playing).toBe(false);
  });

  it("does not restart a loop when the blocking pause reaches the song end", () => {
    const run = harness();
    run.trainer.configureControls({ ...ready, loop: true });
    run.trainer.setPlaying(true);
    run.frame(4900);
    now = 5300;
    const count = run.snapshots.length;
    run.trainer.configureControls({ ...ready, loop: true, canStart: false });
    expect(run.snapshots.slice(count).every((snapshot) => !snapshot.playing)).toBe(true);
    expect(run.latest()).toMatchObject({ playing: false, finished: true });
    expect(run.latest()?.time).toBeCloseTo(2.3);
    run.frame(6200, 1000);
    expect(run.view.draw.mock.lastCall?.[0].time).toBeCloseTo(2.3);
  });

  it.each(["pause", "seek", "load", "destroy"] as const)(
    "cancels pending automatic resume on explicit %s",
    (command) => {
      const run = harness();
      run.trainer.configureControls(ready);
      run.trainer.setPlaying(true);
      run.trainer.configureControls({ ...ready, canStart: false });
      if (command === "pause") run.trainer.setPlaying(false);
      if (command === "seek") run.trainer.seek(0);
      if (command === "load") run.trainer.load(SONG, options, "new-song");
      if (command === "destroy") run.trainer.destroy();
      run.trainer.configureControls(ready);
      run.frame(5000, 4000);
      expect(run.view.draw.mock.lastCall?.[0].pressed).toEqual(new Set());
      expect(run.latest()?.playing).toBe(false);
    }
  );

  it("retains the blocked resume intent and exact time through a preserving reload", () => {
    const run = harness();
    run.trainer.configureControls(ready);
    run.trainer.setPlaying(true);
    now = 3375;
    run.trainer.configureControls({ ...ready, canStart: false });
    now = 4000;
    run.trainer.load(SONG, options, "another-variant", { preservePosition: true });
    expect(run.latest()?.playing).toBe(false);
    expect(run.latest()?.time).toBeCloseTo(0.375);
    now = 5000;
    run.trainer.configureControls(ready);
    expect(run.latest()?.playing).toBe(true);
    run.frame(5200, 200);
    expect(run.latest()?.time).toBeCloseTo(0.475);
  });

  it("pauses without automatic resume when the readiness flag is absent", () => {
    const run = harness();
    run.trainer.setPlaying(true);
    run.trainer.configureControls({ loop: false, stopOnError: false, canStart: false });
    expect(run.latest()?.playing).toBe(false);
    run.trainer.configureControls({ loop: false, stopOnError: false, canStart: true });
    expect(run.latest()?.playing).toBe(false);
  });

  it("keeps ranked device changes paused even with automatic readiness enabled", () => {
    const run = harness();
    run.trainer.configureControls({ ...ready, allowedDeviceId: "piano" });
    run.trainer.setPlaying(true);
    now = 3375;
    run.trainer.configureControls({ ...ready, allowedDeviceId: "piano", canStart: false });
    run.trainer.configureControls({ ...ready, allowedDeviceId: "piano" });
    expect(run.latest()?.playing).toBe(false);
    run.trainer.setPlaying(true);
    run.trainer.configureControls({ ...ready, allowedDeviceId: "other" });
    expect(run.latest()?.playing).toBe(false);
  });
});

describe("Trainer key lights", () => {
  function lit() {
    const run = harness();
    const lights: (readonly number[])[] = [];
    run.trainer.onLights = (pitches) => {
      lights.push(pitches);
    };
    return { ...run, lights, last: () => lights.at(-1) };
  }
  it("lights the cued keys while playing and drops a hit one", () => {
    const run = lit();
    run.frame(1000);
    expect(run.last()).toEqual([]);
    run.trainer.setPlaying(true);
    run.frame(2800);
    expect(run.last()).toEqual([60]);
    down(run.trainer, 2950);
    run.frame(3000);
    expect(run.last()).toEqual([]);
  });
  it("turns every key off on pause, seek and the end of the song", () => {
    const run = lit();
    run.trainer.setPlaying(true);
    run.frame(2800);
    run.trainer.setPlaying(false);
    expect(run.last()).toEqual([]);
    run.frame(2900);
    expect(run.last()).toEqual([]);
    run.trainer.setPlaying(true);
    run.frame(2900);
    expect(run.last()).toEqual([60]);
    run.trainer.seek(0);
    expect(run.last()).toEqual([]);
    run.frame(9000, 6000);
    expect(run.latest()?.finished).toBe(true);
    expect(run.last()).toEqual([]);
  });
  it("lights nothing in the performance mode", () => {
    const run = lit();
    run.trainer.configureControls({
      loop: false,
      stopOnError: false,
      canStart: true,
      performance: true
    });
    run.trainer.setPlaying(true);
    run.frame(2800);
    expect(run.last()).toEqual([]);
  });
});
