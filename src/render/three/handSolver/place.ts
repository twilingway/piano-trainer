import type { Finger, Hand } from "../../../fingering/fingering";
import { fit } from "./fit";
import { canonicalShape, nearest, placement } from "./library";
import type { FingerPitch, Library, Placement } from "./library";
import {
  ABD,
  AIM_PASSES,
  BEND_SPLIT,
  CHAIN,
  CLEAR,
  FINGERS,
  KEY_DIP,
  K_BAND,
  LIM,
  LONG,
  MISS_MM,
  PITCH,
  REF,
  REF_W,
  ROLL,
  R_FINGER,
  THUMB_PALMAR_MAX,
  THUMB_PALMAR_MIN,
  THUMB_RADIAL_MAX,
  THUMB_RADIAL_MIN,
  TIP_ABOVE,
  WHITE_W,
  WRIST_Z,
  YAW_TOL,
  addAngles,
  angles,
  at,
  clamp,
  contact,
  curlMax,
  handJoints,
  kRange,
  keyTarget,
  norm,
  tipOf,
  violations
} from "./mech";
import type { AngleDelta, Angles, KeyTarget, Range, Rest, Root, Shape, Spread, Vec3 } from "./mech";

// The hand's pose for a strike in three layers (tools/hand-rig/hand_mech.py's place()): `root` (the
// wrist's place and turn), `shape` (the example's finger angles) and `press` (the key's travel).

type PerFinger<T> = Partial<Record<Finger, T>>;

/** A pose of steps 2 and 3: root (the wrist's height included), curl, per pressed finger k, spread
 * and the tips' misses. */
export interface Fitted {
  readonly root: Root;
  readonly curl: number;
  readonly k: PerFinger<number>;
  readonly spread: PerFinger<Spread>;
  readonly miss: PerFinger<number>;
}

export type Flag = "canonical" | "strained" | "impossible";

/** place()'s result: the hand's pose for its notes. */
export interface PlacedPose {
  readonly hand: Hand;
  readonly notes: readonly FingerPitch[];
  readonly source: "own" | "nearest" | "canonical";
  readonly flags: Flag[];
  /** Pitches the hand cannot reach with the rest of the chord. */
  readonly dropped: number[];
  readonly exampleYawDeg: number;
  readonly curl: number;
  readonly lift: PerFinger<number>;
  /** The press layer of each pressing finger, in the order of the notes. */
  readonly press: ReadonlyMap<Finger, AngleDelta[Finger] & object>;
  readonly missMm: PerFinger<number>;
  readonly angles: Angles;
  readonly rootVec: Root;
  readonly shape: Shape;
  readonly violations: string[];
}

/** What a pose needs to stay where it is: its root and curl. */
export interface Hold {
  readonly rootVec: Root;
  readonly curl: number;
}

export const round = (v: number, digits: number) => Number(v.toFixed(digits));

const pressedOf = (targets: readonly KeyTarget[]) => {
  const map = new Map<Finger, KeyTarget>();
  for (const t of targets) map.set(t.finger, t);
  return map;
};

/** The pressed fingers' middle joints with the height they must keep over the keys. */
const floorOf = (pressed: ReadonlyMap<Finger, KeyTarget>) =>
  [...pressed.keys()].flatMap((f) =>
    f === 1 ? [] : [CHAIN[f][1], CHAIN[f][2]].map((i) => [i, R_FINGER[f] * TIP_ABOVE] as const)
  );

const withZ = (p: readonly number[], z: number): Root => [
  at(p, 0),
  at(p, 1),
  at(p, 2),
  at(p, 3),
  at(p, 4),
  z
];

