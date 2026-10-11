import type * as PianoSamples from "./pianoSamples";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tone = vi.hoisted(() => ({
  requests: [] as {
    urls: Record<string, string>;
    baseUrl: string;
    onload: () => void;
    onerror: () => void;
  }[]
}));

vi.mock("tone", () => ({
  ToneAudioBuffers: vi.fn(function (options: (typeof tone.requests)[number]) {
    tone.requests.push(options);
    return { get: (pitch: number) => `buffer:${String(pitch)}`, dispose: vi.fn() };
  })
}));

type Samples = typeof PianoSamples;
let samples: Samples;

beforeEach(async () => {
  vi.resetModules();
  tone.requests.length = 0;
  samples = await import("./pianoSamples");
});

function layerOf(request: (typeof tone.requests)[number]): string {
  return /v(\d+)\.mp3$/.exec(Object.values(request.urls)[0] ?? "")?.[1] ?? "";
}

describe("piano samples", () => {
  it("loads the middle layer from this site first, then the others", async () => {
    const first = samples.loadPianoSamples();
    expect(tone.requests.map(layerOf)).toEqual(["10"]);
    expect(tone.requests[0]?.baseUrl).toBe("/audio/salamander-v1/");
    expect(tone.requests[0]?.urls).toMatchObject({
      21: "A0v10.mp3",
      63: "Ds4v10.mp3",
      108: "C8v10.mp3"
    });
    expect(Object.keys(tone.requests[0]?.urls ?? {})).toHaveLength(30);
    tone.requests[0]?.onload();
    await first;
    expect(samples.loadedPianoLayers()).toEqual(new Set([10]));
    expect(tone.requests.map(layerOf)).toEqual(["10", "1", "5", "15"]);
    expect(samples.pianoSample(10, 63)).toBe("buffer:63");
    expect(samples.pianoSample(15, 63)).toBeUndefined();
  });

  it("leaves a failed layer out and keeps loading the rest", async () => {
    const loadedLayers: number[] = [];
    samples.onPianoLayerLoaded((layer) => loadedLayers.push(layer));
    const first = samples.loadPianoSamples();
    const rejected = expect(first).rejects.toThrow("Piano samples could not be loaded");
    tone.requests[0]?.onerror();
    await rejected;
    for (const request of tone.requests.slice(1)) request.onload();
    expect(loadedLayers).toEqual([1, 5, 15]);
    expect(samples.loadedPianoLayers().has(10)).toBe(false);
  });

  it("really retries failed first samples and ignores late success from that failed load", async () => {
    const first = samples.loadPianoSamples();
    const rejected = expect(first).rejects.toThrow();
    const failed = tone.requests[0];
    failed?.onerror();
    await rejected;
    const retried = samples.loadPianoSamples();
    expect(tone.requests.map(layerOf)).toEqual(["10", "1", "5", "15", "10"]);
    failed?.onload();
    expect(samples.loadedPianoLayers().has(10)).toBe(false);
    tone.requests[4]?.onload();
    await retried;
    expect(samples.loadedPianoLayers().has(10)).toBe(true);
  });

  it("loads once however often the sound starts", () => {
    void samples.loadPianoSamples();
    void samples.loadPianoSamples();
    expect(tone.requests).toHaveLength(1);
  });

  it("finds the nearest sample a minor third apart", () => {
    expect([0, 21, 22, 23, 60, 61, 62, 108, 127].map(samples.nearestSamplePitch)).toEqual([
      21, 21, 21, 24, 60, 60, 63, 108, 108
    ]);
  });
});
