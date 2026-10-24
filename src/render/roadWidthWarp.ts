import { depthAtScreenProgress } from "./perspective";
import type { WorldCamera } from "./worldCamera";

export interface RoadWidthWarp {
  readonly nearZ: number;
  readonly axis: number;
  readonly farZ: number;
  readonly farScale: number;
  /** CPU coordinates have already had source-pixel pan subtracted. */
  pan: number;
  readonly contacts?: readonly { readonly y: number; readonly z: number }[];
}

export function roadWidthScale(warp: RoadWidthWarp, z: number, nearZ = warp.nearZ): number {
  const t = Math.max(0, Math.min(1, (z - nearZ) / Math.max(0.000001, warp.farZ - nearZ)));
  return 1 + (warp.farScale - 1) * t;
}

export function roadWidthX(warp: RoadWidthWarp, x: number, z: number, axis = warp.axis): number {
  return axis + (x - axis) * roadWidthScale(warp, z);
}

/** Width affects only transverse geometry; the canonical camera and longitudinal timing stay fixed. */
export function roadWidthCamera(
  camera: WorldCamera,
  requested: number,
  sourceWidth = camera.params.width,
  contacts: RoadWidthWarp["contacts"] = [camera.near],
  tapered = true
): WorldCamera {
  const share = Number.isFinite(requested) ? Math.max(-1, Math.min(0.9, requested)) : 0.1;
  const x0 = camera.sourceX(0),
    x1 = camera.sourceX(sourceWidth);
  const near0 = camera.project(x0, camera.near.y, camera.near.z);
  const near1 = camera.project(x1, camera.near.y, camera.near.z);
  const far0 = camera.project(x0, camera.near.y, camera.roadFarZ);
  const far1 = camera.project(x1, camera.near.y, camera.roadFarZ);
  const nearPx = Math.abs(near1.x - near0.x),
    farPx = Math.abs(far1.x - far0.x);
  const desired = share < 0 ? -share * camera.params.width : share * nearPx;
  const warp: RoadWidthWarp = {
    nearZ: camera.near.z,
    axis: (x0 + x1) / 2,
    farZ: camera.roadFarZ,
    farScale: tapered && farPx > 0.000001 ? desired / farPx : 1,
    contacts,
    pan: 0
  };
  const projectRoad: NonNullable<WorldCamera["projectRoad"]> = (x, y, z, near) => {
    const factor = roadWidthScale(warp, z, near);
    const point = camera.project(warp.axis - warp.pan + (x - warp.axis + warp.pan) * factor, y, z);
    return { ...point, scale: point.scale * factor };
  };
  const project: WorldCamera["project"] = (x, y, z) => {
    let near = warp.nearZ,
      distance = Infinity;
    for (const contact of contacts) {
      if (Math.abs(contact.y - y) < distance) {
        distance = Math.abs(contact.y - y);
        near = contact.z;
      }
    }
    return projectRoad(x, y, z, near);
  };
  return {
    ...camera,
    roadWidth: warp,
    projectRoad,
    project,
    projectAtProgress: (x, y, near, far, progress) => {
      const { prefs, fit, orthographicScale } = camera.params;
      let fraction = Math.max(0, Math.min(1, progress));
      if (orthographicScale === undefined) {
        const angle = (prefs.pitch * Math.PI) / 180,
          sine = Math.sin(angle),
          cosine = Math.cos(angle);
        const vertical = y * prefs.scale - prefs.height * fit;
        const nearDepth = -vertical * sine + (near * prefs.scale + prefs.distance * fit) * cosine;
        const farDepth = -vertical * sine + (far * prefs.scale + prefs.distance * fit) * cosine;
        fraction = depthAtScreenProgress(progress, nearDepth, farDepth);
      }
      return projectRoad(x, y, far + (near - far) * fraction, near);
    },
    road: {
      ...camera.road,
      at: (x, progress) =>
        project(
          camera.sourceX(x),
          camera.near.y,
          camera.near.z + (1 - progress) * (camera.roadFarZ - camera.near.z)
        )
    }
  };
}

/** Positive-depth CPU counterpart of the shared native road shader. */
export function roadWorldPoint(
  warp: RoadWidthWarp,
  x: number,
  y: number,
  z: number,
  contactY: number,
  contactZ: number,
  vertical = false
) {
  const progress = (z - contactZ) / Math.max(0.000001, warp.farZ - contactZ);
  return {
    x: warp.axis + (x - warp.axis) * roadWidthScale(warp, z, contactZ),
    y: vertical ? contactY + progress * 2000 : y,
    z: vertical ? contactZ - (y - contactY) : z
  };
}