/** Steps 2 and 3 for the pressed targets: root and the hand's curl by the tips, then k and spread. */
export function solve(
  rest: Rest,
  shape: Shape,
  targets: readonly KeyTarget[],
  yaw0: number,
  start: readonly [number, number],
  wristZ: number,
  kBand: Range = K_BAND,
  yawTol: number = YAW_TOL
): Fitted {
  const pressed = pressedOf(targets);
  const cmax = Math.min(
    ...LONG.flatMap((f) => {
      const r = shape.fingers[String(f) as "2"].rel;
      return r > 1e-6 ? [curlMax(f) / r] : [];
    })
  );
  const floor = floorOf(pressed);
  const ref = [yaw0, REF.pitch[0], REF.roll[0], start[0], start[1], REF.curl[0]];
  const sig = [REF.yaw, REF.pitch[1], REF.roll[1], REF.wrist, REF.wrist, REF.curl[1]];
  // Each tip aims at the point of its box nearest to where the pose puts it, the aims taken again
  // after every fit: a miss that is zero inside the box has a kink at its edge where descent stalls.
  const aim = new Map<Finger, Vec3>();
  const joints = (p: readonly number[]) => handJoints(rest, angles(shape, at(p, 5)), withZ(p, wristZ));
  const takeAims = (p: readonly number[]) => {
    const X = joints(p);
    for (const [f, t] of pressed) {
      const tip = tipOf(X, f);
      const c = contact(tip, t);
      aim.set(f, [tip[0] - c[0], tip[1] - c[1], tip[2] - c[2]]);
    }
  };
  const res2 = (p: readonly number[]) => {
    const X = joints(p);
    const r: number[] = [];
    for (const f of pressed.keys()) {
      const tip = tipOf(X, f);
      const a = aim.get(f) as Vec3;
      r.push(tip[0] - a[0], tip[1] - a[1], tip[2] - a[2]);
    }
    for (const [i, z] of floor) r.push(Math.min(0, at(X, i)[2] - z));
    p.forEach((v, i) => r.push((REF_W * (v - at(ref, i))) / at(sig, i)));
    return r;
  };
  const lo = [yaw0 - yawTol, PITCH[0], ROLL[0], -3000, -400, 0];
  const hi = [yaw0 + yawTol, PITCH[1], ROLL[1], 3000, 400, cmax];
  const worst = (p: readonly number[]) => {
    const X = joints(p);
    return Math.max(...[...pressed].map(([f, t]) => norm(contact(tipOf(X, f), t))));
  };
  // Released in order, not all at once: the wrist's place, the yaw and the pitch go first; the curl,
  // then the roll, only when the tips still miss.
  let p: readonly number[] = ref;
  const stages = [
    [true, true, false, true, true, false],
    [true, true, false, true, true, true],
    [true, true, true, true, true, true]
  ];
  for (const active of stages) {
    for (let pass = 0; pass < AIM_PASSES; pass++) {
      takeAims(p);
      p = fit(p, lo, hi, res2, active).x;
    }
    if (worst(p) <= MISS_MM) break;
  }
  return fingers(rest, shape, targets, withZ(p, wristZ), at(p, 5), kBand);
}

/** Step 3 at a given root and curl: k and spread per pressed finger. */
export function fingers(
  rest: Rest,
  shape: Shape,
  targets: readonly KeyTarget[],
  root: Root,
  curl: number,
  kBand: Range = K_BAND
): Fitted {
  const pressed = pressedOf(targets);
  const floor = floorOf(pressed);
  const k: PerFinger<number> = {};
  const spread: PerFinger<Spread> = {};
  for (const [f, t] of pressed) {
    let kr: Range;
    let sr: Range[];
    let s0: number[];
    if (f === 1) {
      const th = shape.thumb;
      kr = kRange([th.t_mcp, th.t_ip], [LIM.t_mcp, LIM.t_ip], kBand);
      sr = [
        [THUMB_RADIAL_MIN, THUMB_RADIAL_MAX],
        [THUMB_PALMAR_MIN, THUMB_PALMAR_MAX]
      ];
      s0 = [th.cmc_radial, th.cmc_palmar];
    } else {
      const s = shape.fingers[String(f) as "2"];
      const c = curl * s.rel;
      kr = kRange(
        BEND_SPLIT[f].map((b) => b * c),
        [LIM.mcp, LIM.pip, LIM.dip],
        kBand
      );
      sr = [ABD[f]];
      s0 = [s.abd];
    }
    if (kr[0] > kr[1]) kr = [kr[1], kr[1]];
    const res3 = (q: readonly number[]) => {
      const sp: Spread = f === 1 ? [at(q, 1), at(q, 2)] : at(q, 1);
      const X = handJoints(rest, angles(shape, curl, { [f]: at(q, 0) }, { [f]: sp }), root);
      const r: number[] = [...contact(tipOf(X, f), t)];
      for (const [i, z] of floor) if (CHAIN[f].includes(i)) r.push(Math.min(0, at(X, i)[2] - z));
      r.push((REF_W * (at(q, 0) - 1)) / REF.k);
      s0.forEach((v0, i) => r.push((REF_W * (at(q, i + 1) - v0)) / REF.spread));
      return r;
    };
    const x0 = [clamp(Math.max(1, kr[0]), -Infinity, kr[1]), ...s0.map((v, i) => clamp(v, ...at(sr, i)))];
    const q = fit(x0, [kr[0], ...sr.map((r) => r[0])], [kr[1], ...sr.map((r) => r[1])], res3).x;
    k[f] = at(q, 0);
    spread[f] = f === 1 ? [at(q, 1), at(q, 2)] : at(q, 1);
  }
  const X = handJoints(rest, angles(shape, curl, k, spread), root);
  const miss: PerFinger<number> = {};
  for (const [f, t] of pressed) miss[f] = norm(contact(tipOf(X, f), t));
  return { root, curl, k, spread, miss };
}

