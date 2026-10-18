import type { Finger, Hand } from "../../fingering/fingering";
import { fit } from "./handSolver/fit";
import {
  ABD,
  CHAIN,
  FINGERS,
  LIM,
  R_FINGER,
  TIP_ABOVE,
  THUMB_PALMAR_MIN,
  THUMB_PALMAR_MAX,
  THUMB_RADIAL_MIN,
  THUMB_RADIAL_MAX,
  addAngles,
  at,
  clamp,
  handJoints,
  keyTarget,
  keyUnder,
  tipOf
} from "./handSolver/mech";
import { fitSkin } from "./fitSkin";
import { fitSkinPose } from "./fitSkinPose";
import { fitSceneTransition } from "./fitSceneTransition";
import type { SkinGoal } from "./skinConstraints";
import { SkinConstraints } from "./skinConstraints";
import type { SkinGeometry } from "./skinGeometry";
import { keyDistance } from "./handKeySolids";
import type { AngleDelta, Angles, Range, Rest, Root, Vec3 } from "./handSolver/mech";
import { HOVER } from "./handSolver/plan";
import { sampleTrack } from "./handSolver/track";
import type { HandAt, Track, TrackPose } from "./handSolver/track";

export type SkinRadii = Readonly<Record<Finger, number>>;

const skins = new WeakMap<SkinGeometry, WeakMap<Rest, Map<number, SkinConstraints>>>();
function skinFor(
  rest: Rest,
  geometry: SkinGeometry | undefined,
  finger?: Finger
): SkinConstraints | undefined {
  if (!geometry || geometry.vertices.length === 0) return undefined;
  let byRest = skins.get(geometry);
  if (!byRest) {
    byRest = new WeakMap();
    skins.set(geometry, byRest);
  }
  let byFinger = byRest.get(rest);
  if (!byFinger) {
    byFinger = new Map();
    byRest.set(rest, byFinger);
  }
  const key = finger ?? 0;
  let skin = byFinger.get(key);
  if (!skin) {
    skin = new SkinConstraints(geometry, rest, finger);
    byFinger.set(key, skin);
  }
  return skin;
}
function clearError(
  rest: Rest,
  angles: Angles,
  root: Root,
  f: Finger,
  mirror: boolean,
  allowed: number | undefined,
  radii: SkinRadii,
  geometry?: SkinGeometry
): number[] {
  const skin = skinFor(rest, geometry, f);
  if (skin) {
    skin.evaluate(angles, root);
    return skin.clearance(f, mirror, allowed);
  }
  return sceneClearance(handJoints(rest, angles, root), f, mirror, allowed, radii);
}

const keys = (f: Finger) =>
  f === 1
    ? (["cmc_radial", "cmc_palmar", "t_mcp", "t_ip"] as const)
    : (["mcp", "pip", "dip", "abd"] as const);
const ranges = (f: Finger): readonly Range[] =>
  f === 1
    ? [
        [THUMB_RADIAL_MIN, THUMB_RADIAL_MAX],
        [THUMB_PALMAR_MIN, THUMB_PALMAR_MAX],
        LIM.t_mcp,
        LIM.t_ip
      ]
    : [LIM.mcp, LIM.pip, LIM.dip, ABD[f]];
const value = (angles: Angles, f: Finger, key: string) =>
  (angles[f] as unknown as Readonly<Record<string, number>>)[key] ?? 0;

/** Tapered phalanx envelopes against smooth key solids; full-mesh raycasts remain in tests. */
export function sceneClearance(
  X: readonly Vec3[],
  finger: Finger,
  mirror: boolean,
  allowed?: number,
  skinRadius: SkinRadii = R_FINGER
): number[] {
  const chain = CHAIN[finger],
    out: number[] = [];
  for (let j = 0; j < 3; j++)
    for (let k = 0; k <= 4; k++) {
      const a = at(X, at(chain, j)),
        b = at(X, at(chain, j + 1)),
        u = k / 4;
      const scale = skinRadius[finger] / R_FINGER[finger];
      const radius =
        (skinRadius[finger] + (finger === 1 ? 4 : 2) * scale) *
        (j === 2 ? 1 - (finger === 1 ? 0.35 : 0.55) * u : 1);
      const p = a.map((v, i) => v + (at(b, i) - v) * u) as unknown as Vec3;
      const point: Vec3 = [mirror ? -p[0] : p[0], p[1], p[2]];
      const base = keyUnder(point[0], 0, false).pitch;
      // Pitch classes give a stable residual vector while distant keys enter or leave the broad phase.
      const row = new Array<number>(12).fill(0);
      for (let pitch = base - 3; pitch <= base + 3; pitch++) {
        if (pitch === allowed) continue;
        const distance = keyDistance(pitch, point);
        row[((pitch % 12) + 12) % 12] = Math.max(
          0,
          radius + (finger === 1 ? 2 : 1) * scale - distance
        );
      }
      out.push(...row);
    }
  return out;
}

