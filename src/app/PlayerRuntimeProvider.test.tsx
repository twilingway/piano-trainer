// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createRuntimeSelector, createRuntimeSource } from "./PlayerRuntimeProvider";

type Runtime = Parameters<typeof createRuntimeSource>[0];
/** Delivery helpers only inspect the selected fields; no live Trainer is needed. */
const runtime = (fields: Pick<Runtime, "playing" | "play">): Runtime => fields as Runtime;

describe("instance-owned runtime delivery", () => {
  it("publishes the current snapshot before notifying, ignores identical publishes and unsubscribes", () => {
    const initial = runtime({ playing: false, play: () => undefined });
    const source = createRuntimeSource(initial);
    const observed: Runtime[] = [];
    const listener = vi.fn(() => {
      observed.push(source.getSnapshot());
    });
    const unsubscribe = source.subscribe(listener);
    source.publish(initial);
    expect(listener).not.toHaveBeenCalled();
    const next = runtime({ playing: true, play: initial.play });
    source.publish(next);
    expect(observed).toEqual([next]);
    expect(source.getSnapshot()).toBe(next);
    unsubscribe();
    unsubscribe();
    source.publish(initial);
    expect(listener).toHaveBeenCalledOnce();
    expect(source.getSnapshot()).toBe(initial);
  });

  it("keeps allocating selector snapshots stable across unrelated runtime publications", () => {
    const play = vi.fn();
    const initial = runtime({ playing: false, play });
    const source = createRuntimeSource(initial);
    const select = vi.fn((value: Runtime) => ({ playing: value.playing }));
    const read = createRuntimeSelector(
      source,
      select,
      (left, right) => left.playing === right.playing
    );
    const selected = read();
    expect(read()).toBe(selected);
    expect(select).toHaveBeenCalledOnce();
    source.publish(runtime({ playing: false, play: vi.fn() }));
    expect(read()).toBe(selected);
    expect(read()).toBe(selected);
    expect(select).toHaveBeenCalledTimes(2);
    source.publish(runtime({ playing: true, play }));
    const changed = read();
    expect(changed).not.toBe(selected);
    expect(changed.playing).toBe(true);
    expect(read()).toBe(changed);
  });

  it("delivers the latest runtime command instead of keeping a stale command version", () => {
    const original = vi.fn(),
      updated = vi.fn();
    const source = createRuntimeSource(runtime({ playing: false, play: original }));
    const read = createRuntimeSelector(source, (value) => value.play);
    read()();
    expect(original).toHaveBeenCalledOnce();
    source.publish(runtime({ playing: false, play: updated }));
    expect(read()).toBe(updated);
    read()();
    expect(updated).toHaveBeenCalledOnce();
    expect(original).toHaveBeenCalledOnce();
  });

  it("keeps independently owned sources and subscriptions separate", () => {
    const first = createRuntimeSource(runtime({ playing: false, play: vi.fn() }));
    const second = createRuntimeSource(runtime({ playing: false, play: vi.fn() }));
    const listener = vi.fn();
    const unsubscribe = second.subscribe(listener);
    first.publish(runtime({ playing: true, play: vi.fn() }));
    expect(second.getSnapshot().playing).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
