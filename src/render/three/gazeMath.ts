export interface GazePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface GazeBasis {
  readonly origin: GazePoint;
  /** Actual base-pose face forward and up in world space, before additive gaze. */
  readonly forward: GazePoint;
  readonly up: GazePoint;
}
export interface CameraGazeInput {
  readonly time: number;
  readonly cameraWorld: GazePoint;
  readonly face: GazeBasis;
  readonly attention?: number;
  /** Optional deterministic camera path; no retained frame state is needed for damping. */
  readonly cameraAt?: (songTime: number) => GazePoint;
}
export interface CameraGaze {
  readonly headYaw: number;
  readonly headPitch: number;
  readonly eyeYaw: number;
  readonly eyePitch: number;
  readonly weight: number;
}
const ZERO: CameraGaze = { headYaw: 0, headPitch: 0, eyeYaw: 0, eyePitch: 0, weight: 0 };
const RAD = Math.PI / 180;
const finite = (p: GazePoint): boolean => [p.x, p.y, p.z].every(Number.isFinite);
const dot = (a: GazePoint, b: GazePoint): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: GazePoint, b: GazePoint): GazePoint => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
const unit = (p: GazePoint): GazePoint | undefined => {
  const length = Math.hypot(p.x, p.y, p.z);
  return Number.isFinite(length) && length > 1e-9
    ? { x: p.x / length, y: p.y / length, z: p.z / length }
    : undefined;
};
const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const limit = (angle: number, degrees: number): number =>
  degrees * RAD * Math.tanh(angle / (degrees * RAD));
const HISTORY = [
  [0, 0.2],
  [0.05, 0.3],
  [0.1, 0.25],
  [0.2, 0.15],
  [0.35, 0.1]
] as const;

/** Additive face-local radians. Bounds and trailing path samples replace stateful frame lerps. */
export function cameraGaze(input: CameraGazeInput): CameraGaze {
  const { time, face } = input;
  if (
    !Number.isFinite(time) ||
    time < 0 ||
    !finite(input.cameraWorld) ||
    !finite(face.origin) ||
    !finite(face.forward) ||
    !finite(face.up)
  )
    return ZERO;
  const forward = unit(face.forward);
  const right = forward && unit(cross(forward, face.up));
  const up = forward && right && unit(cross(right, forward));
  if (!forward || !right || !up) return ZERO;
  let x = 0,
    y = 0,
    z = 0,
    total = 0;
  const samples = input.cameraAt ? HISTORY : [[0, 1] as const];
  for (const [delay, weight] of samples) {
    const camera =
      delay === 0 || !input.cameraAt
        ? input.cameraWorld
        : input.cameraAt(Math.max(0, time - delay));
    if (!finite(camera)) continue;
    const direction = unit({
      x: camera.x - face.origin.x,
      y: camera.y - face.origin.y,
      z: camera.z - face.origin.z
    });
    if (!direction) continue;
    x += dot(direction, right) * weight;
    y += dot(direction, up) * weight;
    z += dot(direction, forward) * weight;
    total += weight;
  }
  if (total === 0) return ZERO;
  const direction = unit({ x, y, z });
  if (!direction) return ZERO;
  const attention = input.attention ?? 1;
  if (!Number.isFinite(attention)) return ZERO;
  // Turn away from a passing camera before it reaches the ears; never chase behind the head.
  const weight = Math.max(0, Math.min(1, attention)) * smooth((direction.z - 0.05) / 0.4);
  if (weight === 0) return ZERO;
  const yaw = Math.atan2(direction.x, direction.z);
  const pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  const headYaw = limit(yaw, 25),
    headPitch = limit(pitch, 12);
  return {
    headYaw: headYaw * weight,
    headPitch: headPitch * weight,
    eyeYaw: limit(yaw - headYaw, 8) * weight,
    eyePitch: limit(pitch - headPitch, 8) * weight,
    weight
  };
}
