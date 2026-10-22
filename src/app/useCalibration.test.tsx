// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalibration, type CalibrationOptions } from "./useCalibration";

let root: Root;
let host: HTMLDivElement;
let calibration: ReturnType<typeof useCalibration>;
let now: number;
let options: CalibrationOptions;
function Harness() {
  const current = useCalibration(options);
  useLayoutEffect(() => {
    calibration = current;
  });
  return null;
}
function advance(milliseconds: number) {
  act(() => {
    now += milliseconds;
    vi.advanceTimersByTime(milliseconds);
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  options = {
    audioOffsetMs: 0,
    audioOutputId: "default",
    playBeat: vi.fn(),
    onComplete: vi.fn()
  };
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function start() {
  act(() => {
    root.render(<Harness />);
  });
  act(() => {
    calibration.start();
  });
}

describe("calibration preparation countdown", () => {
  it.each([-1000, 0, 1000])(
    "waits three seconds before scheduling beats with offset %s",
    (offset) => {
      options.audioOffsetMs = offset;
      start();
      expect(calibration.running).toBe(true);
      expect(calibration.countdown).toBe(3);
      advance(1000);
      expect(calibration.countdown).toBe(2);
      advance(1000);
      expect(calibration.countdown).toBe(1);
      advance(999);
      expect(options.playBeat).not.toHaveBeenCalled();
      advance(1);
      expect(calibration.countdown).toBeNull();
      expect(options.playBeat).not.toHaveBeenCalled();
      const firstBeat = 4000 + Math.max(300, offset + 150);
      advance(firstBeat - offset - 100 - now);
      expect(options.playBeat).toHaveBeenCalledExactlyOnceWith(firstBeat);
    }
  );

  it("consumes preparation taps and stale timestamps without counting them", () => {
    options.audioOffsetMs = -1000;
    start();
    advance(2999);
    act(() => {
      // This timestamp would round to the first beat without the readiness guard.
      expect(calibration.capture(60, 4250)).toBe(true);
      expect(calibration.capture(60, 3999)).toBe(true);
    });
    expect(calibration.progress?.warmup).toBe(0);
    advance(1);
    act(() => {
      expect(calibration.capture(60, 3999)).toBe(true);
    });
    expect(calibration.progress?.warmup).toBe(0);
    advance(300);
    act(() => {
      expect(calibration.capture(60, 4300)).toBe(true);
    });
    expect(calibration.progress?.warmup).toBe(1);
    expect(calibration.progress?.measured).toBe(0);
  });

  it("cancels the countdown and leaves no beats or completion callbacks", () => {
    start();
    advance(1000);
    act(() => {
      calibration.cancel();
    });
    expect(calibration.running).toBe(false);
    expect(calibration.countdown).toBeNull();
    expect(calibration.capture(60, 4300)).toBe(false);
    advance(30000);
    expect(options.playBeat).not.toHaveBeenCalled();
    expect(options.onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the countdown and beat timers when unmounted", () => {
    start();
    advance(1000);
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    advance(30000);
    expect(options.playBeat).not.toHaveBeenCalled();
    expect(options.onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
