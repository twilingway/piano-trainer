import type { Hand } from "../fingering/fingering";
import { ownsNote } from "../practice/playableRange";
import type { PlayableRange } from "../practice/playableRange";
import type { SongNote } from "../song/song";

/** Keyboards by their number of keys; "88" is the whole piano and limits nothing. */
export const DEVICE_PRESETS = ["88", "76", "61", "49", "37", "25"] as const;
export type DevicePreset = (typeof DEVICE_PRESETS)[number];

/** The player's keyboard: a preset or the keys they captured. */
export type DeviceRange =
  | { readonly preset: DevicePreset }
  | { readonly preset: "custom"; readonly low: number; readonly high: number };

/** The lowest and highest keys of common instruments; a capture fixes a shifted controller. */
const PRESET_KEYS: Readonly<Record<DevicePreset, PlayableRange>> = {
  "88": { low: 21, high: 108 },
  "76": { low: 28, high: 103 },
  "61": { low: 36, high: 96 },
  "49": { low: 36, high: 84 },
  "37": { low: 48, high: 84 },
  "25": { low: 48, high: 72 }
};

export const DEFAULT_DEVICE_RANGE: DeviceRange = { preset: "88" };

const PIANO = PRESET_KEYS["88"];

/** The keys a range spans. */
export function deviceKeys(range: DeviceRange): PlayableRange {
  return range.preset === "custom"
    ? { low: range.low, high: range.high }
    : PRESET_KEYS[range.preset];
}

/** What a session is limited to: nothing for the whole piano, so notes past it stay the player's. */
export function playableOf(range: DeviceRange): PlayableRange | undefined {
  const keys = deviceKeys(range);
  return keys.low <= PIANO.low && keys.high >= PIANO.high ? undefined : keys;
}

/** A stored range, or the whole piano when it is missing or broken. */
export function parseDeviceRange(value: unknown): DeviceRange {
  if (!value || typeof value !== "object") return DEFAULT_DEVICE_RANGE;
  const raw = value as Record<string, unknown>;
  if ((DEVICE_PRESETS as readonly unknown[]).includes(raw.preset)) {
    return { preset: raw.preset as DevicePreset };
  }
  const { low, high } = raw;
  if (
    raw.preset === "custom" &&
    Number.isInteger(low) &&
    Number.isInteger(high) &&
    (low as number) >= PIANO.low &&
    (low as number) < (high as number) &&
    (high as number) <= PIANO.high
  ) {
    return { preset: "custom", low: low as number, high: high as number };
  }
  return DEFAULT_DEVICE_RANGE;
}

/** Capturing a range: the first key pressed, then the range once a second one comes. */
export type RangeCapture =
  | { readonly step: "first" }
  | { readonly step: "second"; readonly first: number }
  | { readonly step: "done"; readonly range: DeviceRange };

/** The next state of a capture after a key: the same key twice is not a range. */
export function captureKey(capture: RangeCapture, pitch: number): RangeCapture {
  if (capture.step === "first") return { step: "second", first: pitch };
  if (capture.step === "done" || capture.first === pitch) return capture;
  return {
    step: "done",
    range: {
      preset: "custom",
      low: Math.max(PIANO.low, Math.min(capture.first, pitch)),
      high: Math.min(PIANO.high, Math.max(capture.first, pitch))
    }
  };
}

/** How many notes of the hands lie off the keyboard. */
export function outsideCount(
  notes: readonly SongNote[],
  hands: ReadonlySet<Hand>,
  playable: PlayableRange | undefined
): number {
  if (!playable) return 0;
  let count = 0;
  for (const note of notes) {
    if (hands.has(note.hand) && !ownsNote(note, hands, playable)) count++;
  }
  return count;
}

const OCTAVE_SHIFTS = [0, -1, 1, -2, 2] as const;

/**
 * The octave shift, within two either way, that leaves the fewest notes of the hands off the
 * keyboard; the smaller shift on a tie, and 0 when none helps. `octave` is the current shift.
 */
export function bestOctaveShift(
  notes: readonly SongNote[],
  hands: ReadonlySet<Hand>,
  playable: PlayableRange | undefined,
  octave = 0
): number {
  if (!playable) return octave;
  const outsideAt = (shift: number) =>
    outsideCount(notes, hands, {
      low: playable.low - (shift - octave) * 12,
      high: playable.high - (shift - octave) * 12
    });
  let best = octave;
  let fewest = outsideAt(octave);
  for (const shift of OCTAVE_SHIFTS) {
    const count = outsideAt(shift);
    if (count < fewest) {
      best = shift;
      fewest = count;
    }
  }
  return best;
}
