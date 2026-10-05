// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { findOutput, openMidiOutput, panicMessages } from "./midiOutput";
import type { OutputState } from "./midiOutput";

interface FakeOutput {
  readonly id: string;
  readonly name: string;
  state: "connected" | "disconnected";
  readonly send: Mock<(data: number[], timestamp?: number) => void>;
}

function fakeOutput(id: string, name = id): FakeOutput {
  return { id, name, state: "connected", send: vi.fn() };
}

function fakeAccess(...outputs: FakeOutput[]) {
  const access = Object.assign(new EventTarget(), {
    outputs: new Map(outputs.map((output) => [output.id, output]))
  });
  vi.stubGlobal("navigator", { requestMIDIAccess: () => Promise.resolve(access) });
  return {
    access,
    change: () => {
      access.dispatchEvent(new Event("statechange"));
    }
  };
}

const PANIC = panicMessages().map((message) => [message, undefined]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("findOutput", () => {
  const devices = [
    { id: "a", name: "Piano" },
    { id: "b", name: "loopMIDI Port" }
  ];
  it("prefers the id, then the name", () => {
    expect(findOutput(devices, { id: "b", name: "Piano" })?.id).toBe("b");
    expect(findOutput(devices, { id: "gone", name: "Piano" })?.id).toBe("a");
    expect(findOutput(devices, { id: "gone", name: "Gone" })).toBeUndefined();
    expect(findOutput(devices, null)).toBeUndefined();
  });
});

describe("panicMessages", () => {
  it("sends All Notes Off on all 16 channels", () => {
    const messages = panicMessages();
    expect(messages).toHaveLength(16);
    expect(messages[0]).toEqual([0xb0, 123, 0]);
    expect(messages[15]).toEqual([0xbf, 123, 0]);
  });
});

describe("openMidiOutput", () => {
  it("finds a renumbered port by its name", async () => {
    fakeAccess(fakeOutput("b", "Digital Piano"));
    const onState = vi.fn<(state: OutputState) => void>();
    await openMidiOutput({ id: "a", name: "Digital Piano" }, onState);
    expect(onState).toHaveBeenLastCalledWith({
      devices: [{ id: "b", name: "Digital Piano" }],
      current: { id: "b", name: "Digital Piano" }
    });
  });

  it("panics the previous output when the player switches", async () => {
    const a = fakeOutput("a");
    const b = fakeOutput("b");
    fakeAccess(a, b);
    const output = await openMidiOutput({ id: "a", name: "a" }, vi.fn());
    output.select({ id: "b", name: "b" });
    expect(a.send.mock.calls).toEqual(PANIC);
    expect(b.send).not.toHaveBeenCalled();
    output.select(null);
    expect(b.send.mock.calls).toEqual(PANIC);
  });

  it("keeps the choice through a disconnect and reconnects by itself", async () => {
    const piano = fakeOutput("a", "Digital Piano");
    const { change } = fakeAccess(piano);
    const onState = vi.fn<(state: OutputState) => void>();
    const output = await openMidiOutput({ id: "a", name: "Digital Piano" }, onState);
    piano.state = "disconnected";
    piano.send.mockImplementation(() => {
      throw new DOMException("closed", "InvalidStateError");
    });
    change();
    expect(onState).toHaveBeenLastCalledWith({ devices: [] });
    expect(piano.send).not.toHaveBeenCalled();
    output.test();
    expect(piano.send).not.toHaveBeenCalled();
    piano.state = "connected";
    piano.send.mockReset();
    change();
    expect(onState.mock.lastCall?.[0].current?.id).toBe("a");
    output.test();
    expect(piano.send).toHaveBeenCalledTimes(2);
  });

  it("does not throw when the port refuses the panic", async () => {
    const a = fakeOutput("a");
    a.send.mockImplementation(() => {
      throw new DOMException("closed", "InvalidStateError");
    });
    fakeAccess(a, fakeOutput("b"));
    const output = await openMidiOutput({ id: "a", name: "a" }, vi.fn());
    expect(() => {
      output.select({ id: "b", name: "b" });
    }).not.toThrow();
  });

  it("panics when the page is hidden and when disposed", async () => {
    const piano = fakeOutput("a");
    const { change } = fakeAccess(piano);
    const onState = vi.fn();
    const output = await openMidiOutput({ id: "a", name: "a" }, onState);
    window.dispatchEvent(new Event("pagehide"));
    expect(piano.send.mock.calls).toEqual(PANIC);
    piano.send.mockClear();
    output.dispose();
    expect(piano.send.mock.calls).toEqual(PANIC);
    piano.send.mockClear();
    onState.mockClear();
    change();
    window.dispatchEvent(new Event("pagehide"));
    output.test();
    expect(onState).not.toHaveBeenCalled();
    expect(piano.send).not.toHaveBeenCalled();
  });

  it("lights C4 for a second on channel 1", async () => {
    vi.spyOn(performance, "now").mockReturnValue(500);
    const piano = fakeOutput("a");
    fakeAccess(piano);
    const output = await openMidiOutput({ id: "a", name: "a" }, vi.fn());
    output.test();
    expect(piano.send.mock.calls).toEqual([
      [[0x90, 60, 64], undefined],
      [[0x80, 60, 0], 1500]
    ]);
  });

  it("sends nothing without a chosen output", async () => {
    const piano = fakeOutput("a");
    fakeAccess(piano);
    const output = await openMidiOutput(null, vi.fn());
    output.test();
    output.send([0x92, 60, 64]);
    output.dispose();
    expect(piano.send).not.toHaveBeenCalled();
  });

  it("sends a message to the current output, and nothing once disposed", async () => {
    const piano = fakeOutput("a");
    fakeAccess(piano);
    const output = await openMidiOutput({ id: "a", name: "a" }, vi.fn());
    output.send([0x92, 60, 64]);
    expect(piano.send.mock.calls).toEqual([[[0x92, 60, 64], undefined]]);
    output.dispose();
    piano.send.mockClear();
    output.send([0x82, 60, 0]);
    expect(piano.send).not.toHaveBeenCalled();
  });
});
