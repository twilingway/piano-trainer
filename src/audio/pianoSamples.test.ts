import type * as PianoSamples from "./pianoSamples";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  decodes: [] as {
    data: ArrayBuffer;
    resolve: (buffer: AudioBuffer) => void;
    reject: (error: Error) => void;
  }[],
  buffers: vi.fn(function (decoded: AudioBuffer) {
    return { loaded: true, decoded };
  })
}));
vi.mock("tone", () => ({
  getContext: () => ({
    decodeAudioData: (data: ArrayBuffer) =>
      new Promise<AudioBuffer>((resolve, reject) => {
        control.decodes.push({ data, resolve, reject });
      })
  }),
  ToneAudioBuffer: control.buffers
}));
vi.mock("virtual:piano-sample-sizes", () => ({
  default: Object.fromEntries(
    [1, 5, 10, 15].flatMap((layer) =>
      Array.from({ length: 30 }, (_, i) => {
        const pitch = 21 + i * 3,
          names: Record<number, string> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };
        return [
          `${names[pitch % 12] ?? ""}${String(Math.floor(pitch / 12) - 1)}v${String(layer)}.mp3`,
          4
        ];
      })
    )
  )
}));

interface Request {
  url: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}
let requests: Request[];
let samples: typeof PianoSamples;
const decoded = {} as AudioBuffer;
const tick = async () => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
};
const response = () => new Response(new Uint8Array([1, 2, 3, 4]));
const finishFetches = (items = requests) => {
  items.forEach((request) => {
    request.resolve(response());
  });
};
const finishDecodes = (items = control.decodes) => {
  items.forEach((request) => {
    request.resolve(decoded);
  });
};
const criticalRequests = () => requests.filter((request) => request.url.endsWith("v10.mp3"));

beforeEach(async () => {
  vi.resetModules();
  requests = [];
  control.decodes.length = 0;
  control.buffers.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise<Response>((resolve, reject) => {
          requests.push({ url, resolve, reject });
        })
    )
  );
  samples = await import("./pianoSamples");
});
afterEach(() => vi.unstubAllGlobals());

async function readyCritical(): Promise<void> {
  const ready = samples.loadPianoSamples();
  await tick();
  finishFetches(criticalRequests());
  await tick();
  finishDecodes();
  await ready;
  await tick();
}

