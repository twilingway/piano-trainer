import { describe, expect, it } from "vitest";
import { analyzeCalibration, CalibrationSession, jitterQuality, median } from "./calibration";
import {
  calibrationIsCurrent,
  defaultTimingPreferences,
  getTimingProfile,
  loadTimingPreferences,
  saveTimingPreferences,
  updateTimingProfile,
  type TimingProfile
} from "../app/timingPreferences";

describe("calibration statistics", () => {
  it("uses median and rejects a mistaken tap rather than shifting latency", () => {
    const result = analyzeCalibration([
      ...Array.from({ length: 23 }, (_, index) => 35 + (index % 3)),
      230
    ]);
    expect(result.inputOffsetMs).toBe(36);
    expect(result.jitterMs).toBe(1);
    expect(result.rejectedSamples).toBe(1);
    expect(result.confidence).toBe("high");
    expect(result.complete).toBe(true);
  });
  it("does not classify incomplete or unstable data as high confidence", () => {
    expect(analyzeCalibration([30, 31]).confidence).toBe("low");
    const unstable = analyzeCalibration(
      Array.from({ length: 24 }, (_, index) => (index % 2 ? 70 : -10))
    );
    expect(unstable.jitterMs).toBe(40);
    expect(unstable.quality).toBe("unstable");
    expect(unstable.confidence).toBe("low");
  });
  it("ignores nonfinite values and rejects too many outliers as incomplete", () => {
    expect(analyzeCalibration([Number.NaN, Infinity]).complete).toBe(false);
    expect(analyzeCalibration([Number.NaN, Infinity]).inputOffsetMs).toBe(0);
    const values = [...Array<number>(16).fill(10), ...Array<number>(8).fill(150)];
    expect(analyzeCalibration(values).complete).toBe(false);
  });
  it("includes the exact jitter thresholds and does not mutate input", () => {
    expect([3, 7, 15, 15.01].map(jitterQuality)).toEqual([
      "excellent",
      "good",
      "acceptable",
      "unstable"
    ]);
    const input = [40, 10, 30, 20];
    expect(median(input)).toBe(25);
    expect(input).toEqual([40, 10, 30, 20]);
  });
});
describe("calibration profile persistence", () => {
  const profile = (transport: "usb" | "ble"): TimingProfile => ({
    ...analyzeCalibration(Array<number>(24).fill(36)),
    deviceId: "piano",
    deviceName: "Piano",
    transport,
    audioOffsetMs: 95,
    audioOutputId: "headphones"
  });
  it("round trips separate USB and BLE profiles without sharing offsets", () => {
    let preferences = updateTimingProfile(defaultTimingPreferences(), profile("usb"));
    preferences = updateTimingProfile(preferences, {
      ...profile("ble"),
      ...analyzeCalibration(Array<number>(24).fill(75))
    });
    let stored = "";
    saveTimingPreferences(preferences, {
      setItem: (_key, value) => {
        stored = value;
      }
    });
    const loaded = loadTimingPreferences({ getItem: () => stored });
    expect(getTimingProfile(loaded, "piano", "usb")?.inputOffsetMs).toBe(36);
    expect(getTimingProfile(loaded, "piano", "ble")?.inputOffsetMs).toBe(75);
    expect(getTimingProfile(loaded, "other", "usb")).toBeUndefined();
  });
  it("invalidates calibration after an audio configuration change", () => {
    expect(calibrationIsCurrent(profile("usb"), 95, "headphones")).toBe(true);
    expect(calibrationIsCurrent(profile("usb"), 0, "headphones")).toBe(false);
    expect(calibrationIsCurrent(profile("usb"), 95, "speakers")).toBe(false);
    expect(calibrationIsCurrent(undefined, 95, "headphones")).toBe(false);
  });
  it("rejects corrupted and obsolete storage safely including forged complete profiles", () => {
    expect(loadTimingPreferences({ getItem: () => "{bad" })).toEqual(defaultTimingPreferences());
    expect(loadTimingPreferences({ getItem: () => '{"version":2}' })).toEqual(
      defaultTimingPreferences()
    );
    const preferences = defaultTimingPreferences();
    const malformed = { ...profile("usb"), calibrationSamples: [] };
    const loaded = loadTimingPreferences({
      getItem: () => JSON.stringify({ ...preferences, profiles: { piano: malformed } })
    });
    expect(loaded.profiles).toEqual({});
    expect(() => {
      saveTimingPreferences(preferences, {
        setItem: () => {
          throw new Error("Unavailable");
        }
      });
    }).not.toThrow();
  });
});
describe("calibration beat capture", () => {
  it("excludes four warmup taps from the measured median and accepts delayed callbacks by timestamp", () => {
    const session = new CalibrationSession(1000);
    for (let beat = 0; beat < 28; beat++) {
      expect(session.capture(60, 1000 + beat * 600 + (beat < 4 ? 180 : 36))).toBe(true);
    }
    const progress = session.snapshot();
    expect(progress.warmup).toBe(4);
    expect(progress.measured).toBe(24);
    expect(progress.complete).toBe(true);
    expect(progress.result?.inputOffsetMs).toBe(36);
  });
  it("rejects wrong pitches, duplicates, nonfinite and offbeat taps", () => {
    const session = new CalibrationSession(1000);
    expect(session.capture(61, 1000)).toBe(false);
    expect(session.capture(60, NaN)).toBe(false);
    expect(session.capture(60, 1300)).toBe(false);
    expect(session.capture(60, 1000)).toBe(true);
    expect(session.capture(60, 1010)).toBe(false);
    expect(session.capture(60, 1000 + 28 * 600)).toBe(false);
    expect(session.snapshot().measured).toBe(0);
  });
  it("does not complete when a warmup beat is missing", () => {
    const session = new CalibrationSession(1000);
    for (let beat = 1; beat < 28; beat++) session.capture(60, 1000 + beat * 600);
    expect(session.snapshot().complete).toBe(false);
  });
});
