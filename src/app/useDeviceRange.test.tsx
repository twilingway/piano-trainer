// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceRange } from "./useDeviceRange";

let host: HTMLDivElement;
let root: Root;
let device: ReturnType<typeof useDeviceRange>;

function Harness() {
  const value = useDeviceRange();
  useEffect(() => {
    device = value;
  });
  return null;
}
const down = (pitch: number) => ({ type: "down" as const, pitch, velocity: 80 });
const up = (pitch: number) => ({ type: "up" as const, pitch, velocity: 0 });
async function run(action: () => unknown): Promise<unknown> {
  let result: unknown;
  await act(async () => {
    await Promise.resolve();
    result = action();
  });
  return result;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  root = createRoot(host);
  await run(() => {
    root.render(<Harness />);
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe("useDeviceRange", () => {
  it("limits nothing on the whole piano", () => {
    expect(device.range).toEqual({ preset: "88" });
    expect(device.playable).toBeUndefined();
  });

  it("captures two keys and keeps them, and the run never hears them", async () => {
    await run(device.startCapture);
    expect(await run(() => device.intercept(down(84)))).toBe(true);
    expect(device.capture).toEqual({ step: "second", first: 84 });
    expect(await run(() => device.intercept(up(84)))).toBe(true);
    expect(await run(() => device.intercept(down(48)))).toBe(true);
    expect(device.capture).toBeNull();
    expect(device.playable).toEqual({ low: 48, high: 84 });
    // The second key is let go after the capture ended: still the capture's.
    expect(await run(() => device.intercept(up(48)))).toBe(true);
    expect(await run(() => device.intercept(down(60)))).toBe(false);
    expect(JSON.parse(localStorage.getItem("device-range-v1") ?? "null")).toEqual({
      preset: "custom",
      low: 48,
      high: 84
    });
  });

  it("leaves the range alone when the capture is cancelled", async () => {
    await run(() => {
      device.setRange({ preset: "61" });
    });
    await run(device.startCapture);
    await run(() => device.intercept(down(50)));
    await run(device.cancelCapture);
    expect(device.capture).toBeNull();
    expect(device.range).toEqual({ preset: "61" });
    expect(await run(() => device.intercept(down(60)))).toBe(false);
  });

  it("keeps the same limits object while the keys stay the same", async () => {
    await run(() => {
      device.setRange({ preset: "49" });
    });
    const first = device.playable;
    await run(() => {
      device.setRange({ preset: "custom", low: 36, high: 84 });
    });
    expect(device.playable).toBe(first);
  });
});
