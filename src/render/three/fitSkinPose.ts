import { fitSkin } from "./fitSkin";
import type { SkinFit } from "./fitSkin";
import { at, clamp } from "./handSolver/mech";
import type { HandAt } from "./handSolver/track";

type SkinPoseCheck = Pick<SkinFit, "skin" | "mirror" | "fingers" | "allowed" | "goals"> & {
  readonly tipCenter?: boolean;
};

/** Full-profile feasibility, including actual pressure rather than a fitting fallback point. */
export function skinPoseError(settings: SkinPoseCheck, pose: HandAt): number {
  settings.skin.evaluate(pose.angles, pose.root);
  let error = 0;
  for (const f of settings.fingers)
    error = Math.max(error, ...settings.skin.clearance(f, settings.mirror, settings.allowed[f]));
  for (const goal of settings.goals) {
    const r = settings.skin.contact(goal.target, settings.mirror, goal.depth);
    const patch = settings.skin.patchContact(
      goal.target.finger,
      goal.target.pitch,
      settings.mirror
    );
    const patchDepth = patch ? (goal.target.black ? 12 : 0) - patch.height : -Infinity;
    const depth = Number.isFinite(patchDepth) ? patchDepth : goal.depth - (r[2] ?? 0);
    error = Math.max(
      error,
      Math.hypot(
        settings.tipCenter === false ? 0 : (r[0] ?? 0),
        settings.tipCenter === false ? 0 : (r[1] ?? 0),
        r[3] ?? 0,
        r[4] ?? 0
      ) - 0.45,
      goal.depth > 0.5
        ? Math.abs((patch?.frontDip ?? 0) - goal.depth) - 0.15
        : goal.depth < -0.5
          ? depth + 0.3
          : Math.abs(depth - goal.depth) - 0.45,
      (patch?.frontDip ?? 0) - 10.25,
      // A nearby fallback point guides fitting but cannot count as actual key pressure.
      goal.depth > 0.5 && !Number.isFinite(patchDepth) ? 1 + Math.hypot(r[3] ?? 0, r[4] ?? 0) : 0
    );
  }
  return Number.isFinite(error) ? error : Infinity;
}

export function skinFitError(settings: SkinFit, q: readonly number[]): number {
  return skinPoseError(settings, settings.pose(q));
}

/** More work belongs to offline key poses, and only when the full profile is still infeasible. */
export function fitSkinPose(settings: SkinFit): number[] {
  let best = fitSkin(settings),
    error = skinFitError(settings, best);
  if (error < 0.05) return best;
  // Different wrist starts escape a skin-pad local minimum while preserving all supplied bounds.
  const seeds = [
    best,
    best.map((v, i) => v + (i === 5 ? 15 : 0)),
    best.map((v, i) => v + (i === 5 ? 30 : i === 2 ? -15 : 0)),
    best.map((v, i) => v + (i === 5 ? 15 : i === 2 ? 15 : 0)),
    best.map((v, i) => v + (i === 0 ? -15 : 0)),
    best.map((v, i) => v + (i === 0 ? 15 : 0))
  ];
  for (const seed of seeds) {
    const candidate = fitSkin({
      ...settings,
      start: seed.map((v, i) => clamp(v, at(settings.lo, i), at(settings.hi, i))),
      iterations: 160
    });
    const candidateError = skinFitError(settings, candidate);
    if (candidateError < error) {
      best = candidate;
      error = candidateError;
    }
    if (error < 0.05) break;
  }
  return best;
}
