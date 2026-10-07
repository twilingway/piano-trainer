// @vitest-environment happy-dom
import { withTestStore } from "./storeTestSupport";
import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import type { MidiOutputControls } from "../ui/settings/MidiSettings";
import { saveKeyLights } from "./keyLightPreferences";
import { saveMidiOutput } from "./midiOutputPreferences";
import { useMidiOutput } from "./useMidiOutput";

let root: Root;
let latest: MidiOutputControls | undefined;
let isEcho: ((event: KeyEvent) => boolean) | undefined;
const trainer: Pick<Trainer, "onLights"> = { onLights: undefined };
const trainerRef = { current: trainer as Trainer };
let grant: () => void;
const piano = {
  id: "a",
  name: "Digital Piano",
  state: "connected",
  send: vi.fn<(data: number[], timestamp?: number) => void>()
};

function Harness() {
  const value = useMidiOutput(trainerRef, true);
  useEffect(() => {
    latest = value.controls;
    isEcho = value.isEcho;
  });
  return null;
}
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  piano.send.mockClear();
  trainer.onLights = undefined;
  localStorage.clear();
  saveMidiOutput({ id: "a", name: "Digital Piano" });
  const access = Object.assign(new EventTarget(), { outputs: new Map([["a", piano]]) });
  // Access arrives only when the test grants it, as after the browser's prompt.
  const pending: (() => void)[] = [];
  grant = () => {
    for (const resolve of pending.splice(0)) resolve();
  };
  const requestMIDIAccess = vi.fn(
    () =>
      new Promise((resolve) => {
        pending.push(() => {
          resolve(access);
        });
      })
  );
  vi.stubGlobal("navigator", { requestMIDIAccess });
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe("useMidiOutput", () => {
  it("keeps a choice made while the browser asks for access", async () => {
    await act(async () => {
      root.render(withTestStore(<Harness />));
      await Promise.resolve();
    });
    expect(latest?.selectedId).toBe("a");
    act(() => {
      latest?.onSelect("");
    });
    grant();
    await settle();
    expect(latest?.connected).toBe(false);
    expect(latest?.selectedId).toBe("");
    // At most the panic for leaving the stored port; never the test note.
    piano.send.mockClear();
    latest?.onTest();
    expect(piano.send).not.toHaveBeenCalled();
  });

  it("stays silent on the StrictMode remount and panics once on unmount", async () => {
    await act(async () => {
      root.render(
        withTestStore(
          <StrictMode>
            <Harness />
          </StrictMode>
        )
      );
      await Promise.resolve();
    });
    grant();
    await settle();
    expect(latest?.connected).toBe(true);
    expect(piano.send).not.toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
    expect(piano.send).toHaveBeenCalledTimes(16);
    root = createRoot(document.createElement("div"));
  });

  it("lights the trainer's keys on the output and knows their echo", async () => {
    saveKeyLights({ enabled: true, channel: 3, velocity: 64 });
    await act(async () => {
      root.render(withTestStore(<Harness />));
      await Promise.resolve();
    });
    grant();
    await settle();
    trainer.onLights?.([60]);
    expect(piano.send).toHaveBeenLastCalledWith([0x92, 60, 64], undefined);
    expect(isEcho?.({ type: "down", pitch: 60, velocity: 100, channel: 3 })).toBe(true);
    expect(isEcho?.({ type: "down", pitch: 60, velocity: 100, channel: 1 })).toBe(false);
    act(() => {
      latest?.onLights({ enabled: false, channel: 3, velocity: 64 });
    });
    expect(piano.send).toHaveBeenLastCalledWith([0x82, 60, 0], undefined);
    expect(trainer.onLights).toBeUndefined();
    expect(isEcho?.({ type: "down", pitch: 60, velocity: 100, channel: 3 })).toBe(false);
  });

  it("does not ask the trainer for keys while the lights are off", async () => {
    await act(async () => {
      root.render(withTestStore(<Harness />));
      await Promise.resolve();
    });
    expect(trainer.onLights).toBeUndefined();
  });
});
