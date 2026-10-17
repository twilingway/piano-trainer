import type { WorldCamera } from "./worldCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { createNoteLaneProjection } from "./noteLaneProjection";
import { BLACK_NOTE_FLOOR } from "./noteDimensions";

/** Derive note-only projection after the independent piano camera has its final layout. */
export function nativeViewCameras(
  base: WorldCamera,
  keyboardHeight: number,
  keyboardTop: boolean,
  perspective: boolean,
  roadHeight: number,
  horizon: number,
  viewportHeight: number
) {
  const keyboard = keyboardTop ? mixedKeyboardCamera(base, keyboardHeight) : base;
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
    viewportHeight
  );
  return { keyboard, notes, blackLane };
}
