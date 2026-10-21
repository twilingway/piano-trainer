import type { KeyRect } from "./keyboardLayout";
import { KEYBOARD_DEPTH, metricSourceUnits } from "./keyboardMetrics";
import { worldCamera } from "./worldCamera";
import type { CameraPrefs, WorldCamera } from "./worldCamera";

/** Frame the song range on an unchanging metric 88-key piano; zoom belongs to the camera. */
export function metricKeyboardCamera(
  width: number,
  sceneWidth: number,
  height: number,
  prefs: CameraPrefs,
  horizon: number,
  keys: Iterable<KeyRect>
): WorldCamera {
  const units = metricSourceUnits(keys);
  return worldCamera(
    width,
    Math.max(1, height),
    prefs,
    { y: 22, z: KEYBOARD_DEPTH },
    horizon,
    {
      left: (-width * units) / 2,
      right: (sceneWidth - width / 2) * units,
      pan: (sceneWidth - width) / 2
    },
    units,
    KEYBOARD_DEPTH
  );
}

export function metricCameraForKeys(
  base: WorldCamera,
  keys: ReadonlyMap<number, KeyRect>,
  height: number,
  horizon: number
): WorldCamera {
  const width = Math.max(...[...keys.values()].map((key) => key.x + key.width));
  return metricKeyboardCamera(
    base.params.width,
    width,
    height,
    base.params.prefs,
    horizon,
    keys.values()
  );
}
