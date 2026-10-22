// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import { generateIndependentRhythmExercise } from "../independentRhythm/generator";
import { IndependentRhythmPhaseSession } from "../independentRhythm/session";
import type { IndependentRhythmInput } from "../independentRhythm/types";
import type { FallingNotesView } from "../render/FallingNotesView";
import { Trainer, type TrainerSnapshot } from "./Trainer";
import {
  INDEPENDENT_RHYTHM_PRACTICE_OPTIONS,
  type TrainerIndependentRhythmPolicy
} from "./independentRhythmPolicy";

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
afterEach(() => {
  vi.restoreAllMocks();
});

function run(offsetMs = 0) {
  const exercise = generateIndependentRhythmExercise(0).pulse;
  const phase = new IndependentRhythmPhaseSession(exercise, {
    runId: "actual-trainer",
    presentationId: "pulse",
    source: "keyboard",
    offsetMs
  });
  phase.present(now);
  let tick: (delta: number) => void = () => undefined;
  let latest: TrainerSnapshot | undefined;
  const view = {
    onTick: (callback: (delta: number) => void) => {
      tick = callback;
    },
    setSong: vi.fn(),
    draw: vi.fn<FallingNotesView["draw"]>()
  };
  const trainer = new Trainer(view as unknown as FallingNotesView);
  const take = vi.fn(),
    finished = vi.fn();
  trainer.onSnapshot = (snapshot) => {
    latest = snapshot;
  };
  trainer.onTake = take;
  trainer.onRunFinished = finished;
  trainer.load(exercise.song, INDEPENDENT_RHYTHM_PRACTICE_OPTIONS, exercise.id);
  const convert = (event: KeyEvent): IndependentRhythmInput => ({
    kind: event.type,
    pitch: event.pitch,
    atMs: event.timestamp ?? now,
    source: event.source ?? "pointer",
    offsetMs,
    ...(event.deviceId ? { deviceId: event.deviceId } : {})
  });
  const policy: TrainerIndependentRhythmPolicy = {
    inputCompensationMs: () => offsetMs,
    onStart: (atMs, receipt, held) => {
      phase.seedHeld(held.map(convert), atMs);
      const started = phase.start(atMs);
      if (started) phase.tick(atMs, receipt);
      return started;
    },
    onFrame: (_session, playing, atMs, receipt) => {
      if (playing) phase.tick(atMs, receipt);
    },
    onInput: (event, _session, _playing, _raw, _corrected, received, receipt) => {
      phase.input(convert(event), received, phase.snapshot().active ? receipt : undefined);
    },
    cancel: (atMs) => {
      phase.cancel(atMs);
    },
    seedHeld: (events, atMs) => {
      phase.seedHeld(events.map(convert), atMs);
    },
    cuePitches: () => [60],
    statusOf: (id) => {
      const outcome = phase.snapshot().outcomes.find((note) => note.noteId === id)?.outcome;
      return outcome === "miss" ? "missed" : outcome;
    }
  };
  trainer.configureCourse("independentRhythm", policy);
  return {
    trainer,
    phase,
    take,
    finished,
    view,
    latest: () => latest,
    frame: (atMs: number) => {
      now = atMs;
      tick(16);
    },
    send: (type: "down" | "up", atMs: number, pitch = 60, received = atMs) => {
      now = received;
      trainer.key({
        type,
        pitch,
        velocity: 90,
        timestamp: atMs,
        source: "keyboard",
        deviceId: "keyboard"
      });
    }
  };
}

describe("independent rhythm on the actual Trainer clock", () => {
  it("does not finish at the last attack or create ordinary takes and results", () => {
    const course = run();
    now = 1400;
    course.trainer.setPlaying(true);
    for (let index = 0; index < 8; index++) {
      course.send("down", 5400 + index * 1000);
      course.send("up", 5410 + index * 1000);
    }
    expect(course.phase.snapshot().summary.right.hits).toBe(8);
    expect(course.phase.result()).toBeNull();
    course.frame(13400);
    expect(course.latest()?.playing).toBe(true);
    expect(course.phase.result()).toBeNull();
    course.frame(13650);
    expect(course.phase.result()).toBeNull();
    course.frame(13651);
    expect(course.phase.result()?.passed).toBe(true);
    course.trainer.setPlaying(false);
    expect(course.phase.result()?.passed).toBe(true);
    expect(course.take).not.toHaveBeenCalled();
    expect(course.finished).not.toHaveBeenCalled();
  });

  it("delivers an offset attack after actual end without clipping at pending notes", () => {
    const course = run(1000);
    course.trainer.setPlaying(true);
    course.frame(13050);
    course.send("down", 13050);
    expect(course.phase.snapshot().summary.right.hits).toBe(1);
    expect(course.phase.snapshot().outcomes.at(-1)?.deviationMs).toBe(50);
    course.frame(14250);
    expect(course.phase.result()).toBeNull();
    course.frame(14251);
    expect(course.phase.result()?.summary.right.hits).toBe(1);
  });

  it("preserves wrong pitches, receives nonselected owners and draws preparation cues", () => {
    const course = run();
    course.trainer.configureControls({
      canStart: true,
      loop: false,
      stopOnError: false,
      allowedDeviceId: "other-midi"
    });
    course.frame(1000);
    expect(course.view.draw.mock.lastCall?.[0].hints).toBe(false);
    course.trainer.setPlaying(true);
    course.send("down", 5000, 72);
    expect(course.phase.snapshot().summary.unknownExtras).toBe(1);
    expect(course.phase.snapshot().summary.right.hits).toBe(0);
    course.send("up", 5010, 72);
    course.send("down", 5100);
    expect(course.phase.snapshot().summary.right.hits).toBe(1);
  });

  it("seeds a physically held key into preparation and refuses manual start", () => {
    const course = run();
    course.send("down", 1000);
    expect(course.phase.snapshot().blocked).toBe(true);
    now = 1100;
    course.trainer.setPlaying(true);
    expect(course.latest()?.playing).toBe(false);
    expect(course.phase.snapshot().active).toBe(false);
    course.send("up", 1110);
    now = 1200;
    course.trainer.setPlaying(true);
    expect(course.latest()?.playing).toBe(true);
    expect(course.phase.snapshot().status).toBe("count-in");
  });
});
