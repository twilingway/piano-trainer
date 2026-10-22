import type { WorldCamera } from "./worldCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { createNoteLaneProjection } from "./noteLaneProjection";
import { BLACK_NOTE_FLOOR } from "./noteDimensions";
import { KEYBOARD_BLACK_BACK } from "./keyboardMetrics";

/** Derive note-only projection after the independent piano camera has its final layout. */
export function nativeViewCameras(
  base: WorldCamera,
  keyboardHeight: number,
  keyboardTop: boolean,
  perspective: boolean,
  roadHeight: number,
  horizon: number,
  viewportHeight: number,
  keyboardBottom?: number,
  keyboardOffset = { x: 0, y: 0 }
) {
  let keyboard = keyboardTop ? mixedKeyboardCamera(base, keyboardHeight) : base;
  if (keyboardBottom !== undefined && keyboard.params.prefs.pitch === 90)
    keyboard = dockKeyboardCamera(keyboard, keyboardBottom);
  return {
    keyboard,
    ...nativeNoteCameras(keyboard, perspective, roadHeight, horizon, viewportHeight, keyboardOffset)
  };
}

/** Calibrate contact after placement; Three applies the same offset to the keyboard pass once. */
export function nativeNoteCameras(
  keyboard: WorldCamera,
  perspective: boolean,
  roadHeight: number,
  horizon: number,
  viewportHeight: number,
  offset: { readonly x: number; readonly y: number }
) {
  const placed = shiftCamera(keyboard, offset.x, offset.y);
  const notes = noteProjectionCamera(
    placed,
    perspective ? "perspective" : "direct",
    roadHeight,
    horizon
  );
  const blackLane = createNoteLaneProjection(
    notes,
    placed,
    BLACK_NOTE_FLOOR,
    keyboard.params.width,
    viewportHeight,
    keyboard.params.keyboardDepth === undefined ? undefined : KEYBOARD_BLACK_BACK
  );
  return { notes, blackLane };
}

/** Keep overhead keys on their layout floor while retaining the player's camera shift. */
function dockKeyboardCamera(camera: WorldCamera, bottom: number): WorldCamera {
  if (!Number.isFinite(bottom)) return camera;
  const shift = bottom + camera.params.prefs.targetY - camera.project(0, 22, 0).y;
  return shiftCamera(camera, 0, shift);
}

function shiftCamera(camera: WorldCamera, x: number, y: number): WorldCamera {
  if (x === 0 && y === 0) return camera;
  const moved = (point: ReturnType<WorldCamera["project"]>) => ({
    ...point,
    x: point.x + x,
    y: point.y + y
  });
  return {
    ...camera,
    params: {
      ...camera.params,
      originX: (camera.params.originX ?? camera.params.width / 2) + x,
      originY: camera.params.originY + y
    },
    project: (...args) => moved(camera.project(...args)),
    projectAtProgress: (...args) => moved(camera.projectAtProgress(...args)),
    road: { ...camera.road, at: (...args) => moved(camera.road.at(...args)) }
  };
}
