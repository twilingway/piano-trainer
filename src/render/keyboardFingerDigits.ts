import type { Sprite } from "./flatThree";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";
export const DIGIT_MAX_PX = 26;

/** Fit an already-baked ordinary song digit; lesson badges have separate permission. */
export function placeKeyboardFingerDigit(
  hint: Sprite,
  key: KeyRect,
  geometry: Geometry,
  stickers: boolean,
  modelFaces: boolean,
  bevels: { readonly black: number; readonly white: number }
): void {
  const { keyboardTop, blackHeight, keyboardHeight } = geometry;
  hint.x = key.x + key.width / 2;
  if (!stickers) {
    const bevel = key.black ? bevels.black : bevels.white;
    const bottom = keyboardTop + (key.black ? blackHeight : keyboardHeight) - bevel - 4;
    const top = keyboardTop + (key.black ? 4 : blackHeight + 4);
    hint.scale.set(
      Math.min(
        (key.width * 0.7) / hint.texture.width,
        44 / hint.texture.height,
        Math.max(0, bottom - top) / hint.texture.height
      )
    );
    hint.y = bottom;
  } else {
    hint.scale.set(Math.min(1, (key.width * 0.9) / 40, DIGIT_MAX_PX / 40));
    hint.y = (key.black ? keyboardTop : keyboardTop + blackHeight) + hint.height + 2;
  }
  if (modelFaces) {
    const oldHeight = hint.height;
    const depth = key.black ? 94.0242 : 150;
    const sourceHeight = key.black ? blackHeight : keyboardHeight;
    const usableWidth = key.black ? 0.84 : 0.86;
    const units = (key.black ? 13.31152 : 22.5) / key.width;
    hint.scale.y *= (sourceHeight * units) / (depth * usableWidth);
    if (stickers) hint.y += hint.height - oldHeight;
  }
}
