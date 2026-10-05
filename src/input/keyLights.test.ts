import { describe, expect, it, vi } from "vitest";

import { createKeyLights, DEFAULT_KEY_LIGHTS } from "./keyLights";
import type { KeyLightSettings } from "./keyLights";
import type { KeyEvent } from "./midiInput";

const ON: KeyLightSettings = { enabled: true, channel: 3, velocity: 64 };

function lights(settings: KeyLightSettings = ON) {
  let time = 1000;
  const send = vi.fn<(message: number[]) => void>();
  const control = createKeyLights(send, settings, () => time);
  return {
    control,
    sent: () => send.mock.calls.map(([message]) => message),
    clear: () => {
      send.mockClear();
    },
    at: (ms: number) => {
      time = ms;
    }
  };
}

const key = (
  type: KeyEvent["type"],
  pitch: number,
  timestamp: number,
  channel = 1,
  velocity = 64
): KeyEvent => ({ type, pitch, velocity, timestamp, channel, source: "midi" });

describe("createKeyLights", () => {
  it("sends only what changed", () => {
    const run = lights();
    run.control.show([60, 64]);
    expect(run.sent()).toEqual([
      [0x92, 60, 64],
      [0x92, 64, 64]
    ]);
    run.clear();
    run.control.show([60, 64]);
    expect(run.sent()).toEqual([]);
    run.control.show([64, 67]);
    expect(run.sent()).toEqual([
      [0x82, 60, 0],
      [0x92, 67, 64]
    ]);
    run.clear();
    run.control.show([]);
    expect(run.sent()).toEqual([
      [0x82, 64, 0],
      [0x82, 67, 0]
    ]);
  });

  it("stays silent while off, and is off by default", () => {
    expect(DEFAULT_KEY_LIGHTS).toEqual({ enabled: false, channel: 3, velocity: 64 });
    const run = lights(DEFAULT_KEY_LIGHTS);
    run.control.show([60]);
    expect(run.sent()).toEqual([]);
  });

  it("turns the lit keys off on the old channel before new settings take over", () => {
    const run = lights();
    run.control.show([60]);
    run.clear();
    run.control.configure({ ...ON, channel: 4 });
    expect(run.sent()).toEqual([[0x82, 60, 0]]);
    run.control.show([60]);
    expect(run.sent()).toEqual([
      [0x82, 60, 0],
      [0x93, 60, 64]
    ]);
    run.clear();
    run.control.configure({ ...ON, channel: 4 });
    expect(run.sent()).toEqual([]);
    run.control.configure({ ...ON, channel: 4, enabled: false });
    expect(run.sent()).toEqual([[0x83, 60, 0]]);
  });

  it("lights again after forgetting a port that got a panic", () => {
    const run = lights();
    run.control.show([60]);
    run.clear();
    run.control.forget();
    expect(run.sent()).toEqual([]);
    run.control.show([60]);
    expect(run.sent()).toEqual([[0x92, 60, 64]]);
  });

  it("takes anything on the light channel for an echo", () => {
    const run = lights();
    expect(run.control.isEcho(key("down", 60, 5000, 3, 100))).toBe(true);
    expect(run.control.isEcho(key("down", 60, 5000, 1, 100))).toBe(false);
  });

  it("takes our own key with our velocity within 30 ms for an echo", () => {
    const run = lights();
    run.control.show([60]);
    expect(run.control.isEcho(key("down", 60, 1005))).toBe(true);
    expect(run.control.isEcho(key("down", 60, 1030))).toBe(true);
    expect(run.control.isEcho(key("down", 60, 1031))).toBe(false);
    expect(run.control.isEcho(key("down", 62, 1005))).toBe(false);
    // A player's press a moment later has its own velocity.
    expect(run.control.isEcho(key("down", 60, 1010, 1, 90))).toBe(false);
    // Lit, not turned off: a release is the player's.
    expect(run.control.isEcho(key("up", 60, 1005, 1, 0))).toBe(false);
    run.at(2000);
    run.control.show([]);
    expect(run.control.isEcho(key("up", 60, 2010, 1, 0))).toBe(true);
    expect(run.control.isEcho(key("up", 60, 2100, 1, 0))).toBe(false);
  });

  it("filters nothing while off", () => {
    const run = lights(DEFAULT_KEY_LIGHTS);
    expect(run.control.isEcho(key("down", 60, 1000, 3))).toBe(false);
  });

  it("ignores keys without a channel unless they echo a light", () => {
    const run = lights();
    expect(run.control.isEcho({ type: "down", pitch: 60, velocity: 64, source: "keyboard" })).toBe(
      false
    );
  });
});
