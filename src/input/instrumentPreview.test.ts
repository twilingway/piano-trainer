import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInstrumentPreview } from "./instrumentPreview";
import type { PianoInstrument } from "./instrumentProfiles";

const flute: PianoInstrument = { id: "flute", name: "Pan Flute", program: 75 };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("instrument preview", () => {
  it("sends banks before the program and plays only its chosen channel", () => {
    const send = vi.fn<(message: number[]) => void>();
    const playing = vi.fn();
    const preview = createInstrumentPreview(send, playing, () => Date.now());
    preview.play({ ...flute, bankMSB: 2, bankLSB: 3 }, 4);
    expect(send.mock.calls.slice(0, 4)).toEqual([
      [[0xb3, 0, 2]],
      [[0xb3, 32, 3]],
      [[0xc3, 75]],
      [[0x93, 60, 60]]
    ]);
    vi.runAllTimers();
    expect(
      send.mock.calls.filter(([message]) => ((message[0] ?? -1) & 0xf0) === 0x90)
    ).toHaveLength(7);
    expect(
      send.mock.calls.filter(([message]) => ((message[0] ?? -1) & 0xf0) === 0x80)
    ).toHaveLength(7);
    expect(playing.mock.calls).toEqual([[true], [false]]);
  });

  it("cancels future notes and releases only the note it owns", () => {
    const send = vi.fn<(message: number[]) => void>();
    const preview = createInstrumentPreview(send, vi.fn(), () => Date.now());
    preview.play(flute, 1);
    vi.advanceTimersByTime(100);
    preview.stop();
    expect(send).toHaveBeenLastCalledWith([0x80, 60, 0]);
    const sent = send.mock.calls.length;
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(sent);
    expect(send.mock.calls.some(([message]) => message[1] === 123)).toBe(false);
    preview.stop();
    expect(send).toHaveBeenCalledTimes(sent);
  });

  it("recognizes its MIDI Thru after cancellation and discards expired echo history", () => {
    const send = vi.fn<(message: number[]) => void>();
    const preview = createInstrumentPreview(send, vi.fn(), () => Date.now());
    preview.play(flute, 2);
    preview.stop();
    const echo = {
      type: "up" as const,
      pitch: 60,
      velocity: 0,
      source: "midi" as const,
      channel: 2,
      timestamp: Date.now()
    };
    expect(preview.isEcho(echo)).toBe(true);
    expect(preview.isEcho({ ...echo, channel: 1 })).toBe(false);
    vi.advanceTimersByTime(101);
    expect(preview.isEcho({ ...echo, timestamp: Date.now() })).toBe(false);
  });

  it("keeps an unmapped panel number silent", () => {
    const send = vi.fn<(message: number[]) => void>();
    const playing = vi.fn();
    createInstrumentPreview(send, playing).play({ ...flute, program: null, panelNumber: 176 }, 1);
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    expect(playing).not.toHaveBeenCalled();
  });
});
