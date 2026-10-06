/*
 * Which recorded velocity layer of the piano sounds a note, and how loud.
 * Salamander layer k was struck at about velocity 8k. The layer changes only
 * the timbre: the loudness keeps the old single-layer curve, velocity / 127 of
 * layer 8, using each layer's measured attack loudness against layer 8.
 */
export const PIANO_LAYERS = [
  { layer: 1, velocity: 8, loudnessDb: -13 },
  { layer: 5, velocity: 40, loudnessDb: -2.9 },
  { layer: 10, velocity: 80, loudnessDb: 1.7 },
  { layer: 15, velocity: 120, loudnessDb: 7.4 }
] as const;

export type PianoLayer = (typeof PIANO_LAYERS)[number]["layer"];

/** Loaded first: the layer nearest the velocities a score and a keyboard play at. */
export const FIRST_PIANO_LAYER: PianoLayer = 10;

/**
 * The loaded layer recorded nearest `velocity` (MIDI 1-127; a tie goes to the
 * quieter one) and the linear gain to play it at; none while nothing is loaded.
 */
export function pianoLayer(
  velocity: number,
  loaded: ReadonlySet<PianoLayer>
): { readonly layer: PianoLayer; readonly gain: number } | undefined {
  const strength = Math.min(127, Math.max(1, velocity));
  let best: (typeof PIANO_LAYERS)[number] | undefined;
  for (const candidate of PIANO_LAYERS) {
    if (!loaded.has(candidate.layer)) continue;
    if (!best || Math.abs(candidate.velocity - strength) < Math.abs(best.velocity - strength))
      best = candidate;
  }
  if (!best) return undefined;
  // A quiet layer standing in for a loud one is not boosted past its recording.
  return { layer: best.layer, gain: Math.min(1, (strength / 127) * 10 ** (-best.loudnessDb / 20)) };
}
