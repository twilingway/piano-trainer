import * as Tone from "tone";
import sizes from "virtual:piano-sample-sizes";
import { FIRST_PIANO_LAYER, PIANO_LAYERS, type PianoLayer } from "./pianoLayers";

const BASE_URL = `${import.meta.env.BASE_URL}audio/salamander-v1/`;
const FILE_NAMES: Partial<Record<number, string>> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };
export const SAMPLE_PITCHES: readonly number[] = Array.from({ length: 30 }, (_, i) => 21 + i * 3);

export type SampleGroupProgress = Readonly<{
  readonly status: "idle" | "loading" | "decoding" | "ready" | "error";
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly completedFiles: number;
  readonly totalFiles: number;
}>;
export type PianoSampleProgress = Readonly<{
  readonly critical: SampleGroupProgress;
  readonly background: SampleGroupProgress;
}>;

interface SampleFile {
  readonly name: string;
  readonly layer: PianoLayer;
  readonly pitch: number;
  status: SampleGroupProgress["status"];
  loadedBytes: number;
  totalBytes: number;
  body?: Uint8Array<ArrayBuffer>;
  sample?: Tone.ToneAudioBuffer;
  pending?: Promise<void> | undefined;
}

const files = PIANO_LAYERS.flatMap(({ layer }) =>
  SAMPLE_PITCHES.map((pitch): SampleFile => {
    const name = `${FILE_NAMES[pitch % 12] ?? ""}${String(Math.floor(pitch / 12) - 1)}v${String(layer)}.mp3`;
    const totalBytes = sizes[name];
    if (totalBytes === undefined || totalBytes <= 0)
      throw new Error(`Missing piano sample size: ${name}`);
    return { name, layer, pitch, status: "idle", loadedBytes: 0, totalBytes };
  })
);
const loaded = new Set<PianoLayer>();
const byLayer = new Map(
  PIANO_LAYERS.map(({ layer }) => [
    layer,
    new Map(files.filter((file) => file.layer === layer).map((file) => [file.pitch, file]))
  ])
);
const listeners = new Set<(layer: PianoLayer) => void>();
const progressListeners = new Set<() => void>();
const loading = new Map<PianoLayer, Promise<void>>();
let firstLayer: Promise<void> | undefined;

function groupProgress(critical: boolean): SampleGroupProgress {
  const group = files.filter((file) => (file.layer === FIRST_PIANO_LAYER) === critical);
  const completedFiles = group.filter((file) => file.status === "ready").length;
  const status =
    completedFiles === group.length
      ? "ready"
      : group.some((file) => file.status === "error")
        ? "error"
        : group.some((file) => file.status === "loading")
          ? "loading"
          : group.some((file) => file.status === "decoding")
            ? "decoding"
            : "idle";
  return Object.freeze({
    status,
    completedFiles,
    totalFiles: group.length,
    loadedBytes: group.reduce((sum, file) => sum + file.loadedBytes, 0),
    totalBytes: group.reduce((sum, file) => sum + file.totalBytes, 0)
  });
}

let progress: PianoSampleProgress = Object.freeze({
  critical: groupProgress(true),
  background: groupProgress(false)
});

function publish(): void {
  const next = Object.freeze({ critical: groupProgress(true), background: groupProgress(false) });
  if (JSON.stringify(next) === JSON.stringify(progress)) return;
  progress = next;
  for (const listener of progressListeners) listener();
}

/** Stable immutable snapshots are safe for useSyncExternalStore, including before the first gesture. */
export const getPianoSampleProgress = (): PianoSampleProgress => progress;
export function subscribePianoSampleProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

async function receive(file: SampleFile): Promise<Uint8Array<ArrayBuffer>> {
  file.loadedBytes = 0;
  file.status = "loading";
  publish();
  const response = await fetch(BASE_URL + file.name);
  if (!response.ok) throw new Error(`Piano sample HTTP ${String(response.status)}: ${file.name}`);
  const chunks: Uint8Array[] = [];
  const received = (chunk: Uint8Array) => {
    chunks.push(chunk);
    file.loadedBytes += chunk.byteLength;
    file.totalBytes = Math.max(file.totalBytes, file.loadedBytes);
    publish();
  };
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else received(new Uint8Array(await response.arrayBuffer()));
  const body = new Uint8Array(file.loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  file.totalBytes = body.byteLength;
  return body;
}

function loadFile(file: SampleFile): Promise<void> {
  if (file.sample) return Promise.resolve();
  if (file.pending) return file.pending;
  file.pending = Promise.resolve()
    .then(async () => {
      try {
        file.body ??= await receive(file);
        file.status = "decoding";
        publish();
        // A decoder may detach its input; retain the downloaded body for decoder-only retries.
        const decoded = await Tone.getContext().decodeAudioData(file.body.slice().buffer);
        file.sample = new Tone.ToneAudioBuffer(decoded);
        file.status = "ready";
        delete file.body;
        publish();
      } catch (error) {
        file.status = "error";
        publish();
        throw error;
      }
    })
    .finally(() => {
      file.pending = undefined;
    });
  return file.pending;
}

/** Each layer owns readiness; ready AudioBuffers never rely on ToneAudioBuffers.onload. */
function loadLayer(layer: PianoLayer): Promise<void> {
  if (loaded.has(layer)) return Promise.resolve();
  const pending = loading.get(layer);
  if (pending) return pending;
  const request = Promise.all(files.filter((file) => file.layer === layer).map(loadFile))
    .then(() => {
      if (loading.get(layer) !== request) return;
      loaded.add(layer);
      for (const listener of listeners) listener(layer);
    })
    .finally(() => {
      if (loading.get(layer) === request) loading.delete(layer);
    });
  loading.set(layer, request);
  return request;
}

function startBackground(): void {
  for (const { layer } of PIANO_LAYERS)
    if (layer !== FIRST_PIANO_LAYER) void loadLayer(layer).catch(() => undefined);
}

/** Only v10 blocks playback; a new request retries failed files while sharing all useful work. */
export function loadPianoSamples(): Promise<void> {
  if (loaded.has(FIRST_PIANO_LAYER)) startBackground();
  firstLayer ??= loadLayer(FIRST_PIANO_LAYER)
    .catch((error: unknown) => {
      firstLayer = undefined;
      throw error;
    })
    .finally(startBackground);
  return firstLayer;
}

export function loadedPianoLayers(): ReadonlySet<PianoLayer> {
  return loaded;
}
export function onPianoLayerLoaded(listener: (layer: PianoLayer) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function pianoSample(layer: PianoLayer, pitch: number): Tone.ToneAudioBuffer | undefined {
  return loaded.has(layer) ? byLayer.get(layer)?.get(pitch)?.sample : undefined;
}
export function nearestSamplePitch(pitch: number): number {
  const index = Math.round((pitch - 21) / 3);
  return 21 + Math.min(SAMPLE_PITCHES.length - 1, Math.max(0, index)) * 3;
}
