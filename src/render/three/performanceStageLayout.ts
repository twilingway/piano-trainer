import { performanceShortFraming } from "./performanceShortFraming";
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
  /** The middle of the lower edge of the band the sign is centred in. */
  readonly base: CameraPoint;
  readonly width: number;
  readonly maxHeight: number;
}
/** A giant backdrop behind the stage, filling the top of the short song's view, facing -Z. */
export function performanceSignPlacement(bounds: CameraBounds): PerformanceSignPlacement {
  return performanceShortFraming(bounds).sign;
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
