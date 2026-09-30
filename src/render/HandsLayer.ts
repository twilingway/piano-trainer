import { AlphaFilter, Container, Graphics } from "pixi.js";

import type { Finger, Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { FINGER_COLOR } from "./fingerColors";
import { FINGERS, easePose, handPose, upcomingChord } from "./handPose";
import type { HandPose, Tip } from "./handPose";
import type { KeyRect } from "./keyboardLayout";

/** Where the hands are drawn: the keyboard, and the strip under it the palms reach into. */
export interface HandsGeometry {
  readonly keyboardTop: number;
  readonly keyboardHeight: number;
  readonly blackHeight: number;
  readonly whiteWidth: number;
}

const HANDS: readonly Hand[] = ["left", "right"];
const OUTLINE = 0xd5dce8;
const FILL = 0x3a4150;
/** The whole hand at once, so the keys and their hints show through it. */
const HAND_ALPHA = 0.72;
/** Seconds the hand takes to move most of the way to its next position. */
const MOVE_SMOOTHING_S = 0.12;
/**
 * How early the hand sets off for the next chord, so that played legato it
 * is over the keys when they are struck rather than still gliding there.
 */
const ANTICIPATION_S = 0.2;
/** In white-key widths: knuckles from the white fingertips, spacing of the knuckles. */
const KNUCKLE_DROP = 2.4;
const KNUCKLE_SPACING = 1.1;
const FINGER_WIDTH = 0.62;
const THUMB_WIDTH = 0.7;
const TIP_RADIUS = 0.26;
const OUTLINE_PX = 2;
/** Pulses a second, for the finger that plays next. */
const PULSE_HZ = 2.5;

/**
 * Schematic hands lying over the keyboard, drawn in outline: every fingertip
 * over the key it plays next, in its finger's colour, lit while it presses
 * and pulsing just before. Only the hands the player plays are drawn.
 */
export class HandsLayer {
  readonly container = new Container();
  private readonly graphics: Record<Hand, Graphics> = {
    left: new Graphics(),
    right: new Graphics()
  };
  private notes: Record<Hand, SongNote[]> = { left: [], right: [] };
  private readonly poses = new Map<Hand, HandPose>();

  constructor() {
    this.container.eventMode = "none";
    for (const hand of HANDS) {
      const graphics = this.graphics[hand];
      // A filter, not `alpha`: alpha would show the hidden strokes through the fills.
      graphics.filters = [new AlphaFilter({ alpha: HAND_ALPHA })];
      this.container.addChild(graphics);
    }
  }

  setSong(song: Song): void {
    this.notes = {
      left: song.notes.filter((note) => note.hand === "left"),
      right: song.notes.filter((note) => note.hand === "right")
    };
    this.poses.clear();
  }

  /** Forgets where the hands were: their pixels belong to a keyboard laid out anew, or hidden. */
  reset(): void {
    this.poses.clear();
    for (const hand of HANDS) this.graphics[hand].clear();
  }

  draw(
    time: number,
    deltaSeconds: number,
    hands: ReadonlySet<Hand>,
    keys: ReadonlyMap<number, KeyRect>,
    geometry: HandsGeometry
  ): void {
    for (const hand of HANDS) {
      const graphics = this.graphics[hand];
      graphics.clear();
      if (!hands.has(hand)) {
        this.poses.delete(hand);
        continue;
      }
      const chord = upcomingChord(this.notes[hand], time + ANTICIPATION_S);
      const target = handPose(hand, chord?.notes ?? [], keys, this.poses.get(hand));
      if (!target) continue;
      const pose = easePose(this.poses.get(hand), target, deltaSeconds, MOVE_SMOOTHING_S);
      this.poses.set(hand, pose);
      const pressing = chord !== undefined && chord.start <= time;
      const pulse = 0.55 + 0.45 * Math.sin(time * Math.PI * 2 * PULSE_HZ);
      drawHand(graphics, pose, geometry, pressing ? 1 : pulse);
    }
  }
}

function tipY(tip: Tip, geometry: HandsGeometry): number {
  const { keyboardTop, keyboardHeight, blackHeight } = geometry;
  const white = keyboardTop + blackHeight + (keyboardHeight - blackHeight) * 0.45;
  const black = keyboardTop + blackHeight * 0.72;
  return white + (black - white) * tip.reach;
}

/**
 * One hand, outlined as a single shape: every part's outline first, then every
 * part's fill over it, so only the outer edge of the union stays visible.
 */
function drawHand(
  graphics: Graphics,
  pose: HandPose,
  geometry: HandsGeometry,
  downAlpha: number
): void {
  const w = geometry.whiteWidth;
  const dir = pose.hand === "right" ? 1 : -1;
  const whiteTipY = tipY({ x: 0, reach: 0 }, geometry);
  const knuckleY = whiteTipY + KNUCKLE_DROP * w;
  const palmX = (pose.tips[2].x + pose.tips[3].x + pose.tips[4].x + pose.tips[5].x) / 4;

  const base = (finger: Finger): { x: number; y: number } =>
    finger === 1
      ? { x: palmX - dir * 2.3 * w, y: knuckleY + 1.3 * w }
      : { x: palmX + dir * (finger - 3.5) * KNUCKLE_SPACING * w, y: knuckleY };
  const palm = [
    palmX - dir * 2.1 * w,
    knuckleY - 0.2 * w,
    palmX + dir * 2.2 * w,
    knuckleY - 0.2 * w,
    palmX + dir * 2.0 * w,
    knuckleY + 2.4 * w,
    palmX + dir * 1.5 * w,
    knuckleY + 5 * w,
    palmX - dir * 1.5 * w,
    knuckleY + 5 * w,
    palmX - dir * 2.5 * w,
    knuckleY + 2 * w
  ];
  const finger = (f: Finger, extra: number, color: number) => {
    const from = base(f);
    const tip = pose.tips[f];
    graphics
      .moveTo(from.x, from.y)
      .lineTo(tip.x, tipY(tip, geometry))
      .stroke({ width: (f === 1 ? THUMB_WIDTH : FINGER_WIDTH) * w + extra, color, cap: "round" });
  };

  graphics.poly(palm).stroke({ width: OUTLINE_PX * 2, color: OUTLINE, join: "round" });
  for (const f of FINGERS) finger(f, OUTLINE_PX * 2, FINGER_COLOR[f]);
  graphics.poly(palm).fill({ color: FILL });
  for (const f of FINGERS) finger(f, 0, FILL);

  for (const f of FINGERS) {
    const tip = pose.tips[f];
    const y = tipY(tip, geometry);
    const down = pose.down.has(f);
    graphics
      .circle(tip.x, y, TIP_RADIUS * w)
      .fill({ color: FINGER_COLOR[f], alpha: down ? downAlpha : 0.25 });
  }
}
