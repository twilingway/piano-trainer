import type { KeyRect } from "./keyboardLayout";
import { whiteKeysBetween } from "./keyboardLayout";

/** G2–A3 in bass, E4–F5 in treble: the natural notes on the ten staff lines. */
export const STAFF_LINE_PITCHES = [43, 47, 50, 53, 57, 64, 67, 71, 74, 77] as const;

/** Missing notes continue outside the selected keyboard range rather than landing on another key. */
export function staffLineTargets(keys: ReadonlyMap<number, KeyRect>): readonly number[] {
  const first = [...keys.values()].find((key) => !key.black);
  if (!first) return [];
  return STAFF_LINE_PITCHES.map((pitch) => {
    const key = keys.get(pitch);
    if (key) return key.x + key.width / 2;
    const distance =
      pitch >= first.pitch
        ? whiteKeysBetween(first.pitch, pitch) - 1
        : -whiteKeysBetween(pitch, first.pitch - 1);
    return first.x + (distance + 0.5) * first.width;
  });
}
