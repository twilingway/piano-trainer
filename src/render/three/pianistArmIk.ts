import { Vector3 } from "three";

export interface ArmSolution {
  readonly elbow: Vector3;
  readonly wrist: Vector3;
  readonly error: number;
}

/** Two rigid segments. The pole chooses the elbow side even at a straight-arm singularity. */
export function solvePianistArm(
  shoulder: Vector3,
  target: Vector3,
  upper: number,
  lower: number,
  pole: Vector3
): ArmSolution {
  const offset = target.clone().sub(shoulder);
  const distance = offset.length();
  const axis = distance > 1e-9 ? offset.divideScalar(distance) : new Vector3(0, -1, 0);
  const reach = Math.max(Math.abs(upper - lower) + 1e-8, Math.min(upper + lower - 1e-8, distance));
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const bend = pole.clone().sub(shoulder);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 1e-12) {
    bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
    if (bend.lengthSq() < 1e-12) bend.set(0, 0, 1).addScaledVector(axis, -axis.z);
  }
  return {
    elbow: shoulder.clone().addScaledVector(axis, along).addScaledVector(bend.normalize(), height),
    wrist: shoulder.clone().addScaledVector(axis, reach),
    error: Math.abs(distance - reach)
  };
}
