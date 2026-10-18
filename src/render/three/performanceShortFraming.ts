import { point } from "./performanceCameraMath";
import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import type { PerformanceSignPlacement } from "./performanceStageLayout";

export const SHORT_FRAMING_FOV = 45;
/** The pass looks slightly down, so the note road in front of the keyboard shows. */
const PITCH = (12 * Math.PI) / 180;
/** Screen heights (-1 bottom, 1 top) of the pianist from the stand to the hat; notes come below. */
const SUBJECT = [-0.78, 0.22] as const;
/** The sign's band in the top of the frame. */
const SIGN = [0.38, 0.9] as const;
/** The lowest share of the scene left below the frame: the feet and the stand's legs. */
const FEET = 0.3;
/** The sign fills this share of a 1.6 frame's width; a wider screen shows more around it. */
const SIGN_FILL = 0.74;
const SIGN_ASPECT = 1.6;
/** How far behind the scene the sign stands, in viewing distances: a backdrop, not a prop. */
const SIGN_BACK = 0.6;

export interface PerformanceShortFraming {
  /** The middle of the pass. */
  readonly camera: CameraPoint;
  readonly target: CameraPoint;
  /** From the camera to the scene's middle along the view. */
  readonly distance: number;
  readonly sign: PerformanceSignPlacement;
}

/**
 * The short song's frame from the posed scene alone: the playing pianist below, and a giant sign
 * behind the stage sized and raised to fill the top of the same view. Camera and stage share it.
 */
export function performanceShortFraming(bounds: CameraBounds): PerformanceShortFraming {
  const tanV = Math.tan((SHORT_FRAMING_FOV * Math.PI) / 360);
  const height = Math.max(1e-6, bounds.max.y - bounds.min.y);
  const low = bounds.min.y + height * FEET;
  const x = (bounds.min.x + bounds.max.x) / 2,
    middle = (bounds.min.z + bounds.max.z) / 2;
  // Half the frame's height at the scene's middle, from the pianist's share of the screen.
  const half = (bounds.max.y - low) / (SUBJECT[1] - SUBJECT[0]);
  const distance = half / tanV;
  const target = point(x, low - SUBJECT[0] * half, middle);
  const camera = point(x, target.y + distance * Math.tan(PITCH), middle - distance);
  // The view's forward and up; a screen height's ray lands on the sign's plane at this height.
  const forward = point(0, -Math.sin(PITCH), Math.cos(PITCH)),
    up = point(0, Math.cos(PITCH), Math.sin(PITCH));
  const z = bounds.max.z + distance * SIGN_BACK;
  const heightAt = (screen: number) => {
    const ry = forward.y + screen * tanV * up.y,
      rz = forward.z + screen * tanV * up.z;
    return camera.y + ((z - camera.z) / rz) * ry;
  };
  const base = heightAt(SIGN[0]),
    top = heightAt(SIGN[1]);
  const depth = (base + top) / 2 - camera.y;
  const along = depth * forward.y + (z - camera.z) * forward.z;
  return {
    camera,
    target,
    distance,
    sign: {
      base: point(x, base, z),
      width: 2 * SIGN_FILL * along * tanV * SIGN_ASPECT,
      maxHeight: top - base
    }
  };
}
