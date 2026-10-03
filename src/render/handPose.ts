import type { Finger, Hand } from "../fingering/fingering";
import type { KeyRect } from "./keyboardLayout";

export const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/**
 * Where one fingertip rests: across the keyboard, and how far in it reaches,
 * 0 on a white key's front, 1 in among the black keys. A number, not a flag,
 * so a finger moving onto a black key slides in rather than jumping.
 */
export interface Tip {
  readonly x: number;
  readonly reach: number;
}

/** A hand over the keyboard: every fingertip, and the fingers pressing now. */
export interface HandPose {
  readonly hand: Hand;
  readonly tips: Readonly<Record<Finger, Tip>>;
  readonly down: ReadonlySet<Finger>;
}

/** A note the hand plays next, reduced to what places a finger. */
export interface PlacedNote {
  readonly pitch: number;
  readonly finger?: Finger | undefined;
}

/**
 * The hand over the notes it plays next. A finger with a note sits over the
 * middle of its key; a finger without one lies between its neighbours, or a
 * white key further on past the last placed finger. Fingers run up the
 * keyboard from the thumb on the right hand and down it on the left. With no
 * fingered note the hand keeps `previous`, or has no pose at all.
 */
export function handPose(
  hand: Hand,
  notes: readonly PlacedNote[],
  keys: ReadonlyMap<number, KeyRect>,
  previous?: HandPose
): HandPose | undefined {
  const placed = new Map<Finger, Tip>();
  for (const note of notes) {
    const key = keys.get(note.pitch);
    // One key a finger: a second note on the same finger keeps the first.
    if (note.finger === undefined || !key || placed.has(note.finger)) continue;
    placed.set(note.finger, { x: key.x + key.width / 2, reach: key.black ? 1 : 0 });
  }
  if (placed.size === 0) return previous && { ...previous, down: new Set() };

  const step = whiteWidth(keys) * (hand === "right" ? 1 : -1);
  const tips = {} as Record<Finger, Tip>;
  for (const finger of FINGERS) {
    tips[finger] = placed.get(finger) ?? { x: freeX(finger, placed, step), reach: 0 };
  }
  return { hand, tips, down: new Set(placed.keys()) };
}

/** A free finger: between the placed fingers either side of it, or a key's step past the nearest. */
function freeX(finger: Finger, placed: ReadonlyMap<Finger, Tip>, step: number): number {
  let below: Finger | undefined;
  let above: Finger | undefined;
  for (const other of placed.keys()) {
    if (other < finger && (below === undefined || other > below)) below = other;
    if (other > finger && (above === undefined || other < above)) above = other;
  }
  const low = below === undefined ? undefined : placed.get(below);
  const high = above === undefined ? undefined : placed.get(above);
  if (below !== undefined && above !== undefined && low && high) {
    return low.x + ((high.x - low.x) * (finger - below)) / (above - below);
  }
  if (below !== undefined && low) return low.x + step * (finger - below);
  if (above !== undefined && high) return high.x - step * (above - finger);
  return 0;
}

function whiteWidth(keys: ReadonlyMap<number, KeyRect>): number {
  for (const key of keys.values()) if (!key.black) return key.width;
  return 0;
}

/** Notes that start together, within this many seconds, are one chord for the hand. */
const CHORD_WINDOW_S = 0.03;

/**
 * What the hand is on at `time`: the chord struck last among those still
 * sounding (a held bass does not keep the hand from the notes over it), or
 * else the next one. `start` tells whether it is pressed yet. Undefined past
 * the last note.
 */
export function upcomingChord<T extends { readonly start: number; readonly duration: number }>(
  notes: readonly T[],
  time: number
): { readonly start: number; readonly notes: readonly T[] } | undefined {
  let latestStruck = -Infinity;
  let nextStart = Infinity;
  for (const note of notes) {
    if (note.start + note.duration <= time) continue;
    if (note.start <= time) latestStruck = Math.max(latestStruck, note.start);
    else nextStart = Math.min(nextStart, note.start);
  }
  let first = latestStruck > -Infinity ? latestStruck : nextStart;
  if (first === Infinity) return undefined;
  // A chord struck a little unevenly starts with its earliest note.
  for (const note of notes) {
    const sounding = note.start + note.duration > time;
    if (sounding && note.start < first && first - note.start <= CHORD_WINDOW_S) first = note.start;
  }
  const chord = notes.filter(
    (note) =>
      note.start >= first &&
      note.start - first <= CHORD_WINDOW_S &&
      note.start + note.duration > time
  );
  return { start: first, notes: chord };
}

/** Waiting for input overrides the visual clock, including calibration offsets and note ends. */
export function handHintChord<T extends { readonly start: number; readonly duration: number }>(
  notes: readonly T[],
  time: number,
  waitingFor: readonly T[],
  sessionWaiting = false
): { readonly start: number; readonly notes: readonly T[] } | undefined {
  if (waitingFor.length > 0) {
    const pendingStart = Math.min(...waitingFor.map((note) => note.start));
    let start = notes[0]?.start ?? pendingStart;
    for (const note of notes) {
      if (note.start - start <= CHORD_WINDOW_S) continue;
      if (pendingStart <= start + CHORD_WINDOW_S) break;
      start = note.start;
    }
    // Already played members still define the hand's chord shape while the rest are pending.
    const chord = notes.filter(
      (note) => note.start >= start && note.start - start <= CHORD_WINDOW_S
    );
    return { start, notes: [...new Set([...chord, ...waitingFor])] };
  }
  // The other hand keeps its resting pose while input for this chord is still missing.
  if (sessionWaiting) return undefined;
  return upcomingChord(notes, time);
}

/**
 * Moves `current` towards `target` by an exponential ease: `smoothing`
 * seconds carry it about two thirds of the way, whatever the frame rate.
 */
export function easePose(
  current: HandPose | undefined,
  target: HandPose,
  deltaSeconds: number,
  smoothing: number
): HandPose {
  if (!current || smoothing <= 0) return target;
  const share = 1 - Math.exp(-deltaSeconds / smoothing);
  const tips = {} as Record<Finger, Tip>;
  for (const finger of FINGERS) {
    const from = current.tips[finger];
    const to = target.tips[finger];
    tips[finger] = {
      x: from.x + (to.x - from.x) * share,
      reach: from.reach + (to.reach - from.reach) * share
    };
  }
  return { hand: target.hand, tips, down: target.down };
}
