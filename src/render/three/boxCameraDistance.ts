interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
interface Bounds3 {
  readonly min: Point3;
  readonly max: Point3;
}

/** Fit each AABB corner against the actual horizontal and vertical frustum, preserving view axis. */
export function boxCameraDistance(
  bounds: Bounds3,
  fov: number,
  aspect: number,
  direction: Point3,
  padding = 1.1
): number {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const dx = direction.x / length,
    dy = direction.y / length,
    dz = direction.z / length;
  const horizontal = Math.hypot(dx, dz) || 1;
  const tanY = Math.tan((fov * Math.PI) / 360),
    tanX = tanY * Math.max(0.001, aspect);
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const px = x - cx,
          py = y - cy,
          pz = z - cz;
        const right = (px * dz - pz * dx) / horizontal;
        const up = (-px * dx * dy + py * horizontal * horizontal - pz * dy * dz) / horizontal;
        const towardsCamera = px * dx + py * dy + pz * dz;
        distance = Math.max(
          distance,
          towardsCamera + padding * Math.max(Math.abs(right) / tanX, Math.abs(up) / tanY)
        );
      }
  return distance;
}
