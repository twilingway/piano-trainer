/*
 * Automatic piano fingering as a shortest path.
 *
 * Every note (or chord) of one hand gets a finger (or a set of fingers); a
 * transition between two consecutive events costs more the less comfortable it
 * is for the hand, and dynamic programming (Viterbi) picks the cheapest whole
 * sequence. The left hand is solved as a mirrored right hand: negating the
 * pitch turns "left thumb to the right of the fifth finger" into the same
 * geometry the right-hand table describes.
 *
 * The span table follows the shape of the ergonomic model by Parncutt et al.
 * (1997): for each finger pair, a relaxed, a comfortable and a practical range
 * of the interval between them. The numbers are tuned against the canonical
 * scale and triad fingerings in the tests, not copied from the paper.
 */

export type Finger = 1 | 2 | 3 | 4 | 5;
export type Hand = "left" | "right";

export interface FingeringNote {
  readonly id: string;
  /** MIDI note number, 60 = middle C. */
  readonly pitch: number;
  /** Onset in seconds; notes closer than CHORD_WINDOW_S form one chord. */
  readonly start: number;
}

export type TransitionKind =
  "repeat" | "position" | "extension" | "contraction" | "thumbUnder" | "crossOver" | "shift";

const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];
const CHORD_WINDOW_S = 0.03;

const RELAXED_COST = 1;
const COMFORT_COST = 2;
const PRACTICAL_COST = 10;
const SAME_FINGER_BASE = 4;
const SAME_FINGER_PER_SEMITONE = 0.5;
const CROSS_BASE = 3;
const INDEX_CROSS_EXTRA = 1;
const THUMB_ON_BLACK = 1;
/** Semitones from which a chord counts as wide: a perfect fifth. */
const WIDE_CHORD = 7;
const OUTER_FINGER_MISSING = 1;
const CROSS_FROM_BLACK_BONUS = -1;
const CROSS_ONTO_BLACK_EXTRA = 2;

interface Span {
  readonly minPractical: number;
  readonly minComfort: number;
  readonly minRelaxed: number;
  readonly maxRelaxed: number;
  readonly maxComfort: number;
  readonly maxPractical: number;
}

/*
 * Semitones from the lower-numbered finger to the higher-numbered one, right
 * hand. Negative values for thumb pairs are the thumb passing under.
 */
const SPANS: Readonly<Record<string, Span>> = {
  // Thumb and index hold a major third at rest: inversions are fingered 1-2-5 on it.
  "1-2": span(-5, -3, 1, 4, 8, 10),
  "1-3": span(-4, -2, 3, 4, 10, 12),
  "1-4": span(-3, -1, 5, 6, 12, 14),
  "1-5": span(-1, 1, 7, 8, 13, 15),
  "2-3": span(1, 1, 1, 2, 3, 5),
  "2-4": span(1, 1, 3, 4, 5, 7),
  "2-5": span(2, 2, 5, 6, 8, 10),
  "3-4": span(1, 1, 1, 2, 2, 4),
  "3-5": span(1, 1, 3, 4, 5, 7),
  "4-5": span(1, 1, 1, 2, 3, 5)
};

function span(
  minPractical: number,
  minComfort: number,
  minRelaxed: number,
  maxRelaxed: number,
  maxComfort: number,
  maxPractical: number
): Span {
  return { minPractical, minComfort, minRelaxed, maxRelaxed, maxComfort, maxPractical };
}

function spanFor(low: Finger, high: Finger): Span {
  const entry = SPANS[`${String(low)}-${String(high)}`];
  if (!entry) throw new Error(`No span for fingers ${String(low)}-${String(high)}`);
  return entry;
}

export function isBlackKey(pitch: number): boolean {
  const pitchClass = ((pitch % 12) + 12) % 12;
  return (
    pitchClass === 1 ||
    pitchClass === 3 ||
    pitchClass === 6 ||
    pitchClass === 8 ||
    pitchClass === 10
  );
}

/** A key in the geometry of the right hand: the left hand's pitch is mirrored. */
interface Key {
  readonly pitch: number;
  readonly black: boolean;
}

function keyFor(pitch: number, hand: Hand): Key {
  return { pitch: hand === "right" ? pitch : -pitch, black: isBlackKey(pitch) };
}

/** How the hand gets from finger `a` on key `from` to finger `b` on key `to`. */
function classify(a: Finger, from: Key, b: Finger, to: Key): TransitionKind {
  if (a === b) return from.pitch === to.pitch ? "repeat" : "shift";
  const low = a < b ? a : b;
  const high = a < b ? b : a;
  const lowKey = a < b ? from : to;
  const highKey = a < b ? to : from;
  const interval = highKey.pitch - lowKey.pitch;
  const limits = spanFor(low, high);
  if (low === 1 && interval <= 0) {
    if (interval < limits.minPractical) return "shift";
    // Moving onto the thumb means the thumb went under; leaving it, a finger went over.
    return b === 1 ? "thumbUnder" : "crossOver";
  }
  if (interval < limits.minComfort || interval > limits.maxComfort) return "shift";
  if (interval > limits.maxRelaxed) return "extension";
  if (interval < limits.minRelaxed) return "contraction";
  return "position";
}

