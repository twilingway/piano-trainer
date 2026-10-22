import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMelodyMidiOutput } from "./melodyMidiOutput";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("automatic MIDI notes", () => {
  it("waits for session timestamps and preserves pitch, channel and velocity", () => {
    const send = vi.fn<(message: number[]) => void>();
    const output = createMelodyMidiOutput(send, 2, () => Date.now());
    const now = Date.now();
    output.noteOn(48, 91, now + 200, "a");
    output.noteOff(48, now + 400, "a");
    vi.advanceTimersByTime(199);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenLastCalledWith([0x91, 48, 91]);
    vi.advanceTimersByTime(200);
    expect(send).toHaveBeenLastCalledWith([0x81, 48, 0]);
  });

  it("cancels future attacks and releases only its active notes on reset", () => {
    const send = vi.fn<(message: number[]) => void>();
    const output = createMelodyMidiOutput(send, 1, () => Date.now());
    const now = Date.now();
    output.noteOn(48, 90, now, "held");
    output.noteOn(60, 90, now + 200, "future");
    output.noteOff(48, now + 400, "held");
    output.reset();
    expect(send.mock.calls.map(([message]) => message)).toEqual([
      [0x90, 48, 90],
      [0x80, 48, 0]
    ]);
    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps a pitch held until the last overlapping note ends", () => {
    const send = vi.fn<(message: number[]) => void>();
    const output = createMelodyMidiOutput(send, 1, () => Date.now());
    const now = Date.now();
    output.noteOn(48, 90, now, "a");
    output.noteOn(48, 80, now, "b");
    output.noteOff(48, now, "a");
    expect(send).toHaveBeenCalledTimes(1);
    output.noteOff(48, now, "b");
    expect(send).toHaveBeenLastCalledWith([0x80, 48, 0]);
  });

  it("recognizes matching MIDI echo without blocking other player notes", () => {
    const output = createMelodyMidiOutput(vi.fn(), 1, () => Date.now());
    output.noteOn(48, 90, Date.now(), "a");
    const echo = {
      type: "down" as const,
      pitch: 48,
      velocity: 90,
      channel: 1,
      source: "midi" as const
    };
    expect(output.isEcho(echo)).toBe(true);
    expect(output.isEcho({ ...echo, pitch: 60 })).toBe(false);
    expect(output.isEcho({ ...echo, velocity: 91 })).toBe(false);
    expect(output.isEcho({ ...echo, channel: 3 })).toBe(false);
    expect(output.isEcho({ ...echo, source: "keyboard" })).toBe(false);
    vi.advanceTimersByTime(101);
    expect(output.isEcho(echo)).toBe(false);
  });
});