describe("piano sample preparation", () => {
  it("knows total body sizes before fetching and exposes stable immutable snapshots", () => {
    const initial = samples.getPianoSampleProgress();
    expect(initial).toEqual({
      critical: {
        status: "idle",
        loadedBytes: 0,
        totalBytes: 120,
        completedFiles: 0,
        totalFiles: 30
      },
      background: {
        status: "idle",
        loadedBytes: 0,
        totalBytes: 360,
        completedFiles: 0,
        totalFiles: 90
      }
    });
    expect(samples.getPianoSampleProgress()).toBe(initial);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.critical)).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("shares the critical download/decode and waits after 100% bytes without Tone callbacks", async () => {
    const first = samples.loadPianoSamples(),
      second = samples.loadPianoSamples();
    expect(second).toBe(first);
    let ready = false;
    void first.then(() => {
      ready = true;
    });
    await tick();
    expect(requests).toHaveLength(30);
    expect(requests[0]?.url).toBe("/audio/salamander-v1/A0v10.mp3");
    finishFetches();
    await tick();
    expect(control.decodes).toHaveLength(30);
    expect(samples.getPianoSampleProgress().critical).toMatchObject({
      status: "decoding",
      loadedBytes: 120,
      totalBytes: 120,
      completedFiles: 0
    });
    expect(ready).toBe(false);
    finishDecodes();
    await first;
    expect(ready).toBe(true);
    expect(samples.loadedPianoLayers()).toEqual(new Set([10]));
    expect(samples.getPianoSampleProgress().critical.status).toBe("ready");
    expect(requests).toHaveLength(120);
    expect(control.buffers).toHaveBeenCalledTimes(30);
    expect(control.buffers.mock.calls.every(([input]) => input === decoded)).toBe(true);
    expect(samples.pianoSample(10, 63)?.loaded).toBe(true);
    expect(samples.pianoSample(15, 63)).toBeUndefined();
    const warm = samples.loadPianoSamples();
    await warm;
    expect(warm).toBe(first);
    expect(requests).toHaveLength(120);
    expect(control.decodes).toHaveLength(30);
  });

  it("reports chunks as body bytes and releases progress subscriptions", async () => {
    const changed = vi.fn(),
      stop = samples.subscribePianoSampleProgress(changed);
    void samples.loadPianoSamples();
    await tick();
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    requests[0]?.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
          }
        })
      )
    );
    stream?.enqueue(new Uint8Array([1, 2]));
    await tick();
    expect(samples.getPianoSampleProgress().critical.loadedBytes).toBe(2);
    expect(changed).toHaveBeenCalled();
    stop();
    changed.mockClear();
    stream?.enqueue(new Uint8Array([3, 4]));
    stream?.close();
    await tick();
    expect(samples.getPianoSampleProgress().critical.loadedBytes).toBe(4);
    expect(changed).not.toHaveBeenCalled();
  });

  it("rejects critical failure, preserves 29 decoded files and retries only the failed fetch", async () => {
    const first = samples.loadPianoSamples(),
      rejected = expect(first).rejects.toThrow("offline");
    await tick();
    const failed = requests[0];
    failed?.reject(new Error("offline"));
    finishFetches(requests.slice(1));
    await tick();
    finishDecodes();
    await rejected;
    expect(samples.getPianoSampleProgress().critical).toMatchObject({
      status: "error",
      completedFiles: 29
    });
    expect(samples.loadedPianoLayers().has(10)).toBe(false);
    const retry = samples.loadPianoSamples();
    await tick();
    expect(criticalRequests()).toHaveLength(31);
    const retried = requests.at(-1);
    expect(retried?.url).toBe(failed?.url);
    retried?.resolve(response());
    await tick();
    expect(control.decodes).toHaveLength(30);
    control.decodes.at(-1)?.resolve(decoded);
    await retry;
    expect(samples.getPianoSampleProgress().critical.completedFiles).toBe(30);
  });

  it("rejects immediately with other files stalled and shares their work with the retry", async () => {
    const layers: number[] = [];
    samples.onPianoLayerLoaded((layer) => {
      layers.push(layer);
    });
    const first = samples.loadPianoSamples(),
      rejected = expect(first).rejects.toThrow("offline");
    await tick();
    const original = criticalRequests(),
      failed = original[0];
    failed?.reject(new Error("offline"));
    await rejected;
    expect(control.decodes).toHaveLength(0);
    expect(samples.getPianoSampleProgress().critical.status).toBe("error");
    const retry = samples.loadPianoSamples();
    expect(retry).not.toBe(first);
    expect(samples.loadPianoSamples()).toBe(retry);
    await tick();
    expect(criticalRequests()).toHaveLength(31);
    const retried = criticalRequests().at(-1);
    expect(retried?.url).toBe(failed?.url);
    finishFetches(original.slice(1));
    await tick();
    finishDecodes();
    await tick();
    expect(control.decodes).toHaveLength(29);
    expect(samples.getPianoSampleProgress().critical.completedFiles).toBe(29);
    expect(samples.loadedPianoLayers().has(10)).toBe(false);
    expect(layers).not.toContain(10);
    retried?.resolve(response());
    await tick();
    control.decodes.at(-1)?.resolve(decoded);
    await retry;
    expect(control.decodes).toHaveLength(30);
    expect(samples.loadedPianoLayers().has(10)).toBe(true);
    expect(layers).toEqual([10]);
  });

  it("retries a failed decoder from retained content without fetching that file again", async () => {
    const first = samples.loadPianoSamples(),
      rejected = expect(first).rejects.toThrow("decode");
    await tick();
    finishFetches();
    await tick();
    control.decodes[0]?.reject(new Error("decode"));
    finishDecodes(control.decodes.slice(1));
    await rejected;
    const retry = samples.loadPianoSamples();
    await tick();
    expect(criticalRequests()).toHaveLength(30);
    expect(control.decodes).toHaveLength(31);
    expect(control.decodes.at(-1)?.data).not.toBe(control.decodes[0]?.data);
    control.decodes.at(-1)?.resolve(decoded);
    await retry;
    expect(samples.getPianoSampleProgress().critical.status).toBe("ready");
  });

  it("keeps playback ready after a background failure and retries that file on a new request", async () => {
    const layers: number[] = [];
    samples.onPianoLayerLoaded((layer) => {
      layers.push(layer);
    });
    await readyCritical();
    const background = requests.filter((request) => !request.url.endsWith("v10.mp3"));
    background[0]?.reject(new Error("background offline"));
    finishFetches(background.slice(1));
    await tick();
    finishDecodes();
    await tick();
    expect(samples.getPianoSampleProgress().critical.status).toBe("ready");
    expect(samples.getPianoSampleProgress().background).toMatchObject({
      status: "error",
      completedFiles: 89
    });
    expect(layers).toEqual([10, 5, 15]);
    await samples.loadPianoSamples();
    await tick();
    expect(requests).toHaveLength(121);
    requests.at(-1)?.resolve(response());
    await tick();
    control.decodes.at(-1)?.resolve(decoded);
    await tick();
    expect(samples.getPianoSampleProgress().background.status).toBe("ready");
    expect(layers).toEqual([10, 5, 15, 1]);
  });

  it("finds the nearest sample a minor third apart", () => {
    expect([0, 21, 22, 23, 60, 61, 62, 108, 127].map(samples.nearestSamplePitch)).toEqual([
      21, 21, 21, 24, 60, 60, 63, 108, 108
    ]);
  });
});
