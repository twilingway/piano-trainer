import * as Tone from "tone";
import { FIRST_PIANO_LAYER, PIANO_LAYERS, type PianoLayer } from "./pianoLayers";

/*
 * The Salamander grand samples this site serves: every minor third from A0 to
 * C8, one set a velocity layer. Each layer is fetched and decoded once and
 * shared by the live sampler and the scheduled voices.
 */
const BASE_URL = `${import.meta.env.BASE_URL}audio/salamander-v1/`;
const FILE_NAMES: Partial<Record<number, string>> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };

export const SAMPLE_PITCHES: readonly number[] = Array.from({ length: 30 }, (_, i) => 21 + i * 3);

function fileName(pitch: number, layer: PianoLayer): string {
  return `${FILE_NAMES[pitch % 12] ?? ""}${String(Math.floor(pitch / 12) - 1)}v${String(layer)}.mp3`;
}

const buffers = new Map<PianoLayer, Tone.ToneAudioBuffers>();
const loaded = new Set<PianoLayer>();
const listeners = new Set<(layer: PianoLayer) => void>();
let firstLayer: Promise<void> | undefined;
const loading = new Map<PianoLayer, Promise<void>>();

/** A failed layer is never ready and can be fetched again on the next gesture. */
function loadLayer(layer: PianoLayer): Promise<void> {
  if (loaded.has(layer)) return Promise.resolve();
  const pending = loading.get(layer);
  if (pending) return pending;
  buffers.get(layer)?.dispose();
  const request = new Promise<void>((resolve, reject) => {
    let settled = false;
    buffers.set(
      layer,
      new Tone.ToneAudioBuffers({
        urls: Object.fromEntries(SAMPLE_PITCHES.map((pitch) => [pitch, fileName(pitch, layer)])),
        baseUrl: BASE_URL,
        onload: () => {
          if (settled) return;
          settled = true;
          loaded.add(layer);
          for (const listener of listeners) listener(layer);
          resolve();
        },
        onerror: () => {
          if (settled) return;
          settled = true;
          reject(new Error("Piano samples could not be loaded"));
        }
      })
    );
  });
  const tracked = request.finally(() => loading.delete(layer));
  loading.set(layer, tracked);
  return tracked;
}

/** Loads the middle layer, then the others; errors reject and leave the first layer retryable. */
export function loadPianoSamples(): Promise<void> {
  firstLayer ??= loadLayer(FIRST_PIANO_LAYER)
    .catch((error: unknown) => {
      firstLayer = undefined;
      throw error;
    })
    .finally(() => {
      for (const { layer } of PIANO_LAYERS)
        if (layer !== FIRST_PIANO_LAYER) void loadLayer(layer).catch(() => undefined);
    });
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

/** A loaded layer's sample recorded at `pitch`, one of `SAMPLE_PITCHES`. */
export function pianoSample(layer: PianoLayer, pitch: number): Tone.ToneAudioBuffer | undefined {
  return loaded.has(layer) ? buffers.get(layer)?.get(pitch) : undefined;
}

export function nearestSamplePitch(pitch: number): number {
  const index = Math.round((pitch - 21) / 3);
  return 21 + Math.min(SAMPLE_PITCHES.length - 1, Math.max(0, index)) * 3;
}
