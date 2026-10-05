// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadDeviceRange, saveDeviceRange } from "./deviceRangePreferences";

beforeEach(() => {
  localStorage.clear();
});

describe("device range storage", () => {
  it("keeps a captured range", () => {
    saveDeviceRange({ preset: "custom", low: 48, high: 84 });
    expect(loadDeviceRange()).toEqual({ preset: "custom", low: 48, high: 84 });
  });

  it.each(["{", JSON.stringify({ preset: "custom", low: 84, high: 48 })])(
    "falls back to the whole piano on %s",
    (stored) => {
      localStorage.setItem("device-range-v1", stored);
      expect(loadDeviceRange()).toEqual({ preset: "88" });
    }
  );
});