function outsideCost(value: number, min: number, max: number, perUnit: number): number {
  if (value < min) return (min - value) * perUnit;
  if (value > max) return (value - max) * perUnit;
  return 0;
}

function pairCost(a: Finger, from: Key, b: Finger, to: Key): number {
  if (a === b) {
    const distance = Math.abs(to.pitch - from.pitch);
    return distance === 0 ? 0 : SAME_FINGER_BASE + distance * SAME_FINGER_PER_SEMITONE;
  }
  const low = a < b ? a : b;
  const high = a < b ? b : a;
  const lowKey = a < b ? from : to;
  const highKey = a < b ? to : from;
  const interval = highKey.pitch - lowKey.pitch;
  const limits = spanFor(low, high);
  const stretch =
    outsideCost(interval, limits.minComfort, limits.maxComfort, COMFORT_COST) +
    outsideCost(interval, limits.minPractical, limits.maxPractical, PRACTICAL_COST);

  if (low === 1 && interval <= 0) {
    // lowKey is the thumb's key, highKey the other finger's.
    let cost = CROSS_BASE + stretch;
    if (high === 2) cost += INDEX_CROSS_EXTRA;
    if (highKey.black && !lowKey.black) cost += CROSS_FROM_BLACK_BONUS;
    if (lowKey.black && !highKey.black) cost += CROSS_ONTO_BLACK_EXTRA;
    return cost;
  }
  return (
    stretch +
    outsideCost(interval, limits.minRelaxed, limits.maxRelaxed, RELAXED_COST) +
    // Crossing two non-thumb fingers is not a technique, it is a mistake.
    (interval <= 0 ? PRACTICAL_COST * (1 - interval) : 0)
  );
}

interface FingeringEvent {
  /** Notes ordered by mirrored pitch, so fingers rise along the array. */
  readonly notes: readonly FingeringNote[];
  readonly keys: readonly Key[];
}

function groupEvents(notes: readonly FingeringNote[], hand: Hand): FingeringEvent[] {
  const sorted = [...notes].sort((x, y) => x.start - y.start || x.pitch - y.pitch);
  const groups: FingeringNote[][] = [];
  let chordStart = Number.NEGATIVE_INFINITY;
  for (const note of sorted) {
    const current = groups.at(-1);
    if (current && note.start - chordStart <= CHORD_WINDOW_S) {
      current.push(note);
    } else {
      groups.push([note]);
      chordStart = note.start;
    }
  }
  return groups.map((group) => {
    const ordered = [...group].sort(
      (x, y) => keyFor(x.pitch, hand).pitch - keyFor(y.pitch, hand).pitch
    );
    return { notes: ordered, keys: ordered.map((note) => keyFor(note.pitch, hand)) };
  });
}

/** Every rising choice of `count` fingers: a chord is never played with crossed fingers. */
function risingCombinations(count: number): Finger[][] {
  const result: Finger[][] = [];
  const walk = (from: number, chosen: Finger[]) => {
    if (chosen.length === count) {
      result.push(chosen);
      return;
    }
    for (let index = from; index < FINGERS.length; index++) {
      const finger = FINGERS[index];
      if (finger !== undefined) walk(index + 1, [...chosen, finger]);
    }
  };
  walk(0, []);
  return result;
}

function unaryCost(fingers: readonly Finger[], keys: readonly Key[]): number {
  let cost = 0;
  for (let index = 0; index < fingers.length; index++) {
    const finger = fingers[index];
    const key = keys[index];
    if (finger === undefined || key === undefined) continue;
    if (finger === 1 && key.black) cost += THUMB_ON_BLACK;
    const nextFinger = fingers[index + 1];
    const nextKey = keys[index + 1];
    if (nextFinger !== undefined && nextKey !== undefined) {
      cost += pairCost(finger, key, nextFinger, nextKey);
    }
  }
  // A chord of a fifth or wider is held by the outer fingers, 1 and 5: the hand sits
  // still on it, and the inner fingers choose between themselves.
  const lowKey = keys[0];
  const highKey = keys.at(-1);
  if (fingers.length >= 3 && lowKey && highKey && highKey.pitch - lowKey.pitch >= WIDE_CHORD) {
    if (fingers[0] !== 1) cost += OUTER_FINGER_MISSING;
    if (fingers.at(-1) !== 5) cost += OUTER_FINGER_MISSING;
  }
  return cost;
}

