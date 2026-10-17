import type { WorldCamera } from "./worldCamera";
import { NOTE_SLAB_THICKNESS } from "./noteDimensions";

export const READABLE_ROAD_DURATION_LIMIT = 0.6;

/** Extends only a note's far tail so its top face can carry a readable finger digit. */
export function readableRoadTop(
  keyX: number,
  top: number,
  bottom: number,
  width: number,
  hitY: number,
  camera: WorldCamera,
  duration = 0
): number {
  // Sustained notes must consume to zero; a minimum would pin their burning tail in place.
  if (duration >= READABLE_ROAD_DURATION_LIMIT) return top;
  const { prefs, focal, originY, fit, orthographicScale } = camera.params;
  const span = camera.roadFarZ - camera.near.z;
  if (
    !Number.isFinite(keyX) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(width) ||
    !Number.isFinite(hitY) ||
    !Number.isFinite(span) ||
    !Number.isFinite(camera.near.y) ||
    !Number.isFinite(focal) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(fit) ||
    !Number.isFinite(prefs.height) ||
    !Number.isFinite(prefs.distance) ||
    !Number.isFinite(prefs.pitch) ||
    !Number.isFinite(prefs.targetY) ||
    !Number.isFinite(prefs.scale) ||
    hitY <= 0 ||
    width <= 0 ||
    span <= 0 ||
    focal <= 0 ||
    prefs.scale <= 0 ||
    top <= 0 ||
    bottom <= top
  )
    return top;

  const nearBottom = Math.min(hitY, bottom);
  if (nearBottom <= top) return top;
  const x = camera.sourceX(keyX);
  // Source pixels are twice world units; the actual upper face is one thickness above the road.
  const y = camera.near.y + (width / 2) * NOTE_SLAB_THICKNESS;
  const zBottom = camera.near.z + (1 - nearBottom / hitY) * span;
  const zTop = camera.near.z + (1 - top / hitY) * span;
  const lower = camera.project(x, y, zBottom);
  const upper = camera.project(x, y, zTop);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(lower.y) ||
    !Number.isFinite(upper.y) ||
    !Number.isFinite(lower.scale) ||
    lower.scale <= 0 ||
    upper.scale <= 0
  )
    return top;
  const minimum =
    orthographicScale === undefined
      ? Math.max(24, Math.min(64, width * lower.scale * 0.8))
      : Math.max(18, Math.min(30, width * lower.scale * 0.8));
  if (lower.y - upper.y >= minimum) return top;

  const fallback = Math.max(0, Math.min(top, nearBottom - 4));
  if (orthographicScale !== undefined) {
    if (!Number.isFinite(orthographicScale) || orthographicScale <= 0) return top;
    const extension = (minimum * hitY) / (orthographicScale * prefs.scale * span);
    return Number.isFinite(extension) ? Math.max(0, Math.min(top, nearBottom - extension)) : top;
  }
  const angle = (prefs.pitch * Math.PI) / 180;
  const ca = Math.cos(angle),
    sa = Math.sin(angle);
  const q = (originY + prefs.targetY - (lower.y - minimum)) / focal;
  const denominator = q * ca - sa;
  if (Math.abs(denominator) <= 1e-8) return fallback;
  const yy = y * prefs.scale - prefs.height * fit;
  const zz = (yy * (ca + q * sa)) / denominator;
  const solvedZ = (zz - prefs.distance * fit) / prefs.scale;
  const solvedTop = hitY * (1 - (solvedZ - camera.near.z) / span);
  if (!Number.isFinite(solvedTop) || solvedZ <= zBottom) return fallback;
  return Math.max(0, Math.min(top, solvedTop));
}
