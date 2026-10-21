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
  keyboardBottom?: number
) {
  let keyboard = keyboardTop ? mixedKeyboardCamera(base, keyboardHeight) : base;
  if (keyboardBottom !== undefined && keyboard.params.prefs.pitch === 90)
    keyboard = dockKeyboardCamera(keyboard, keyboardBottom);
  const notes = noteProjectionCamera(
    keyboard,
    perspective ? "perspective" : "direct",
    roadHeight,
    horizon
  );
  const blackLane = createNoteLaneProjection(
    notes,
    keyboard,
    BLACK_NOTE_FLOOR,
    base.params.width,
    viewportHeight,
    base.params.keyboardDepth === undefined ? undefined : KEYBOARD_BLACK_BACK
  );
  return { keyboard, notes, blackLane };
}

/** Keep overhead keys on their layout floor while retaining the player's camera shift. */
function dockKeyboardCamera(camera: WorldCamera, bottom: number): WorldCamera {
  if (!Number.isFinite(bottom)) return camera;
  const shift = bottom + camera.params.prefs.targetY - camera.project(0, 22, 0).y;
  const moved = (point: ReturnType<WorldCamera["project"]>) => ({ ...point, y: point.y + shift });
  return {
    ...camera,
    params: { ...camera.params, originY: camera.params.originY + shift },
    project: (...args) => moved(camera.project(...args)),
    projectAtProgress: (...args) => moved(camera.projectAtProgress(...args)),
    road: { ...camera.road, at: (...args) => moved(camera.road.at(...args)) }
  };
}
