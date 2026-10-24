import { CAMERA_PRESETS, worldCamera, type WorldCamera } from "./worldCamera";
import { WHITE_NOTE_FLOOR } from "./noteDimensions";
import { nativeNoteCameras } from "./nativeViewCameras";

/** A unit screen-pixel source basis joins the shared road to the unchanged flat keys. */
export function flatRoadCamera(
  width: number,
  height: number,
  hitY: number,
  perspective: boolean,
  horizon: number,
  offset = { x: 0, y: 0 },
  viewportHeight = height
) {
  const base = worldCamera(
    width,
    height,
    { ...CAMERA_PRESETS.top, scale: 1, targetY: 0 },
    { y: WHITE_NOTE_FLOOR, z: 0 }
  );
  const originY = hitY + base.params.prefs.distance * base.params.fit * 2;
  const project: WorldCamera["project"] = (x, _y, z) => ({
    x: width / 2 + x * 2,
    y: hitY - z * 2,
    scale: 1
  });
  const keyboard: WorldCamera = {
    ...base,
    params: { ...base.params, originY, orthographicScale: 2 },
    project,
    projectAtProgress: (x, y, near, far, progress) => project(x, y, far + (near - far) * progress),
    road: {
      at: (x, progress) => ({ x, y: hitY * progress, scale: 1 }),
      progressAt: (depth) => depth,
      depthAt: (progress) => progress
    }
  };
  return {
    keyboard,
    ...nativeNoteCameras(keyboard, perspective, height, horizon, viewportHeight, offset)
  };
}
