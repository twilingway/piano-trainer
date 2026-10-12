// @vitest-environment happy-dom
import { act, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyEvent, MidiDevice } from "../input/midiInput";
import { Trainer, type TrainerSnapshot } from "../practice/Trainer";
import { RHYTHM_PRACTICE_OPTIONS } from "../practice/rhythmPolicy";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import { createMemoryReadingRepository } from "./readingRepository";
import { readingActions } from "./readingSlice";
import { preferencesActions } from "./preferencesSlice";
import { createAppStore, type AppStore } from "./store";
import { useAppSelector } from "./storeHooks";
import { withTestStore } from "./storeTestSupport";
import { useRhythmCourse, type RhythmCourseController } from "./useRhythmCourse";
import { useRhythmTrainer } from "./useRhythmTrainer";
import { useTimingControls } from "./useTimingControls";
import { createTrainerSnapshotSource } from "./trainerSnapshots";
import { setInterfaceLanguage } from "./interfaceLanguage";

const audio = vi.hoisted(() => ({
  ready: true,
  ensure: vi.fn<() => Promise<boolean>>(),
  interrupted: new Set<() => void>(),
  start: vi.fn(),
  reset: vi.fn(),
  tap: vi.fn()
}));
vi.mock("../audio/rhythmTapSound", () => ({ soundRhythmTap: audio.tap }));
vi.mock("../audio/pianoSound", () => ({
  soundAllOff: vi.fn(),
  audioTime: () => 0,
  scheduleSound: () => 1,
  cancelScheduledSound: vi.fn(),
  soundClick: vi.fn(),
  ensureMetronomeSound: audio.ensure,
  metronomeSoundReady: () => audio.ready,
  onPianoSoundInterrupted: (callback: () => void) => {
    audio.interrupted.add(callback);
    return () => {
      audio.interrupted.delete(callback);
    };
  }
}));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = audio.start;
    reset = audio.reset;
    schedule = vi.fn();
  }
}));

const DEVICES: readonly MidiDevice[] = [{ id: "piano", name: "Test piano" }];
const ORDINARY_SONG: Song = {
  title: "ordinary fixture",
  source: "midi",
  duration: 100,
  notes: [{ id: "ordinary", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }],
  beats: [],
  measures: []
};
let host: HTMLDivElement;
let root: Root;
let store: AppStore;
let repository: ReturnType<typeof createMemoryReadingRepository>;
let course: RhythmCourseController;
let trainer: Trainer;
let tick: (deltaMs: number) => void;
let snapshot: TrainerSnapshot | undefined;
let now: number;
let visibility: DocumentVisibilityState;
let trainerRef: { current: Trainer };

function Harness({
  blocked = false,
  deviceId = "piano",
  calibrate = false
}: {
  blocked?: boolean;
  deviceId?: string;
  calibrate?: boolean;
}) {
  const value = useRhythmCourse();
  const timing = useAppSelector((state) => state.preferences.timing);
  const loadedId = useRef<string | null>(null);
  useRhythmTrainer(value, trainerRef, true, blocked, DEVICES, deviceId);
  const [source] = useState(createTrainerSnapshotSource);
  const calibration = useTimingControls({
    trainerRef,
    trainerReady: true,
    devices: DEVICES,
    deviceId,
    localInput: value.active && value.source !== "midi",
    snapshotSource: source,
    ensureSound: () => Promise.resolve()
  });
  useLayoutEffect(() => {
    trainer.configureTiming({
      inputOffsets: {},
      manualInputOffsetMs: timing.manualOffsetMs,
      audioOffsetMs: timing.audioOffsetMs,
      visualOffsetMs: timing.visualOffsetMs
    });
  }, [timing]);
  useLayoutEffect(() => {
    if (value.exercise && value.exercise.id !== loadedId.current) {
      trainer.load(value.exercise.song, RHYTHM_PRACTICE_OPTIONS, value.exercise.id);
      loadedId.current = value.exercise.id;
    }
  }, [value.exercise]);
  useEffect(() => {
    course = value;
  });
  return calibrate ? calibration.settings : null;
}

