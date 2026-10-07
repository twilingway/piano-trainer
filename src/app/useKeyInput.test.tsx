import { Provider } from "react-redux";
import { createAppStore, type AppStore } from "./store";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import { presetBindings } from "../input/keyboardLayouts";
import { listenToMidi, midiSupported, type MidiEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import { saveKeyLights } from "./keyLightPreferences";
import { useKeyInput } from "./useKeyInput";

vi.mock("../audio/pianoSound", () => ({
  soundNoteOn: vi.fn(),
  soundNoteOff: vi.fn(),
  startSoundOnFirstGesture: () => vi.fn()
}));
vi.mock("../input/midiInput", () => ({
  midiSupported: vi.fn(() => false),
  listenToMidi: vi.fn()
}));

const trainer = { key: vi.fn(), pedal: vi.fn(), activateOverdrive: vi.fn() };
const trainerRef = { current: trainer as unknown as Trainer };
const bindings = presetBindings("extended_range");
let root: Root;
let store: AppStore | undefined;
let host: HTMLDivElement;

function Harness({ options }: { options: KeyboardInputOptions }) {
  useKeyInput(trainerRef, options);
  return null;
}
async function mount(options: KeyboardInputOptions = { bindings }) {
  await act(async () => {
    store ??= createAppStore();
    root.render(
      <Provider store={store}>
        <Harness options={options} />
      </Provider>
    );
    await Promise.resolve();
  });
}
async function key(code: string, type = "keydown", init: KeyboardEventInit = {}) {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init })
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(midiSupported).mockReturnValue(false);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  store = undefined;
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

describe("Overdrive from the keys", () => {
  it("switches Overdrive on with 0 in both games, without a note or a repeat", async () => {
    for (const options of [{ bindings }, { bindings, wordPitch: () => 60 }]) {
      vi.clearAllMocks();
      await mount(options);
      await key("Digit0");
      await key("Digit0", "keydown", { repeat: true });
      await key("Digit0", "keyup");
      expect(trainer.activateOverdrive).toHaveBeenCalledOnce();
      expect(trainer.key).not.toHaveBeenCalled();
    }
  });

  it("lets a piano note the player put on 0 win", async () => {
    await mount({ bindings: { ...bindings, Digit0: { type: "note", pitch: 61 } } });
    await key("Digit0");
    expect(trainer.activateOverdrive).not.toHaveBeenCalled();
    expect(soundNoteOn).toHaveBeenCalledExactlyOnceWith(61);
  });

  it("switches Overdrive on when the keyboard pedal goes down, and the pedal still sustains", async () => {
    await mount();
    await key("Space");
    await key("Space", "keyup");
    await key("Space");
    expect(trainer.activateOverdrive).toHaveBeenCalledTimes(2);
    expect(trainer.pedal).toHaveBeenLastCalledWith(true, expect.any(Number), "keyboard");
  });

  it("switches Overdrive on once a MIDI pedal press, however many times it reports down", async () => {
    let onMidi: ((event: MidiEvent, deviceId: string) => void) | undefined;
    vi.mocked(midiSupported).mockReturnValue(true);
    vi.mocked(listenToMidi).mockImplementation((listener) => {
      onMidi = listener;
      return Promise.resolve(() => undefined);
    });
    await mount();
    const pedal = (down: boolean, deviceId = "piano") => {
      onMidi?.({ type: "pedal", down, timestamp: 0, source: "midi", deviceId }, deviceId);
    };
    pedal(true);
    pedal(true);
    pedal(true);
    expect(trainer.activateOverdrive).toHaveBeenCalledOnce();
    pedal(false);
    pedal(true);
    pedal(true, "other");
    expect(trainer.activateOverdrive).toHaveBeenCalledTimes(3);
    expect(trainer.pedal).toHaveBeenCalledTimes(6);
  });

  it("keeps the key lights' echo on their channel from the trainer", async () => {
    let onMidi: ((event: MidiEvent, deviceId: string) => void) | undefined;
    vi.mocked(midiSupported).mockReturnValue(true);
    vi.mocked(listenToMidi).mockImplementation((listener) => {
      onMidi = listener;
      return Promise.resolve(() => undefined);
    });
    saveKeyLights({ enabled: true, channel: 3, velocity: 64 });
    try {
      await mount();
      const press = (channel: number) => {
        onMidi?.(
          { type: "down", pitch: 60, velocity: 64, channel, source: "midi", deviceId: "piano" },
          "piano"
        );
      };
      press(3);
      expect(trainer.key).not.toHaveBeenCalled();
      press(1);
      expect(trainer.key).toHaveBeenCalledOnce();
    } finally {
      localStorage.clear();
    }
  });
});
