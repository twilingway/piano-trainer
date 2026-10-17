/** A point in the pianist's metre-space, Y up and +Z towards the player. */
export interface BenchPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BenchPose {
  readonly pelvis: BenchPoint;
  readonly leftHip: BenchPoint;
  readonly rightHip: BenchPoint;
  readonly leftKnee: BenchPoint;
  readonly rightKnee: BenchPoint;
  readonly leftFoot: BenchPoint;
  readonly rightFoot: BenchPoint;
}

export interface BenchLayout {
  readonly x: number;
  readonly top: number;
  readonly front: number;
  readonly width: number;
  readonly depth: number;
  readonly floor: number;
}

/** Fits a seat beneath a seated pelvis; invalid or non-seated rigs have no bench. */
export function pianistBenchLayout(pose: BenchPose): BenchLayout | undefined {
  const { pelvis, leftHip, rightHip, leftKnee, rightKnee, leftFoot, rightFoot } = pose;
  for (const point of [pelvis, leftHip, rightHip, leftKnee, rightKnee, leftFoot, rightFoot])
    if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
  const knees = (leftKnee.y + rightKnee.y) / 2;
  const top = Math.max(knees, Math.min(knees + 0.05, pelvis.y - 0.07));
  const front = (leftHip.z + rightHip.z + leftKnee.z + rightKnee.z) / 4;
  const floor = Math.min(leftFoot.y, rightFoot.y) - 0.09;
  if (pelvis.y <= top || pelvis.z <= front || floor >= top - 0.1) return undefined;
  const halfHips = Math.max(Math.abs(leftHip.x - pelvis.x), Math.abs(rightHip.x - pelvis.x));
  return {
    x: pelvis.x,
    top,
    front,
    width: Math.max(0.6, 2 * halfHips + 0.24),
    depth: Math.max(0.34, pelvis.z - front + 0.1),
    floor
  };
}
