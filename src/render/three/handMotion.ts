import type { Finger } from "../../fingering/fingering";
import { placeHand } from "./handPlacement.ts";
import type { HandPlan } from "./handPlacement.ts";

// The living hand over a plan, after Zhu, Ramakrishnan, Hamann and Neff, "A system for automatic
// animation of piano performances" (CAVW 2012): the wrist follows the fingertips and turns after
// them, drops and reaches forward in a stretch, arcs up between positions and gives a little at
// each strike; a free finger is dragged by its neighbours. Springs add the inertia, a slow sway
// keeps a resting hand from freezing. Distances are millimetres, angles radians, along the
// keyboard positive towards the treble.

export const WHITE_MM = 23.5;
const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/** The wrist off the position's own pose: along the keys, up, forward into them; its turns. */
export interface Wrist {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Turns the fingertips towards the treble. */
  readonly yaw: number;
  /** Lowers the treble side of the hand. */
  readonly roll: number;
}

/** How far each joint, knuckle first, has gone from lifted (0) to pressed (1). */
export type Bend = readonly [number, number, number];

export interface LiveFinger {
  readonly bend: Bend;
  /** Where the tip should be, along the keys from its own key in the position. */
  readonly reach: number;
  /** Towards the black keys, 0..1. */
  readonly depth: number;
}

export interface LiveHand {
  /** The position's thumb key, white keys from C4. */
  readonly anchor: number;
  readonly wrist: Wrist;
  readonly fingers: Readonly<Record<Finger, LiveFinger>>;
}

/** How hard each fingertip pulls the wrist along the keys: the outer fingers most (Zhu et al.). */
const PULL: Readonly<Record<Finger, number>> = { 1: 1.6, 2: 1, 3: 1, 4: 1, 5: 1.6 };
/** How much each finger's direction turns the wrist: the middle finger most, the thumb least. */
const TURN: Readonly<Record<Finger, number>> = { 1: 0.05, 2: 0.2, 3: 0.4, 4: 0.2, 5: 0.15 };
/** From the wrist to each fingertip, along the hand. */
export const TIP_MM: Readonly<Record<Finger, number>> = { 1: 110, 2: 165, 3: 175, 4: 170, 5: 150 };
/** The share of the fingertips' pull the wrist follows; the knuckles do the rest. */
const WRIST_SHARE = 0.35;
const TURN_SHARE = 0.5;
/** A pressing finger turns and rolls the hand to its side. */
const PRESS_TURN = 0.05;
const PRESS_ROLL = 0.08;
/** Per white key of stretch past five keys, the wrist drops and moves forward. */
const STRETCH_DOWN_MM = 4;
const STRETCH_FORWARD_MM = 4;
/** A finger on a black key brings the wrist forward. */
const BLACK_FORWARD_MM = 10;
/** The wrist's arc over a move: higher for a longer move, up to the cap. */
const ARC_MM = 8;
const ARC_PER_KEY_MM = 2;
const ARC_MAX_MM = 20;
/** The give after a strike at velocity 80. */
const BOUNCE_MM = 1.5;
const BOUNCE_S = 0.2;
/** How much a free finger follows a pressing neighbour; the thumb follows nobody. */
const FOLLOW: Readonly<Record<Finger, Partial<Record<Finger, number>>>> = {
  1: {},
  2: { 3: 0.2 },
  3: { 2: 0.15, 4: 0.25 },
  4: { 3: 0.35, 5: 0.3 },
  5: { 4: 0.4 }
};
const FOLLOW_MAX = 0.35;

function wave(time: number, hertz: number, phase = 0): number {
  return Math.sin(2 * Math.PI * hertz * time + phase);
}

/** The slow sway of a hand at rest: a couple of millimetres, a degree at most. */
function sway(time: number): Wrist {
  return {
    x: 1.0 * wave(time, 0.21) + 0.5 * wave(time, 0.47, 1.3),
    y: 0.8 * wave(time, 0.17, 0.7),
    z: 0.5 * wave(time, 0.11, 2.4),
    yaw: 0.012 * wave(time, 0.13, 2),
    roll: 0.008 * wave(time, 0.19, 0.4)
  };
}

/** The wrist's lift over a move between positions, peaking halfway. */
function arc(plan: HandPlan, time: number): number {
  for (const move of plan.moves) {
    if (time <= move.depart || time >= move.arrive) continue;
    const share = (time - move.depart) / (move.arrive - move.depart);
    const height = Math.min(ARC_MAX_MM, ARC_MM + ARC_PER_KEY_MM * Math.abs(move.to - move.from));
    return height * Math.sin(Math.PI * share);
  }
  return 0;
}

/** The wrist's give after the strikes just before `time`. */
function bounce(plan: HandPlan, time: number): number {
  let lift = 0;
  for (const strike of plan.strikes) {
    if (strike.time > time) break;
    const since = time - strike.time;
    if (since < BOUNCE_S)
      lift += BOUNCE_MM * strike.loudness * Math.sin((Math.PI * since) / BOUNCE_S);
  }
  return lift;
}

