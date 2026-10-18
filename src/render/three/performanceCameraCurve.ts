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
/** Shared physical tangents roll through every internal node, including inserted clearance bends. */
export function cameraFlowNodes<T extends FlowNode>(
  nodes: readonly T[],
  unit: number,
  blocked?: (a: CameraPoint, b: CameraPoint) => boolean
): (T & { velocity?: CameraPoint })[] {
  const result: (T & { velocity?: CameraPoint })[] = nodes.map((node, index) => {
    const before = nodes[index - 1],
      next = nodes[index + 1];
    if (!before || !next || node.velocity) return { ...node };
    const incoming = distance(before.position, node.position),
      outgoing = distance(node.position, next.position);
    const a = Math.max(1e-9, incoming),
      b = Math.max(1e-9, outgoing);
    let direction = point(
      (node.position.x - before.position.x) / a + (next.position.x - node.position.x) / b,
      (node.position.y - before.position.y) / a + (next.position.y - node.position.y) / b,
      (node.position.z - before.position.z) / a + (next.position.z - node.position.z) / b
    );
    let length = Math.hypot(direction.x, direction.y, direction.z);
    if (length < 1e-6) {
      // A reversal needs a small sideways arc, never a zero-speed pivot.
      direction = point(
        -(node.position.z - before.position.z),
        0,
        node.position.x - before.position.x
      );
      length = Math.hypot(direction.x, direction.y, direction.z);
      if (length < 1e-6) {
        direction = point(1, 0, 0);
        length = 1;
      }
    }
    const speed = Math.min(
      600 * unit,
      Math.max(
        12 * unit,
        0.95 *
          Math.min(
            incoming / Math.max(1e-6, node.time - before.time),
            outgoing / Math.max(1e-6, next.time - node.time)
          )
      )
    );
    return {
      ...node,
      velocity: point(
        (direction.x * speed) / length,
        (direction.y * speed) / length,
        (direction.z * speed) / length
      )
    };
  });
  if (!blocked) return result;
  // The polyline is already protected. Bound its rounded C2 bends with shared node velocities,
  // so a correction on one segment cannot create a discontinuity on its neighbour.
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (let index = 1; index < result.length; index++) {
      const a = result[index - 1],
        b = result[index];
      if (!a || !b) continue;
      let previous = a.position,
        unsafe = false;
      for (let step = 1; step <= 64; step++) {
        const next = cameraCurvePoint(
          a.position,
          b.position,
          step / 64,
          b.time - a.time,
          a.velocity,
          b.velocity
        );
        if (blocked(previous, next)) {
          unsafe = true;
          break;
        }
        previous = next;
      }
      if (!unsafe) continue;
      for (const node of [a, b])
        if (node.velocity)
          node.velocity = point(
            node.velocity.x * 0.5,
            node.velocity.y * 0.5,
            node.velocity.z * 0.5
          );
      changed = true;
    }
    if (!changed) break;
  }
  return result;
}
