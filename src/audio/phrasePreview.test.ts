import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhrasePreview } from "./phrasePreview";
import type { PhrasePreviewRequest } from "./phrasePreview";
import type { MusicNote } from "../musicLearning/types";

const audio = vi.hoisted(() => ({
  time: 0,
  next: 0,
  ready: true,
  jobs: new Map<number, { at: number; callback: () => void }>(),
  global: new Set<() => void>(),
  interrupted: new Set<() => void>(),
  start: vi.fn<() => Promise<void>>(),
  attack: vi.fn<(...args: unknown[]) => boolean>(),
  release: vi.fn<(...args: unknown[]) => void>(),
  dispose: vi.fn(),
  clear: vi.fn(),
  check: vi.fn()
}));
vi.mock("./pianoSound", () => ({
  onPianoSoundInterrupted: (callback: () => void) => {
    audio.interrupted.add(callback);
    return () => audio.interrupted.delete(callback);
  },
  audioTime: () => audio.time,
  startPianoSound: () => audio.start(),
  pianoSoundReady: (pitches: readonly number[]) => {
    audio.check(pitches);
    return audio.ready;
  },
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
const resources: ReturnType<typeof createPhrasePreview>[] = [];
function preview() {
  const resource = createPhrasePreview("dictation");
  resources.push(resource);
  return resource;
}
function notes(length = 3): readonly MusicNote[] {
  return Array.from({ length }, (_, index) => ({
    pitch: 60 + index,
    startBeat: index,
    durationBeats: 1,
    hand: "right"
  }));
}
function request(
  material: PhrasePreviewRequest["material"] = { bpm: 120, notes: notes() }
): PhrasePreviewRequest {
  return {
    runId: "run-1",
    presentationId: "presentation-1",
    playbackId: "play-1",
    material,
    onStarted: vi.fn(),
    onCompleted: vi.fn(),
    onCancelled: vi.fn(),
    onError: vi.fn()
  };
}
function advance(to: number) {
  audio.time = to;
  for (const [id, job] of [...audio.jobs].sort((left, right) => left[1].at - right[1].at)) {
    if (job.at > to || !audio.jobs.has(id)) continue;
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

describe("engine-observed phrase preview", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "plays the whole %i-note phrase with exact pitches and release times",
    async (length) => {
      const owner = preview();
      const event = request({ bpm: 120, notes: notes(length) });
      expect(await owner.play(event)).toBe(true);
      expect(audio.attack.mock.calls.map((call) => call.slice(0, 3))).toEqual(
        notes(length).map((note) => [note.pitch, 100, 0.05 + note.startBeat * 0.5])
      );
      expect(audio.release.mock.calls.map((call) => call.slice(0, 2))).toEqual(
        notes(length).map((note) => [note.pitch, 0.05 + (note.startBeat + 1) * 0.5])
      );
      expect(new Set(audio.attack.mock.calls.map((call) => call[3])).size).toBe(length);
      expect(event.onStarted).not.toHaveBeenCalled();
      advance(0.05);
      expect(event.onStarted).toHaveBeenCalledOnce();
      expect(event.onStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          evidence: "engine-observed",
          firstAttackAudioSeconds: 0.05,
          runId: "run-1",
          presentationId: "presentation-1",
          playbackId: "play-1"
        })
      );
      advance(0.05 + length * 0.5);
      expect(event.onCompleted).not.toHaveBeenCalled();
      advance(0.05 + length * 0.5 + 0.081);
      expect(event.onCompleted).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          evidence: "engine-observed",
          observedAttacks: length,
          observedReleases: length,
          totalNotes: length
        })
      );
      expect(event.onCancelled).not.toHaveBeenCalled();
      expect(audio.dispose).toHaveBeenCalledTimes(length);
    }
  );
  it("preserves studied durations and rests using beats and BPM", async () => {
    const owner = preview();
    await owner.play(
      request({
        bpm: 60,
        notes: [
          { pitch: 60, startBeat: 3, durationBeats: 0.5, hand: "right" },
          { pitch: 60, startBeat: 5, durationBeats: 2, hand: "right" }
        ]
      })
    );
    expect(audio.attack.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      [60, 100, 0.05],
      [60, 100, 2.05]
    ]);
    expect(audio.release.mock.calls[0]?.[1]).toBeCloseTo(0.55);
    expect(audio.release.mock.calls[1]?.[1]).toBeCloseTo(4.05);
  });
  it("supports a simultaneous harmony reference and a sequence of chord groups", async () => {
    const owner = preview();
    const chord: readonly MusicNote[] = [60, 64, 67].map((pitch) => ({
      pitch,
      startBeat: 0,
      durationBeats: 2,
      hand: "right"
    }));
    const event = request({ bpm: 120, notes: chord });
    await owner.play(event);
    expect(audio.attack.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      [60, 100, 0.05],
      [64, 100, 0.05],
      [67, 100, 0.05]
    ]);
    advance(2);
    expect(event.onStarted).toHaveBeenCalledOnce();
    expect(event.onCompleted).toHaveBeenCalledOnce();
    expect(
      await owner.play(
        request({
          bpm: 120,
          notes: [...chord, ...chord.map((note) => ({ ...note, startBeat: 2 }))]
        })
      )
    ).toBe(true);
  });
  it("rejects concurrent clicks during sample loading and while sounding", async () => {
    let ready!: () => void;
    audio.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        })
    );
    const owner = preview();
    const pending = owner.play(request());
    expect(await owner.play(request())).toBe(false);
    ready();
    expect(await pending).toBe(true);
    expect(await owner.play(request())).toBe(false);
    expect(audio.start).toHaveBeenCalledOnce();
  });
  it("cancels pending loading before first sound without spending a listening", async () => {
    let ready!: () => void;
    audio.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        })
    );
    const owner = preview();
    const event = request();
    const pending = owner.play(event);
    owner.cancel();
    owner.cancel();
    ready();
    expect(await pending).toBe(false);
    expect(event.onStarted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        partial: false,
        firstAttackAudioSeconds: null
      })
    );
    expect(audio.attack).not.toHaveBeenCalled();
    expect(event.onCompleted).not.toHaveBeenCalled();
  });
  it("cancels future scheduled attacks before first sound", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    owner.cancel();
    expect(event.onStarted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledWith(expect.objectContaining({ partial: false }));
    expect(audio.dispose).toHaveBeenCalledTimes(3);
    expect(audio.jobs.size).toBe(0);
  });
  it("acknowledges the actual audio-clock start even if cancel beats its JS observation", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    audio.time = 0.06;
    owner.cancel();
    expect(event.onStarted).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ firstAttackAudioSeconds: 0.05 })
    );
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ partial: true })
    );
    expect(event.onCompleted).not.toHaveBeenCalled();
  });
  it("does not infer a first sound from elapsed audio time when muted before late cancellation", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    audio.ready = false;
    audio.time = 0.06;
    owner.cancel();
    expect(event.onStarted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        partial: false,
        firstAttackAudioSeconds: null,
        observedAttacks: 0
      })
    );
    expect(event.onCompleted).not.toHaveBeenCalled();
    expect(audio.jobs.size).toBe(0);
  });
  it("does not infer a first sound while suspended before any first-sound observation", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    audio.ready = false;
    audio.time = 0.06;
    for (const interrupted of audio.interrupted) interrupted();
    owner.cancel();
    expect(event.onStarted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        partial: false,
        firstAttackAudioSeconds: null,
        observedAttacks: 0
      })
    );
    expect(event.onError).toHaveBeenCalledOnce();
    audio.ready = true;
    advance(10);
    expect(event.onCompleted).not.toHaveBeenCalled();
  });
  it("rejects silence, failed loading and missing samples before sound, and permits retry", async () => {
    const owner = preview();
    audio.ready = false;
    const silent = request();
    expect(await owner.play(silent)).toBe(false);
    expect(silent.onError).toHaveBeenCalledOnce();
    expect(silent.onStarted).not.toHaveBeenCalled();
    expect(silent.onCancelled).toHaveBeenCalledWith(expect.objectContaining({ partial: false }));
    audio.ready = true;
    audio.start.mockRejectedValueOnce(new Error("network"));
    const failed = request();
    expect(await owner.play(failed)).toBe(false);
    expect(failed.onStarted).not.toHaveBeenCalled();
    audio.attack.mockReturnValueOnce(false);
    const missing = request();
    expect(await owner.play(missing)).toBe(false);
    expect(missing.onStarted).not.toHaveBeenCalled();
    expect(missing.onError).toHaveBeenCalledOnce();
    expect(await owner.play(request())).toBe(true);
  });
  it("rejects invalid plans before scheduling voices", async () => {
    const owner = preview();
    for (const material of [
      { bpm: 0, notes: notes() },
      { bpm: 120, notes: [] },
      { bpm: 120, notes: notes(9) }
    ])
      expect(await owner.play(request(material))).toBe(false);
    expect(audio.attack).not.toHaveBeenCalled();
    expect(audio.start).not.toHaveBeenCalled();
  });
  it("cancels context suspension even when resumed before the next observation", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    advance(0.1);
    audio.ready = false;
    for (const interrupted of audio.interrupted) interrupted();
    audio.ready = true;
    advance(10);
    expect(event.onCompleted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ partial: true })
    );
    expect(event.onError).toHaveBeenCalledOnce();
  });
  it("rechecks readiness at every attack/release and refuses a full muted phrase", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    advance(0.05);
    expect(audio.check).toHaveBeenLastCalledWith([60, 61, 62]);
    audio.ready = false;
    advance(0.55);
    expect(event.onCancelled).toHaveBeenCalledWith(expect.objectContaining({ partial: true }));
    expect(event.onError).toHaveBeenCalledOnce();
    advance(10);
    expect(event.onCompleted).not.toHaveBeenCalled();
  });
  it("does not call muted-before-first-observation silence an actual first sound", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    audio.ready = false;
    advance(0.05);
    expect(event.onStarted).not.toHaveBeenCalled();
    expect(event.onCancelled).toHaveBeenCalledWith(expect.objectContaining({ partial: false }));
  });
  it("does not complete when end arrives before required attack/release observations", async () => {
    const owner = preview();
    const event = request();
    await owner.play(event);
    audio.time = 10;
    const final = [...audio.jobs.values()].sort((left, right) => right.at - left.at)[0];
    final?.callback();
    expect(event.onCompleted).not.toHaveBeenCalled();
    expect(event.onError).toHaveBeenCalledOnce();
  });
  it("global cancellation clears only owned voices and stale callbacks cannot complete a new generation", async () => {
    const owner = preview();
    const old = request();
    await owner.play(old);
    advance(0.1);
    const stale = [...audio.jobs.values()].map((job) => job.callback);
    for (const cancel of audio.global) cancel();
    const next = { ...request(), presentationId: "presentation-2", playbackId: "play-2" };
    await owner.play(next);
    for (const callback of stale) callback();
    expect(old.onCompleted).not.toHaveBeenCalled();
    expect(next.onCompleted).not.toHaveBeenCalled();
    advance(10);
    expect(next.onCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ presentationId: "presentation-2", playbackId: "play-2" })
    );
    expect(
      audio.dispose.mock.calls.every(([id]) => typeof id === "string" && id.startsWith("phrase:"))
    ).toBe(true);
  });
  it("disposal invalidates pending callbacks and unsubscribes without cancelling other previews", async () => {
    const owner = preview();
    const other = preview();
    const old = request();
    const next = request();
    await owner.play(old);
    await other.play(next);
    const stale = [...audio.jobs.values()].map((job) => job.callback);
    owner.dispose();
    owner.dispose();
    for (const callback of stale) callback();
    expect(old.onCompleted).not.toHaveBeenCalled();
    expect(next.onStarted).not.toHaveBeenCalled();
    expect(next.onCompleted).not.toHaveBeenCalled();
    expect(old.onCancelled).toHaveBeenCalledOnce();
    expect(await owner.play(request())).toBe(false);
    advance(10);
    expect(next.onCompleted).toHaveBeenCalledOnce();
    expect(next.onCancelled).not.toHaveBeenCalled();
  });
});
