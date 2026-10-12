// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pianoSoundReady,
  scheduleSoundObserved,
  onPianoSoundInterrupted,
  startPianoSound,
  startSoundOnFirstGesture,
  ensureMetronomeSound,
  metronomeSoundReady,
  soundAllOff
} from "./pianoSound";
import { stopRhythmTapSound } from "./rhythmTapSound";
vi.mock("./rhythmTapSound", () => ({ stopRhythmTapSound: vi.fn() }));

it("stops local rhythm voices when the trainer silences playback", () => {
  soundAllOff();
  expect(stopRhythmTapSound).toHaveBeenCalledOnce();
});

it("prepares a metronome without waiting for piano samples and detects silent output", async () => {
  audio.start.mockResolvedValueOnce(undefined);
  expect(await ensureMetronomeSound()).toBe(true);
  audio.mute = true;
  expect(metronomeSoundReady()).toBe(false);
  expect(await ensureMetronomeSound()).toBe(false);
  audio.mute = false;
  audio.state = "suspended";
  expect(metronomeSoundReady()).toBe(false);
  audio.state = "running";
  audio.start.mockRejectedValueOnce(new Error("blocked"));
  expect(await ensureMetronomeSound()).toBe(false);
});

const audio = vi.hoisted(() => ({
  state: "running",
  time: 10,
  mute: false,
  volume: 0,
  loaded: new Set([10]),
  missing: new Set<number>(),
  start: vi.fn<() => Promise<void>>(),
  load: vi.fn<() => Promise<void>>(),
  timeout: vi.fn(),
  changed: new Set<() => void>()
}));
vi.mock("tone", () => ({
  start: () => audio.start(),
  getContext: () => ({
    get state() {
      return audio.state;
    },
    immediate: () => audio.time,
    setTimeout: audio.timeout,
    on: (_event: string, callback: () => void) => {
      audio.changed.add(callback);
    },
    off: (_event: string, callback: () => void) => {
      audio.changed.delete(callback);
    }
  }),
  getDestination: () => ({ mute: audio.mute, volume: { value: audio.volume } }),
  Sampler: vi.fn(function () {
    return { toDestination: () => ({}) };
  })
}));
vi.mock("./pianoSamples", () => ({
  loadPianoSamples: () => audio.load(),
  loadedPianoLayers: () => audio.loaded,
  onPianoLayerLoaded: vi.fn(),
  pianoSample: (_layer: number, pitch: number) =>
    audio.missing.has(pitch) ? undefined : { loaded: true },
  nearestSamplePitch: (pitch: number) => Math.round((pitch - 21) / 3) * 3 + 21,
  SAMPLE_PITCHES: [60, 63, 66]
}));
vi.mock("./scheduledVoices", () => ({ cancelScheduledVoices: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  audio.state = "running";
  audio.mute = false;
  audio.volume = 0;
  audio.loaded = new Set([10]);
  audio.missing.clear();
  audio.start.mockResolvedValue();
  audio.load.mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe("actual piano readiness", () => {
  it("observes audio suspension and releases its own state listener", () => {
    const callback = vi.fn();
    const stop = onPianoSoundInterrupted(callback);
    for (const changed of audio.changed) changed();
    expect(callback).not.toHaveBeenCalled();
    audio.state = "suspended";
    for (const changed of audio.changed) changed();
    expect(callback).toHaveBeenCalledOnce();
    stop();
    expect(audio.changed.size).toBe(0);
  });
  it("checks both buffers, running context and nonzero application volume", () => {
    expect(pianoSoundReady([60, 67])).toBe(true);
    audio.missing.add(66);
    expect(pianoSoundReady([60, 67])).toBe(false);
    audio.missing.clear();
    audio.state = "suspended";
    expect(pianoSoundReady([60, 67])).toBe(false);
    audio.state = "running";
    audio.mute = true;
    expect(pianoSoundReady([60, 67])).toBe(false);
    audio.mute = false;
    audio.volume = -Infinity;
    expect(pianoSoundReady([60, 67])).toBe(false);
    audio.volume = -20;
    expect(pianoSoundReady([60, 67])).toBe(true);
    audio.loaded.clear();
    expect(pianoSoundReady([60, 67])).toBe(false);
  });

  it("rejects a start gesture which did not actually resume the context", async () => {
    audio.state = "suspended";
    await expect(startPianoSound()).rejects.toThrow("Audio context is suspended");
    expect(audio.load).not.toHaveBeenCalled();
  });

  it("uses immediate audio time for completion observations, excluding scheduling lookahead", () => {
    const callback = vi.fn();
    scheduleSoundObserved(12, callback);
    expect(audio.timeout).toHaveBeenCalledWith(callback, 2);
  });

  it("rearms first gesture on failure and retries rather than leaving an unhandled rejection", async () => {
    audio.load.mockRejectedValueOnce(new Error("network"));
    const stop = startSoundOnFirstGesture();
    window.dispatchEvent(new Event("pointerdown"));
    await vi.waitFor(() => {
      expect(audio.load).toHaveBeenCalledOnce();
    });
    window.dispatchEvent(new Event("pointerdown"));
    await vi.waitFor(() => {
      expect(audio.load).toHaveBeenCalledTimes(2);
    });
    stop();
  });

  it("does not rearm failed first gesture after its owner has unmounted", async () => {
    let fail!: (error: Error) => void;
    audio.load.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    const stop = startSoundOnFirstGesture();
    window.dispatchEvent(new Event("keydown"));
    await vi.waitFor(() => {
      expect(audio.load).toHaveBeenCalledOnce();
    });
    stop();
    fail(new Error("network"));
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new Event("keydown"));
    expect(audio.load).toHaveBeenCalledOnce();
  });
});
