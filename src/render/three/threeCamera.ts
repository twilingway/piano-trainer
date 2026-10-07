import { Matrix4 } from "three";
import type { CameraParams } from "../worldCamera";

/** Clip planes, in world units scaled by `prefs.scale`: the keys lie hundreds to thousands away. */
const NEAR = 5;
const FAR = 50000;

/**
 * three's view of `worldCamera`. The game's world is left-handed (z runs away from the player), so
 * the scene stores it as `(x, y, -z)`; `prefs.scale` and the pan belong to the scene's transform,
 * and the matrices take the scaled coordinates.
 */
export function viewMatrix(params: CameraParams): Matrix4 {
  const { prefs, fit } = params;
  const angle = (prefs.pitch * Math.PI) / 180,
    ca = Math.cos(angle),
    sa = Math.sin(angle);
  const height = prefs.height * fit,
    distance = prefs.distance * fit;
  // prettier-ignore
  return new Matrix4().set(
    1, 0, 0, 0,
    0, ca, -sa, -height * ca + distance * sa,
    0, sa, ca, -height * sa - distance * ca,
    0, 0, 0, 1
  );
}

/**
 * The perspective of a view `width` × `height` pixels whose centre of projection sits where
 * `worldCamera` puts it, moved by `offset` (the keys dragged off the hit line).
 */
export function projectionMatrix(
  params: CameraParams,
  width: number,
  height: number,
  offset: { readonly x: number; readonly y: number } = { x: 0, y: 0 }
): Matrix4 {
  const { focal } = params;
  const cx = params.width / 2 + offset.x;
  const cy = params.originY + params.prefs.targetY + offset.y;
  // prettier-ignore
  return new Matrix4().set(
    (2 * focal) / width, 0, 1 - (2 * cx) / width, 0,
    0, (2 * focal) / height, (2 * cy) / height - 1, 0,
    0, 0, -(FAR + NEAR) / (FAR - NEAR), (-2 * FAR * NEAR) / (FAR - NEAR),
    0, 0, -1, 0
  );
}
