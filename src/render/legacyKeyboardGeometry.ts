import { roadProjection } from "./perspective";
export const LEGACY_KEYS_SQUASH = 0.9;
/** The original road keeps its independently painted keyboard rectangular. */
export function legacyRoadProjection(
  width: number,
  flatHitY: number,
  bottom: number,
  shape: { readonly far: number; readonly horizon: number }
) {
  const hitY = bottom - (bottom - flatHitY) * LEGACY_KEYS_SQUASH;
  const horizonY = hitY * shape.horizon;
  return {
    hitY,
    horizonY,
    projection: roadProjection(width, hitY, horizonY, shape.far, Math.min(shape.far, 0.12))
  };
}
export function legacyKeyboardPoint(
  x: number,
  y: number,
  pan: number,
  hitY: number,
  flatHitY: number
) {
  if (y < hitY) return undefined;
  return { x: x + pan, y: flatHitY + (y - hitY) / LEGACY_KEYS_SQUASH };
}