/** Reach all three coordinates rather than moving the thumb's CMC height alone. */
function reach(
  rest: Rest,
  angles: Angles,
  root: Root,
  f: Finger,
  goal: Vec3,
  mirror = false,
  clear = false,
  allowed?: number,
  skinRadius: SkinRadii = R_FINGER,
  geometry?: SkinGeometry,
  contactDepth = 8
): NonNullable<AngleDelta[Finger]> {
  const ks = keys(f);
  const rs = ranges(f);
  const base = ks.map((k) => value(angles, f, k));
  const delta = (q: readonly number[]) =>
    Object.fromEntries(ks.map((k, i) => [k, at(q, i) - at(base, i)]));
  const measured = skinFor(rest, geometry, f),
    contactTarget = allowed === undefined ? undefined : keyTarget(allowed, f, mirror);
  const pointError = (q: readonly number[]) => {
    const p = tipOf(handJoints(rest, addAngles(angles, { [f]: delta(q) }), root), f);
    return p.map((v, i) => v - at(goal, i));
  };
  if (measured && clear) {
    const collisionAllowed = contactDepth > 0 ? allowed : undefined;
    const q = fitSkin({
      skin: measured,
      rest,
      mirror,
      fingers: [f],
      allowed: collisionAllowed === undefined ? {} : { [f]: collisionAllowed },
      goals: contactTarget ? [{ target: contactTarget, depth: contactDepth }] : [],
      start: base,
      lo: rs.map((r) => r[0]),
      hi: rs.map((r) => r[1]),
      pose: (q) => ({ root, angles: addAngles(angles, { [f]: delta(q) }) }),
      extra: contactTarget ? () => [] : pointError,
      iterations: 24
    });
    const solved = addAngles(angles, { [f]: delta(q) });
    measured.evaluate(solved, root);
    if (
      contactTarget &&
      contactDepth > 0 &&
      !((measured.patchContact(f, allowed ?? 60, mirror)?.frontDip ?? 0) > 0)
    ) {
      // An unsolved shallow press must release cleanly instead of keeping an unpressed key allowed.
      const raised = freeAngles(rest, solved, root, f, mirror, undefined, skinRadius, geometry);
      return Object.fromEntries(ks.map((k) => [k, value(raised, f, k) - value(angles, f, k)]));
    }
    return delta(q);
  }
  let q = fit(
    base,
    rs.map((r) => r[0]),
    rs.map((r) => r[1]),
    pointError,
    undefined,
    24
  ).x;
  const collision = (q: readonly number[]) =>
    clearError(
      rest,
      addAngles(angles, { [f]: delta(q) }),
      root,
      f,
      mirror,
      allowed,
      skinRadius,
      geometry
    );
  if (clear && Math.max(...collision(q)) > 0.01) {
    q = fit(
      q,
      rs.map((r) => r[0]),
      rs.map((r) => r[1]),
      (q) => [...pointError(q), ...collision(q).map((v) => v * 5)],
      undefined,
      24
    ).x;
  }
  return delta(q);
}

/** Free fingers may uncurl as well as lift; a fixed PIP/DIP can otherwise stay under a black key. */
function freeAngles(
  rest: Rest,
  angles: Angles,
  root: Root,
  f: Finger,
  mirror: boolean,
  allowed?: number,
  skinRadius: SkinRadii = R_FINGER,
  geometry?: SkinGeometry
): Angles {
  // A departing skin pad cannot keep an old key down once its tip drives another key.
  if (allowed !== undefined) {
    const tip = tipOf(handJoints(rest, angles, root), f);
    if (keyUnder(tip[0], tip[1], mirror).pitch !== allowed) allowed = undefined;
  }
  if (Math.max(...clearError(rest, angles, root, f, mirror, allowed, skinRadius, geometry)) < 0.01)
    return angles;
  const ks = keys(f),
    rs = ranges(f),
    base = ks.map((k) => value(angles, f, k));
  const delta = (q: readonly number[]) =>
    Object.fromEntries(ks.map((k, i) => [k, at(q, i) - at(base, i)]));
  const measured = skinFor(rest, geometry, f);
  if (measured) {
    const q = fitSkin({
      skin: measured,
      rest,
      mirror,
      fingers: [f],
      allowed: allowed === undefined ? {} : { [f]: allowed },
      goals: [],
      start: base,
      lo: rs.map((r) => r[0]),
      hi: rs.map((r) => r[1]),
      pose: (q) => ({ root, angles: addAngles(angles, { [f]: delta(q) }) }),
      extra: (q) => q.map((v, i) => (v - at(base, i)) * 0.05),
      iterations: 24
    });
    return addAngles(angles, { [f]: delta(q) });
  }
  const q = fit(
    base,
    rs.map((r) => r[0]),
    rs.map((r) => r[1]),
    (q) => [
      ...clearError(
        rest,
        addAngles(angles, { [f]: delta(q) }),
        root,
        f,
        mirror,
        allowed,
        skinRadius,
        geometry
      ).map((v) => v * 10),
      ...q.map((v, i) => (v - at(base, i)) * 0.05)
    ],
    undefined,
    24
  ).x;
  return addAngles(angles, { [f]: delta(q) });
}

