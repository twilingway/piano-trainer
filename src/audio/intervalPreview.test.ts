import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntervalPreview, type IntervalPreviewRequest } from "./intervalPreview";

const audio = vi.hoisted(() => ({
  time: 0,
  next: 0,
  ready: true,
  jobs: new Map<number, { at: number; callback: () => void }>(),
  global: new Set<() => void>(),
  interrupted: new Set<() => void>(),
  start: vi.fn<() => Promise<void>>(),
  attack: vi.fn<(...args: unknown[]) => boolean>(),
  release: vi.fn(),
  dispose: vi.fn(),
  clear: vi.fn()
}));

vi.mock("./pianoSound", () => ({
  onPianoSoundInterrupted: (callback: () => void) => {
    audio.interrupted.add(callback);
    return () => audio.interrupted.delete(callback);
  },
  audioTime: () => audio.time,
  startPianoSound: () => audio.start(),
  pianoSoundReady: () => audio.ready,
  cancelScheduledSound: (id: number) => {
    audio.clear(id);
    audio.jobs.delete(id);
  },
  scheduleSoundObserved: (at: number, callback: () => void) => {
    const id = ++audio.next;
    audio.jobs.set(id, { at, callback });
    return id;
  }
}));
vi.mock("./scheduledVoices", () => ({
  scheduledNoteOn: (...args: unknown[]) => audio.attack(...args),
  scheduledNoteOff: (...args: unknown[]) => {
    audio.release(...args);
  },
  disposeScheduledVoice: (id: string) => {
    audio.dispose(id);
  },
  onScheduledVoicesCancelled: (callback: () => void) => {
    audio.global.add(callback);
    return () => audio.global.delete(callback);
  }
}));

const resources: ReturnType<typeof createIntervalPreview>[] = [];
function preview() {
  const resource = createIntervalPreview("ear");
  resources.push(resource);
  return resource;
}
function request(): IntervalPreviewRequest {
  return {
    runId: "run1",
    questionId: "q1",
    pitches: [60, 60],
    onStarted: vi.fn(),
    onCompleted: vi.fn(),
    onCancelled: vi.fn(),
    onError: vi.fn()
  };
}
function advance(to: number) {
  audio.time = to;
  for (const [id, job] of [...audio.jobs]) {
    if (job.at > to) continue;
    audio.jobs.delete(id);
    job.callback();
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  audio.time = 0;
  audio.next = 0;
  audio.ready = true;
  audio.jobs.clear();
  audio.start.mockResolvedValue();
  audio.attack.mockReturnValue(true);
});
afterEach(() => {
  for (const resource of resources.splice(0)) resource.dispose();
  expect(audio.global.size).toBe(0);
  expect(audio.interrupted.size).toBe(0);
});

