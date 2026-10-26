// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayCountdown } from "./usePlayCountdown";
import { useShortcuts } from "./useShortcuts";

let host: HTMLDivElement;
let root: Root;
let now: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let controls: ReturnType<typeof usePlayCountdown>;
const start = vi.fn();
const prepare = vi.fn<() => Promise<boolean>>();
const song = {};
function Harness(props: {
  seconds?: number;
  playing?: boolean;
  finished?: boolean;
  context?: string;
  source?: unknown;
  blocked?: boolean;
}) {
  const value = usePlayCountdown({
    seconds: props.seconds ?? 3,
    playing: props.playing ?? false,
    finished: props.finished ?? false,
    context: props.context ?? "song:wait",
    song: props.source ?? song,
    blocked: props.blocked ?? false,
    prepare,
    onToggle: start
  });
  useLayoutEffect(() => {
    controls = value;
  }, [value]);
  useShortcuts({ play: value.toggle });
  return <output>{value.countdown ?? "paused"}</output>;
}
const render = async (props: Parameters<typeof Harness>[0] = {}) => {
  await act(async () => {
    root.render(<Harness {...props} />);
    await Promise.resolve();
  });
};
const click = async () => {
  await act(async () => {
    controls.toggle();
    await Promise.resolve();
  });
};
const advance = async (milliseconds: number) => {
  now += milliseconds;
  const queued = [...frames.values()];
  frames.clear();
  await act(async () => {
    queued.forEach((callback) => {
      callback(now);
    });
    await Promise.resolve();
  });
};
const displayed = () => host.querySelector("output")?.textContent;
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

