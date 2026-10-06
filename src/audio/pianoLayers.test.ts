import { describe, expect, it } from "vitest";
import { PIANO_LAYERS, type PianoLayer, pianoLayer } from "./pianoLayers";

const ALL = new Set<PianoLayer>([1, 5, 10, 15]);

/** The loudness a note comes out at: the layer's own loudness plus the gain. */
function loudnessDb(velocity: number, loaded: ReadonlySet<PianoLayer>): number {
  const pick = pianoLayer(velocity, loaded);
  const layer = PIANO_LAYERS.find((candidate) => candidate.layer === pick?.layer);
  if (!pick || !layer) throw new Error("no layer");
  return layer.loudnessDb + 20 * Math.log10(pick.gain);
}

describe("pianoLayer", () => {
  it("splits the velocities at 24, 60 and 100", () => {
    const layers = [1, 24, 25, 60, 61, 100, 101, 127].map((v) => pianoLayer(v, ALL)?.layer);
    expect(layers).toEqual([1, 1, 5, 5, 10, 10, 15, 15]);
  });

  it("keeps the old loudness curve whichever layer sounds", () => {
    for (const velocity of [1, 24, 25, 64, 100, 101, 127])
      expect(loudnessDb(velocity, ALL)).toBeCloseTo(20 * Math.log10(velocity / 127), 9);
    expect(loudnessDb(80, new Set<PianoLayer>([10]))).toBeCloseTo(20 * Math.log10(80 / 127), 9);
  });

  it("falls back to the nearest loaded layer", () => {
    expect(pianoLayer(127, new Set<PianoLayer>([10]))?.layer).toBe(10);
    expect(pianoLayer(1, new Set<PianoLayer>([10, 15]))?.layer).toBe(10);
    expect(pianoLayer(110, new Set<PianoLayer>([1, 5, 10]))?.layer).toBe(10);
  });

  it("plays nothing before a layer arrives", () => {
    expect(pianoLayer(90, new Set())).toBeUndefined();
  });

  it("never boosts a layer above its recording", () => {
    expect(pianoLayer(127, ALL)?.gain).toBeLessThan(1);
    expect(pianoLayer(127, new Set<PianoLayer>([1]))?.gain).toBe(1);
  });
});
