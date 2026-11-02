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
      expect(calibration.phase).toBe("preparation");
      advance(1000);
      expect(calibration.countdown).toBe(2);
      advance(1000);
      expect(calibration.countdown).toBe(1);
      advance(999);
      expect(options.playBeat).not.toHaveBeenCalled();
      advance(1);
      expect(calibration.countdown).toBeNull();
      expect(calibration.phase).toBe("lead-in");
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
    expect(calibration.progress?.warmup).toBe(0);
    expect(calibration.progress?.measured).toBe(0);
    advance(1700);
    act(() => {
      expect(calibration.capture(60, 6000)).toBe(true);
    });
    expect(calibration.phase).toBe("warmup");
    expect(calibration.progress?.warmup).toBe(1);
  });

  it("cancels the countdown and leaves no beats or completion callbacks", () => {
    start();
    advance(1000);
    act(() => {
      calibration.cancel();
    });
    expect(calibration.running).toBe(false);
    expect(calibration.countdown).toBeNull();
    expect(calibration.phase).toBeNull();
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

describe("calibration lead-in and stage schedule", () => {
  const firstBeat = 4300;
  const end = firstBeat + 31 * 600 + 500;
  function tap(timestamp: number) {
    advance(timestamp - now);
    act(() => {
      expect(calibration.capture(60, timestamp)).toBe(true);
    });
  }
  it("schedules all 31 clicks and changes stages at admission boundaries without any input", () => {
    start();
    expect(calibration.phase).toBe("preparation");
    advance(3000);
    expect(calibration.phase).toBe("lead-in");
    advance(firstBeat + 3 * 600 - 270 - now - 1);
    expect(calibration.phase).toBe("lead-in");
    advance(1);
    expect(calibration.phase).toBe("warmup");
    expect(calibration.progress).toMatchObject({ warmup: 0, measured: 0 });
    advance(firstBeat + 7 * 600 - 270 - now - 1);
    expect(calibration.phase).toBe("warmup");
    advance(1);
    expect(calibration.phase).toBe("measurement");
    expect(calibration.progress).toMatchObject({ warmup: 0, measured: 0 });
    advance(end - now);
    expect(vi.mocked(options.playBeat).mock.calls.map(([timestamp]) => timestamp)).toEqual(
      Array.from({ length: 31 }, (_, beat) => firstBeat + beat * 600)
    );
    expect(calibration.running).toBe(false);
    expect(calibration.phase).toBeNull();
    expect(calibration.progress).toMatchObject({
      warmup: 0,
      measured: 0,
      complete: false,
      result: null
    });
    expect(options.onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("accepts an early warmup attack and never reclassifies a delayed intro timestamp", () => {
    start();
    tap(firstBeat + 3 * 600 - 100);
    expect(calibration.phase).toBe("warmup");
    expect(calibration.progress).toMatchObject({ warmup: 1, measured: 0 });
    advance(100);
    act(() => {
      expect(calibration.capture(60, firstBeat + 2 * 600 + 250)).toBe(true);
    });
    expect(calibration.progress).toMatchObject({ warmup: 1, measured: 0 });
    tap(firstBeat + 7 * 600 - 100);
    expect(calibration.phase).toBe("measurement");
    expect(calibration.progress).toMatchObject({ warmup: 1, measured: 1 });
  });
  it.each([
    [3, -271, 0, 0],
    [3, -270, 1, 0],
    [3, 270, 1, 0],
    [3, 271, 0, 0],
    [7, -271, 0, 0],
    [7, -270, 0, 1],
    [7, 270, 0, 1],
    [7, 271, 0, 0]
  ] as const)(
    "classifies beat %s offset %s by the inclusive nearest window",
    (beat, offset, warmup, measured) => {
      start();
      tap(firstBeat + beat * 600 + offset);
      expect(calibration.progress).toMatchObject({ warmup, measured });
    }
  );
  it("analyzes only 24 measurements after three ignored intro and four warmup attacks", () => {
    start();
    for (let beat = 0; beat < 31; beat++) {
      tap(firstBeat + beat * 600 + (beat < 7 ? 180 : 36));
      if (beat < 3) expect(calibration.progress).toMatchObject({ warmup: 0, measured: 0 });
    }
    expect(calibration.progress).toMatchObject({ warmup: 4, measured: 24, complete: true });
    expect(options.onComplete).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        inputOffsetMs: 36,
        jitterMs: 0,
        calibrationSamples: Array<number>(24).fill(36),
        complete: true
      }),
      { audioOffsetMs: 0, audioOutputId: "default" }
    );
    expect(calibration.phase).toBeNull();
    expect(calibration.running).toBe(false);
    expect(calibration.capture(60, firstBeat + 30 * 600 + 40)).toBe(false);
    advance(30000);
    expect(options.onComplete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("leaves three warmup plus 24 measured attacks incomplete without saving a profile", () => {
    start();
    for (let beat = 0; beat < 31; beat++) if (beat !== 3) tap(firstBeat + beat * 600 + 36);
    expect(calibration.phase).toBe("measurement");
    expect(calibration.progress).toMatchObject({
      warmup: 3,
      measured: 24,
      complete: false,
      result: null
    });
    expect(options.onComplete).not.toHaveBeenCalled();
    advance(end - now);
    expect(calibration.running).toBe(false);
    expect(calibration.phase).toBeNull();
    expect(options.onComplete).not.toHaveBeenCalled();
  });
  it.each([
    [1000, "preparation"],
    [3000, "lead-in"],
    [5000, "warmup"],
    [7300, "measurement"]
  ] as const)("cancels all timers and late input after %s ms in %s", (elapsed, phase) => {
    start();
    advance(elapsed);
    expect(calibration.phase).toBe(phase);
    const calls = vi.mocked(options.playBeat).mock.calls.length;
    act(() => {
      calibration.cancel();
    });
    expect(calibration.phase).toBeNull();
    expect(calibration.countdown).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(calibration.capture(60, firstBeat + 30 * 600)).toBe(false);
    advance(30000);
    expect(options.playBeat).toHaveBeenCalledTimes(calls);
    expect(options.onComplete).not.toHaveBeenCalled();
  });
  it("starts a fresh preparation and ignores every old scheduled callback after restart", () => {
    const scheduled = vi.spyOn(globalThis, "setTimeout");
    start();
    const oldCallbacks = scheduled.mock.calls.map(([callback]) => callback);
    tap(firstBeat + 3 * 600 - 100);
    expect(calibration.progress?.warmup).toBe(1);
    act(() => {
      calibration.cancel();
      calibration.start();
    });
    const calls = vi.mocked(options.playBeat).mock.calls.length;
    act(() => {
      for (const callback of oldCallbacks) if (typeof callback === "function") callback();
      expect(calibration.capture(60, firstBeat + 2 * 600 + 250)).toBe(true);
    });
    expect(calibration.phase).toBe("preparation");
    expect(calibration.countdown).toBe(3);
    expect(calibration.progress).toMatchObject({ warmup: 0, measured: 0 });
    expect(calibration.running).toBe(true);
    expect(options.playBeat).toHaveBeenCalledTimes(calls);
    expect(options.onComplete).not.toHaveBeenCalled();
  });
  it("finishes the old session before a completion callback starts a new one", () => {
    options.onComplete = vi.fn(() => {
      calibration.start();
    });
    start();
    for (let beat = 3; beat < 31; beat++) tap(firstBeat + beat * 600 + 36);
    expect(options.onComplete).toHaveBeenCalledOnce();
    expect(calibration.running).toBe(true);
    expect(calibration.phase).toBe("preparation");
    expect(calibration.countdown).toBe(3);
    expect(calibration.progress).toMatchObject({ warmup: 0, measured: 0, complete: false });
  });
});
