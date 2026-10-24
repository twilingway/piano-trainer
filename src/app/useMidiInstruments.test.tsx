// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMidiInstruments } from "./useMidiInstruments";
import type { MidiOutputControl } from "../input/midiOutput";

type Options = Parameters<typeof useMidiInstruments>[0];
let value: ReturnType<typeof useMidiInstruments>;
const send = vi.fn<(message: number[], expectedPortId?: string) => void>();
const control: MidiOutputControl = { select: vi.fn(), test: vi.fn(), send, dispose: vi.fn() };
const root = createRoot(document.createElement("div"));
const base: Options = {
  controlRef: { current: control },
  portId: "piano",
  ready: true,
  connectionRevision: 1,
  instrument: { id: "flute", name: "Pan Flute", program: 75 },
  selectionKey: "grace:flute",
  channel: 1,
  midiEnabled: true,
  conflict: false,
  songPlaying: false
};
function Harness({ options }: { options: Options }) {
  const current = useMidiInstruments(options);
  useEffect(() => {
    value = current;
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  send.mockClear();
});
afterEach(() => {
  act(() => {
    root.render(null);
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function render(options: Options) {
  act(() => {
    root.render(<Harness options={options} />);
  });
}

it("waits for output control readiness and reapplies on reconnect or channel change", () => {
  render({ ...base, ready: false });
  expect(send).not.toHaveBeenCalled();
  render(base);
  expect(send).toHaveBeenLastCalledWith([0xc0, 75], "piano");
  render({ ...base, connectionRevision: 3 });
  expect(send).toHaveBeenCalledTimes(2);
  render({ ...base, connectionRevision: 3, channel: 3 });
  expect(send).toHaveBeenLastCalledWith([0xc2, 75], "piano");
});

it("keeps browser-only selection silent but permits explicit MIDI preview", () => {
  render({ ...base, midiEnabled: false });
  expect(send).not.toHaveBeenCalled();
  act(() => {
    value.controls.onPlay();
  });
  expect(send).toHaveBeenCalledWith([0xc0, 75], "piano");
  expect(send).toHaveBeenCalledWith([0x90, 60, 60], "piano");
  expect(value.controls.playing).toBe(true);
  act(() => value.controls.onStop());
  expect(value.controls.playing).toBe(false);
});

it("does not resend a program or interrupt preview when only a profile or sound label changes", () => {
  render(base);
  act(() => {
    value.controls.onPlay();
  });
  const count = send.mock.calls.length;
  render({ ...base, instrument: { id: "flute", program: 75, name: "Renamed flute" } });
  expect(send).toHaveBeenCalledTimes(count);
  expect(value.controls.playing).toBe(true);
});

it.each(["conflict", "songPlaying"] as const)(
  "blocks preview for %s and cancels active notes",
  (field) => {
    render(base);
    act(() => {
      value.controls.onPlay();
    });
    render({ ...base, [field]: true });
    expect(value.controls.available).toBe(false);
    expect(value.controls.playing).toBe(false);
    expect(send).toHaveBeenLastCalledWith([0x80, 60, 0], "piano");
    const count = send.mock.calls.length;
    act(() => {
      value.controls.onPlay();
      vi.runAllTimers();
    });
    expect(send).toHaveBeenCalledTimes(count);
  }
);

it("cancels preview on output change, closes cleanly and never emits on the next output", () => {
  render(base);
  act(() => {
    value.controls.onPlay();
  });
  render({ ...base, portId: "other" });
  const count = send.mock.calls.length;
  act(() => {
    vi.runAllTimers();
  });
  expect(send).toHaveBeenCalledTimes(count);
  expect(value.controls.playing).toBe(false);
  expect(send.mock.calls.filter(([message]) => ((message[0] ?? -1) & 0xf0) === 0x90)).toEqual([
    [[0x90, 60, 60], "piano"]
  ]);
});

it("does not send a program while the light channel conflicts, and clears preview on unmount", () => {
  render({ ...base, conflict: true });
  expect(send).not.toHaveBeenCalled();
  render(base);
  act(() => {
    value.controls.onPlay();
  });
  act(() => {
    root.render(null);
  });
  expect(send).toHaveBeenLastCalledWith([0x80, 60, 0], "piano");
  const count = send.mock.calls.length;
  act(() => {
    vi.runAllTimers();
  });
  expect(send).toHaveBeenCalledTimes(count);
});
