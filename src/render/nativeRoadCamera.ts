import { CAMERA_PRESETS } from "./worldCamera";
import type { CameraPrefs } from "./worldCamera";

const directCameras = new WeakMap<CameraPrefs, CameraPrefs>();

/** Direct 3D uses an overhead projection without overwriting the saved perspective framing. */
export function nativeRoadCamera(camera: CameraPrefs, direct: boolean): CameraPrefs {
  if (!direct) return camera;
  let derived = directCameras.get(camera);
  if (!derived) {
    derived = { ...CAMERA_PRESETS.top, scale: camera.scale, targetY: camera.targetY };
    directCameras.set(camera, derived);
  }
  return derived;
}
