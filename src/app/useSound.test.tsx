import { getPianoSampleProgress } from "../audio/pianoSamples";
// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useSound } from "./useSound";

const audio = vi.hoisted(() => ({
  start: vi.fn<() => Promise<void>>(),
  samples: vi.fn<() => Promise<void>>(),
  ready: false
}));
vi.mock("../audio/pianoSamples", () => {
  const group = {
    status: "idle",
    loadedBytes: 0,
    totalBytes: 100,
    completedFiles: 0,
    totalFiles: 30
  };
  const progress = { critical: group, background: group };
  return {
    getPianoSampleProgress: vi.fn(() => progress),
    loadPianoSamples: () => audio.samples(),
    subscribePianoSampleProgress: () => () => undefined
  };
});
vi.mock("../audio/pianoSound", () => ({
  startPianoSound: () => audio.start(),
  pianoSoundReady: () => audio.ready
}));

const initialProgress = getPianoSampleProgress();
let root: Root;
let host: HTMLDivElement;
let sound: ReturnType<typeof useSound>;
function Harness() {
  const value = useSound();
  useEffect(() => {
    sound = value;
  }, [value]);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  audio.start.mockReset();
  audio.start.mockImplementation(() => {
    audio.ready = true;
    return Promise.resolve();
  });
  audio.samples.mockReset().mockImplementation(() => {
    audio.ready = true;
    return Promise.resolve();
  });
  audio.ready = false;
  vi.mocked(getPianoSampleProgress).mockReturnValue(initialProgress);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => {
    await Promise.resolve();
    root.render(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("sound readiness", () => {
  it("makes concurrent callers await the same load and becomes ready only after it", async () => {
    let ready!: () => void;
    audio.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = () => {
            audio.ready = true;
            resolve();
          };
        })
    );
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    let legacy!: Promise<boolean>;
    await act(async () => {
      await Promise.resolve();
      first = sound.ensureIntervalSound();
      second = sound.ensureIntervalSound();
      legacy = sound.ensureSound();
    });
    expect(first).toBe(second);
    expect(audio.start).toHaveBeenCalledOnce();
    expect(sound.sound).toBe("loading");
    await act(async () => {
      ready();
      expect(await first).toBe(true);
      await legacy;
    });
    expect(sound.sound).toBe("ready");
  });

  it("keeps failed loads out of ready and retries on the next explicit attempt", async () => {
    audio.start.mockRejectedValueOnce(new Error("samples"));
    await act(async () => {
      expect(await sound.ensureIntervalSound()).toBe(false);
    });
    expect(sound.sound).toBe("error");
    await act(async () => {
      expect(await sound.ensureIntervalSound()).toBe(true);
    });
    expect(audio.start).toHaveBeenCalledTimes(2);
    expect(sound.sound).toBe("ready");
  });

  it("does not accept a suspended context, mute or missing buffers as ready", async () => {
    audio.ready = false;
    audio.start.mockResolvedValue();
    await act(async () => {
      expect(await sound.ensureIntervalSound()).toBe(false);
    });
    expect(sound.sound).toBe("error");
  });

  it("returns false to legacy callers without an unhandled rejection", async () => {
    audio.start.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      expect(await sound.ensureSound()).toBe(false);
    });
    expect(sound.sound).toBe("error");
  });
});

it("cancels a consumer immediately without aborting or reviving its shared load", async () => {
  let loaded!: () => void;
  audio.ready = false;
  audio.start.mockImplementation(
    () =>
      new Promise((resolve) => {
        loaded = resolve;
      })
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = sound.ensureSound();
  });
  expect(sound.audioPreparation.foreground).toBe(true);
  await act(async () => {
    sound.audioPreparation.cancel();
    expect(await pending).toBe(false);
  });
  expect(sound.audioPreparation.foreground).toBe(false);
  expect(sound.sound).toBe("off");
  await act(async () => {
    audio.ready = true;
    loaded();
    await Promise.resolve();
  });
  expect(sound.sound).toBe("off");
  expect(sound.audioPreparation.foreground).toBe(false);
  expect(audio.start).toHaveBeenCalledOnce();
});
it("settles an unmounted consumer as false and ignores a late successful load", async () => {
  let loaded!: () => void;
  audio.start.mockImplementation(
    () =>
      new Promise((resolve) => {
        loaded = resolve;
      })
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = sound.ensureSound();
  });
  act(() => {
    root.render(null);
  });
  expect(await pending).toBe(false);
  await act(async () => {
    loaded();
    await Promise.resolve();
  });
});

it("keeps ready sound immediate without a foreground preparation or another start", async () => {
  audio.ready = true;
  vi.mocked(getPianoSampleProgress).mockReturnValue({
    ...initialProgress,
    critical: { ...initialProgress.critical, status: "ready" }
  });
  await act(async () => {
    expect(await sound.ensureSound()).toBe(true);
  });
  expect(audio.start).not.toHaveBeenCalled();
  expect(sound.audioPreparation.foreground).toBe(false);
  expect(sound.sound).toBe("ready");
});
it("awaits mandatory samples without activating AudioContext after a deferred frame", async () => {
  await act(async () => {
    expect(await sound.audioPreparation.wait()).toBe(true);
  });
  expect(audio.samples).toHaveBeenCalledOnce();
  expect(audio.start).not.toHaveBeenCalled();
});
it("retries optional layers without promoting their progress to a modal", () => {
  const current = initialProgress;
  vi.mocked(getPianoSampleProgress).mockReturnValue({
    ...current,
    critical: { ...current.critical, status: "ready" },
    background: { ...current.background, status: "error" }
  });
  act(() => {
    sound.audioPreparation.retry();
  });
  expect(audio.samples).toHaveBeenCalledOnce();
  expect(audio.start).not.toHaveBeenCalled();
  expect(sound.audioPreparation.foreground).toBe(false);
});

it("dismisses a failed foreground panel when external warm-up completed before the retry click", async () => {
  audio.start.mockRejectedValueOnce(new Error("network"));
  await act(async () => {
    expect(await sound.ensureSound()).toBe(false);
  });
  expect(sound.audioPreparation.foreground).toBe(true);
  audio.ready = true;
  vi.mocked(getPianoSampleProgress).mockReturnValue({
    ...initialProgress,
    critical: { ...initialProgress.critical, status: "ready" }
  });
  await act(async () => {
    expect(await sound.ensureSound()).toBe(true);
  });
  expect(sound.sound).toBe("ready");
  expect(sound.audioPreparation.foreground).toBe(false);
  expect(audio.start).toHaveBeenCalledOnce();
});
