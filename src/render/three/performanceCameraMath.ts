export interface CameraPoint {
  x: number;
  y: number;
  z: number;
}
export interface CameraBounds {
  readonly min: CameraPoint;
  readonly max: CameraPoint;
}
export const quintic = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const point = (x: number, y: number, z: number): CameraPoint => ({ x, y, z });
export const pointMix = (a: CameraPoint, b: CameraPoint, t: number): CameraPoint =>
  point(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t));
export const distance = (a: CameraPoint, b: CameraPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function inside(point: CameraPoint, box: CameraBounds, margin: number): boolean {
  return (
    point.x > box.min.x - margin &&
    point.x < box.max.x + margin &&
    point.y > box.min.y - margin &&
    point.y < box.max.y + margin &&
    point.z > box.min.z - margin &&
    point.z < box.max.z + margin
  );
}
/** Exact segment test against the camera's inflated obstacle, including thin key bodies. */
export function segmentBlocked(
  a: CameraPoint,
  b: CameraPoint,
  box: CameraBounds,
  margin: number
): boolean {
  let low = 0,
    high = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = b[axis] - a[axis],
      min = box.min[axis] - margin,
      max = box.max[axis] + margin;
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] <= min || a[axis] >= max) return false;
      continue;
    }
    const first = (min - a[axis]) / delta,
      last = (max - a[axis]) / delta;
    low = Math.max(low, Math.min(first, last));
    high = Math.min(high, Math.max(first, last));
    if (low >= high) return false;
  }
  return high > 0 && low < 1;
}
export function lookAngles(from: CameraPoint, to: CameraPoint): { yaw: number; pitch: number } {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export function mixAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
