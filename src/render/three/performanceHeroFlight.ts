import { point, segmentBlocked } from "./performanceCameraMath";
import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import type { PerformanceKeyboardFlight } from "./performanceKeyboardFlight";
export interface PerformanceHeroFlight {
  readonly approach: CameraPoint;
  readonly entrance: CameraPoint;
  readonly under: CameraPoint;
  readonly underHands: boolean;
}
/** A side entry goes around the torso; the final rising segment is certified against posed surfaces. */
export function performanceHeroFlight(
  flight: PerformanceKeyboardFlight | undefined,
  roadEntry: CameraPoint,
  unit: number,
  obstacles: readonly CameraBounds[],
  clearance: number
): PerformanceHeroFlight | undefined {
  if (!flight) return undefined;
  const blocked = (a: CameraPoint, b: CameraPoint) =>
    obstacles.some((box) => segmentBlocked(a, b, box, clearance));
  for (const offset of [0, -60, 60, -120, 120]) {
    const x = Math.max(flight.start.x, Math.min(flight.end.x, roadEntry.x + offset * unit));
    const entrance = point(flight.start.x, flight.start.y, flight.start.z),
      under = point(x, flight.start.y, flight.start.z);
    const approach = point(entrance.x - 160 * unit, entrance.y + 260 * unit, entrance.z);
    if (!blocked(approach, entrance) && !blocked(entrance, under) && !blocked(under, roadEntry))
      return { approach, entrance, under, underHands: flight.underHands };
  }
  return undefined;
}