/** Fit contact in the physical white-key front, leaving black-key space for the skin's radius. */
export function fitScenePose(
  pose: TrackPose,
  rest: Rest,
  hand: Hand,
  skinRadius: SkinRadii = R_FINGER,
  geometry?: SkinGeometry
): TrackPose {
  const playing = FINGERS.filter((f) => pose.pitches[f] !== undefined);
  if (!playing.length) return pose;
  const mirror = hand === "left";
  const adjusted = geometry ? FINGERS : playing;
  const targets = playing.map((f) => keyTarget(pose.pitches[f] ?? 60, f, mirror));
  const initial = addAngles(pose.angles, pose.press);
  const base = [
    ...pose.rootVec,
    ...adjusted.flatMap((f) => keys(f).map((k) => value(initial, f, k)))
  ];
  const lo = [
    pose.rootVec[0] - 20,
    Math.max(-45, pose.rootVec[1] - 20),
    Math.max(-180, pose.rootVec[2] - 30),
    -3000,
    -400,
    40,
    ...adjusted.flatMap((f) => ranges(f).map((r) => r[0]))
  ];
  const hi = [
    pose.rootVec[0] + 20,
    Math.min(60, pose.rootVec[1] + 20),
    Math.min(20, pose.rootVec[2] + 30),
    3000,
    400,
    100,
    ...adjusted.flatMap((f) => ranges(f).map((r) => r[1]))
  ];
  const unpack = (q: readonly number[]): { root: Root; angles: Angles } => {
    const delta: Partial<Record<Finger, NonNullable<AngleDelta[Finger]>>> = {};
    adjusted.forEach((f, fi) => {
      delta[f] = Object.fromEntries(
        keys(f).map((k, j) => [k, at(q, 6 + fi * 4 + j) - value(pose.angles, f, k)])
      );
    });
    const root: Root = [at(q, 0), at(q, 1), at(q, 2), at(q, 3), at(q, 4), at(q, 5)];
    return { root, angles: addAngles(pose.angles, delta) };
  };
  const measured = skinFor(rest, geometry);
  const measuredQ = measured
    ? fitSkinPose({
        skin: measured,
        rest,
        mirror,
        fingers: adjusted,
        allowed: pose.pitches,
        goals: targets.map((target) => ({ target, depth: 8 })),
        start: base,
        lo,
        hi,
        pose: (q) => {
          const p = unpack(q);
          return { root: p.root, angles: p.angles };
        },
        extra: (q) => q.map((v, i) => (v - at(base, i)) * (i < 3 ? 0.05 : 0.005)),
        iterations: 60
      })
    : undefined;
  const q =
    measuredQ ??
    fit(
      base,
      lo,
      hi,
      (q) => {
        const { root, angles } = unpack(q);
        const X = handJoints(rest, angles, root);
        const residual: number[] = [];
        const skin = skinFor(rest, geometry);
        if (skin) skin.evaluate(angles, root);
        targets.forEach((t) => {
          if (skin) residual.push(...skin.contact(t, mirror));
          else {
            const tip = tipOf(X, t.finger);
            residual.push(
              tip[0] - clamp(tip[0], t.x - 1, t.x + 1),
              tip[1] - clamp(tip[1], t.black ? 67 : 15, t.black ? 120 : 40),
              tip[2] - (t.z + (skinRadius[t.finger] - R_FINGER[t.finger]) * TIP_ABOVE - 10)
            );
          }
          residual.push(
            ...(skin
              ? skin.clearance(t.finger, mirror, t.pitch)
              : sceneClearance(X, t.finger, mirror, t.pitch, skinRadius)
            ).map((v) => v * 5)
          );
        });
        q.forEach((v, i) => residual.push((v - at(base, i)) * (i < 3 ? 0.05 : 0.005)));
        return residual;
      },
      undefined,
      60
    ).x;
  const solved = unpack(q);
  let angles = solved.angles;
  for (const f of FINGERS.filter((f) => !playing.includes(f)))
    angles = freeAngles(rest, angles, solved.root, f, mirror, undefined, skinRadius, geometry);
  const X = handJoints(rest, angles, solved.root);
  const press: Partial<Record<Finger, NonNullable<AngleDelta[Finger]>>> = {};
  const hover: Partial<Record<Finger, NonNullable<AngleDelta[Finger]>>> = {};
  for (const f of playing) {
    const tip = tipOf(X, f);
    press[f] = {};
    if (pose.hover[f])
      hover[f] = reach(
        rest,
        angles,
        solved.root,
        f,
        [tip[0], tip[1], tip[2] + 10 + HOVER],
        mirror,
        true,
        geometry ? pose.pitches[f] : undefined,
        skinRadius,
        geometry,
        -HOVER
      );
  }
  return { ...pose, rootVec: solved.root, angles, press, hover };
}

