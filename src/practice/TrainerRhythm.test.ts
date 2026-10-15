// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Trainer } from "./Trainer";
import { PracticeSession } from "./session";
import {
  RHYTHM_PRACTICE_OPTIONS,
  type RhythmAttackEvidence,
  type TrainerRhythmPolicy
} from "./rhythmPolicy";
import { generateRhythmExercise } from "../rhythm/generator";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { RhythmBpm } from "../rhythm/types";

vi.mock("../audio/pianoSound", () => ({ soundAllOff: vi.fn() }));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = vi.fn();
    reset = vi.fn();
  }
}));
let now = 1000;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

function harness(source: "keyboard" | "pointer" | "midi" = "midi", bpm: RhythmBpm = 60) {
  const exercise = generateRhythmExercise(1, bpm);
  let frame: (delta: number) => void = () => undefined;
  const view = {
    onTick: (tick: typeof frame) => {
      frame = tick;
    },
    setSong: vi.fn(),
    draw: vi.fn()
  };
  const trainer = new Trainer(view as unknown as FallingNotesView);
  const attacks: RhythmAttackEvidence[] = [];
  const policy: TrainerRhythmPolicy = {
    inputCompensationMs: () => 100,
    accepts: (event) =>
      event.source === source && (source !== "midi" || event.deviceId === "piano"),
    onAttack: (event) => {
      attacks.push(event);
    },
    onFrame: vi.fn()
  };
  trainer.configureCourse("rhythm", policy);
  trainer.configureTiming({
    inputOffsets: { piano: 100, keyboard: 100, pointer: 100, foreign: 1000 },
    manualInputOffsetMs: 0,
    audioOffsetMs: 0,
    visualOffsetMs: 0
  });
  trainer.load(exercise.song, RHYTHM_PRACTICE_OPTIONS, "rhythm");
  trainer.setPlaying(true);
  const key = (
    type: "down" | "up",
    pitch = 70,
    deviceId = "piano",
    timestamp = now,
    eventSource = source
  ) => {
    trainer.key({ type, pitch, deviceId, velocity: 90, timestamp, source: eventSource });
  };
  return {
    trainer,
    view,
    exercise,
    attacks,
    key,
    frame: (at: number) => {
      now = at;
      frame(16);
    }
  };
}

describe("rhythm trainer clock and fresh input", () => {
  it.each([60, 80, 100] as const)(
    "counts four beats at %s BPM, with a quiet delivery tail",
    (bpm) => {
      const exercise = generateRhythmExercise(1, bpm);
      const session = new PracticeSession(exercise.song, RHYTHM_PRACTICE_OPTIONS);
      expect(session.time).toBeCloseTo(-240 / bpm);
      expect(session.audioBeats.filter((beat) => beat.time < 0)).toHaveLength(4);
      expect(session.audioBeats.find((beat) => beat.time < 0)?.downbeat).toBe(true);
      session.startClock(1000);
      session.setInputGrace(100);
      session.tick(1000 + (240 / bpm + exercise.durationS + 0.349) * 1000);
      expect(session.finished).toBe(false);
      session.tick(1000 + (240 / bpm + exercise.durationS + 0.351) * 1000);
      expect(session.finished).toBe(true);
      const { countInBeats: _countIn, ...ordinaryOptions } = RHYTHM_PRACTICE_OPTIONS;
      const ordinary = new PracticeSession(exercise.song, ordinaryOptions);
      expect(ordinary.time).toBe(-2);
    }
  );
  it("observes extra attacks outside game windows, preserves chord identity and clears intercepted releases", () => {
    const h = harness();
    h.frame(5100);
    h.key("down", 70);
    h.key("down", 70);
    h.key("down", 71);
    expect(h.attacks).toHaveLength(2);
    expect(h.attacks[0]?.songTimeS).toBeCloseTo(0);
    h.frame(5101);
    expect(h.view.draw).toHaveBeenLastCalledWith(expect.objectContaining({ graded: [] }));
    h.trainer.onInput = () => true;
    h.key("up", 70);
    h.trainer.onInput = undefined;
    h.frame(6000);
    h.key("down", 70);
    expect(h.attacks).toHaveLength(3);
    h.key("up", 70);
    h.frame(6600);
    h.key("down", 70); // midway through a half or in a rest
    expect(h.attacks).toHaveLength(4);
    h.trainer.destroy();
  });
  it("rejects foreign source, old raw timestamps, and paused downs until their release", () => {
    const h = harness();
    h.frame(5100);
    h.key("down", 70, "other");
    h.key("down", 71, "piano", now - 251);
    h.key("down", 72, "keyboard", now, "keyboard");
    expect(h.attacks).toHaveLength(0);
    h.trainer.setPlaying(false);
    h.key("down", 75);
    h.trainer.setPlaying(true);
    h.key("down", 75);
    expect(h.attacks).toHaveLength(0);
    h.key("up", 75);
    h.key("down", 75);
    expect(h.attacks).toHaveLength(1);
    h.trainer.destroy();
  });
  it.each([15, 60])("keeps count-in mapping at %s FPS", (fps) => {
    const h = harness("keyboard", 80);
    const end = 1000 + 3000;
    for (let at = 1000; at < end; at += 1000 / fps) h.frame(at);
    h.frame(end + 100);
    h.key("down", 60, "keyboard");
    expect(h.attacks[0]?.songTimeS).toBeCloseTo(0);
    h.trainer.destroy();
  });
});
