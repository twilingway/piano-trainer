import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
export interface PerformanceStageLayout {
  readonly centre: CameraPoint;
  readonly radius: number;
  readonly top: number;
  readonly thickness: number;
  readonly unit: number;
}
/** Physical stage dimensions in the same world units as the posed instrument and pianist. */
export function performanceStageLayout(bounds: CameraBounds, unit = 1): PerformanceStageLayout {
  const scale = Number.isFinite(unit) && unit > 0 ? unit : 1;
  return {
    centre: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: bounds.min.y - 8 * scale,
      z: (bounds.min.z + bounds.max.z) / 2
    },
    radius: Math.max(
      600 * scale,
      Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.62
    ),
    top: bounds.min.y - 8 * scale,
    thickness: 120 * scale,
    unit: scale
  };
}
export interface PerformanceSignPlacement {
  /** The middle of the sign's lower edge. */
  readonly base: CameraPoint;
  readonly width: number;
  readonly maxHeight: number;
}
/** Behind the pianist's back and above the hat, facing the front cameras (towards -Z). */
export function performanceSignPlacement(bounds: CameraBounds, unit = 1): PerformanceSignPlacement {
  const scale = Number.isFinite(unit) && unit > 0 ? unit : 1;
  const width = Math.min(
    2600 * scale,
    Math.max(1300 * scale, (bounds.max.x - bounds.min.x) * 1.35)
  );
  return {
    base: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: bounds.max.y + 150 * scale,
      z: bounds.max.z + 200 * scale
    },
    width,
    maxHeight: width * 0.4
  };
}
/** Nine octave sectors include the two partial ends of the real A0–C8 keyboard. */
export function stageNotePoint(pitch: number, stage: PerformanceStageLayout) {
  if (!Number.isInteger(pitch) || pitch < 21 || pitch > 108) return undefined;
  const octave = Math.floor(pitch / 12) - 1;
  const sectorAngle = ((octave - 4) * Math.PI * 2) / 9;
  const angle = sectorAngle + (((pitch % 12) - 5.5) / 12) * ((Math.PI * 2) / 9) * 0.82;
  return {
    x: stage.centre.x + Math.sin(angle) * stage.radius * 0.96,
    y: stage.top + 7 * stage.unit,
    z: stage.centre.z - Math.cos(angle) * stage.radius * 0.96,
    angle,
    sectorAngle,
    octave
  };
}