/** Where the hand wants to be at `time`, before inertia. */
export function liveTarget(plan: HandPlan, time: number): LiveHand {
  const { anchor, fingers } = placeHand(plan, time);
  const direction = plan.hand === "right" ? 1 : -1;
  // Fingertips in white keys from the thumb's key; the middle finger sits at the centre.
  const centre = 2 * direction;
  const at = (finger: Finger) => direction * (finger - 1) + fingers[finger].offset - centre;
  const home = (finger: Finger) => direction * (finger - 1) - centre;

  let pull = 0,
    pullWeight = 0,
    pressed = 0,
    side = 0,
    depth = 0;
  for (const finger of FINGERS) {
    const { press } = fingers[finger];
    const weight = PULL[finger] * (1 + 2 * press);
    pull += weight * at(finger);
    pullWeight += weight;
    pressed += press;
    side += (press * direction * (finger - 3)) / 2;
    depth = Math.max(depth, fingers[finger].depth);
  }
  const x = WRIST_SHARE * (pull / pullWeight) * WHITE_MM;

  // Zhu et al.: the wrist turns after the rays to the fingertips, weighted to the middle finger.
  let turn = 0;
  for (const finger of FINGERS) {
    const now = Math.atan2(at(finger) * WHITE_MM - x, TIP_MM[finger]);
    const rest = Math.atan2(home(finger) * WHITE_MM, TIP_MM[finger]);
    turn += TURN[finger] * (now - rest);
  }
  const tilt = side / Math.max(1, pressed);
  const stretch = Math.max(0, Math.abs(at(5) - at(1)) - 4);
  const breath = sway(time);
  const wrist: Wrist = {
    x: x + breath.x,
    y: -STRETCH_DOWN_MM * stretch + arc(plan, time) + bounce(plan, time) + breath.y,
    z: STRETCH_FORWARD_MM * stretch + BLACK_FORWARD_MM * depth + breath.z,
    yaw: TURN_SHARE * turn + PRESS_TURN * tilt + breath.yaw,
    roll: PRESS_ROLL * tilt + breath.roll
  };

  const live = {} as Record<Finger, LiveFinger>;
  for (const finger of FINGERS) {
    const own = fingers[finger].press;
    let follow = 0;
    for (const [other, share] of Object.entries(FOLLOW[finger])) {
      follow += share * fingers[Number(other) as Finger].press;
    }
    const idle = 0.04 * (1 + wave(time, 0.25 + 0.06 * finger, finger)) * 0.5;
    const bend = own + (1 - own) * (Math.min(FOLLOW_MAX, follow) + idle);
    live[finger] = {
      bend: [bend, bend, bend],
      reach: fingers[finger].offset * WHITE_MM,
      depth: fingers[finger].depth
    };
  }
  return { anchor, wrist, fingers: live };
}

/** What a finger's knuckle has to add sideways once the wrist has moved and turned. */
export function knuckleSide(hand: LiveHand, finger: Finger): number {
  return hand.fingers[finger].reach - hand.wrist.x - hand.wrist.yaw * TIP_MM[finger];
}

/** A spring's natural frequency in hertz and its damping ratio. */
interface Spring {
  readonly hertz: number;
  readonly damping: number;
}

const WRIST_SPRING: Spring = { hertz: 3.5, damping: 0.85 };
/** The knuckle quickest, the tip joint a little behind it. */
const BEND_SPRINGS: readonly Spring[] = [
  { hertz: 10, damping: 0.75 },
  { hertz: 8, damping: 0.7 },
  { hertz: 6.5, damping: 0.65 }
];
const REACH_SPRING: Spring = { hertz: 6, damping: 0.9 };
const SPRINGS: readonly Spring[] = [
  ...Array<Spring>(5).fill(WRIST_SPRING),
  ...FINGERS.flatMap(() => [...BEND_SPRINGS, REACH_SPRING, REACH_SPRING])
];
const SUBSTEP_S = 1 / 240;
/** A longer frame (a hidden tab) is not simulated: the hand catches up as if it were this long. */
const MAX_STEP_S = 0.1;

function flatten(hand: LiveHand): number[] {
  const { x, y, z, yaw, roll } = hand.wrist;
  return [
    x,
    y,
    z,
    yaw,
    roll,
    ...FINGERS.flatMap((finger) => {
      const { bend, reach, depth } = hand.fingers[finger];
      return [...bend, reach, depth];
    })
  ];
}

function joint(bend: number): number {
  return Math.min(1, Math.max(0, bend));
}

function rebuild(anchor: number, values: readonly number[]): LiveHand {
  const value = (index: number) => values[index] ?? 0;
  const fingers = {} as Record<Finger, LiveFinger>;
  FINGERS.forEach((finger, index) => {
    const base = 5 + index * 5;
    fingers[finger] = {
      // An overshooting joint must not push the finger through its key, nor lift it past lifted.
      bend: [joint(value(base)), joint(value(base + 1)), joint(value(base + 2))],
      reach: value(base + 3),
      depth: value(base + 4)
    };
  });
  return {
    anchor,
    wrist: { x: value(0), y: value(1), z: value(2), yaw: value(3), roll: value(4) },
    fingers
  };
}

/** The hand's inertia: every wrist and finger channel follows its target on a damped spring. */
export class HandSprings {
  private values: number[] | undefined;
  private velocities: number[] = [];

  /** The hand after `deltaSeconds` chasing `target`; the first call starts on the target. */
  step(target: LiveHand, deltaSeconds: number): LiveHand {
    const goal = flatten(target);
    if (!this.values) {
      this.values = goal;
      this.velocities = goal.map(() => 0);
      return target;
    }
    const values = this.values;
    const velocities = this.velocities;
    let left = Math.min(MAX_STEP_S, Math.max(0, deltaSeconds));
    while (left > 1e-9) {
      const h = Math.min(SUBSTEP_S, left);
      left -= h;
      for (let index = 0; index < goal.length; index++) {
        const spring = SPRINGS[index] ?? WRIST_SPRING;
        const omega = 2 * Math.PI * spring.hertz;
        const x = values[index] ?? 0;
        const v = velocities[index] ?? 0;
        const next =
          v + (-2 * spring.damping * omega * v - omega * omega * (x - (goal[index] ?? 0))) * h;
        velocities[index] = next;
        values[index] = x + next * h;
      }
    }
    return rebuild(target.anchor, values);
  }
}
