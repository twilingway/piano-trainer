import type { Finger } from "../../fingering/fingering";
import { fit } from "./handSolver/fit";
import type { Rest } from "./handSolver/mech";
import type { HandAt } from "./handSolver/track";
import { SkinConstraints } from "./skinConstraints";
import type { SkinGoal } from "./skinConstraints";

export interface SkinFit {
  readonly skin: SkinConstraints;
  readonly rest: Rest;
  readonly mirror: boolean;
  readonly fingers: readonly Finger[];
  readonly allowed: Readonly<Partial<Record<Finger, number>>>;
  readonly goals: readonly SkinGoal[];
  readonly start: readonly number[];
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  readonly pose: (q: readonly number[]) => HandAt;
  readonly extra: (q: readonly number[]) => readonly number[];
  readonly iterations: number;
}

/** Constraint generation: Jacobians use active supports, then the full baked profile is verified. */
export function fitSkin(settings: SkinFit): number[] {
  const { skin, rest, mirror, fingers, allowed, goals } = settings,
    sources = new Set<number>();
  let q = [...settings.start];
  const evaluate = (model: SkinConstraints, q: readonly number[]): number[] => {
    const pose = settings.pose(q);
    model.evaluate(pose.angles, pose.root);
    const out = [...settings.extra(q)];
    for (const goal of goals) out.push(...model.contact(goal.target, mirror, goal.depth));
    for (const f of fingers) out.push(...model.clearance(f, mirror, allowed[f]).map((v) => v * 5));
    return out;
  };
  const passes = 8;
  for (let pass = 0; pass < passes; pass++) {
    const pose = settings.pose(q);
    skin.evaluate(pose.angles, pose.root);
    for (const vertex of skin.active(fingers, mirror, allowed, goals).vertices)
      sources.add(vertex.source);
    const geometry = { vertices: skin.geometry.vertices.filter((v) => sources.has(v.source)) };
    const active = new SkinConstraints(geometry, rest);
    q = fit(
      q,
      settings.lo,
      settings.hi,
      (q) => evaluate(active, q),
      undefined,
      Math.ceil(settings.iterations / passes)
    ).x;
    const solved = settings.pose(q);
    skin.evaluate(solved.angles, solved.root);
    const clear = fingers.every((f) => Math.max(...skin.clearance(f, mirror, allowed[f])) < 0.05);
    const contact = goals.every((g) => {
      const error = skin.contact(g.target, mirror, g.depth);
      const pad = skin.patchContact(g.target.finger, g.target.pitch, mirror);
      const actualDepth = pad ? (g.target.black ? 12 : 0) - pad.height : -Infinity;
      // Shared keys need one physical angle: all pressing pads follow the requested front travel.
      // A hover remains above the cap without chasing an arbitrary exact preparation height.
      const phase =
        g.depth > 0.5
          ? !!pad && Math.abs(pad.frontDip - g.depth) < 0.2
          : g.depth < -0.5
            ? actualDepth < -0.25
            : Math.abs(actualDepth - g.depth) < 0.5;
      return (
        phase &&
        Math.hypot(error[0] ?? 0, error[1] ?? 0, error[3] ?? 0, error[4] ?? 0) < 0.5 &&
        actualDepth <= 10.3
      );
    });
    if (clear && contact) return q;
  }
  return q;
}