function render(blocked = false, deviceId = "piano", calibrate = false) {
  act(() => {
    root.render(
      withTestStore(<Harness blocked={blocked} deviceId={deviceId} calibrate={calibrate} />, store)
    );
  });
}
function at(timestamp: number, command: () => void) {
  now = timestamp;
  act(command);
}
function select(source: "keyboard" | "pointer" | "midi" = "keyboard") {
  at(now, () => {
    store.dispatch(readingActions.rhythmSelected({ bpm: 60, inputSource: source, seed: 42 }));
  });
}
function present() {
  at(now, () => {
    const presentation = course.presentation;
    presentation?.onPresented(presentation.id, now);
  });
}
async function start() {
  await act(async () => {
    await course.onStart();
  });
}
function frame(timestamp: number) {
  at(timestamp, () => {
    tick(16);
  });
}
function key(
  type: "down" | "up",
  timestamp: number,
  source: KeyEvent["source"] = "keyboard",
  pitch = 60
) {
  at(timestamp, () => {
    trainer.key({
      type,
      timestamp,
      pitch,
      velocity: 90,
      source,
      deviceId: source === "midi" ? "piano" : source
    });
  });
}
function space(type: "keydown" | "keyup", timestamp: number) {
  const event = new KeyboardEvent(type, {
    code: "Space",
    key: " ",
    bubbles: true,
    cancelable: true
  });
  Object.defineProperty(event, "timeStamp", { value: timestamp });
  at(timestamp, () => {
    window.dispatchEvent(event);
  });
}

beforeEach(async () => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  now = 1000;
  visibility = "visible";
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(Date, "now").mockImplementation(() => 1_800_000_000_000 + now);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  audio.ready = true;
  audio.ensure.mockReset().mockResolvedValue(true);
  audio.interrupted.clear();
  audio.start.mockClear();
  audio.reset.mockClear();
  audio.tap.mockClear();
  repository = createMemoryReadingRepository();
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: repository
  });
  await store.readingPersistenceReady;
  tick = () => undefined;
  snapshot = undefined;
  trainer = new Trainer({
    onTick: (callback: (deltaMs: number) => void) => {
      tick = callback;
    },
    setSong: vi.fn(),
    draw: vi.fn()
  } as unknown as FallingNotesView);
  trainer.onSnapshot = (value) => {
    snapshot = value;
  };
  trainer.load(ORDINARY_SONG, { mode: "tempo", hands: new Set(["right"]), speed: 1 }, "ordinary");
  trainerRef = { current: trainer };
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  render();
});
afterEach(async () => {
  vi.useRealTimers();
  act(() => {
    root.unmount();
  });
  await store.flushReadingPersistence();
  trainer.destroy();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("rhythm preparation and ownership", () => {
  it("routes Space and native pointer calibration taps past the blocked rhythm listener", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    select();
    present();
    await start();
    render(true, "piano", true);
    const startButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Калибровать C4"
    );
    if (!startButton) throw new Error("Missing calibration button");
    await act(async () => {
      startButton.click();
      await Promise.resolve();
    });
    for (let index = 0; index < 28; index++) {
      const timestamp = 1300 + index * 600;
      if (index % 2 === 0) space("keydown", timestamp);
      else {
        const tapButton = Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Ударить"
        );
        if (!tapButton) throw new Error("Missing calibration tap");
        const event = new PointerEvent("pointerdown", {
          button: 0,
          bubbles: true,
          cancelable: true
        });
        Object.defineProperty(event, "timeStamp", { value: timestamp });
        at(timestamp, () => {
          tapButton.dispatchEvent(event);
        });
      }
    }
    expect(
      store.getState().preferences.timing.profiles[JSON.stringify(["keyboard", "local"])]
    ).toMatchObject({ complete: true, inputOffsetMs: 0 });
    expect(course.status).toBe("cancelled");
    expect(snapshot?.playing).toBe(false);
    expect(store.getState().reading.rhythm.history).toHaveLength(0);
  });
  it("does not start or grade until the visible score and audio are ready", async () => {
    select();
    await start();
    expect(course.error).toBe("staff");
    expect(snapshot?.playing).toBe(false);
    expect(audio.ensure).not.toHaveBeenCalled();
    present();
    audio.ensure.mockResolvedValueOnce(false);
    await start();
    expect(course.error).toBe("audio");
    expect(snapshot?.playing).toBe(false);
    expect(store.getState().reading.rhythm.history).toHaveLength(0);
    await start();
    expect(course.status).toBe("count-in");
    expect(snapshot?.time).toBe(-4);
    expect(snapshot?.playing).toBe(true);
  });

  it("invalidates delayed audio and score callbacks when the selection changes", async () => {
    select();
    present();
    const oldPresentation = course.presentation;
    let finish!: (ready: boolean) => void;
    audio.ensure.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
    );
    let pending!: Promise<void>;
    act(() => {
      pending = course.onStart();
    });
    expect(course.status).toBe("preparing");
    at(now + 10, () => {
      course.onNewSeries();
    });
    expect(course.ready).toBe(false);
    at(now, () => {
      oldPresentation?.onPresented(oldPresentation.id, now);
    });
    expect(course.ready).toBe(false);
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(snapshot?.playing).toBe(false);
    expect(store.getState().reading.rhythm.history).toHaveLength(0);
    present();
    await start();
    expect(course.status).toBe("count-in");
  });

  it("leaves ordinary playback running when rhythm is inactive and connection settings change", () => {
    at(now, () => {
      trainer.setPlaying(true);
    });
    expect(snapshot?.playing).toBe(true);
    render(true, "missing");
    expect(snapshot?.playing).toBe(true);
    at(now, () => {
      store.dispatch(
        preferencesActions.timingChanged({
          ...store.getState().preferences.timing,
          manualOffsetMs: 25
        })
      );
    });
    expect(snapshot?.playing).toBe(true);
  });

  it("requires a selected MIDI device before preparing audio", async () => {
    render(false, "missing");
    select("midi");
    present();
    await start();
    expect(course.error).toBe("midi");
    expect(audio.ensure).not.toHaveBeenCalled();
  });
});

