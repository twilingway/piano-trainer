import { describe, expect, it, vi } from "vitest";
import { PointerKeys } from "./pointerKeys";

describe("pointer pitch ownership", () => {
  it("retains simultaneous independent pitches and physical timestamps", () => {
    const emit = vi.fn();
    const keys = new PointerKeys(emit);
    keys.press(48, { pointerId: 1, pointerType: "touch", timeStamp: 100 });
    keys.press(60, { pointerId: 2, pointerType: "touch", timeStamp: 120 });
    keys.release({ pointerId: 1, pointerType: "touch", timeStamp: 140 });
    expect(emit.mock.calls.map(([event]) => [event.type, event.pitch, event.timestamp])).toEqual([
      ["down", 48, 100],
      ["down", 60, 120],
      ["up", 48, 140]
    ]);
    keys.press(60, { pointerId: 2, timeStamp: 150 });
    expect(emit).toHaveBeenCalledTimes(3);
    keys.release({ pointerId: 2, timeStamp: 160 });
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "up", pitch: 60, timestamp: 160 })
    );
  });

  it("requires the last owner to release a shared pitch and preserves other fingers on drag", () => {
    const emit = vi.fn();
    const keys = new PointerKeys(emit);
    keys.press(48, { pointerId: 1, timeStamp: 100 });
    keys.press(48, { pointerId: 2, timeStamp: 101 });
    keys.press(60, { pointerId: 1, timeStamp: 110 });
    expect(emit.mock.calls.map(([event]) => [event.type, event.pitch])).toEqual([
      ["down", 48],
      ["down", 60]
    ]);
    keys.release({ pointerId: 2, timeStamp: 120 });
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ type: "up", pitch: 48 }));
    keys.release({ pointerId: 1, timeStamp: 130 });
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ type: "up", pitch: 60 }));
  });

  it("never latches a one-pointer mouse drag", () => {
    const emit = vi.fn();
    const keys = new PointerKeys(emit);
    keys.press(48, { pointerId: 1, pointerType: "mouse", timeStamp: 100 });
    keys.press(60, { pointerId: 1, pointerType: "mouse", timeStamp: 150 });
    expect(emit.mock.calls.map(([event]) => [event.type, event.pitch])).toEqual([
      ["down", 48],
      ["up", 48],
      ["down", 60]
    ]);
    keys.clear();
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ type: "up", pitch: 60 }));
    keys.clear();
    expect(emit).toHaveBeenCalledTimes(4);
  });
});
