import { Matrix4 } from "three";
import type { Camera } from "three";
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
  const view = new Matrix4().set(
    1, 0, 0, 0,
    0, ca, -sa, -height * ca + distance * sa,
    0, sa, ca, -height * sa - distance * ca,
    0, 0, 0, 1
  );
  return view;
}

/**
 * The perspective of a view `width` × `height` pixels whose centre of projection sits where
 * `worldCamera` puts it, moved by `offset` (the keys dragged off the hit line).
 */
function baseProjectionMatrix(
  params: CameraParams,
  width: number,
  height: number,
  offset: { readonly x: number; readonly y: number } = { x: 0, y: 0 }
): Matrix4 {
  const { focal } = params;
  const cx = (params.originX ?? params.width / 2) + offset.x;
  const cy = params.originY + params.prefs.targetY + offset.y;
  if (params.orthographicScale !== undefined) {
    const scale = params.orthographicScale;
    const scaleY = params.orthographicScaleY ?? scale;
    // prettier-ignore
    return new Matrix4().set(
      2 * scale / width, 0, 0, 2 * cx / width - 1,
      0, 2 * scaleY / height, 0, 1 - 2 * cy / height,
      0, 0, -2 / (FAR - NEAR), -(FAR + NEAR) / (FAR - NEAR),
      0, 0, 0, 1
    );
  }
  // prettier-ignore
  return new Matrix4().set(
    (2 * focal) / width, 0, 1 - (2 * cx) / width, 0,
    0, (2 * focal) / height, (2 * cy) / height - 1, 0,
    0, 0, -(FAR + NEAR) / (FAR - NEAR), (-2 * FAR * NEAR) / (FAR - NEAR),
    0, 0, -1, 0
  );
}

/** Match the projection flags used by Three's PBR view-direction uniform. */
export function setCameraProjectionKind(camera: Camera, params: CameraParams): void {
  const typed = camera as Camera & { isOrthographicCamera: boolean; isPerspectiveCamera: boolean };
  typed.isOrthographicCamera = params.orthographicScale !== undefined;
  typed.isPerspectiveCamera = !typed.isOrthographicCamera;
}

/** Bake longitudinal display fitting into projection: Three deliberately strips scale from cameras. */
export function projectionMatrix(
  params: CameraParams,
  width: number,
  height: number,
  offset: { readonly x: number; readonly y: number } = { x: 0, y: 0 }
): Matrix4 {
  const projection = baseProjectionMatrix(params, width, height, offset);
  const factor = params.keyboardDepthScale;
  const anchor = params.keyboardDepthAnchor;
  if (factor === undefined || anchor === undefined) return projection;
  const view = viewMatrix(params);
  const depth = new Matrix4().makeScale(1, 1, factor);
  depth.elements[14] = -anchor * (1 - factor) * params.prefs.scale;
  return projection.multiply(view).multiply(depth).multiply(view.clone().invert());
}
