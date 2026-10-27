import { KEYS_BACK, worldCamera, type CameraPrefs, type WorldCamera } from "./worldCamera";

/** The road's shape, the player's to tune: a wider keyboard wants a lower horizon. */
export interface RoadShape {
  /** Nonnegative: near-road width share. Negative: inverse width as a viewport share. */
  readonly far: number;
  /** The horizon, as a share of the way down from the top of the view to the hit line. */
  readonly horizon: number;
  /** Standard road straightening; absent keeps the plain near-quarter bend. */
  readonly fit?: RoadFit | undefined;
}
/**
 * "auto" keeps every standard lane straight to the shown keys; "button" bends the near quarter,
 * straight only under the keyboard camera snapshot the button took.
 */
export interface RoadFit {
  readonly mode: "auto" | "button";
  readonly camera?: CameraPrefs | undefined;
}
export const DEFAULT_ROAD_FIT: RoadFit = { mode: "button" };
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
