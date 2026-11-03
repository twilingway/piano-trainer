import type { Sprite, Texture } from "./flatThree";
import { roadLayoutCamera } from "./roadLayoutCamera";
import type { CameraPrefs } from "./worldCamera";
import type { WorldCamera } from "./worldCamera";
import { nativeKeyboardFootprint } from "./nativeKeyboardFraming";

export function nativePaneFootprint(native: boolean, camera: WorldCamera | undefined) {
  return native && camera ? nativeKeyboardFootprint(camera) : undefined;
}

/** Layout-only texture sizing and road projection, independent of the native frame compositor. */
export function roadSurfaceLayout(options: {
  readonly width: number;
  readonly height: number;
  readonly bottom: number;
  readonly viewWidth: number;
  readonly cameraHeight: number;
  readonly prefs: CameraPrefs;
  readonly horizon: number;
  readonly resolution: number;
  readonly texture: Texture;
  readonly fog: Sprite;
}) {
  const { width, height, bottom, viewWidth, cameraHeight, prefs, horizon, texture, fog } = options;
  const resolution = Math.min(options.resolution, 8192 / width);
  texture.source.resize(width, Math.max(1, bottom - height), resolution);
  const camera = roadLayoutCamera(viewWidth, width, cameraHeight, prefs, true, horizon);
  const projection = camera.road;
  const hitY = projection.at(viewWidth / 2, 1).y;
  const horizonY = projection.at(viewWidth / 2, 0).y;
  fog.position.set(0, horizonY);
  fog.width = viewWidth;
  fog.height = Math.max(1, (hitY - horizonY) * 0.5);
  return {
    size: { width, height: Math.max(0, height) },
    viewWidth,
    cameraHeight,
    camera,
    projection,
    hitY,
    horizonY
  };
}
