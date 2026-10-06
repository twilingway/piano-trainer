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

/** Settles once the layer is in, or once a file of it fails: then it never counts as loaded. */
function loadLayer(layer: PianoLayer): Promise<void> {
  return new Promise((resolve) => {
    buffers.set(
      layer,
      new Tone.ToneAudioBuffers({
        urls: Object.fromEntries(SAMPLE_PITCHES.map((pitch) => [pitch, fileName(pitch, layer)])),
        baseUrl: BASE_URL,
        onload: () => {
          loaded.add(layer);
          for (const listener of listeners) listener(layer);
          resolve();
        },
        onerror: () => {
          resolve();
        }
      })
    );
  });
}

/** Loads the middle layer, then the others in the background; resolves when the first settles. */
export function loadPianoSamples(): Promise<void> {
  firstLayer ??= loadLayer(FIRST_PIANO_LAYER).then(() => {
    for (const { layer } of PIANO_LAYERS) if (layer !== FIRST_PIANO_LAYER) void loadLayer(layer);
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
