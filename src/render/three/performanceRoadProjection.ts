import { point, quintic } from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";

export const PERFORMANCE_ROAD_TILT = 0.24;
/** The same local longitudinal scale is applied to notes and the physical flight. */
export function performanceRoadScale(span: number, songTime: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  return 1 + (2000 / span - 1) * quintic((songTime - 16) / 6);
}
export function performanceRoadPoint(
  anchor: CameraPoint,
  length: number,
  angle: number,
  normalOffset = 0
): CameraPoint {
  return point(
    anchor.x,
    anchor.y + length * Math.sin(angle) + normalOffset * Math.cos(angle),
    anchor.z - length * Math.cos(angle) + normalOffset * Math.sin(angle)
  );
}

/** Aim at the real note plane below the camera, rather than at its empty parallel horizon. */
export function performanceRoadLook(
  position: CameraPoint,
  angle: number,
  normalOffset: number,
  lookAhead: number
): CameraPoint {
  return point(
    position.x,
    position.y + Math.sin(angle) * lookAhead - Math.cos(angle) * normalOffset,
    position.z - Math.cos(angle) * lookAhead - Math.sin(angle) * normalOffset
  );
}

/** Follow the S-curve tangent while intersecting the real plane; upward motion needs more lead. */
export function performanceRoadFlightLook(
  position: CameraPoint,
  velocity: CameraPoint,
  angle: number,
  normalOffset: number,
  unit: number
): CameraPoint {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    normalSpeed = velocity.y * c + velocity.z * s;
  const planar = point(velocity.x, velocity.y - normalSpeed * c, velocity.z - normalSpeed * s),
    speed = Math.hypot(planar.x, planar.y, planar.z);
  if (speed < 1e-6) return performanceRoadLook(position, angle, normalOffset, 360 * unit);
  const desired = Math.atan2(normalOffset, 360 * unit),
    limit = Math.max(0.06, Math.acos(0.94) - Math.atan2(normalSpeed, speed));
  const delta = Math.max(
      0.05,
      (desired + limit - Math.sqrt((desired - limit) ** 2 + 0.008 ** 2)) / 2
    ),
    ahead = normalOffset / Math.tan(delta);
  return point(
    position.x + (planar.x / speed) * ahead,
    position.y + (planar.y / speed) * ahead - c * normalOffset,
    position.z + (planar.z / speed) * ahead - s * normalOffset
  );
}
