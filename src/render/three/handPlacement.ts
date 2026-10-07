import type { Finger, Hand } from "../../fingering/fingering";

/** A note of one hand, with the finger that plays it; a note without one is not the hand's to place. */
export interface FingeredNote {
  readonly start: number;
  readonly duration: number;
  readonly pitch: number;
  readonly finger?: Finger | undefined;
  /** MIDI velocity, 1..127; a missing one counts as 80. */
  readonly velocity?: number | undefined;
}

/** One finger at a moment: how far it presses (0 lifted, 1 down) and where it reaches. */
export interface FingerState {
  readonly press: number;
  /** White keys from the finger's own key in the position, up the keyboard. */
  readonly offset: number;
  /** Towards the black keys: 0 on a white key's front, 1 among the black keys. */
  readonly depth: number;
}

/** The hand at a moment: where its thumb's key is, in white keys from C4, and every finger. */
export interface HandPlacement {
  readonly anchor: number;
  readonly fingers: Readonly<Record<Finger, FingerState>>;
}

const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/** How far a finger reaches from its own key without the hand moving, in white keys. */
export const REACH: Readonly<Record<Finger, number>> = { 1: 1, 2: 0.5, 3: 0.5, 4: 0.5, 5: 1 };

/** Notes that start together, within this many seconds, are one chord for the hand. */
const CHORD_WINDOW_S = 0.03;
/** A finger starts down this long before its note and is on the key at the note's start. */
export const STRIKE_S = 0.08;
/** A finger takes this long to lift after its note ends. */
export const LIFT_S = 0.1;
/** A free finger takes this long to reach for its next key, or to come back over its own. */
export const PREP_S = 0.15;
/** A moving hand sets off no later than this before the chord it moves to. */
export const LEAD_S = 0.25;

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

/** A key's place across the keyboard in white keys from C4; a black key sits on the seam. */
export function whitePosition(pitch: number): number {
  const octave = Math.floor((pitch - 60) / 12);
  const pc = pitch - 60 - octave * 12;
  const white = WHITE_PCS.indexOf(pc);
  return white >= 0 ? octave * 7 + white : octave * 7 + WHITE_PCS.indexOf(pc - 1) + 0.5;
}

function isBlack(pitch: number): boolean {
  return !WHITE_PCS.includes(((pitch % 12) + 12) % 12);
}

/** Where a finger aims: its offset from its key in the position, and depth. */
interface Aim {
  readonly offset: number;
  readonly depth: number;
}

const HOME: Aim = { offset: 0, depth: 0 };

interface PlannedNote {
  readonly start: number;
  /** When the finger starts lifting: the note's end, or sooner to strike the next note again. */
  readonly release: number;
  readonly lift: number;
  readonly aim: Aim;
}

export interface Move {
  readonly from: number;
  readonly to: number;
  readonly depart: number;
  readonly arrive: number;
}

/** A hand's whole way through a song, worked out once; `placeHand` samples it. */
export interface HandPlan {
  readonly hand: Hand;
  readonly first: number;
  /** When each chord is struck, and how loud: 1 at velocity 80. */
  readonly strikes: readonly { readonly time: number; readonly loudness: number }[];
  readonly moves: readonly Move[];
  readonly fingers: Readonly<Record<Finger, readonly PlannedNote[]>>;
}

/**
 * Plans the hand over its notes: the hand stays in a position (five neighbouring white keys, a
 * finger each, up the keyboard from the thumb on the right hand, down it on the left) while every
 * finger of the next chord reaches its key from there; otherwise it moves to the position
 * where they sit over their own keys (as near as their reach allows), or between the notes when
 * none reaches them all. Undefined with no fingered note.
 */
export function planHand(notes: readonly FingeredNote[], hand: Hand): HandPlan | undefined {
  const fingered = notes
    .filter((note): note is FingeredNote & { finger: Finger } => note.finger !== undefined)
    .sort((a, b) => a.start - b.start);
  if (fingered.length === 0) return undefined;
  const direction = hand === "right" ? 1 : -1;

  const chords: { start: number; release: number; notes: typeof fingered }[] = [];
  for (const note of fingered) {
    const last = chords[chords.length - 1];
    if (last && note.start - last.start <= CHORD_WINDOW_S) {
      last.notes.push(note);
      last.release = Math.max(last.release, note.start + note.duration);
    } else {
      chords.push({ start: note.start, release: note.start + note.duration, notes: [note] });
    }
  }

  const anchors: number[] = [];
  for (const chord of chords)
    anchors.push(fit(chord.notes, direction, anchors[anchors.length - 1]));

  const moves: Move[] = [];
  for (let i = 1; i < chords.length; i++) {
    const from = anchors[i - 1] ?? 0;
    const to = anchors[i] ?? 0;
    const previous = chords[i - 1];
    const chord = chords[i];
    if (from === to || !previous || !chord) continue;
    const depart = Math.max(previous.start, Math.min(previous.release, chord.start - LEAD_S));
    moves.push({ from, to, depart, arrive: chord.start });
  }

  const fingers = { 1: [], 2: [], 3: [], 4: [], 5: [] } as Record<Finger, PlannedNote[]>;
  chords.forEach((chord, index) => {
    const anchor = anchors[index] ?? 0;
    for (const note of chord.notes) {
      const slot = anchor + direction * (note.finger - 1);
      fingers[note.finger].push({
        start: note.start,
        release: note.start + note.duration,
        lift: LIFT_S,
        aim: { offset: whitePosition(note.pitch) - slot, depth: isBlack(note.pitch) ? 1 : 0 }
      });
    }
  });
  for (const finger of FINGERS) fingers[finger] = restrike(fingers[finger]);
  const strikes = chords.map((chord) => ({
    time: chord.start,
    loudness: Math.max(...chord.notes.map((note) => note.velocity ?? 80)) / 80
  }));
  return { hand, first: anchors[0] ?? 0, strikes, moves, fingers };
}

