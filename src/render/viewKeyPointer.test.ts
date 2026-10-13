// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { FederatedPointerEvent } from "pixi.js";
import { FallingNotesView } from "./FallingNotesView";
import { KeyboardLayer } from "./KeyboardLayer";
import { PointerKeys } from "./pointerKeys";
import { releaseViewKeyPointer } from "./viewKeyPointer";

function harness(roadMode: boolean) {
  const emit = vi.fn();
  const cancel = vi.fn();
  const keyboard = Object.assign(Object.create(KeyboardLayer.prototype) as object, {
    pointers: new PointerKeys(emit),
    pitchAt: vi.fn((x: number) => (x < 100 ? 48 : 60))
  }) as unknown as KeyboardLayer;
  const stage = {};
  const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
    app: { stage },
    parts: { keys: true },
    roadMode,
    keyboard,
    pan: 20,
    offset: { x: 10, y: 5 },
    road: { keysPointAt: (x: number, y: number) => ({ x: x + 10, y: y - 5 }) }
  }) as unknown as { keysPointer: (event: FederatedPointerEvent) => void };
  const event = (pointerId: number, x: number, raw: number) =>
    ({
      pointerId,
      pointerType: "touch",
      global: { x, y: 20 },
      target: {},
      timeStamp: raw + 5,
      nativeEvent: { timeStamp: raw }
    }) as unknown as FederatedPointerEvent;
  return { emit, cancel, keyboard, view, event };
}

describe("flat and projected pointer routes", () => {
  it.each([false, true])("retains independent fingers and native timestamps, road=%s", (road) => {
    const run = harness(road);
    run.view.keysPointer(run.event(1, 0, 100));
    run.view.keysPointer(run.event(2, 100, 120));
    run.view.keysPointer(run.event(2, 100, 130));
    expect(run.keyboard.pitchAt).toHaveBeenCalledWith(10, 15);
    expect(run.keyboard.pitchAt).toHaveBeenCalledWith(110, 15);
    expect(run.emit.mock.calls.map(([key]) => [key.type, key.pitch, key.timestamp])).toEqual([
      ["down", 48, 100],
      ["down", 60, 120]
    ]);
    releaseViewKeyPointer(run.event(1, 0, 140), false, run.keyboard, run.keyboard, run.cancel);
    expect(run.cancel).not.toHaveBeenCalled();
    expect(run.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "up", pitch: 48, timestamp: 140 })
    );
    releaseViewKeyPointer(run.event(2, 100, 150), false, run.keyboard, run.keyboard, run.cancel);
    expect(run.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "up", pitch: 60, timestamp: 150 })
    );
  });

  it("cancels before synthetic cleanup and releases only the cancelled owner", () => {
    const run = harness(false);
    run.view.keysPointer(run.event(1, 0, 100));
    run.view.keysPointer(run.event(2, 100, 120));
    run.emit.mockClear();
    releaseViewKeyPointer(run.event(1, 0, 140), true, run.keyboard, run.keyboard, run.cancel);
    expect(run.cancel).toHaveBeenCalledWith(false);
    expect(run.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      run.emit.mock.invocationCallOrder[0] ?? Infinity
    );
    expect(run.emit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "up", pitch: 48 })
    );
    run.view.keysPointer(run.event(2, 100, 150));
    expect(run.emit).toHaveBeenCalledTimes(1);
    releaseViewKeyPointer(undefined, true, run.keyboard, run.keyboard, run.cancel);
    expect(run.cancel).toHaveBeenLastCalledWith(true);
    expect(run.emit).toHaveBeenLastCalledWith(expect.objectContaining({ type: "up", pitch: 60 }));
  });
});
