import type { SongNote } from "../song/song";
import type { FrameState } from "./frameState";
import type { KeyRect } from "./keyboardLayout";

/** A stretch of the keyboard, in the full keyboard's pixels. */
export interface Span {
  readonly left: number;
  readonly right: number;
}

/**
 * Where the view over a keyboard wider than the screen should rest so the
 * keys to play next are on screen. `spans` are the next keys in the order
 * they come; as many of the first as fit in the view (with `margin` on each
 * side) decide. The view moves only as far as it must: keys already on screen
 * leave it where it is, so it does not drift with every note.
 */
export function panToShow(
  current: number,
  spans: readonly Span[],
  viewWidth: number,
  totalWidth: number,
  margin: number
): number {
  const maxPan = Math.max(0, totalWidth - viewWidth);
  const clamp = (pan: number) => Math.min(maxPan, Math.max(0, pan));
  const first = spans[0];
  if (!first) return clamp(current);
  let low = first.left;
  let high = first.right;
  for (let index = 1; index < spans.length; index++) {
    const span = spans[index];
    if (!span) break;
    const nextLow = Math.min(low, span.left);
    const nextHigh = Math.max(high, span.right);
    if (nextHigh - nextLow + margin * 2 > viewWidth) break;
    low = nextLow;
    high = nextHigh;
  }
  if (high - low + margin * 2 > viewWidth) {
    // Even the next keys alone are wider than the view: centre on them.
    return clamp((low + high) / 2 - viewWidth / 2);
  }
  if (low - margin < current) return clamp(low - margin);
  if (high + margin > current + viewWidth) return clamp(high + margin - viewWidth);
  return clamp(current);
}

/** Moves `pan` towards `target`: `smoothing` seconds carry it about two thirds of the way. */
export function easePan(
  pan: number,
  target: number,
  deltaSeconds: number,
  smoothing: number
): number {
  if (smoothing <= 0) return target;
  return pan + (target - pan) * (1 - Math.exp(-deltaSeconds / smoothing));
}

/** Preserve the player's scroll relative to the keyboard centre when its viewport changes. */
export function panAfterResize(
  pan: number,
  previous: { readonly width: number; readonly total: number },
  next: { readonly width: number; readonly total: number }
): number {
  const overflow = next.total - next.width;
  if (overflow <= 0) return overflow / 2;
  const reframed = pan + (overflow - previous.total + previous.width) / 2;
  return Math.max(0, Math.min(overflow, reframed));
}

/** The first upcoming owned keys, bounded so a long score does not allocate per frame. */
export function upcomingSpans(
  state: FrameState,
  notes: readonly SongNote[],
  keys: ReadonlyMap<number, KeyRect>
): Span[] {
  const until = state.time + state.lookAhead * 0.6;
  const spans: Span[] = [];
  for (const note of notes) {
    if (note.start >= until) break;
    if (note.start + note.duration <= state.time) continue;
    if (state.hands.size > 0 && !state.owns(note)) continue;
    const key = keys.get(note.pitch);
    if (key) spans.push({ left: key.x, right: key.x + key.width });
    if (spans.length >= 24) break;
  }
  return spans;
}
