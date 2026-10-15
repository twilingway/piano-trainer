// @vitest-environment happy-dom
import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeSession } from "../practice/session";
import type { Trainer } from "../practice/Trainer";
import type { TrainerIndependentRhythmPolicy } from "../practice/independentRhythmPolicy";
import type { KeyEvent, MidiDevice } from "../input/midiInput";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { createMemoryReadingRepository } from "./readingRepository";
import { preferencesActions } from "./preferencesSlice";
import {
  useIndependentRhythmCourse,
  useIndependentRhythmTrainer
} from "./useIndependentRhythmCourse";

const audio = vi.hoisted(() => ({
  ensure: vi.fn(() => Promise.resolve(true)),
  start: vi.fn(() => Promise.resolve()),
  ready: vi.fn(() => true),
  piano: vi.fn(() => true),
  interrupted: null as (() => void) | null
}));
vi.mock("../audio/pianoSound", () => ({
  ensureMetronomeSound: audio.ensure,
  startPianoSound: audio.start,
  metronomeSoundReady: audio.ready,
  pianoSoundReady: audio.piano,
  onPianoSoundInterrupted: (callback: () => void) => {
    audio.interrupted = callback;
    return () => {
      audio.interrupted = null;
    };
  }
}));
let root: Root, host: HTMLDivElement, store: AppStore, now: number;
let course: ReturnType<typeof useIndependentRhythmCourse>;
let practice: PracticeSession | null;
let policy: TrainerIndependentRhythmPolicy | null;
let playing: boolean, blocked: boolean, devices: readonly MidiDevice[], selectedDeviceId: string;
const held = new Map<number, KeyEvent>();
const configureCourse = vi.fn(
  (_kind: "independentRhythm", next: TrainerIndependentRhythmPolicy | null) => {
    if (policy === next) return;
    policy?.cancel(now);
    policy = next;
    policy?.seedHeld([...held.values()], now);
  }
);
const setPlaying = vi.fn((next: boolean) => {
  if (!practice) return;
  if (next) {
    practice.resumeClock(now);
    playing = policy?.onStart(now, practice.tempoClockReceipt(now), [...held.values()]) ?? false;
    if (!playing) practice.pauseClock(now);
    policy?.onFrame(practice, playing, now, practice.tempoClockReceipt(now));
  } else {
    playing = false;
    policy?.cancel(now);
    practice.pauseClock(now);
  }
});
const trainerRef = { current: { configureCourse, setPlaying } as unknown as Trainer };
function Harness() {
  const value = useIndependentRhythmCourse();
  useIndependentRhythmTrainer(value, trainerRef, true, blocked, devices, selectedDeviceId);
  useEffect(() => {
    course = value;
  });
  return null;
}
function render() {
  act(() => {
    root.render(
      withTestStore(
        <StrictMode>
          <Harness />
        </StrictMode>,
        store
      )
    );
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  now = 1000;
  blocked = false;
  devices = [];
  selectedDeviceId = "all";
  practice = null;
  policy = null;
  playing = false;
  held.clear();
  audio.ensure.mockImplementation(() => Promise.resolve(true));
  audio.start.mockImplementation(() => Promise.resolve());
  audio.ready.mockReturnValue(true);
  audio.piano.mockReturnValue(true);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  render();
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing course value");
  return value;
}
function loadScene(present = true) {
  const scene = required(course.scene);
  practice = new PracticeSession(scene.song, {
    mode: "tempo",
    hands: new Set(["left", "right"]),
    speed: 1,
    countInBeats: 4,
    accompaniment: false,
    noteResult: false
  });
  practice.startClock(now);
  practice.pauseClock(now);
  if (present)
    act(() => {
      const shown = required(course.presentation);
      shown.onPresented(shown.id, now);
    });
  return practice;
}
function select(present = true) {
  act(() => {
    course.start();
  });
  return loadScene(present);
}
async function start() {
  await act(async () => {
    await course.onStart();
  });
}
function frame(at: number) {
  now = at;
  const current = required(practice);
  current.tick(at);
  act(() => {
    policy?.onFrame(current, playing, at, current.tempoClockReceipt(at));
  });
}
function input(
  type: "down" | "up",
  pitch: number,
  at: number,
  received = at,
  metadata: Partial<KeyEvent> = {}
) {
  now = received;
  const current = required(practice);
  current.tick(received);
  const event: KeyEvent = {
    type,
    pitch,
    velocity: 90,
    source: course.source,
    timestamp: at,
    ...(course.source === "midi" ? { deviceId: selectedDeviceId, channel: 1 } : {}),
    ...metadata
  };
  if (type === "down") held.set(pitch, event);
  else held.delete(pitch);
  act(() => {
    const active = policy;
    active?.onInput(
      event,
      current,
      playing,
      at,
      at - active.inputCompensationMs(),
      received,
      current.tempoClockReceipt(received)
    );
    active?.onFrame(current, playing, received, current.tempoClockReceipt(received));
  });
}
function solvePhase(
  options: { onlyRight?: boolean; keepLastHeld?: boolean; finish?: boolean } = {}
) {
  const current = required(practice),
    zero = required(current.tempoClockReceipt(now).startPerformanceMs),
    offset = required(policy).inputCompensationMs();
  for (const onset of [...new Set(current.song.notes.map((note) => note.start))]) {
    const notes = current.song.notes.filter(
      (note) => note.start === onset && (!options.onlyRight || note.hand === "right")
    );
    for (const note of notes) input("down", note.pitch, zero + onset * 1000 + offset);
    for (const note of notes)
      if (!(options.keepLastHeld && onset === 7))
        input("up", note.pitch, zero + onset * 1000 + offset + 10);
  }
  if (options.finish !== false)
    frame(zero + current.song.duration * 1000 + Math.max(0, offset) + 251);
}

describe("independent rhythm React shell and actual tempo clock", () => {
  it("runs two manually started fresh Songs, preserves the permit only in memory and saves once", async () => {
    select();
    expect(course.status).toBe("preparation");
    expect(configureCourse).toHaveBeenLastCalledWith("independentRhythm", course.policy);
    await start();
    expect(course.status).toBe("count-in");
    const pulseSong = required(course.scene).song;
    solvePhase();
    expect(course.phase).toBe("two-hands");
    expect(course.status).toBe("passed");
    expect(course.ready).toBe(false);
    expect(required(course.scene).song).not.toBe(pulseSong);
    expect(playing).toBe(false);
    expect(store.getState().reading.independentRhythm.history).toHaveLength(0);
    now += 100;
    loadScene();
    await start();
    solvePhase();
    expect(course.status).toBe("completed");
    expect(course.result?.series.outcomes).toHaveLength(24);
    expect(course.result?.series.summary).toMatchObject({
      left: { hits: 12 },
      right: { hits: 12 }
    });
    expect(store.getState().reading.independentRhythm.history).toHaveLength(1);
    frame(now + 500);
    expect(store.getState().reading.independentRhythm.history).toHaveLength(1);
    expect(store.getState().reading.profile.observations).toHaveLength(0);
    expect(store.getState().reading.rhythm.history).toHaveLength(0);
    const oldSong = required(course.scene).song,
      seed = required(course.exercise).seed;
    act(() => {
      course.start();
    });
    expect(required(course.exercise).seed).toBe(seed);
    expect(required(course.scene).song).not.toBe(oldSong);
    expect(course.phase).toBe("pulse");
    expect(course.result).toBeNull();
  });
  it("keeps a failed pulse out of series history and repeats with a new presentation", async () => {
    select();
    await start();
    const oldScene = required(course.scene);
    frame(13251);
    expect(course.status).toBe("failed");
    expect(course.pulseSummary?.right.misses).toBe(8);
    expect(store.getState().reading.independentRhythm.history).toHaveLength(0);
    act(() => {
      course.onRepeat();
    });
    expect(course.status).toBe("preparation");
    expect(required(course.scene).song).not.toBe(oldScene.song);
    expect(course.ready).toBe(false);
  });
  it("does not install the observer or start before actual Staff presentation", async () => {
    select(false);
    expect(configureCourse).not.toHaveBeenCalled();
    await start();
    expect(audio.ensure).not.toHaveBeenCalled();
    expect(setPlaying).not.toHaveBeenCalledWith(true);
    act(() => {
      const shown = required(course.presentation);
      shown.onPresented(shown.id, now);
    });
    expect(configureCourse).toHaveBeenLastCalledWith("independentRhythm", course.policy);
    await start();
    expect(playing).toBe(true);
  });
  it("blocks held keys between phases and requires physical release before the next manual start", async () => {
    select();
    await start();
    solvePhase({ keepLastHeld: true });
    expect(course.phase).toBe("two-hands");
    expect(course.allReleased).toBe(false);
    now += 100;
    loadScene();
    await start();
    expect(playing).toBe(false);
    input("up", 60, now + 10);
    expect(course.allReleased).toBe(true);
    await start();
    expect(playing).toBe(true);
  });
  it("records actual preparation key help separately for each phase", async () => {
    select();
    act(() => {
      course.setShowKeyHints(true);
    });
    expect(required(policy).cuePitches()).toEqual([48, 60]);
    act(() => {
      policy?.onCuePresented?.([48, 60], now);
    });
    await start();
    expect(required(policy).cuePitches()).toEqual([]);
    solvePhase();
    now += 100;
    loadScene();
    act(() => {
      policy?.onCuePresented?.([48, 60], now);
    });
    await start();
    solvePhase();
    expect(course.result?.pulse.help).toHaveLength(1);
    expect(course.result?.series.help).toHaveLength(1);
  });
  it("cancels both the permit and active run on settings, hidden or interrupted sound", async () => {
    select();
    await start();
    solvePhase();
    expect(course.phase).toBe("two-hands");
    blocked = true;
    render();
    expect(course.phase).toBe("pulse");
    expect(course.status).toBe("cancelled");
    expect(course.pulseSummary).toBeNull();
    blocked = false;
    render();
    act(() => {
      course.onRepeat();
    });
    now += 100;
    loadScene();
    await start();
    act(() => {
      audio.interrupted?.();
    });
    expect(course.status).toBe("cancelled");
    expect(course.result).toBeNull();
    act(() => {
      course.onRepeat();
    });
    now += 100;
    loadScene();
    await start();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(course.status).toBe("cancelled");
  });
  it("rejects stale audio and Staff completions after exit or a same-seed restart", async () => {
    select();
    const old = required(course.presentation);
    let release: ((value: boolean) => void) | undefined;
    audio.ensure.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        })
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = course.onStart();
    });
    act(() => {
      course.exit();
    });
    await act(async () => {
      release?.(true);
      await pending;
    });
    expect(setPlaying).not.toHaveBeenCalledWith(true);
    expect(course.active).toBe(false);
    act(() => {
      course.start();
    });
    loadScene(false);
    act(() => {
      old.onPresented(old.id, now);
    });
    expect(course.ready).toBe(false);
  });
  it("resets the gate when MIDI origin or calibration changes and keeps the selected channel across phases", async () => {
    devices = [{ id: "m", name: "Piano" }];
    selectedDeviceId = "m";
    render();
    select();
    act(() => {
      course.setSource("midi");
    });
    loadScene();
    await start();
    solvePhase();
    expect(course.midiChannel).toBe(1);
    now += 100;
    loadScene();
    await start();
    solvePhase();
    expect(course.result?.pulse.channel).toBe(1);
    expect(course.result?.series.config.channel).toBe(1);
    act(() => {
      course.onRepeat();
    });
    now += 100;
    loadScene();
    await start();
    selectedDeviceId = "missing";
    render();
    expect(course.status).toBe("cancelled");
    expect(course.midiAvailable).toBe(false);
  });
  it("shows audio failure without saving a result and allows a fresh manual retry", async () => {
    select();
    audio.piano.mockReturnValue(false);
    await start();
    expect(course.error).toBe("audio");
    expect(course.phase).toBe("pulse");
    expect(course.ready).toBe(false);
    expect(store.getState().reading.independentRhythm.history).toHaveLength(0);
    audio.piano.mockReturnValue(true);
    act(() => {
      course.onRepeat();
    });
    now += 100;
    loadScene();
    await start();
    expect(playing).toBe(true);
  });
  it("finalizes once when a delivered input closes the terminal horizon before a frame", async () => {
    select();
    await start();
    solvePhase({ finish: false });
    frame(13250);
    expect(course.phase).toBe("pulse");
    expect(course.status).toBe("finalizing");
    input("down", 62, 13251);
    expect(course.phase).toBe("two-hands");
    expect(course.status).toBe("passed");
    expect(course.allReleased).toBe(false);
  });
  it("saves independent hand errors after a valid pulse and cancels a permit on calibration changes", async () => {
    select();
    await start();
    solvePhase();
    now += 100;
    loadScene();
    await start();
    solvePhase({ onlyRight: true });
    expect(course.result?.series.summary).toMatchObject({
      left: { hits: 0, misses: 12, signedDeviationMs: null },
      right: { hits: 12, misses: 0 },
      spreadMs: null
    });
    act(() => {
      course.onRepeat();
    });
    now += 100;
    loadScene();
    await start();
    solvePhase();
    expect(course.phase).toBe("two-hands");
    act(() => {
      store.dispatch(
        preferencesActions.timingChanged({
          ...store.getState().preferences.timing,
          manualOffsetMs: 100
        })
      );
    });
    expect(course.phase).toBe("pulse");
    expect(course.status).toBe("cancelled");
    expect(course.pulseSummary).toBeNull();
    expect(store.getState().reading.independentRhythm.history).toHaveLength(1);
  });
  it("does not reuse a stale observer or Staff error after a same-seed reset", () => {
    select();
    const old = required(course.policy),
      shown = required(course.presentation),
      oldSong = required(course.scene).song;
    act(() => {
      course.start();
    });
    loadScene();
    act(() => {
      old.cancel(now, true);
      shown.onError(shown.id);
    });
    expect(course.status).toBe("preparation");
    expect(course.ready).toBe(true);
    expect(course.error).toBeNull();
    expect(required(course.scene).song).not.toBe(oldSong);
  });
});
