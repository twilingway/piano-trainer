// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainerSnapshot } from "../practice/Trainer";
import {
  createSnapshotSelector,
  createTrainerSnapshotSource,
  sameTrainerStatus,
  selectTrainerStatus,
  useTrainerSelector
} from "./trainerSnapshots";

const snapshot = (time = 0, overrides: Partial<TrainerSnapshot> = {}): TrainerSnapshot => ({
  playing: true,
  waiting: false,
  finished: false,
  time,
  beat: time,
  timingPolicy: "strict",
  stats: { hits: time, misses: 0, wrong: 0, meanOffset: 0, troubleSpots: [] },
  ...overrides
});
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("instance-local trainer snapshot selectors", () => {
  it("caches allocating selections, reads unchanged snapshots once and isolates instances", () => {
    const first = createTrainerSnapshotSource();
    const second = createTrainerSnapshotSource();
    const select = vi.fn(selectTrainerStatus);
    const read = createSnapshotSelector(first, select, sameTrainerStatus);
    first.publish(snapshot());
    const initial = read();
    expect(read()).toBe(initial);
    expect(select).toHaveBeenCalledOnce();
    first.publish(snapshot(10));
    expect(read()).toBe(initial);
    expect(second.getSnapshot()).toBeNull();
    first.publish(snapshot(11, { playing: false }));
    expect(read().playing).toBe(false);
    expect(read()).not.toBe(initial);
  });

  it("removes unsubscribed listeners and ignores publishing the same object", () => {
    const source = createTrainerSnapshotSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);
    const next = snapshot();
    source.publish(next);
    source.publish(next);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    source.publish(snapshot(2));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("updates dynamic leaves for 30 seconds without rendering the coarse shell", async () => {
    const source = createTrainerSnapshotSource();
    source.publish(snapshot());
    const renders = { shell: 0, leaf: 0 };
    function Leaf() {
      renders.leaf++;
      const time = useTrainerSelector(source, (current) => current?.time ?? 0);
      const hits = useTrainerSelector(source, (current) => current?.stats.hits ?? 0);
      return (
        <output>
          {time}:{hits}
        </output>
      );
    }
    function Shell() {
      renders.shell++;
      const status = useTrainerSelector(source, selectTrainerStatus, sameTrainerStatus);
      return (
        <>
          <span>{status.playing ? "playing" : "paused"}</span>
          <Leaf />
        </>
      );
    }
    await act(async () => {
      await Promise.resolve();
      root.render(
        <StrictMode>
          <Shell />
        </StrictMode>
      );
    });
    const shellRenders = renders.shell;
    for (let time = 0.15; time <= 30; time += 0.15) {
      await act(async () => {
        await Promise.resolve();
        source.publish(snapshot(time));
      });
    }
    expect(renders.shell).toBe(shellRenders);
    expect(renders.leaf).toBeGreaterThan(shellRenders);
    expect(host.querySelector("output")?.textContent).toMatch(/^29/);
    await act(async () => {
      await Promise.resolve();
      source.publish(snapshot(30, { playing: false, finished: true }));
    });
    expect(renders.shell).toBeGreaterThan(shellRenders);
    expect(host.textContent).toContain("paused30:30");
  });

  it("detaches disabled subscriptions and reads the latest snapshot on reopening", async () => {
    const source = createTrainerSnapshotSource();
    let listeners = 0;
    const tracked = {
      getSnapshot: source.getSnapshot,
      subscribe(listener: () => void) {
        listeners++;
        const unsubscribe = source.subscribe(listener);
        return () => {
          listeners--;
          unsubscribe();
        };
      }
    };
    const renders = vi.fn();
    function Window({ open }: { open: boolean }) {
      const hits = useTrainerSelector(tracked, (current) => current?.stats.hits, Object.is, open);
      renders();
      return <output>{hits}</output>;
    }
    await act(async () => {
      await Promise.resolve();
      root.render(<Window open={false} />);
    });
    expect(listeners).toBe(0);
    const count = renders.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
      source.publish(snapshot(12));
    });
    expect(renders).toHaveBeenCalledTimes(count);
    await act(async () => {
      await Promise.resolve();
      root.render(<Window open />);
    });
    expect(listeners).toBe(1);
    expect(host.textContent).toBe("12");
    await act(async () => {
      await Promise.resolve();
      root.render(<Window open={false} />);
    });
    expect(listeners).toBe(0);
  });
});
