import type { WorldCamera } from "./worldCamera";
import { noteSlabHeight } from "./noteDimensions";
import type { NoteLaneProjection } from "./noteLaneProjection";
import { READABLE_NOTE_DURATION_LIMIT, readableNoteFaceHeight } from "./noteReadability";

export const READABLE_ROAD_DURATION_LIMIT = READABLE_NOTE_DURATION_LIMIT;

/** Extends only a note's far tail so its top face can carry a readable finger digit. */
export function readableRoadTop(
  keyX: number,
  top: number,
  bottom: number,
  width: number,
  hitY: number,
  camera: WorldCamera,
  duration = 0,
  lane?: NoteLaneProjection
): number {
  // Sustained notes must consume to zero; a minimum would pin their burning tail in place.
  if (duration >= READABLE_ROAD_DURATION_LIMIT) return top;
  const { prefs, orthographicScale } = camera.params;
  // In perspective a screen minimum makes far short notes as long as near ones and inverts depth.
  if (orthographicScale === undefined) return top;
  const contact = lane?.depth ?? camera.near.z;
  const span = camera.roadFarZ - contact;
  if (
    !Number.isFinite(keyX) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(width) ||
    !Number.isFinite(hitY) ||
    !Number.isFinite(span) ||
    !Number.isFinite(camera.near.y) ||
    !Number.isFinite(prefs.scale) ||
    hitY <= 0 ||
    width <= 0 ||
    span <= 0 ||
    prefs.scale <= 0 ||
    top <= 0 ||
    bottom <= top
  )
    return top;

  const nearBottom = Math.min(hitY, bottom);
  if (nearBottom <= top) return top;
  const x = camera.sourceX(keyX) + (lane?.worldOffsetX ?? 0);
  // The upper face is one physical slab thickness above the contact lane.
  const floorY = lane?.y ?? camera.near.y;
  const y = floorY + noteSlabHeight(width * (camera.params.sourceUnits ?? 0.5), floorY);
  const zBottom = contact + (1 - nearBottom / hitY) * span;
  const zTop = contact + (1 - top / hitY) * span;
  const project = camera.projectRoad ?? camera.project;
  const lower = project(x, y, zBottom, contact);
  const upper = project(x, y, zTop, contact);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(lower.y) ||
    !Number.isFinite(upper.y) ||
    !Number.isFinite(lower.scale) ||
    lower.scale <= 0 ||
    upper.scale <= 0
  )
    return top;
  const visibleScale = lower.scale * (lane?.scaleX ?? 1);
  const minimum = readableNoteFaceHeight(width * visibleScale, false);
  if (lower.y - upper.y >= minimum) return top;
  if (!Number.isFinite(orthographicScale) || orthographicScale <= 0) return top;
  const extension = (minimum * hitY) / (orthographicScale * prefs.scale * span);
  return Number.isFinite(extension) ? Math.max(0, Math.min(top, nearBottom - extension)) : top;
}
