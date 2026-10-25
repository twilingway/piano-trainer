// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayCountdown } from "./usePlayCountdown";
import { useSettingsPlayback } from "./useSettingsPlayback";

let host: HTMLDivElement;
let root: Root;
let now: number;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let play: () => void;
const start = vi.fn();
const prepare = vi.fn<() => Promise<boolean>>();
const song = {};

interface Options {
  readonly seconds?: number;
  readonly editing?: boolean;
  readonly capturing?: boolean;
  readonly calibrating?: boolean;
  readonly practiceActive?: boolean;
  readonly playing?: boolean;
}
function Harness(props: Options) {
  const countdown = usePlayCountdown({
    seconds: props.seconds ?? 3,
    playing: props.playing ?? false,
    song,
    context: "song",
    blocked: false,
    prepare,
    onToggle: start
  });
  const toggle = useSettingsPlayback(
    countdown,
    true,
    props.practiceActive ?? false,
    props.playing ?? false,
    { editing: props.editing ?? false, capturing: props.capturing ?? false },
    props.calibrating ?? false
  );
  useLayoutEffect(() => {
    play = toggle;
  }, [toggle]);
  return <output>{countdown.countdown ?? "paused"}</output>;
}
async function render(props: Options = {}) {
  await act(async () => {
    root.render(<Harness {...props} />);
    await Promise.resolve();
  });
}
async function click() {
  await act(async () => {
    play();
    await Promise.resolve();
  });
}
async function advance(milliseconds: number) {
  now += milliseconds;
  const queued = [...frames.values()];
  frames.clear();
  await act(async () => {
    for (const callback of queued) callback(now);
    await Promise.resolve();
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  now = 100;
  nextFrame = 0;
  frames = new Map();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  start.mockReset();
  prepare.mockReset().mockResolvedValue(true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("settings song transport", () => {
  it("starts the existing countdown while settings remain open and starts once", async () => {
    await render();
    await click();
    expect(prepare).toHaveBeenCalledOnce();
    expect(host.textContent).toBe("3");
    expect(start).not.toHaveBeenCalled();
    await advance(3000);
    expect(start).toHaveBeenCalledOnce();
    await advance(1000);
    expect(start).toHaveBeenCalledOnce();
  });
  it.each(["editing", "capturing", "calibrating", "practiceActive"] as const)(
    "does not start through settings during %s",
    async (guard) => {
      await render({ [guard]: true });
      await click();
      expect(prepare).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    }
  );
  it.each([0, 3])(
    "cancels pending %s-second preparation when capture starts and ignores late audio readiness",
    async (seconds) => {
      let ready!: (value: boolean) => void;
      prepare.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            ready = resolve;
          })
      );
      await render({ seconds });
      await click();
      expect(host.textContent).toBe(String(seconds));
      await render({ capturing: true, seconds });
      expect(host.textContent).toBe("paused");
      await act(async () => {
        ready(true);
        await Promise.resolve();
      });
      await advance(5000);
      expect(start).not.toHaveBeenCalled();
    }
  );
  it("still permits pause and resumes through the same already-started transport", async () => {
    await render({ playing: true, calibrating: true });
    await click();
    expect(start).toHaveBeenCalledOnce();
    await render({ playing: false });
    await click();
    expect(start).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledOnce();
    expect(host.textContent).toBe("paused");
  });
});