/** Chords are joined by their outer voices: the lowest to the lowest, the highest to the highest. */
function transitionCost(
  fromFingers: readonly Finger[],
  fromKeys: readonly Key[],
  toFingers: readonly Finger[],
  toKeys: readonly Key[]
): number {
  const lowCost = pairCost(
    fromFingers[0] ?? 1,
    fromKeys[0] ?? { pitch: 0, black: false },
    toFingers[0] ?? 1,
    toKeys[0] ?? { pitch: 0, black: false }
  );
  if (fromFingers.length === 1 && toFingers.length === 1) return lowCost;
  const highCost = pairCost(
    fromFingers.at(-1) ?? 1,
    fromKeys.at(-1) ?? { pitch: 0, black: false },
    toFingers.at(-1) ?? 1,
    toKeys.at(-1) ?? { pitch: 0, black: false }
  );
  return (lowCost + highCost) / 2;
}

function candidatesFor(
  event: FingeringEvent,
  fixed: ReadonlyMap<string, Finger> | undefined
): Finger[][] {
  // A hand has five fingers: the inner notes of a wider chord stay unfingered.
  const count = Math.min(event.notes.length, FINGERS.length);
  const all = risingCombinations(count);
  if (!fixed) return all;
  const allowed = all.filter((fingers) =>
    fingers.every((finger, index) => {
      const note = event.notes[index];
      const pinned = note ? fixed.get(note.id) : undefined;
      return pinned === undefined || pinned === finger;
    })
  );
  // Contradictory pins (two notes of a chord on one finger) are ignored rather than fatal.
  return allowed.length > 0 ? allowed : all;
}

export interface FingeredNote {
  readonly finger: Finger;
  /** How the hand arrives at this note from the previous event; absent on the first one. */
  readonly transition?: TransitionKind;
}

/**
 * Picks a finger for every note of one hand. `fixed` pins notes the player or
 * the score already fingered; the rest is solved around them.
 */
export function assignFingering(
  notes: readonly FingeringNote[],
  hand: Hand,
  fixed?: ReadonlyMap<string, Finger>
): Map<string, FingeredNote> {
  const events = groupEvents(notes, hand);
  const candidates = events.map((event) => candidatesFor(event, fixed));

  const costs: number[][] = [];
  const back: number[][] = [];
  events.forEach((event, eventIndex) => {
    const options = candidates[eventIndex] ?? [];
    const previousEvent = events[eventIndex - 1];
    const previousOptions = candidates[eventIndex - 1] ?? [];
    const previousCosts = costs[eventIndex - 1] ?? [];
    const rowCosts: number[] = [];
    const rowBack: number[] = [];
    for (const fingers of options) {
      const own = unaryCost(fingers, event.keys);
      if (!previousEvent) {
        rowCosts.push(own);
        rowBack.push(-1);
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      let bestIndex = 0;
      previousOptions.forEach((previousFingers, previousIndex) => {
        const total =
          (previousCosts[previousIndex] ?? 0) +
          transitionCost(previousFingers, previousEvent.keys, fingers, event.keys);
        if (total < best) {
          best = total;
          bestIndex = previousIndex;
        }
      });
      rowCosts.push(best + own);
      rowBack.push(bestIndex);
    }
    costs.push(rowCosts);
    back.push(rowBack);
  });

  const chosen: number[] = new Array<number>(events.length).fill(0);
  const lastCosts = costs.at(-1) ?? [];
  let pick = lastCosts.indexOf(Math.min(...lastCosts));
  for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex--) {
    chosen[eventIndex] = pick;
    pick = back[eventIndex]?.[pick] ?? 0;
  }

  const result = new Map<string, FingeredNote>();
  events.forEach((event, eventIndex) => {
    const fingers = candidates[eventIndex]?.[chosen[eventIndex] ?? 0] ?? [];
    const previousEvent = events[eventIndex - 1];
    const previousFingers = candidates[eventIndex - 1]?.[chosen[eventIndex - 1] ?? 0];
    fingers.forEach((finger, noteIndex) => {
      const note = event.notes[noteIndex];
      const key = event.keys[noteIndex];
      if (!note || !key) return;
      if (!previousEvent || !previousFingers) {
        result.set(note.id, { finger });
        return;
      }
      // A voice arrives from the nearest note of the previous event.
      const fromIndex = Math.min(noteIndex, previousFingers.length - 1);
      const fromFinger = previousFingers[fromIndex] ?? 1;
      const fromKey = previousEvent.keys[fromIndex] ?? key;
      result.set(note.id, { finger, transition: classify(fromFinger, fromKey, finger, key) });
    });
  });
  return result;
}