describe("rhythm attacks and completed evidence", () => {
  it("sounds local hits and extras once without changing their timestamps or grading", async () => {
    select();
    present();
    await start();
    const started = now;
    space("keydown", started + 1000);
    space("keyup", started + 1001);
    expect(audio.tap).not.toHaveBeenCalled(); // The count-in is outside evaluation.
    space("keydown", started + 4000);
    space("keydown", started + 4001); // A held key does not produce another voice.
    space("keyup", started + 4002);
    space("keydown", started + 4500);
    space("keyup", started + 4501); // Extra attack.
    expect(audio.tap).toHaveBeenCalledTimes(2);
    const exercise = course.exercise;
    if (!exercise) throw new Error("Missing exercise");
    frame(started + 4000 + exercise.durationS * 1000 + 251);
    expect(course.result?.summary).toMatchObject({ hits: 1, misses: 9, extras: 1 });
    expect(course.result?.attacks[0]).toMatchObject({
      rawAtMs: started + 4000,
      correctedAtMs: started + 4000,
      deviationMs: 0
    });
    space("keydown", now + 1);
    space("keyup", now + 2);
    expect(audio.tap).toHaveBeenCalledTimes(2);
  });
  it("finishes all ten pointer attacks on the shared clock and restores their raw evidence", async () => {
    select("pointer");
    present();
    await start();
    const exercise = course.exercise;
    if (!exercise) throw new Error("Missing rhythm exercise");
    const startMs = now;
    for (const onset of exercise.onsets) {
      const timestamp = startMs + 4000 + onset.timeS * 1000;
      at(timestamp, () => {
        course.onTapDown("pointer", timestamp, "pointer:3");
      });
      at(timestamp + 1, () => {
        course.onTapUp("pointer", "pointer:3");
      });
    }
    frame(startMs + 4000 + exercise.durationS * 1000 + 251);
    expect(course.status).toBe("completed");
    expect(audio.tap).toHaveBeenCalledTimes(10);
    expect(course.result?.summary).toMatchObject({
      expected: 10,
      hits: 10,
      misses: 0,
      extras: 0,
      hitRate: 1
    });
    expect(course.result?.attacks[0]).toMatchObject({
      source: "pointer",
      rawAtMs: startMs + 4000,
      correctedAtMs: startMs + 4000,
      songTimeS: 0,
      pitch: 60
    });
    const runId = course.result?.runId;
    await store.flushReadingPersistence();
    const restored = createAppStore({
      storage: { getItem: () => null, setItem: () => undefined },
      readingRepository: repository
    });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading.rhythm.history[0]?.runId).toBe(runId);
    expect(restored.getState().reading.activeCourse).toBe("rhythm-training");
    expect(restored.getState().reading.rhythm.inputSource).toBe("pointer");
  });

  it("keeps a held Space fresh gate closed across renders until a real keyup", async () => {
    select();
    present();
    await start();
    const exercise = course.exercise;
    if (!exercise?.onsets[1] || !exercise.onsets[2]) throw new Error("Missing rhythm onsets");
    const startMs = now;
    space("keydown", startMs + 4000);
    render();
    space("keydown", startMs + 4000 + exercise.onsets[1].timeS * 1000);
    space("keyup", now + 1);
    space("keydown", startMs + 4000 + exercise.onsets[2].timeS * 1000);
    space("keyup", now + 1);
    frame(startMs + 4000 + exercise.durationS * 1000 + 251);
    expect(course.result?.summary).toMatchObject({ hits: 2, misses: 8, extras: 0 });
  });

  it("ignores wrong input sources while preserving arbitrary selected MIDI pitches", async () => {
    select("midi");
    present();
    await start();
    const startMs = now;
    key("down", startMs + 4000, "keyboard");
    key("up", now + 1, "keyboard");
    key("down", startMs + 4100, "midi", 90);
    key("down", startMs + 4100, "midi", 90);
    key("up", now + 1, "midi", 90);
    const exercise = course.exercise;
    if (!exercise) throw new Error("Missing rhythm exercise");
    frame(startMs + 4000 + exercise.durationS * 1000 + 251);
    expect(course.result?.summary).toMatchObject({ hits: 1, misses: 9, extras: 0 });
    expect(course.result?.attacks[0]).toMatchObject({
      pitch: 90,
      source: "midi",
      deviceId: "piano"
    });
    expect(course.result?.attacks[0]?.deviationMs).toBeCloseTo(100);
    expect(audio.tap).not.toHaveBeenCalled();
  });
});