/** Carry a moving hand above the keys and solve held contacts with all four finger axes. */
export function sampleSceneTrack(
  track: Track,
  time: number,
  rest: Rest,
  mirror: boolean,
  skinRadius: SkinRadii = R_FINGER,
  geometry?: SkinGeometry
): HandAt | undefined {
  const pose = sampleTrack(track, time);
  if (!pose) return undefined;
  const next = track.keys.findIndex((k) => k.t > time);
  if (next <= 0) return pose;
  const a = at(track.keys, next - 1),
    b = at(track.keys, next);
  if (a.strike === b.strike && a.phase !== "ready" && b.phase !== "ready") return pose;
  const pa = at(track.poses, a.strike),
    pb = at(track.poses, b.strike);
  const u = (time - a.t) / (b.t - a.t),
    s = u * u * (3 - 2 * u);
  const held = FINGERS.filter(
    (f) => pa.pitches[f] !== undefined && pa.pitches[f] === pb.pitches[f]
  );
  const travel = Math.hypot(...pa.rootVec.slice(3).map((v, i) => v - at(pb.rootVec, i + 3)));
  const lift = a.strike !== b.strike ? Math.min(55, travel * 0.15) * Math.sin(Math.PI * u) : 0;
  const root: Root = [
    pose.root[0],
    pose.root[1],
    pose.root[2],
    pose.root[3],
    pose.root[4],
    pose.root[5] + (held.length ? 0 : lift)
  ];
  const atKey = (p: TrackPose, phase: string) =>
    handJoints(
      rest,
      addAngles(p.angles, phase === "ready" ? { ...p.press, ...p.hover } : p.press),
      p.rootVec
    );
  const A = atKey(pa, a.phase),
    B = atKey(pb, b.phase),
    X = handJoints(rest, pose.angles, root);
  let angles = pose.angles;
  const goals: SkinGoal[] = [];
  for (const f of FINGERS) {
    const tip = tipOf(X, f);
    if (held.includes(f)) {
      const ta = tipOf(A, f),
        tb = tipOf(B, f);
      const goal = ta.map((v, i) => v + (at(tb, i) - v) * s) as unknown as Vec3;
      const da = a.phase === "ready" && pa.hover[f] ? -HOVER : 8,
        db = b.phase === "ready" && pb.hover[f] ? -HOVER : 8,
        depth = da + (db - da) * s;
      const collisionAllowed = depth > 0 ? pa.pitches[f] : undefined;
      goals.push({ target: keyTarget(pa.pitches[f] ?? 60, f, mirror), depth });
      if (
        Math.hypot(...tip.map((v, i) => v - at(goal, i))) < 0.01 &&
        Math.max(
          ...clearError(rest, angles, root, f, mirror, collisionAllowed, skinRadius, geometry)
        ) < 0.01
      )
        continue;
      angles = addAngles(angles, {
        [f]: reach(
          rest,
          angles,
          root,
          f,
          goal,
          mirror,
          true,
          pa.pitches[f],
          skinRadius,
          geometry,
          depth
        )
      });
    } else {
      angles = freeAngles(rest, angles, root, f, mirror, undefined, skinRadius, geometry);
    }
  }
  const result = { root, angles };
  return geometry ? fitSceneTransition(result, rest, mirror, geometry, goals) : result;
}
