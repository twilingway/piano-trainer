// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainerPreparation, waitForVisiblePaint } from "./TrainerPreparation";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function harness() {
  const paints: ReturnType<typeof deferred<boolean>>[] = [];
  const frames: ReturnType<typeof deferred<boolean>>[] = [];
  const prep = new TrainerPreparation(() => {
    const item = deferred<boolean>();
    paints.push(item);
    return item.promise;
  });
  const job = (playing: boolean, preserve = true, autostart = false) => ({
    playing,
    pause: vi.fn(),
    release: vi.fn(),
    apply: vi.fn(() => ({ preserve, autostart })),
    resume: vi.fn(),
    frame: vi.fn(() => {
      const item = deferred<boolean>();
      frames.push(item);
      return item.promise;
    })
  });
  return { prep, paints, frames, job };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("current party preparation", () => {
  it("paints before applying only the latest selection and inherits playing intent across rapid changes", async () => {
    const h = harness(),
      left = h.job(true),
      right = h.job(false);
    h.prep.start(left);
    const old = h.prep.wait();
    h.prep.start(right);
    expect(await old).toBe(false);
    expect(h.prep.getSnapshot()).toBe("preparing");
    expect(left.apply).not.toHaveBeenCalled();
    expect(right.apply).not.toHaveBeenCalled();
    h.paints[0]?.resolve(true);
    await flush();
    expect(left.apply).not.toHaveBeenCalled();
    h.paints[1]?.resolve(true);
    await flush();
    expect(right.apply).toHaveBeenCalledOnce();
    expect(right.resume).not.toHaveBeenCalled();
    expect(h.prep.getSnapshot()).toBe("waiting-frame");
    h.frames[0]?.resolve(true);
    await flush();
    expect(right.resume).toHaveBeenCalledOnce();
    expect(h.prep.getSnapshot()).toBe("idle");
  });
  it("lets an explicit pause between selections win while still applying the selected configuration", async () => {
    const h = harness(),
      left = h.job(true),
      right = h.job(false);
    h.prep.start(left);
    const waiting = h.prep.wait();
    h.prep.cancel();
    expect(await waiting).toBe(false);
    h.prep.start(right);
    h.paints[1]?.resolve(true);
    await flush();
    expect(right.apply).toHaveBeenCalledOnce();
    h.frames[0]?.resolve(true);
    await flush();
    expect(right.resume).not.toHaveBeenCalled();
    expect(h.prep.getSnapshot()).toBe("idle");
  });
  it("does not let a stale rendered frame hide a newer request or resume another song", async () => {
    const h = harness(),
      first = h.job(true),
      next = h.job(false, false);
    h.prep.start(first);
    h.paints[0]?.resolve(true);
    await flush();
    h.prep.start(next);
    h.frames[0]?.resolve(true);
    await flush();
    expect(h.prep.getSnapshot()).toBe("preparing");
    expect(first.resume).not.toHaveBeenCalled();
    h.paints[1]?.resolve(true);
    await flush();
    h.frames[1]?.resolve(true);
    await flush();
    expect(next.resume).not.toHaveBeenCalled();
  });
  it("finishes a missing graphics frame as an error and never starts playback", async () => {
    const h = harness(),
      job = h.job(false, false, true);
    h.prep.start(job);
    h.paints[0]?.resolve(true);
    await flush();
    const waiting = h.prep.wait();
    h.frames[0]?.resolve(false);
    await flush();
    expect(await waiting).toBe(false);
    expect(h.prep.getSnapshot()).toBe("error");
    expect(job.release).toHaveBeenCalledOnce();
    expect(job.resume).not.toHaveBeenCalled();
  });
  it("stops an unmounted request before CPU work and ignores its late paint", async () => {
    const h = harness(),
      job = h.job(true);
    h.prep.start(job);
    const waiting = h.prep.wait();
    h.prep.stop();
    h.paints[0]?.resolve(true);
    await flush();
    expect(await waiting).toBe(false);
    expect(job.apply).not.toHaveBeenCalled();
    expect(job.resume).not.toHaveBeenCalled();
  });
});
it("waits for visible browser paint opportunities and remains abortable", async () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const abort = new AbortController();
  const done = vi.fn();
  void waitForVisiblePaint(abort.signal).then(done);
  expect(frames).toHaveLength(0);
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  frames.shift()?.(0);
  await flush();
  expect(done).not.toHaveBeenCalled();
  frames.shift()?.(16);
  await flush();
  expect(done).toHaveBeenCalledWith(true);
  const cancelled = new AbortController();
  const pending = waitForVisiblePaint(cancelled.signal);
  cancelled.abort();
  expect(await pending).toBe(false);
});

