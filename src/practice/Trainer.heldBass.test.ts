import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { soundAllOff } from "../audio/pianoSound";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import { Trainer } from "./Trainer";
import { HELD_BASS_PRACTICE_OPTIONS, type TrainerHeldBassPolicy } from "./heldBassPolicy";
import type { ScopedVerifiedOnset } from "./verifiedWaitingOnset";

vi.mock("../audio/pianoSound", () => ({ soundAllOff: vi.fn() }));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = vi.fn();
    reset = vi.fn();
  }
}));
let now = 1000;
beforeEach(() => vi.spyOn(performance, "now").mockImplementation(() => now));
afterEach(() => vi.restoreAllMocks());
const song: Song = {
  title: "held",
  source: "midi",
  measures: [],
  beats: [],
  duration: 1,
  notes: [
    { id: "bass", pitch: 48, hand: "left", start: 0, startBeat: 0, duration: 1 },
    { id: "r0", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 0.5 },
    { id: "r1", pitch: 62, hand: "right", start: 0.5, startBeat: 1, duration: 0.5 }
  ]
};
function harness() {
  now = 1000;
  let tick: (delta: number) => void = () => undefined;
  const view = {
    onTick: (callback: typeof tick) => {
      tick = callback;
    },
    setSong: vi.fn(),
    draw: vi.fn<FallingNotesView["draw"]>()
  };
  const trainer = new Trainer(view as unknown as FallingNotesView);
  let pending: ScopedVerifiedOnset | undefined;
  const input = vi.fn<TrainerHeldBassPolicy["onInput"]>();
  const commit = vi.fn<NonNullable<TrainerHeldBassPolicy["onCommit"]>>(() => {
    pending = undefined;
  });
  const cancel = vi.fn();
  const seedHeld = vi.fn();
  const policy: TrainerHeldBassPolicy = {
    onsets: {
      runId: "run",
      presentationId: "shown",
      fragmentId: "f",
      steps: [["bass", "r0"], ["r1"]]
    },
    onFrame: () => pending,
    onInput: input,
    onCommit: commit,
    cancel,
    seedHeld,
    cuePitches: () => [48, 60]
  };
  trainer.configureCourse("heldBass", policy);
  trainer.load(song, HELD_BASS_PRACTICE_OPTIONS, "held");
  trainer.setPlaying(true);
  now = 3000;
  tick(16);
  const finish = vi.fn();
  trainer.onRunFinished = finish;
  const takes = vi.fn();
  trainer.onTake = takes;
  const snapshot = vi.fn<NonNullable<Trainer["onSnapshot"]>>();
  trainer.onSnapshot = snapshot;
  return {
    trainer,
    input,
    commit,
    cancel,
    seedHeld,
    policy,
    finish,
    takes,
    snapshot,
    view,
    frame: (at: number) => {
      const delta = at - now;
      now = at;
      tick(delta);
    },
    request: (step: number) => {
      pending = {
        runId: "run",
        presentationId: "shown",
        fragmentId: "f",
        step,
        noteIds: policy.onsets.steps[step] ?? []
      };
    }
  };
}
describe("Trainer held-bass transport", () => {
  it("retains playing and delivers physical up after musical end without cancelling/silencing/recording", () => {
    const run = harness();
    const ordinaryInput = vi.fn(() => true);
    run.trainer.onInput = ordinaryInput;
    run.trainer.key({ type: "down", pitch: 48, velocity: 90, source: "midi", timestamp: now });
    expect(ordinaryInput).not.toHaveBeenCalled();
    expect(run.snapshot.mock.lastCall?.[0].stats.hits).toBe(0);
    run.request(0);
    run.frame(3200);
    expect(run.commit.mock.lastCall?.[1]).toBe(true);
    run.frame(3700);
    run.request(1);
    run.frame(4000);
    expect(run.commit.mock.lastCall?.[1]).toBe(true);
    run.cancel.mockClear();
    vi.mocked(soundAllOff).mockClear();
    run.frame(4600);
    expect(run.snapshot.mock.lastCall?.[0]).toMatchObject({
      playing: true,
      finished: true,
      time: 1
    });
    expect(run.cancel).not.toHaveBeenCalled();
    expect(soundAllOff).not.toHaveBeenCalled();
    expect(run.finish).not.toHaveBeenCalled();
    expect(run.takes).not.toHaveBeenCalled();
    run.trainer.key({ type: "up", pitch: 48, velocity: 0, source: "midi", timestamp: 4500 });
    expect(run.input.mock.lastCall?.[0].type).toBe("up");
    expect(run.input.mock.lastCall?.[6]).toMatchObject({ ended: true, songTime: 1, atMs: 4600 });
    run.frame(4900);
    expect(run.view.draw.mock.lastCall?.[0].graded).toEqual([]);
    run.trainer.setPlaying(false);
    expect(run.cancel).toHaveBeenCalledWith(4900, false);
    expect(soundAllOff).toHaveBeenCalled();
    expect(run.finish).not.toHaveBeenCalled();
  });

  it("delivers up while travelling, using raw/corrected timestamps and actual receipt", () => {
    const run = harness();
    run.request(0);
    run.frame(3200);
    run.trainer.configureTiming({
      inputOffsets: { piano: 40 },
      manualInputOffsetMs: 20,
      audioOffsetMs: 0,
      visualOffsetMs: 0
    });
    run.trainer.setPlaying(false);
    run.trainer.setPlaying(true);
    run.frame(3300);
    run.trainer.key({
      type: "up",
      pitch: 48,
      velocity: 0,
      source: "midi",
      deviceId: "piano",
      timestamp: 3290
    });
    expect(run.input.mock.lastCall?.slice(2, 6)).toEqual([true, 3290, 3230, 3300]);
    expect(run.input.mock.lastCall?.[6].waiting).toBe(false);
    run.trainer.cancelInput(true);
    expect(run.cancel).toHaveBeenLastCalledWith(3300, true);
  });

  it("seeds pre-held ownership and excludes ordinary/pair policies", () => {
    const run = harness();
    run.trainer.configureCourse("heldBass", null);
    run.trainer.key({ type: "down", pitch: 70, velocity: 90, timestamp: now });
    const pairInput = vi.fn();
    run.trainer.configureCourse("pair", {
      onFrame: () => undefined,
      onInput: pairInput,
      cancel: vi.fn(),
      cuePitches: () => []
    });
    run.trainer.configureCourse("heldBass", { ...run.policy });
    expect(run.seedHeld).toHaveBeenLastCalledWith(
      [expect.objectContaining({ pitch: 70, type: "down" })],
      now
    );
    run.trainer.key({ type: "up", pitch: 70, velocity: 0, timestamp: now });
    expect(pairInput).not.toHaveBeenCalled();
    expect(run.input).toHaveBeenCalled();
  });
});
