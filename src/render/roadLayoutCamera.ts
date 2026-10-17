import { KEYS_BACK, worldCamera, type CameraPrefs, type WorldCamera } from "./worldCamera";

/** The road's shape, the player's to tune: a wider keyboard wants a lower horizon. */
export interface RoadShape {
  /** The road's width at the horizon, as a share of its width at the hit line. */
  readonly far: number;
  /** The horizon, as a share of the way down from the top of the view to the hit line. */
  readonly horizon: number;
}
export const DEFAULT_ROAD_SHAPE: RoadShape = { far: 0.1, horizon: 0.1 };

/** Layout-only camera inputs; the scene width may exceed the visible viewport. */
export function roadLayoutCamera(
  viewWidth: number,
  sceneWidth: number,
  height: number,
  prefs: CameraPrefs,
  native: boolean,
  horizon: number
): WorldCamera {
  return worldCamera(
    viewWidth,
    Math.max(1, height),
    prefs,
    KEYS_BACK,
    native ? horizon : undefined,
    native
      ? {
          left: -viewWidth / 4,
          right: sceneWidth / 2 - viewWidth / 4,
          pan: (sceneWidth - viewWidth) / 2
        }
      : undefined
  );
}
