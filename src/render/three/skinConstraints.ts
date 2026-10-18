import type { Finger } from "../../fingering/fingering";
import { keyPenetration, CONTACT_PATCH_X, CONTACT_PATCH_Y, inContactPatch } from "./handKeySolids";
import {
  FINGERS,
  KEY_DIP,
  CHAIN,
  at,
  clamp,
  keyUnder,
  isBlack,
  whitePosition,
  WHITE_W,
  keyTarget
} from "./handSolver/mech";
import type { Angles, KeyTarget, Rest, Root, Vec3 } from "./handSolver/mech";
import { SkinEvaluator } from "./skinGeometry";
import { keyFrontDip, keySkinDepth } from "./handContact";
import type { SkinGeometry } from "./skinGeometry";

/** Small measured skin support geometry, evaluated without Three objects or mesh scans. */
export class SkinConstraints {
  private readonly evaluator: SkinEvaluator;
  private readonly selected = new Set<number>();
  get geometry(): SkinGeometry {
    return this.evaluator.geometry;
  }
  private readonly byFinger = new Map<Finger, number[]>();
  constructor(geometry: SkinGeometry, rest: Rest, finger?: Finger) {
    if (finger !== undefined)
      geometry = { vertices: geometry.vertices.filter((v) => v.finger === finger) };
    this.evaluator = new SkinEvaluator(geometry, rest);
    for (const f of FINGERS) this.byFinger.set(f, []);
    geometry.vertices.forEach((v, i) => this.byFinger.get(v.finger)?.push(i));
  }
  evaluate(angles: Angles, root: Root): void {
    this.evaluator.evaluate(angles, root);
  }
  patchContact(
    f: Finger,
    pitch: number,
    mirror: boolean
  ):
    | {
        readonly height: number;
        readonly along: number;
        readonly frontDip: number;
        readonly index: number;
      }
    | undefined {
    const target = keyTarget(pitch, f, mirror),
      values = this.evaluator.positions;
    let found: { height: number; along: number; frontDip: number; index: number } | undefined;
    for (const index of this.byFinger.get(f) ?? []) {
      const x = values[index * 3] ?? 0,
        y = values[index * 3 + 1] ?? 0,
        z = values[index * 3 + 2] ?? 0;
      if (!inContactPatch(target, x, y)) continue;
      const frontDip = keyFrontDip((target.black ? 12 : 0) - z, y);
      if (!found || frontDip > found.frontDip) found = { height: z, along: y, frontDip, index };
    }
    return found;
  }
  patchHeight(f: Finger, pitch: number, mirror: boolean): number {
    return this.patchContact(f, pitch, mirror)?.height ?? Infinity;
  }
  clearance(f: Finger, mirror: boolean, allowed?: number): number[] {
    const frontDip =
      allowed === undefined ? 0 : Math.max(0, this.patchContact(f, allowed, mirror)?.frontDip ?? 0);
    const ownFront = Math.min(KEY_DIP, frontDip);
    const row = new Array<number>(12).fill(0),
      indices = new Array<number>(12).fill(-1);
    for (const index of this.byFinger.get(f) ?? []) {
      const values = this.evaluator.positions,
        b = index * 3,
        y = values[b + 1] ?? 0,
        z = values[b + 2] ?? 0;
      if (y < -0.3 || y > 150.3 || z > 12.3) continue;
      const x = values[b] ?? 0,
        p: Vec3 = [mirror ? -x : x, y, z];
      const base = keyUnder(p[0], 0, false).pitch;
      // Adjacent white keys share one floor: their side seams cannot hide a pad below an unpressed key.
      if (
        base !== allowed &&
        y >= 0 &&
        y <= 150 &&
        p[0] >= whitePosition(21) * WHITE_W - WHITE_W / 2 &&
        p[0] <= whitePosition(108) * WHITE_W + WHITE_W / 2
      ) {
        const slot = ((base % 12) + 12) % 12;
        if (0.3 - z > (row[slot] ?? 0)) {
          row[slot] = 0.3 - z;
          indices[slot] = index;
        }
      }
      for (let pitch = base - 2; pitch <= base + 2; pitch++) {
        const slot = ((pitch % 12) + 12) % 12;
        if (pitch === allowed) {
          if (p[1] >= 0 && p[1] <= 150 && keyUnder(p[0], p[1], false).pitch === pitch) {
            const error = (isBlack(pitch) ? 12 : 0) - keySkinDepth(ownFront, y) - 0.3 - p[2];
            if (error > (row[slot] ?? 0)) {
              row[slot] = error;
              indices[slot] = index;
            }
          }
          continue;
        }
        const error = keyPenetration(pitch, p, 0.3);
        if (error > (row[slot] ?? 0)) {
          row[slot] = error;
          indices[slot] = index;
        }
      }
    }
    for (const index of indices) if (index >= 0) this.selected.add(index);
    return row;
  }
  contact(target: KeyTarget, mirror: boolean, depth = 8): number[] {
    let anyPad = Infinity,
      fallbackScore = Infinity;
    let anyIndex = -1;
    const pad = this.patchContact(target.finger, target.pitch, mirror);
    const values = this.evaluator.positions,
      side = CONTACT_PATCH_X[target.black ? "black" : "white"],
      [front, back] = CONTACT_PATCH_Y[target.black ? "black" : "white"];
    for (const index of this.byFinger.get(target.finger) ?? []) {
      const b = index * 3,
        x = values[b] ?? 0,
        y = values[b + 1] ?? 0,
        z = values[b + 2] ?? 0;
      const dx = x - clamp(x, target.x - side, target.x + side),
        dy = y - clamp(y, front, back),
        score =
          dx * dx + dy * dy + 0.01 * (z - ((target.black ? 12 : 0) - keySkinDepth(depth, y))) ** 2;
      if (score < fallbackScore) {
        fallbackScore = score;
        anyPad = z;
        anyIndex = index;
      }
    }
    const padSource = pad?.index ?? anyIndex;
    if (padSource >= 0) this.selected.add(padSource);
    const ownFront = Math.min(KEY_DIP, Math.max(0, pad?.frontDip ?? 0));
    let ownError = 0,
      ownIndex = -1;
    for (const index of this.byFinger.get(target.finger) ?? []) {
      const x = values[index * 3] ?? 0,
        y = values[index * 3 + 1] ?? 0,
        z = values[index * 3 + 2] ?? 0;
      if (y < 0 || y > 150 || keyUnder(x, y, mirror).pitch !== target.pitch) continue;
      const error = (target.black ? 12 : 0) - keySkinDepth(ownFront, y) - 0.3 - z;
      if (error > ownError) {
        ownError = error;
        ownIndex = index;
      }
    }
    if (ownIndex >= 0) this.selected.add(ownIndex);
    const tip = at(this.evaluator.joints, CHAIN[target.finger][3]);
    const skinHeight = pad?.height ?? anyPad,
      along = pad?.along ?? values[padSource * 3 + 1] ?? 0,
      top = target.black ? 12 : 0;
    return [
      tip[0] - clamp(tip[0], target.x - 2, target.x + 2),
      tip[1] - clamp(tip[1], target.black ? 85 : 15, target.black ? 120 : 40),
      skinHeight - (top - keySkinDepth(depth, along)),
      padSource < 0
        ? 0
        : (values[padSource * 3] ?? 0) -
          clamp(values[padSource * 3] ?? 0, target.x - side, target.x + side),
      padSource < 0
        ? 0
        : (values[padSource * 3 + 1] ?? 0) - clamp(values[padSource * 3 + 1] ?? 0, front, back),
      ownError * 5
    ];
  }
  active(
    fingers: readonly Finger[],
    mirror: boolean,
    allowed: Readonly<Partial<Record<Finger, number>>>,
    goals: readonly SkinGoal[]
  ): SkinGeometry {
    this.selected.clear();
    for (const f of fingers) this.clearance(f, mirror, allowed[f]);
    for (const goal of goals) this.contact(goal.target, mirror, goal.depth);
    return {
      vertices: [...this.selected].flatMap((i) => {
        const vertex = this.geometry.vertices[i];
        return vertex ? [vertex] : [];
      })
    };
  }
}

export interface SkinGoal {
  readonly target: KeyTarget;
  readonly depth: number;
}
