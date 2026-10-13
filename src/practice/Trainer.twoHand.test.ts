import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import { Trainer } from "./Trainer";
import { TWO_HAND_PRACTICE_OPTIONS, type TrainerPairPolicy } from "./twoHandPolicy";

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
  title: "pairs",
  source: "midi",
  duration: 2,
  measures: [],
  beats: [],
  notes: [
    { id: "l1", pitch: 48, hand: "left", start: 0, startBeat: 0, duration: 0.5 },
    { id: "r1", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 0.5 },
    { id: "l2", pitch: 50, hand: "left", start: 0.5, startBeat: 1, duration: 0.5 },
    { id: "r2", pitch: 62, hand: "right", start: 0.5, startBeat: 1, duration: 0.5 }
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
  let pending: readonly string[] | undefined;
  const input = vi.fn<TrainerPairPolicy["onInput"]>();
  const commit = vi.fn<NonNullable<TrainerPairPolicy["onCommit"]>>(() => {
    pending = undefined;
  });
  const cancel = vi.fn();
  const cue = vi.fn();
  const policy: TrainerPairPolicy = {
    onFrame: () => pending,
    onInput: input,
    cancel,
    cuePitches: () => [48, 60],
    onCuePresented: cue,
    onCommit: commit
  };
  trainer.configurePair(policy);
  trainer.load(song, TWO_HAND_PRACTICE_OPTIONS, "pair");
  trainer.setPlaying(true);
  now = 4000;
  tick(16);
  return {
    trainer,
    input,
    commit,
    cancel,
    cue,
    view,
    frame: () => {
      tick(16);
    },
    request: (ids: readonly string[]) => {
      pending = ids;
    }
  };
}

describe("Trainer pair policy", () => {
  it("hands pre-held third notes to the pair core as ownership without issuing an attack", () => {
    const run = harness();
    run.trainer.configurePair(null);
    run.trainer.key({
      type: "down",
      pitch: 70,
      velocity: 90,
      source: "midi",
      deviceId: "piano",
      channel: 2,
      timestamp: now
    });
    const seedHeld = vi.fn();
    const onInput = vi.fn();
    const cancel = vi.fn();
    run.trainer.configurePair({
      onFrame: () => undefined,
      onInput,
      cancel,
      cuePitches: () => [],
      seedHeld
    });
    expect(seedHeld).toHaveBeenCalledExactlyOnceWith(
      [
        expect.objectContaining({
          type: "down",
          pitch: 70,
          source: "midi",
          deviceId: "piano",
          channel: 2,
          timestamp: now
        })
      ],
      now
    );
    expect(onInput).not.toHaveBeenCalled();
    run.trainer.cancelInput(true);
    expect(cancel).toHaveBeenCalledWith(now, true);
    const nextSeed = vi.fn();
    run.trainer.configurePair({
      onFrame: () => undefined,
      onInput,
      cancel,
      cuePitches: () => [],
      seedHeld: nextSeed
    });
    expect(nextSeed).toHaveBeenCalledWith([], now);
  });
  it("delivers raw down/up before ordinary judgement and never partially hits or records", () => {
    const run = harness();
    const takes = vi.fn();
    run.trainer.onTake = takes;
    const snapshot = vi.fn<NonNullable<Trainer["onSnapshot"]>>();
    run.trainer.onSnapshot = snapshot;
    const down = {
      type: "down" as const,
      pitch: 48,
      velocity: 90,
      source: "keyboard" as const,
      timestamp: now
    };
    run.trainer.key(down);
    run.trainer.key({ ...down, type: "up", timestamp: now + 1 });
    run.trainer.key({ ...down, pitch: 60 });
    expect(run.input).toHaveBeenCalledTimes(3);
    expect(run.input.mock.calls[0]?.[3]).toBe(now);
    expect(snapshot.mock.lastCall?.[0].stats.hits).toBe(0);
    expect(snapshot.mock.lastCall?.[0].waiting).toBe(true);
    run.request(["r1", "l1"]);
    run.frame();
    expect(run.commit).toHaveBeenCalledExactlyOnceWith(["r1", "l1"], true, now);
    run.frame();
    expect(run.commit).toHaveBeenCalledTimes(1);
    run.trainer.setPlaying(false);
    expect(takes).not.toHaveBeenCalled();
    expect(run.view.draw.mock.lastCall?.[0].graded).toEqual([]);
  });

  it("rejects a stale/subset commit without changing either due note", () => {
    const run = harness();
    run.request(["l1"]);
    run.frame();
    expect(run.commit).toHaveBeenLastCalledWith(["l1"], false, now);
    expect(run.trainer.nextDueNoteId()).toBe("l1");
    run.request(["l1", "r1"]);
    run.frame();
    run.request(["l1", "r1"]);
    run.frame();
    expect(run.commit).toHaveBeenLastCalledWith(["l1", "r1"], false, now);
    expect(run.commit.mock.calls.filter(([, accepted]) => accepted)).toHaveLength(1);
  });

  it("shows and acknowledges only current pair cues and cancels lost input before cleanup", () => {
    const run = harness();
    expect(run.view.draw.mock.lastCall?.[0].hintNotes?.map((note) => note.pitch)).toEqual([48, 60]);
    expect(run.cue).toHaveBeenCalledWith([48, 60], now);
    run.trainer.key({ type: "down", pitch: 48, velocity: 90, timestamp: now });
    run.cancel.mockClear();
    run.trainer.cancelInput();
    expect(run.cancel).toHaveBeenCalledExactlyOnceWith(now, false);
    run.frame();
    expect(run.view.draw.mock.lastCall?.[0].pressed.size).toBe(0);
    run.trainer.setPlaying(false);
    run.frame();
    expect(run.view.draw.mock.lastCall?.[0].hintNotes).toEqual([]);
  });
});
