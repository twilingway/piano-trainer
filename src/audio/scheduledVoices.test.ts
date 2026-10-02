import { beforeEach, describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => ({
  sources: [] as {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    onended: () => void;
  }[],
  synths: [] as {
    dispose: ReturnType<typeof vi.fn>;
    triggerAttackRelease: ReturnType<typeof vi.fn>;
    volume: { value: number };
  }[],
  cleanup: new Map<number, () => void>(),
  next: 0,
  clearTimeout: vi.fn(),
  configurations: [] as { playbackRate: number; fadeOut: number; url: string }[]
}));

vi.mock("tone", () => ({
  Frequency: (name: string) => ({ toMidi: () => (name === "C4" ? 60 : 72) }),
  ToneAudioBuffers: vi.fn(function () {
    return { loaded: true, get: (pitch: string) => `buffer:${pitch}` };
  }),
  ToneBufferSource: vi.fn(function (options: {
    playbackRate: number;
    fadeOut: number;
    url: string;
  }) {
    tone.configurations.push(options);
    const source = {
      start: vi.fn(),
      stop: vi.fn(),
      dispose: vi.fn(),
      onended: () => undefined,
      toDestination() {
        return this;
      }
    };
    tone.sources.push(source);
    return source;
  }),
  Synth: vi.fn(function () {
    const synth = {
      dispose: vi.fn(),
      triggerAttackRelease: vi.fn(),
      volume: { value: 0 },
      toDestination() {
        return this;
      }
    };
    tone.synths.push(synth);
    return synth;
  }),
  now: () => 10,
  getContext: () => ({
    setTimeout: (action: () => void) => {
      const id = ++tone.next;
      tone.cleanup.set(id, action);
      return id;
    },
    clearTimeout: (id: number) => {
      tone.clearTimeout(id);
      tone.cleanup.delete(id);
    }
  })
}));

import {
  cancelScheduledVoices,
  loadScheduledSamples,
  scheduledClick,
  scheduledNoteOff,
  scheduledNoteOn
} from "./scheduledVoices";

beforeEach(() => {
  cancelScheduledVoices();
  vi.clearAllMocks();
  tone.sources.length = 0;
  tone.synths.length = 0;
  tone.configurations.length = 0;
  tone.cleanup.clear();
  loadScheduledSamples({ C4: "C4.mp3", C5: "C5.mp3" });
});

describe("owned scheduled voices", () => {
  it("releases only the matching note when automatic voices share a pitch", () => {
    scheduledNoteOn(60, 90, 11, "first");
    scheduledNoteOn(60, 90, 11.5, "second");
    scheduledNoteOff(60, 12, "first");
    expect(tone.sources[0]?.stop).toHaveBeenCalledWith(12);
    expect(tone.sources[1]?.stop).not.toHaveBeenCalled();
  });
  it("bakes sample transposition and schedules velocity and release at exact audio time", () => {
    scheduledNoteOn(62, 64, 15);
    expect(tone.configurations[0]).toEqual({
      url: "buffer:60",
      playbackRate: 2 ** (2 / 12),
      fadeOut: 0.08
    });
    expect(tone.sources[0]?.start).toHaveBeenCalledWith(15, 0, undefined, 64 / 127);
    scheduledNoteOff(62, 15.5);
    expect(tone.sources[0]?.stop).toHaveBeenCalledWith(15.5);
  });

  it("disposes already created future notes and clicks, and cancels their cleanup jobs", () => {
    scheduledNoteOn(60, undefined, 20);
    scheduledNoteOn(60, 90, 21);
    scheduledClick(true, 20);
    const cleanupIds = [...tone.cleanup.keys()];
    expect(tone.synths[0]?.triggerAttackRelease).toHaveBeenCalledWith("C7", 0.03, 20);
    cancelScheduledVoices();
    for (const source of tone.sources) expect(source.dispose).toHaveBeenCalledTimes(1);
    expect(tone.synths[0]?.dispose).toHaveBeenCalledTimes(1);
    for (const id of cleanupIds) expect(tone.clearTimeout).toHaveBeenCalledWith(id);
    expect(tone.cleanup.size).toBe(0);
    // An onended callback after cancellation cannot dispose a node a second time.
    for (const source of tone.sources) source.onended();
    cancelScheduledVoices();
    for (const source of tone.sources) expect(source.dispose).toHaveBeenCalledTimes(1);
  });

  it("retains sounding voices until end and disposes completed clicks only once", () => {
    scheduledNoteOn(60, undefined, 11);
    tone.sources[0]?.onended();
    scheduledNoteOff(60, 12);
    expect(tone.sources[0]?.stop).not.toHaveBeenCalled();
    scheduledClick(false, 11);
    expect(tone.synths[0]?.volume.value).toBe(-14);
    for (const action of [...tone.cleanup.values()]) action();
    cancelScheduledVoices();
    expect(tone.sources[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(tone.synths[0]?.dispose).toHaveBeenCalledTimes(1);
  });
});
