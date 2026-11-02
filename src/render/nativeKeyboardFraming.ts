import {
  KEYBOARD_BLACK_BACK,
  KEYBOARD_BLACK_FRONT,
  KEYBOARD_DEPTH,
  KEYBOARD_DIP
} from "./keyboardMetrics";
import { keyboardHeightCamera } from "./keyboardHeightCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import type { WorldCamera } from "./worldCamera";
import type { CameraPrefs } from "./worldCamera";
import type { KeyRect } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import type { Geometry } from "./viewGeometry";

export function naturalNativeViewHeight(
  screen: { readonly width: number; readonly height: number },
  total: number,
  prefs: CameraPrefs,
  keys: ReadonlyMap<number, KeyRect>,
  overhead: boolean,
  lift: number,
  spriteHands?: Geometry
): number {
  const floor = screen.height * lift;
  const handRoom = spriteHands
    ? screen.height - floor - spriteHands.keyboardTop - spriteHands.keyboardHeight
    : 0;
  return naturalNativeKeyboardHeight(
    metricKeyboardCamera(
      screen.width,
      total,
      screen.height - floor - handRoom,
      prefs,
      0.1,
      keys.values()
    ),
    overhead
  );
}

/** Visible metric key faces and their full parallel travel, including the white front wall. */
export function nativeKeyboardFootprint(camera: WorldCamera): {
  top: number;
  bottom: number;
  height: number;
} {
  const rows = [
    [0, 0],
    [22, 0],
    [0, KEYBOARD_DEPTH],
    [22, KEYBOARD_DEPTH],
    [34, KEYBOARD_BLACK_FRONT],
    [34, KEYBOARD_BLACK_BACK]
  ] as const;
  const projected = rows
    .flatMap(([y, z]) => [camera.project(0, y, z), camera.project(0, y - KEYBOARD_DIP, z)])
    .filter((point) => point.scale > 0 && Number.isFinite(point.y));
  const top = Math.min(...projected.map((point) => point.y));
  const bottom = Math.max(...projected.map((point) => point.y));
  return { top, bottom, height: Number.isFinite(bottom - top) ? bottom - top : 0 };
}

function nativeDisplayCamera(base: WorldCamera, overhead: boolean, scale: number): WorldCamera {
  const rear = base.project(0, 22, KEYBOARD_DEPTH);
  const natural = overhead
    ? (base.project(1, 22, KEYBOARD_DEPTH).x - rear.x) * KEYBOARD_DEPTH
    : base.project(0, 22, 0).y - rear.y;
  return overhead
    ? mixedKeyboardCamera(base, natural * scale)
    : keyboardHeightCamera(base, natural * scale);
}

/** Derived only from a fresh metric camera at layout; never from an already fitted display. */
export function naturalNativeKeyboardHeight(base: WorldCamera, overhead: boolean): number {
  return nativeKeyboardFootprint(nativeDisplayCamera(base, overhead, 1)).height;
}

/** Explicit height remains longitudinal; viewport limits uniformly fit the whole projection. */
export function fittedNativeKeyboardCamera(
  base: WorldCamera,
  height: number,
  overhead: boolean,
  scale: number
): WorldCamera {
  const camera = nativeDisplayCamera(base, overhead, scale);
  const footprint = nativeKeyboardFootprint(camera);
  if (
    !Number.isFinite(height) ||
    height <= 0 ||
    footprint.height <= height ||
    footprint.height <= 0
  )
    return camera;
  const factor = height / footprint.height;
  const anchor = camera.project(0, 22, KEYBOARD_DEPTH);
  const moved = (point: ReturnType<WorldCamera["project"]>) => ({
    x: anchor.x + (point.x - anchor.x) * factor,
    y: anchor.y + (point.y - anchor.y) * factor,
    scale: point.scale * factor
  });
  const { params } = camera;
  return {
    ...camera,
    params: {
      ...params,
      focal: params.focal * factor,
      originX: anchor.x + ((params.originX ?? params.width / 2) - anchor.x) * factor,
      originY:
        anchor.y +
        (params.originY + params.prefs.targetY - anchor.y) * factor -
        params.prefs.targetY,
      ...(params.orthographicScale === undefined
        ? {}
        : { orthographicScale: params.orthographicScale * factor }),
      ...(params.orthographicScaleY === undefined
        ? {}
        : { orthographicScaleY: params.orthographicScaleY * factor })
    },
    project: (...args) => moved(camera.project(...args)),
    projectAtProgress: (...args) => moved(camera.projectAtProgress(...args)),
    road: { ...camera.road, at: (...args) => moved(camera.road.at(...args)) }
  };
}