/** A free finger whose joints would sink into the keys rises at MCP (the thumb at its CMC, palmar)
 * until they clear the white top; PIP and DIP keep the example's shape. */
export function liftFree(rest: Rest, shape: Shape, pose: Fitted, free: readonly Finger[]): PerFinger<number> {
  const lift: PerFinger<number> = {};
  for (const f of free) {
    const lo = f !== 1 ? LIM.mcp[0] : THUMB_PALMAR_MIN;
    for (let deg = 0; deg <= 180; deg++) {
      lift[f] = deg;
      const ang = angles(shape, pose.curl, pose.k, pose.spread, lift);
      const cur = f !== 1 ? ang[f].mcp : ang[1].cmc_palmar;
      const X = handJoints(rest, ang, pose.root);
      const low = Math.min(...CHAIN[f].slice(1).map((i) => at(X, i)[2]));
      if (low >= R_FINGER[f] * TIP_ABOVE + CLEAR || cur - 1 < lo) break;
    }
    if (lift[f] === 0) delete lift[f];
  }
  return lift;
}

/** The press layer: extra flexion that takes finger f's tip straight down by depth mm (up for a
 * negative depth), the tip kept over its point of the key. The thumb goes down at its CMC. */
export function pressDelta(
  rest: Rest,
  ang: Angles,
  root: Root,
  f: Finger,
  depth: number = KEY_DIP
): AngleDelta[Finger] & object {
  const tip = (d: AngleDelta[Finger] & object) => tipOf(handJoints(rest, addAngles(ang, { [f]: d }), root), f);
  const t0 = tip({});
  const goal: Vec3 = [t0[0], t0[1], t0[2] - depth];
  if (f === 1) {
    let a = THUMB_PALMAR_MIN - ang[1].cmc_palmar;
    let b = THUMB_PALMAR_MAX - ang[1].cmc_palmar;
    // The tip's height falls as the CMC turns towards the palm.
    for (let i = 0; i < 30; i++) {
      const mid = (a + b) / 2;
      if (tip({ cmc_palmar: mid })[2] > goal[2]) a = mid;
      else b = mid;
    }
    return { cmc_palmar: round((a + b) / 2, 1) };
  }
  const a = ang[f];
  const b = BEND_SPLIT[f];
  const share = b[2] / b[1];
  const lo = [LIM.mcp[0] - a.mcp, Math.max(LIM.pip[0] - a.pip, (LIM.dip[0] - a.dip) / share)];
  const hi = [LIM.mcp[1] - a.mcp, Math.min(LIM.pip[1] - a.pip, (LIM.dip[1] - a.dip) / share)];
  const of = (q: readonly number[]) => ({ mcp: at(q, 0), pip: at(q, 1), dip: at(q, 1) * share });
  const q = fit([0, 0], lo, hi, (x) => {
    const p = tip(of(x));
    return [p[0] - goal[0], p[1] - goal[1], p[2] - goal[2]];
  }).x;
  const d = of(q);
  return { mcp: round(d.mcp, 1), pip: round(d.pip, 1), dip: round(d.dip, 1) };
}

const canonical = new WeakMap<Library, Partial<Record<Hand, Shape>>>();
function canonOf(library: Library, hand: Hand): Shape {
  const cached = canonical.get(library) ?? {};
  const shape = cached[hand] ?? canonicalShape(library, hand);
  canonical.set(library, { ...cached, [hand]: shape });
  return shape;
}

const anchorX = (pitch: number) => keyTarget(pitch, 1, false).x / WHITE_W;
const mean = (vs: readonly number[]) => vs.reduce((s, v) => s + v, 0) / vs.length;

/**
 * The hand's pose for notes [(finger, pitch)] in three layers, the contact made in the design's
 * order. hold: the previous strike's pose; the hand stays if its fingers reach their keys by k and
 * spread alone. ref: [(notes, thumb)] whose examples set the root's reference when the notes as a
 * whole have no example of their own.
 */