describe("play count-in", () => {
  it("prepares audio in the click, displays 3-2-1 and issues exactly one transport start", async () => {
    await render();
    await click();
    expect(prepare).toHaveBeenCalledOnce();
    expect(displayed()).toBe("3");
    expect(start).not.toHaveBeenCalled();
    await advance(1000);
    expect(displayed()).toBe("2");
    await advance(1000);
    expect(displayed()).toBe("1");
    expect(start).not.toHaveBeenCalled();
    await advance(1000);
    expect(start).toHaveBeenCalledOnce();
    expect(displayed()).toBe("paused");
    await advance(10000);
    expect(start).toHaveBeenCalledOnce();
  });
  it("uses an absolute deadline after delayed animation frames", async () => {
    await render();
    await click();
    await advance(3400);
    expect(start).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
  it("starts immediately at zero and pauses immediately while already playing", async () => {
    await render({ seconds: 0 });
    await click();
    expect(start).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    await render({ playing: true });
    await click();
    expect(start).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledOnce();
    expect(displayed()).toBe("paused");
  });
  it("resumes immediately after a real start even when song time is still zero", async () => {
    await render();
    await click();
    await advance(3000);
    expect(start).toHaveBeenCalledOnce();
    await render({ playing: true });
    await click();
    expect(start).toHaveBeenCalledTimes(2);
    await render({ playing: false });
    await click();
    expect(start).toHaveBeenCalledTimes(3);
    expect(displayed()).toBe("paused");
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });
  it("counts again only after an explicit new run reset", async () => {
    await render({ playing: true });
    await render({ playing: false });
    act(() => {
      controls.resetNewRun();
    });
    await click();
    expect(displayed()).toBe("3");
    expect(start).not.toHaveBeenCalled();
    await advance(3000);
    expect(start).toHaveBeenCalledOnce();
  });
  it("keeps initial count-in available after cancelling it", async () => {
    await render();
    await click();
    await advance(1000);
    await click();
    await click();
    expect(displayed()).toBe("3");
    expect(start).not.toHaveBeenCalled();
    await advance(3000);
    expect(start).toHaveBeenCalledOnce();
  });
  it("does not reset a paused run after changing the delay or ordinary seek cancellation", async () => {
    await render({ playing: true });
    await render({ playing: false, seconds: 8 });
    act(() => {
      controls.cancel();
    });
    await click();
    expect(start).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(displayed()).toBe("paused");
  });
  it("counts before replaying a finished run", async () => {
    await render({ playing: true });
    await render({ playing: false, finished: true });
    await click();
    expect(displayed()).toBe("3");
    expect(start).not.toHaveBeenCalled();
    await advance(3000);
    expect(start).toHaveBeenCalledOnce();
  });
  it.each(["song", "context"] as const)(
    "counts for a new %s after the previous run",
    async (change) => {
      await render({ playing: true });
      await render(change === "song" ? { source: {} } : { context: "next-attempt" });
      await click();
      expect(displayed()).toBe("3");
      expect(start).not.toHaveBeenCalled();
    }
  );
  it("cancels on the second command without a late start", async () => {
    await render();
    await click();
    await advance(1000);
    await click();
    await advance(5000);
    expect(displayed()).toBe("paused");
    expect(start).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
  it("starts and cancels through the same Ctrl+Space shortcut", async () => {
    await render();
    const shortcut = async () => {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", ctrlKey: true }));
        await Promise.resolve();
      });
    };
    await shortcut();
    expect(displayed()).toBe("3");
    await advance(1000);
    await shortcut();
    await advance(3000);
    expect(start).not.toHaveBeenCalled();
    expect(displayed()).toBe("paused");
  });
  it.each(["song", "mode", "blocked", "setting"] as const)(
    "invalidates a pending start when %s changes",
    async (change) => {
      await render();
      await click();
      await render(
        change === "song"
          ? { source: {} }
          : change === "mode"
            ? { context: "song:tempo" }
            : change === "blocked"
              ? { blocked: true }
              : { seconds: 4 }
      );
      await advance(5000);
      expect(start).not.toHaveBeenCalled();
      expect(displayed()).toBe("paused");
    }
  );
  it("waits for slow audio after zero, then starts once", async () => {
    let ready: ((value: boolean) => void) | undefined;
    prepare.mockReturnValue(
      new Promise<boolean>((resolve) => {
        ready = resolve;
      })
    );
    await render();
    await click();
    await advance(3000);
    expect(displayed()).toBe("0");
    expect(start).not.toHaveBeenCalled();
    await act(async () => {
      ready?.(true);
      await Promise.resolve();
    });
    expect(start).toHaveBeenCalledOnce();
    expect(displayed()).toBe("paused");
  });
  it("discards a cancelled audio promise and an unavailable sound", async () => {
    let ready: ((value: boolean) => void) | undefined;
    prepare.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        ready = resolve;
      })
    );
    await render();
    await click();
    await click();
    await act(async () => {
      ready?.(true);
      await Promise.resolve();
    });
    await advance(4000);
    expect(start).not.toHaveBeenCalled();
    prepare.mockResolvedValueOnce(false);
    await click();
    expect(displayed()).toBe("paused");
    await advance(4000);
    expect(start).not.toHaveBeenCalled();
  });
  it("cancels on unmount", async () => {
    await render();
    await click();
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(frames.size).toBe(0);
    await advance(4000);
    expect(start).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});

it("cancels cleanly when audio preparation throws", async () => {
  prepare.mockImplementationOnce(() => {
    throw new Error("No sound");
  });
  await render();
  await click();
  await advance(5000);
  expect(displayed()).toBe("paused");
  expect(start).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

it("can still pause a running game while a menu is open", async () => {
  await render({ playing: true, blocked: true });
  await click();
  expect(start).toHaveBeenCalledOnce();
  expect(prepare).not.toHaveBeenCalled();
});

it("does not consume the initial count-in when audio fails before the real start", async () => {
  prepare.mockResolvedValueOnce(false);
  await render();
  await click();
  expect(displayed()).toBe("paused");
  expect(start).not.toHaveBeenCalled();
  await click();
  expect(displayed()).toBe("3");
  await advance(3000);
  expect(start).toHaveBeenCalledOnce();
});

describe.each(["zero", "resume"] as const)("cancelable readiness for %s wait", (mode) => {
  const seconds = mode === "zero" ? 0 : 3;
  const idle = async () => {
    if (mode === "resume") await render({ playing: true, seconds });
    await render({ playing: false, seconds });
  };
  const deferred = () => {
    let resolve: (value: boolean) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const promise = new Promise<boolean>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    return { promise, resolve, reject };
  };

  it("shows preparing at zero and starts once as soon as audio is actually ready", async () => {
    const ready = deferred();
    prepare.mockReturnValueOnce(ready.promise);
    await idle();
    await click();
    expect(prepare).toHaveBeenCalledOnce();
    expect(displayed()).toBe("0");
    expect(controls.active).toBe(true);
    await advance(8000);
    expect(start).not.toHaveBeenCalled();
    await act(async () => {
      ready.resolve(true);
      await Promise.resolve();
    });
    expect(start).toHaveBeenCalledOnce();
    expect(displayed()).toBe("paused");
    expect(frames.size).toBe(0);
  });

  it.each(["command", "blocked", "caller-cancel", "unmount"] as const)(
    "invalidates pending audio through %s and ignores its late readiness",
    async (reason) => {
      const ready = deferred();
      prepare.mockReturnValueOnce(ready.promise);
      await idle();
      await click();
      expect(displayed()).toBe("0");
      if (reason === "command") await click();
      else if (reason === "blocked") await render({ seconds, blocked: true });
      else
        await act(async () => {
          if (reason === "unmount") root.unmount();
          else controls.cancel(); // Capture, calibration and library commands use this cancellation API.
          await Promise.resolve();
        });
      expect(frames.size).toBe(0);
      await act(async () => {
        ready.resolve(true);
        await Promise.resolve();
      });
      await advance(9000);
      expect(start).not.toHaveBeenCalled();
      if (reason === "unmount") root = createRoot(host);
      else expect(displayed()).toBe("paused");
    }
  );

  it.each(["false", "reject", "throw"] as const)(
    "does not start when readiness returns %s",
    async (outcome) => {
      const ready = deferred();
      if (outcome === "throw")
        prepare.mockImplementationOnce(() => {
          throw new Error("Unavailable audio");
        });
      else prepare.mockReturnValueOnce(ready.promise);
      await idle();
      await click();
      expect(prepare).toHaveBeenCalledOnce();
      expect(start).not.toHaveBeenCalled();
      await act(async () => {
        if (outcome === "false") ready.resolve(false);
        if (outcome === "reject") ready.reject(new Error("Unavailable audio"));
        await Promise.resolve();
      });
      expect(displayed()).toBe("paused");
      expect(frames.size).toBe(0);
      await advance(9000);
      expect(start).not.toHaveBeenCalled();
    }
  );

  it("does not let an older canceled promise complete a newer preparation", async () => {
    const old = deferred(),
      current = deferred();
    prepare.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await idle();
    await click();
    await click();
    await click();
    expect(prepare).toHaveBeenCalledTimes(2);
    await act(async () => {
      old.resolve(true);
      await Promise.resolve();
    });
    expect(start).not.toHaveBeenCalled();
    expect(displayed()).toBe("0");
    await act(async () => {
      current.resolve(true);
      await Promise.resolve();
    });
    expect(start).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