/**
 * The position for a chord: `current` while every finger reaches its key from it, else the
 * whole position nearest to where its fingers sit over their keys, else the middle of those.
 */
function fit(
  notes: readonly (FingeredNote & { finger: Finger })[],
  direction: number,
  current: number | undefined
): number {
  let low = -Infinity;
  let high = Infinity;
  let sum = 0;
  for (const note of notes) {
    // The anchor that puts this finger exactly over this key.
    const wanted = whitePosition(note.pitch) - direction * (note.finger - 1);
    low = Math.max(low, wanted - REACH[note.finger]);
    high = Math.min(high, wanted + REACH[note.finger]);
    sum += wanted;
  }
  const middle = sum / notes.length;
  if (low > high) return middle;
  if (current !== undefined && current >= low && current <= high) return current;
  // A hand that moves anyway goes where the chord's fingers sit over their own keys.
  const whole = Math.min(Math.floor(high), Math.max(Math.ceil(low), Math.round(middle)));
  return whole >= low && whole <= high ? whole : Math.min(high, Math.max(low, middle));
}

/** A finger playing a key again lifts first: its notes end soon enough to strike the next. */
function restrike(notes: readonly PlannedNote[]): PlannedNote[] {
  return notes.map((note, index) => {
    const next = notes[index + 1];
    if (!next) return note;
    const strike = next.start - STRIKE_S;
    const lift = Math.max(0.01, Math.min(LIFT_S, (strike - note.start) / 2));
    const release = Math.max(note.start, Math.min(note.release, strike - lift));
    return { ...note, release, lift };
  });
}

/** Smooth 0..1 between `from` and `to`, flat at both ends. */
export function ease(time: number, from: number, to: number): number {
  if (time <= from) return 0;
  if (time >= to) return 1;
  const linear = (time - from) / (to - from);
  return linear * linear * (3 - 2 * linear);
}

function anchorAt(plan: HandPlan, time: number): number {
  let anchor = plan.first;
  for (const move of plan.moves) {
    if (time < move.depart) break;
    anchor = move.from + (move.to - move.from) * ease(time, move.depart, move.arrive);
  }
  return anchor;
}

function pressAt(notes: readonly PlannedNote[], time: number): number {
  let press = 0;
  for (const note of notes) {
    if (time < note.start - STRIKE_S) break;
    const down = ease(time, note.start - STRIKE_S, note.start);
    const up = ease(time, note.release, note.release + note.lift);
    press = Math.max(press, down * (1 - up));
  }
  return press;
}

function mix(a: Aim, b: Aim, share: number): Aim {
  return {
    offset: a.offset + (b.offset - a.offset) * share,
    depth: a.depth + (b.depth - a.depth) * share
  };
}

/**
 * Where a finger aims: on its note from the strike until it lifts; between notes it reaches for
 * the next one, straight across a short gap, or back over its own key and out again for a long one.
 */
function aimAt(notes: readonly PlannedNote[], time: number): Aim {
  let index = 0;
  while (index < notes.length && (notes[index]?.start ?? 0) - STRIKE_S <= time) index++;
  const previous = notes[index - 1];
  const next = notes[index];
  const leave = previous ? previous.release : -Infinity;
  const reach = next ? next.start - STRIKE_S : Infinity;
  if (previous && time <= leave) return previous.aim;
  const from = previous ? previous.aim : HOME;
  if (!next) return mix(from, HOME, ease(time, leave, leave + PREP_S));
  if (reach - leave <= 2 * PREP_S) return mix(from, next.aim, ease(time, leave, reach));
  if (time < reach - PREP_S) return mix(from, HOME, ease(time, leave, leave + PREP_S));
  return mix(HOME, next.aim, ease(time, reach - PREP_S, reach));
}

/** The hand at `time` on its plan. */
export function placeHand(plan: HandPlan, time: number): HandPlacement {
  const fingers = {} as Record<Finger, FingerState>;
  for (const finger of FINGERS) {
    const notes = plan.fingers[finger];
    fingers[finger] = { press: pressAt(notes, time), ...aimAt(notes, time) };
  }
  return { anchor: anchorAt(plan, time), fingers };
}
