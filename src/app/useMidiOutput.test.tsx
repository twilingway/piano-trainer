// @vitest-environment happy-dom
import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MidiOutputControls } from "../ui/settings/MidiSettings";
import { saveMidiOutput } from "./midiOutputPreferences";
import { useMidiOutput } from "./useMidiOutput";

let root: Root;
let latest: MidiOutputControls | undefined;
let grant: () => void;
const piano = {
  id: "a",
  name: "Digital Piano",
  state: "connected",
  send: vi.fn<(data: number[], timestamp?: number) => void>()
};

function Harness() {
  const value = useMidiOutput();
  useEffect(() => {
    latest = value;
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
      root.render(<Harness />);
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
        <StrictMode>
          <Harness />
        </StrictMode>
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
});