describe("rhythm cancellation", () => {
  it.each(["hidden", "window", "pause", "audio"] as const)(
    "cancels %s without recording a partial result and restarts with a fresh count-in",
    async (reason) => {
      select();
      present();
      await start();
      const initialStart = now;
      key("down", initialStart + 4000);
      key("up", now + 1);
      const oldTimestamp = now;
      if (reason === "hidden") {
        visibility = "hidden";
        at(now, () => {
          document.dispatchEvent(new Event("visibilitychange"));
        });
        visibility = "visible";
      } else if (reason === "window") {
        render(true);
        render(false);
      } else if (reason === "pause")
        at(now, () => {
          trainer.setPlaying(false);
        });
      else
        at(now, () => {
          audio.interrupted.forEach((callback) => {
            callback();
          });
        });
      expect(course.status).toBe("cancelled");
      frame(initialStart + 25000);
      expect(course.result).toBeNull();
      expect(store.getState().reading.rhythm.history).toHaveLength(0);
      await start();
      expect(snapshot?.time).toBe(-4);
      expect(course.status).toBe("count-in");
      at(now, () => {
        trainer.key({
          type: "down",
          pitch: 61,
          velocity: 90,
          timestamp: oldTimestamp,
          source: "keyboard",
          deviceId: "keyboard"
        });
      });
      const exercise = course.exercise;
      if (!exercise) throw new Error("Missing rhythm exercise");
      frame(now + 4000 + exercise.durationS * 1000 + 251);
      expect(course.result?.summary).toMatchObject({ hits: 0, misses: 10, extras: 0 });
    }
  );
});
