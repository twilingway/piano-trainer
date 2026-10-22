// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useSound } from "./useSound";

const audio = vi.hoisted(() => ({ start: vi.fn<() => Promise<void>>(), ready: true }));
vi.mock("../audio/pianoSound", () => ({
  startPianoSound: () => audio.start(),
  pianoSoundReady: () => audio.ready
}));

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
  audio.start.mockResolvedValue();
  audio.ready = true;
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
    audio.start.mockImplementation(() => new Promise((resolve) => (ready = resolve)));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    let legacy!: Promise<void>;
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
    await act(async () => {
      expect(await sound.ensureIntervalSound()).toBe(false);
    });
    expect(sound.sound).toBe("error");
  });

  it("preserves legacy Promise<void> callers without an unhandled rejection", async () => {
    audio.start.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await sound.ensureSound();
    });
    expect(sound.sound).toBe("error");
  });
});