it("lets a new explicit listen request start after cancelling an older party request", async () => {
  const h = harness(),
    old = h.job(true),
    listen = h.job(false, true, true);
  h.prep.start(old);
  h.prep.cancel();
  h.prep.start(listen);
  expect(h.prep.getSnapshot()).toBe("preparing");
  h.paints[1]?.resolve(true);
  await flush();
  h.frames[0]?.resolve(true);
  await flush();
  expect(listen.resume).toHaveBeenCalledOnce();
});

it("gates resume on required sound after the current frame and keeps its late success cancellable", async () => {
  const h = harness(),
    audio = deferred<boolean>(),
    job = { ...h.job(true), prepareSound: vi.fn(() => audio.promise) };
  h.prep.start(job);
  h.paints[0]?.resolve(true);
  await flush();
  expect(job.prepareSound).not.toHaveBeenCalled();
  h.frames[0]?.resolve(true);
  await flush();
  expect(h.prep.getSnapshot()).toBe("idle");
  expect(job.prepareSound).toHaveBeenCalledOnce();
  expect(job.resume).not.toHaveBeenCalled();
  const waiting = h.prep.wait();
  h.prep.cancel();
  audio.resolve(true);
  await flush();
  expect(await waiting).toBe(false);
  expect(job.resume).not.toHaveBeenCalled();
});
it("does not resume a prepared party when mandatory sound reports false", async () => {
  const h = harness(),
    job = { ...h.job(false, false, true), prepareSound: () => Promise.resolve(false) };
  h.prep.start(job);
  h.paints[0]?.resolve(true);
  await flush();
  const waiting = h.prep.wait();
  h.frames[0]?.resolve(true);
  await flush();
  expect(await waiting).toBe(false);
  expect(job.resume).not.toHaveBeenCalled();
});
it("keeps the initial session silent in the runtime UI while still awaiting its actual frame", async () => {
  const h = harness(),
    job = { ...h.job(false), foreground: false };
  h.prep.start(job);
  expect(h.prep.getSnapshot()).toBe("idle");
  h.paints[0]?.resolve(true);
  await flush();
  expect(h.prep.getSnapshot()).toBe("idle");
  expect(job.apply).toHaveBeenCalledOnce();
  const waiting = h.prep.wait();
  h.frames[0]?.resolve(true);
  await flush();
  expect(await waiting).toBe(true);
});

it.each([true, false])(
  "offers Retry again after closing a failed frame request (foreground=%s)",
  async (foreground) => {
    const h = harness(),
      failed = { ...h.job(false), foreground };
    h.prep.start(failed);
    h.paints[0]?.resolve(true);
    await flush();
    h.frames[0]?.resolve(false);
    await flush();
    h.prep.cancel();
    expect(h.prep.getSnapshot()).toBe("idle");
    expect(await h.prep.wait()).toBe(false);
    expect(h.prep.getSnapshot()).toBe("error");
    const retry = h.job(false);
    h.prep.start(retry);
    h.paints[1]?.resolve(true);
    await flush();
    expect(h.prep.getSnapshot()).toBe("waiting-frame");
    const ready = vi.fn();
    void h.prep.wait().then(ready);
    await flush();
    expect(ready).not.toHaveBeenCalled();
    h.frames[1]?.resolve(true);
    await flush();
    expect(ready).toHaveBeenCalledWith(true);
    expect(h.prep.getSnapshot()).toBe("idle");
    expect(retry.resume).not.toHaveBeenCalled();
    expect(failed.resume).not.toHaveBeenCalled();
  }
);
