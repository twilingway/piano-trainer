import type { Finger } from "../../fingering/fingering";
import { fitSkin } from "./fitSkin";
import type { SkinFit } from "./fitSkin";
import { skinFitError } from "./fitSkinPose";
import { SkinConstraints } from "./skinConstraints";
import type { SkinGoal } from "./skinConstraints";
import type { SkinGeometry } from "./skinGeometry";
import {
  ABD,
  FINGERS,
  LIM,
  THUMB_PALMAR_MIN,
  THUMB_PALMAR_MAX,
  THUMB_RADIAL_MIN,
  THUMB_RADIAL_MAX,
  addAngles,
  at
} from "./handSolver/mech";
import type { AngleDelta, Angles, Range, Rest, Root } from "./handSolver/mech";
import type { HandAt } from "./handSolver/track";

const cache = new WeakMap<SkinGeometry, WeakMap<Rest, SkinConstraints>>();
const keys = (f: Finger) =>
  f === 1
    ? (["cmc_radial", "cmc_palmar", "t_mcp", "t_ip"] as const)
    : (["mcp", "pip", "dip", "abd"] as const);
const limits = (f: Finger): readonly Range[] =>
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

/** A rare coupled correction when a fixed wrist cannot keep its held pad clear of adjacent keys. */
export function fitSceneTransition(
  pose: HandAt,
  rest: Rest,
  mirror: boolean,
  geometry: SkinGeometry,
  goals: readonly SkinGoal[]
): HandAt {
  let byRest = cache.get(geometry);
  if (!byRest) {
    byRest = new WeakMap();
    cache.set(geometry, byRest);
  }
  let skin = byRest.get(rest);
  if (!skin) {
    skin = new SkinConstraints(geometry, rest);
    byRest.set(rest, skin);
  }
  const allowed: Partial<Record<Finger, number>> = {};
  for (const goal of goals) if (goal.depth > 0) allowed[goal.target.finger] = goal.target.pitch;
  skin.evaluate(pose.angles, pose.root);
  if (FINGERS.every((f) => Math.max(...skin.clearance(f, mirror, allowed[f])) < 0.05)) return pose;
  const adjusted = FINGERS.filter(
    (f) =>
      goals.some((g) => g.target.finger === f) || Math.max(...skin.clearance(f, mirror)) >= 0.05
  );
  const start = [
    pose.root[5],
    ...adjusted.flatMap((f) => keys(f).map((k) => value(pose.angles, f, k)))
  ];
  const unpack = (q: readonly number[]): HandAt => {
    const delta: Partial<Record<Finger, NonNullable<AngleDelta[Finger]>>> = {};
    adjusted.forEach((f, i) => {
      delta[f] = Object.fromEntries(
        keys(f).map((k, j) => [k, at(q, 1 + i * 4 + j) - value(pose.angles, f, k)])
      );
    });
    const root: Root = [
      pose.root[0],
      pose.root[1],
      pose.root[2],
      pose.root[3],
      pose.root[4],
      at(q, 0)
    ];
    return { root, angles: addAngles(pose.angles, delta) };
  };
  const settings: SkinFit = {
    skin,
    rest,
    mirror,
    fingers: FINGERS,
    allowed,
    goals,
    start,
    lo: [pose.root[5], ...adjusted.flatMap((f) => limits(f).map((r) => r[0]))],
    hi: [pose.root[5] + 30, ...adjusted.flatMap((f) => limits(f).map((r) => r[1]))],
    pose: unpack,
    extra: (q) => q.map((v, i) => (v - at(start, i)) * (i === 0 ? 0.015 : 0.005)),
    iterations: 64
  };
  let q = fitSkin(settings);
  const error = skinFitError(settings, q);
  if (error >= 0.05) {
    const candidate = fitSkin({
      ...settings,
      start: q.map((v, i) => (i === 0 ? Math.min(v + 15, at(settings.hi, 0)) : v)),
      iterations: 96
    });
    if (skinFitError(settings, candidate) < error) q = candidate;
  }
  return unpack(q);
}