export function place(
  rest: Rest,
  library: Library,
  hand: Hand,
  notes: readonly FingerPitch[],
  thumb: string | null = null,
  wristZ: number = WRIST_Z,
  hold?: Hold,
  ref?: readonly (readonly [readonly FingerPitch[], string | null])[]
): PlacedPose {
  const mirror = hand === "left";
  const sx = mirror ? -1 : 1;
  const canon = canonOf(library, hand);
  const flags: Flag[] = [];
  const dropped: number[] = [];
  let yawTol = YAW_TOL;
  let shape: Shape;
  let source: PlacedPose["source"];
  let where: Placement | undefined;
  const found = nearest(library, hand, notes, thumb);
  if (!found) {
    shape = canon;
    source = "canonical";
    flags.push("canonical");
  } else {
    source = found.source;
    if (!found.entry.shape) flags.push("canonical");
    const s = found.entry.shape ?? canon;
    shape = { fingers: s.fingers, thumb: s.thumb ?? canon.thumb };
    where = placement(found.entry, anchorX(found.anchor));
  }
  if (ref && ref.length > 0 && source !== "own") {
    const wheres: Placement[] = [];
    for (const [ns, th] of ref) {
      const got = nearest(library, hand, ns, th);
      if (got) wheres.push(placement(got.entry, anchorX(got.anchor)));
    }
    const yaws = wheres.map((w) => w.yawDeg);
    const spanYaw = Math.max(...yaws) - Math.min(...yaws);
    if (wheres.length > 0 && spanYaw < 2 * YAW_TOL) {
      where = {
        wristX: mean(wheres.map((w) => w.wristX)),
        wristDepthCm: mean(wheres.map((w) => w.wristDepthCm)),
        yawDeg: (Math.max(...yaws) + Math.min(...yaws)) / 2
      };
      yawTol = YAW_TOL - spanYaw / 2;
    }
  }
  const yaw0 = where ? sx * where.yawDeg : 0;
  let keep = [...notes];
  let pose: Fitted;
  for (;;) {
    // The hand stays if its fingers reach from there, deeper between the blacks if they must; it
    // moves only when they cannot, to white keys short of the blacks first.
    const tries: (readonly ["hold" | "solve", boolean])[] = [];
    if (hold && Math.abs(hold.rootVec[0] - yaw0) <= yawTol + 0.05) tries.push(["hold", false], ["hold", true]);
    tries.push(["solve", false], ["solve", true]);
    let targets: KeyTarget[] = [];
    let start: readonly [number, number] = [0, 0];
    pose = undefined as unknown as Fitted;
    for (const [how, deep] of tries) {
      targets = keep.map(([f, p]) => keyTarget(p, f, mirror, deep));
      start = where
        ? [sx * where.wristX * WHITE_W, where.wristDepthCm * 10]
        : [mean(targets.map((t) => t.x)), -100];
      pose =
        how === "hold" && hold
          ? fingers(rest, shape, targets, hold.rootVec, hold.curl)
          : solve(rest, shape, targets, yaw0, start, wristZ, K_BAND, yawTol);
      if (Math.max(...Object.values(pose.miss)) <= MISS_MM) break;
    }
    const bad = Object.entries(pose.miss).filter(([, m]) => m > MISS_MM);
    if (bad.length === 0) break;
    // Within the joints' walls, would a wider k reach? Yes: strained (the pose stays); no: impossible.
    const wide = solve(rest, shape, targets, yaw0, start, wristZ, [0, 10], yawTol);
    if (Object.values(wide.miss).every((m) => m <= MISS_MM)) {
      flags.push("strained");
      break;
    }
    if (!flags.includes("impossible")) flags.push("impossible");
    if (keep.length === 1) break;
    let worst = bad[0] as [string, number];
    for (const b of bad) if (b[1] > worst[1]) worst = b;
    const w = Number(worst[0]);
    dropped.push(...keep.filter(([f]) => f === w).map(([, p]) => p));
    keep = keep.filter(([f]) => f !== w);
  }
  const kept = new Set(keep.map(([f]) => f));
  const lift = liftFree(
    rest,
    shape,
    pose,
    FINGERS.filter((f) => !kept.has(f))
  );
  const ang = angles(shape, pose.curl, pose.k, pose.spread, lift);
  const press = new Map<Finger, AngleDelta[Finger] & object>();
  for (const [f] of keep) if (!press.has(f)) press.set(f, pressDelta(rest, ang, pose.root, f));
  const missMm: PerFinger<number> = {};
  for (const [f, m] of Object.entries(pose.miss)) missMm[Number(f) as Finger] = round(m, 2);
  return {
    hand,
    notes,
    source,
    flags,
    dropped,
    exampleYawDeg: round(sx * yaw0, 2),
    curl: round(pose.curl, 3),
    lift,
    press,
    missMm,
    angles: ang,
    rootVec: pose.root,
    shape,
    violations: violations(ang, pose.root)
  };
}
