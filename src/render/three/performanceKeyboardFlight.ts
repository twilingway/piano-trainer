import { point, segmentBlocked } from "./performanceCameraMath";
import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
export interface PerformanceKeyboardFlight {
  readonly start: CameraPoint;
  readonly end: CameraPoint;
  readonly targetStart: CameraPoint;
  readonly targetEnd: CameraPoint;
  readonly underHands: boolean;
}
/** Test the complete low corridor, not just two camera endpoints. */
export function performanceKeyboardFlight(
  left: number,
  right: number,
  top: number,
  front: number,
  unit: number,
  obstacles: readonly CameraBounds[],
  clearance: number
): PerformanceKeyboardFlight | undefined {
  const candidate = (
    y: number,
    z: number,
    underHands: boolean
  ): PerformanceKeyboardFlight | undefined => {
    const start = point(left, top + y * unit, front + z * unit),
      end = point(right, top + y * unit, front + z * unit);
    if (
      obstacles.some((box) =>
        segmentBlocked(start, end, box, underHands ? Math.max(clearance, 40 * unit) : clearance)
      )
    )
      return undefined;
    return {
      start,
      end,
      targetStart: point(Math.min(right, left + 220 * unit), top + 70 * unit, front + 15 * unit),
      targetEnd: point(right, top + 70 * unit, front + 15 * unit),
      underHands
    };
  };
  for (const z of [100, 140, 180])
    for (const y of [15, 25, 35]) {
      const result = candidate(y, z, true);
      if (result) return result;
    }
  // An obstructed hand corridor becomes an honest low front pass, never an invisible/clipped arm.
  for (const y of [120, 180, 260]) {
    const result = candidate(y, -260, false);
    if (result) return result;
  }
  return undefined;
}
