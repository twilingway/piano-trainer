import type { NoteLaneProjection } from "../noteLaneProjection";
import type { WorldCamera } from "../worldCamera";

/** Unpanned app-world coordinates: positive Z runs from the player towards the horizon. */
export interface WorldRoadNote {
  x: number;
  /** The far end, towards the horizon. */
  top: number;
  /** The near end, towards the hit line. */
  bottom: number;
  width: number;
  color: number;
  alpha: number;
  /** Original duration only controls decoration, never the score clock. */
  duration?: number;
  pitch?: number | undefined;
  seed?: number;
  textureOffset?: number;
  lane?: NoteLaneProjection | undefined;
}

/** Maps the existing hold bounds into the piano world; a supplied target is reused. */
export function worldRoadNote(
  keyX: number,
  top: number,
  bottom: number,
  width: number,
  color: number,
  alpha: number,
  hitY: number,
  camera: WorldCamera,
  target?: WorldRoadNote
): WorldRoadNote | undefined {
  if (
    !Number.isFinite(keyX) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(width) ||
    !Number.isFinite(color) ||
    !Number.isFinite(alpha) ||
    !Number.isFinite(hitY) ||
    hitY <= 0 ||
    width <= 0 ||
    alpha <= 0 ||
    !Number.isFinite(camera.near.z) ||
    !Number.isFinite(camera.roadFarZ)
  )
    return undefined;
  const span = camera.roadFarZ - camera.near.z;
  if (!Number.isFinite(span) || span <= 0) return undefined;
  const clippedTop = Math.max(0, Math.min(hitY, top));
  const clippedBottom = Math.max(0, Math.min(hitY, bottom));
  const worldWidth = width / 2;
  const x = camera.sourceX(keyX);
  if (clippedBottom <= clippedTop || worldWidth <= 0 || !Number.isFinite(x)) return undefined;
  const far = camera.near.z + (1 - clippedTop / hitY) * span;
  const near = camera.near.z + (1 - clippedBottom / hitY) * span;
  if (far <= near) return undefined;
  const note = target ?? { x: 0, top: 0, bottom: 0, width: 0, color: 0, alpha: 0 };
  note.x = x;
  note.top = far;
  note.bottom = near;
  note.width = worldWidth;
  note.color = (color >>> 0) & 0xffffff;
  note.alpha = Math.min(1, alpha);
  return note;
}
