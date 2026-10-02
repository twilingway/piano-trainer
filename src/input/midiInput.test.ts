// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listenToComputerKeyboard,
  listenToMidi,
  parseMidiMessage,
  type MidiEvent
} from "./midiInput";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("MIDI input metadata", () => {
  it("does not clear the newer subscription when the previous effect is disposed", async () => {
    const input = {
      id: "piano",
      name: "Piano",
      onmidimessage: null as ((event: MIDIMessageEvent) => void) | null
    };
    const access = {
      inputs: new Map([[input.id, input]]),
      onstatechange: null as (() => void) | null
    };
    vi.stubGlobal("navigator", { requestMIDIAccess: () => Promise.resolve(access) });
    const previous = vi.fn();
    const next = vi.fn();
    const stopPrevious = await listenToMidi(previous, vi.fn());
    const stopNext = await listenToMidi(next, vi.fn());
    const activeHandler = input.onmidimessage;
    const activeStateHandler = access.onstatechange;
    stopPrevious();
    expect(input.onmidimessage).toBe(activeHandler);
    expect(access.onstatechange).toBe(activeStateHandler);
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 90]),
      timeStamp: 1200
    } as MIDIMessageEvent);
    expect(previous).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    stopNext();
    expect(input.onmidimessage).toBeNull();
  });
  it("does not attach an obsolete async request after the current subscription is active", async () => {
    const input = {
      id: "piano",
      name: "Piano",
      onmidimessage: null as ((event: MIDIMessageEvent) => void) | null
    };
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
    let resolveOlder: (value: typeof access) => void = () => undefined;
    const older = new Promise<typeof access>((resolve) => {
      resolveOlder = resolve;
    });
    const request = vi.fn().mockReturnValueOnce(older).mockResolvedValue(access);
    vi.stubGlobal("navigator", { requestMIDIAccess: request });
    const oldDevices = vi.fn();
    const previousPromise = listenToMidi(vi.fn(), oldDevices);
    const next = vi.fn();
    const stopNext = await listenToMidi(next, vi.fn());
    const activeHandler = input.onmidimessage;
    resolveOlder(access);
    const stopPrevious = await previousPromise;
    stopPrevious();
    expect(input.onmidimessage).toBe(activeHandler);
    expect(oldDevices).not.toHaveBeenCalled();
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 60, 90]),
      timeStamp: 1200
    } as MIDIMessageEvent);
    expect(next).toHaveBeenCalledOnce();
    stopNext();
  });
  it("preserves source timestamp, device and velocity for attack/release/pedal", async () => {
    const input = {
      id: "usb-input",
      name: "Piano",
      onmidimessage: null as ((message: MIDIMessageEvent) => void) | null
    };
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
    vi.stubGlobal("navigator", { requestMIDIAccess: () => Promise.resolve(access) });
    const received: MidiEvent[] = [];
    const devices = vi.fn();
    const stop = await listenToMidi((event) => {
      received.push(event);
    }, devices);
    const send = (data: number[], timeStamp: number) => {
      input.onmidimessage?.({ data: new Uint8Array(data), timeStamp } as MIDIMessageEvent);
    };
    send([0x90, 60, 100], 1234.56);
    send([0x90, 60, 0], 1300);
    send([0xb0, 64, 127], 1350);
    send([0x90, 61, 90], NaN);
    expect(received).toEqual([
      {
        type: "down",
        pitch: 60,
        velocity: 100,
        timestamp: 1234.56,
        source: "midi",
        deviceId: "usb-input"
      },
      {
        type: "up",
        pitch: 60,
        velocity: 0,
        timestamp: 1300,
        source: "midi",
        deviceId: "usb-input"
      },
      { type: "pedal", down: true, timestamp: 1350, source: "midi", deviceId: "usb-input" }
    ]);
    expect(devices).toHaveBeenCalledWith([{ id: "usb-input", name: "Piano" }]);
    stop();
    expect(input.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();
  });
  it("treats Note On zero as release and rejects malformed data", () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))?.type).toBe("up");
    expect(parseMidiMessage(new Uint8Array([0x90, 60]))).toBeUndefined();
    expect(parseMidiMessage(new Uint8Array([0x90, 128, 90]))).toBeUndefined();
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 128]))).toBeUndefined();
    expect(parseMidiMessage(new Uint8Array([0xb0, 1, 50]))).toBeUndefined();
  });
  it("preserves keyboard event timestamps and ignores autorepeat", () => {
    const received = vi.fn();
    const stop = listenToComputerKeyboard(received);
    const event = new KeyboardEvent("keydown", { code: "KeyQ", bubbles: true });
    window.dispatchEvent(event);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", repeat: true }));
    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith({
      type: "down",
      pitch: 60,
      velocity: 90,
      timestamp: event.timeStamp,
      source: "keyboard",
      deviceId: "keyboard"
    });
    stop();
  });
});
