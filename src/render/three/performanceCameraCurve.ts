import { distance, point, pointMix, quintic } from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";
/** Endpoint velocities are world units per song second. Unspecified endpoints are real stops. */
export function cameraCurvePoint(
  a: CameraPoint,
  b: CameraPoint,
  u: number,
  seconds: number,
  va?: CameraPoint,
  vb?: CameraPoint
): CameraPoint {
  if (!va && !vb) return pointMix(a, b, quintic(u));
  const t = Math.max(0, Math.min(1, u)),
    t2 = t * t,
    t3 = t2 * t,
    t4 = t3 * t,
    t5 = t4 * t;
  const p = point(0, 0, 0);
  for (const axis of ["x", "y", "z"] as const)
    p[axis] =
      (1 - 10 * t3 + 15 * t4 - 6 * t5) * a[axis] +
      (t - 6 * t3 + 8 * t4 - 3 * t5) * seconds * (va?.[axis] ?? 0) +
      (10 * t3 - 15 * t4 + 6 * t5) * b[axis] +
      (-4 * t3 + 7 * t4 - 3 * t5) * seconds * (vb?.[axis] ?? 0);
  return p;
}

/** Exact derivative of the same C2 position curve, in world units per song second. */
export function cameraCurveVelocity(
  a: CameraPoint,
  b: CameraPoint,
  u: number,
  seconds: number,
  va?: CameraPoint,
  vb?: CameraPoint
): CameraPoint {
  const t = Math.max(0, Math.min(1, u)),
    t2 = t * t,
    t3 = t2 * t,
    t4 = t3 * t,
    q = 30 * t2 - 60 * t3 + 30 * t4,
    p = point(0, 0, 0);
  for (const axis of ["x", "y", "z"] as const)
    p[axis] =
      (q * (b[axis] - a[axis])) / seconds +
      (1 - 18 * t2 + 32 * t3 - 15 * t4) * (va?.[axis] ?? 0) +
      (-12 * t2 + 28 * t3 - 15 * t4) * (vb?.[axis] ?? 0);
  return p;
}

interface FlowNode {
  readonly time: number;
  readonly position: CameraPoint;
  readonly velocity?: CameraPoint;
}
/** Continuous heading through a shot is selected before duration scaling and collision protection. */
export function cameraFlowNodes<T extends FlowNode>(
  nodes: readonly T[],
  unit: number,
  speeds: ReadonlyMap<number, number> = new Map([
    [36, 180],
    [38, 70],
    [42, 100],
    [46, 160],
    [50, 180],
    [56, 140]
  ])
): T[] {
  return nodes.map((node, index) => {
    const speed = speeds.get(node.time) ?? 0,
      next = nodes[index + 1];
    if (!speed || !next) return node;
    const length = Math.max(1, distance(node.position, next.position));
    return {
      ...node,
      velocity: point(
        ((next.position.x - node.position.x) * speed * unit) / length,
        ((next.position.y - node.position.y) * speed * unit) / length,
        ((next.position.z - node.position.z) * speed * unit) / length
      )
    };
  });
}