describe("interval audio ownership and presentation", () => {
  it("cancels a brief audio suspension even when it resumes before the next observation", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    advance(0.1);
    audio.ready = false;
    for (const interrupted of audio.interrupted) interrupted();
    audio.ready = true;
    advance(2);
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith({ partial: true });
    expect(event.onCompleted).not.toHaveBeenCalled();
    expect(event.onError).toHaveBeenCalledOnce();
    expect(await owner.play(request())).toBe(true);
  });
  it("plays a sequential repeat with distinct voices and completes after both releases", async () => {
    const owner = preview();
    const event = request();
    expect(await owner.play(event)).toBe(true);
    expect(audio.attack.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      [60, 100, 0.05],
      [60, 100, 0.8]
    ]);
    expect(audio.attack.mock.calls[0]?.[3]).not.toBe(audio.attack.mock.calls[1]?.[3]);
    expect(event.onStarted).not.toHaveBeenCalled();
    advance(0.05);
    expect(event.onStarted).toHaveBeenCalledOnce();
    advance(1.3);
    expect(event.onCompleted).not.toHaveBeenCalled();
    advance(1.39);
    expect(event.onCompleted).toHaveBeenCalledOnce();
    expect(audio.dispose).toHaveBeenCalledTimes(2);
    expect(event.onCancelled).not.toHaveBeenCalled();
  });

  it("ignores repeated clicks while loading or sounding", async () => {
    let ready!: () => void;
    audio.start.mockImplementation(() => new Promise((resolve) => (ready = resolve)));
    const owner = preview();
    const first = owner.play(request());
    expect(await owner.play(request())).toBe(false);
    expect(audio.start).toHaveBeenCalledOnce();
    ready();
    await first;
    expect(await owner.play(request())).toBe(false);
    expect(audio.attack).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending load without a partial listen and blocks its late completion", async () => {
    let ready!: () => void;
    audio.start.mockImplementation(() => new Promise((resolve) => (ready = resolve)));
    const owner = preview();
    const event = request();
    const pending = owner.play(event);
    owner.cancel();
    owner.cancel();
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith({ partial: false });
    ready();
    expect(await pending).toBe(false);
    expect(audio.attack).not.toHaveBeenCalled();
    expect(event.onCompleted).not.toHaveBeenCalled();
  });

  it("removes future attacks without counting one as a partial listen", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    owner.cancel();
    expect(event.onCancelled).toHaveBeenCalledWith({ partial: false });
    expect(audio.dispose).toHaveBeenCalledTimes(2);
    expect(audio.jobs.size).toBe(0);
  });

  it("counts an actual attack as partial even before its observation callback has fired", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    audio.time = 0.06;
    owner.cancel();
    expect(event.onStarted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledWith({ partial: true });
  });

  it("global Trainer cancellation invalidates completion and does not poison a new generation", async () => {
    const owner = preview();
    const old = request();
    await owner.play(old);
    advance(0.1);
    const stale = [...audio.jobs.values()].map(({ callback }) => callback);
    for (const cancel of audio.global) cancel();
    expect(old.onCancelled).toHaveBeenCalledWith({ partial: true });
    const next = { ...request(), questionId: "q2" };
    await owner.play(next);
    for (const callback of stale) callback();
    expect(old.onCompleted).not.toHaveBeenCalled();
    expect(next.onCompleted).not.toHaveBeenCalled();
    advance(2);
    expect(next.onCompleted).toHaveBeenCalledOnce();
  });

  it("rejects silence, missing samples and loader errors, and allows a real retry", async () => {
    const owner = preview();
    audio.ready = false;
    const silent = request();
    expect(await owner.play(silent)).toBe(false);
    expect(silent.onError).toHaveBeenCalledOnce();
    expect(audio.attack).not.toHaveBeenCalled();
    audio.ready = true;
    audio.start.mockRejectedValueOnce(new Error("network"));
    const failed = request();
    expect(await owner.play(failed)).toBe(false);
    expect(failed.onError).toHaveBeenCalledOnce();
    audio.attack.mockReturnValueOnce(false);
    const missing = request();
    expect(await owner.play(missing)).toBe(false);
    expect(missing.onError).toHaveBeenCalledOnce();
    const good = request();
    expect(await owner.play(good)).toBe(true);
    advance(2);
    expect(good.onCompleted).toHaveBeenCalledOnce();
  });

  it("cannot report a full listening after audio becomes suspended or muted", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    advance(0.1);
    audio.ready = false;
    advance(2);
    expect(event.onCompleted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledWith({ partial: true });
    expect(event.onError).toHaveBeenCalledOnce();
  });

  it("disposal invalidates pending work and forbids later playback", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    const stale = [...audio.jobs.values()].map(({ callback }) => callback);
    owner.dispose();
    owner.dispose();
    for (const callback of stale) callback();
    expect(event.onCancelled).toHaveBeenCalledOnce();
    expect(event.onCompleted).not.toHaveBeenCalled();
    expect(await owner.play(request())).toBe(false);
  });
});
