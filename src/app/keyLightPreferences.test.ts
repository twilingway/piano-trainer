// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadKeyLights, saveKeyLights } from "./keyLightPreferences";

beforeEach(() => {
  localStorage.clear();
});

describe("key light storage", () => {
  it("starts off on channel 3 at velocity 64 and keeps what the player sets", () => {
    expect(loadKeyLights()).toEqual({ enabled: false, channel: 3, velocity: 64 });
    saveKeyLights({ enabled: true, channel: 4, velocity: 20 });
    expect(loadKeyLights()).toEqual({ enabled: true, channel: 4, velocity: 20 });
  });

  it("replaces each damaged field with its default", () => {
    localStorage.setItem(
      "key-lights-v1",
      JSON.stringify({ enabled: true, channel: 17, velocity: 0.5 })
    );
    expect(loadKeyLights()).toEqual({ enabled: true, channel: 3, velocity: 64 });
    localStorage.setItem(
      "key-lights-v1",
      JSON.stringify({ enabled: "yes", channel: 0, velocity: 128 })
    );
    expect(loadKeyLights()).toEqual({ enabled: false, channel: 3, velocity: 64 });
  });

  it.each(["{", JSON.stringify("on"), "null"])("falls back to the defaults on %s", (stored) => {
    localStorage.setItem("key-lights-v1", stored);
    expect(loadKeyLights()).toEqual({ enabled: false, channel: 3, velocity: 64 });
  });
});
