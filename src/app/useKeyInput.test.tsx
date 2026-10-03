// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import { presetBindings } from "../input/keyboardLayouts";
import type { Trainer } from "../practice/Trainer";
import { useKeyInput } from "./useKeyInput";

vi.mock("../audio/pianoSound", () => ({
  soundNoteOn: vi.fn(),
  soundNoteOff: vi.fn(),
  startSoundOnFirstGesture: () => vi.fn()
}));
vi.mock("../input/midiInput", () => ({
  midiSupported: () => false,
  listenToMidi: vi.fn()
}));

const trainer = { key: vi.fn(), pedal: vi.fn() };
const trainerRef = { current: trainer as unknown as Trainer };
const bindings = presetBindings("extended_range");
let root: Root;
let host: HTMLDivElement;

function Harness({ options }: { options: KeyboardInputOptions }) {
  useKeyInput(trainerRef, options);
  return null;
}
async function mount(options: KeyboardInputOptions = { bindings }) {
  await act(async () => {
    root.render(<Harness options={options} />);
    await Promise.resolve();
  });
}
async function key(code: string, type = "keydown") {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("computer keyboard sound and trainer sustain", () => {
  it("sends physical release to the trainer while deferring sound release until pedal up", async () => {
    await mount();
    await key("Space");
    await key("KeyG");
    await key("KeyG", "keyup");
    expect(soundNoteOn).toHaveBeenCalledExactlyOnceWith(60);
    expect(soundNoteOff).not.toHaveBeenCalled();
    expect(trainer.key).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "up", pitch: 60 })
    );
    expect(trainer.pedal).toHaveBeenCalledWith(true, expect.any(Number), "keyboard");
    await key("Space", "keyup");
    expect(soundNoteOff).toHaveBeenCalledExactlyOnceWith(60);
    expect(trainer.pedal).toHaveBeenLastCalledWith(false, expect.any(Number), "keyboard");
  });

  it("does not stop a reattacked physically held note when the pedal is released", async () => {
    await mount();
    await key("Space");
    await key("KeyG");
    await key("KeyG", "keyup");
    await key("KeyG");
    await key("Space", "keyup");
    expect(soundNoteOn).toHaveBeenCalledTimes(2);
    expect(soundNoteOff).not.toHaveBeenCalled();
    await key("KeyG", "keyup");
    expect(soundNoteOff).toHaveBeenCalledExactlyOnceWith(60);
  });

  it.each(["blur", "options"])(
    "clears both deferred and physically held voices on %s",
    async (trigger) => {
      await mount();
      await key("Space");
      await key("KeyG");
      await key("KeyG", "keyup");
      await key("KeyH");
      if (trigger === "options") await mount({ bindings, blocked: true });
      else
        await act(async () => {
          window.dispatchEvent(new Event("blur"));
          await Promise.resolve();
        });
      expect(
        vi
          .mocked(soundNoteOff)
          .mock.calls.map(([pitch]) => pitch)
          .sort((a, b) => a - b)
      ).toEqual([60, 62]);
      expect(trainer.pedal).toHaveBeenLastCalledWith(false, expect.any(Number), "keyboard");
      expect(trainer.key).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "up", pitch: 62 })
      );
    }
  );
});
