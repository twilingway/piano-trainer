import { roadWidthCamera } from "./roadWidthWarp";
import type { WorldCamera } from "./worldCamera";
import { keyboardHeightCamera } from "./keyboardHeightCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { createNoteLaneProjection } from "./noteLaneProjection";
import { BLACK_NOTE_FLOOR, WHITE_NOTE_FLOOR } from "./noteDimensions";
import { NATIVE_BLACK_CONTACT_BACK, NATIVE_WHITE_CONTACT_BACK } from "./nativeKeyContactAnchors";
import { fittedNativeKeyboardCamera, nativeKeyboardFootprint } from "./nativeKeyboardFraming";

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
  keyboardOffset = { x: 0, y: 0 },
  horizonWidth?: number,
  sourceWidth = base.params.width,
  nativeScale?: number
) {
  let keyboard =
    nativeScale !== undefined && base.params.keyboardDepth !== undefined
      ? fittedNativeKeyboardCamera(base, keyboardHeight, keyboardTop, nativeScale)
      : keyboardTop
        ? mixedKeyboardCamera(base, keyboardHeight)
        : keyboardHeightCamera(base, keyboardHeight);
  if (keyboardBottom !== undefined) keyboard = dockKeyboardCamera(keyboard, keyboardBottom);
  return {
    keyboard,
    ...nativeNoteCameras(
      keyboard,
      perspective,
      roadHeight,
      horizon,
      viewportHeight,
      keyboardOffset,
      horizonWidth,
      sourceWidth
    )
  };
}

/** Calibrate contact after placement; Three applies the same offset to the keyboard pass once. */
export function nativeNoteCameras(
  keyboard: WorldCamera,
  perspective: boolean,
  roadHeight: number,
  horizon: number,
  viewportHeight: number,
  offset: { readonly x: number; readonly y: number },
  horizonWidth?: number,
  sourceWidth = keyboard.params.width
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
    keyboard.params.keyboardDepth === undefined ? undefined : NATIVE_BLACK_CONTACT_BACK
  );
  const whiteLane =
    keyboard.params.keyboardDepth === undefined
      ? undefined
      : createNoteLaneProjection(
          notes,
          placed,
          WHITE_NOTE_FLOOR,
          keyboard.params.width,
          viewportHeight,
          NATIVE_WHITE_CONTACT_BACK
        );
  return {
    notes: roadWidthCamera(
      notes,
      horizonWidth ?? 0.1,
      sourceWidth,
      [
        { y: WHITE_NOTE_FLOOR, z: whiteLane?.depth ?? notes.near.z },
        { y: BLACK_NOTE_FLOOR, z: blackLane.depth ?? notes.near.z }
      ],
      perspective
    ),
    blackLane,
    whiteLane
  };
}

/** Keep the visible keys on their layout floor while retaining the player's camera shift. */
function dockKeyboardCamera(camera: WorldCamera, bottom: number): WorldCamera {
  if (!Number.isFinite(bottom)) return camera;
  const front =
    camera.params.keyboardDepth === undefined
      ? camera.project(0, 22, 0).y
      : nativeKeyboardFootprint(camera).bottom;
  const shift = bottom + camera.params.prefs.targetY - front;
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
