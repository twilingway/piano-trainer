import { depthAtScreenProgress } from "./perspective";
import {
  DEFAULT_CAMERA,
  MAX_ROAD_WORLD_Z,
  SAFE_VIEW_DEPTH,
  type CameraParams,
  type WorldCamera
} from "./worldCamera";

/** Notes own their projection; the keyboard supplies only the shared contact line. */
export function noteProjectionCamera(
  keyboard: WorldCamera,
  projection: "direct" | "perspective",
  viewportHeight: number,
  horizonShare = 0.1
): WorldCamera {
  const { near, sourceX } = keyboard;
  const origin = keyboard.project(0, near.y, near.z);
  const across = keyboard.project(1, near.y, near.z);
  const { scale } = keyboard.params.prefs;
  const pixels = (across.x - origin.x) / scale;
  if (origin.scale <= 0 || !Number.isFinite(pixels) || pixels <= 0) return keyboard;
  const fit = keyboard.params.fit;
  const height = Math.max(1, viewportHeight);
  const share = Number.isFinite(horizonShare) ? Math.max(0, Math.min(0.95, horizonShare)) : 0.1;
  const targetY = Math.max(0, Math.min(height * 0.9, origin.y * share));
  const farShare = 0.1;
  const direct = projection === "direct";
  const pitch = direct
    ? 90
    : calibratedPitch(farShare, origin.y - targetY, pixels, near.y, near.z, scale, fit);
  const angle = (pitch * Math.PI) / 180;
  const ca = direct ? 0 : Math.cos(angle);
  const sa = direct ? 1 : Math.sin(angle);
  // Keep the perspective vanishing row beyond the desired horizon even for a fitted 88-key view.
  const cameraHeight = direct
    ? 1000
    : Math.max(
        (near.y * scale + 1) / fit,
        (near.y * scale + ((origin.y - targetY) * ca) / (pixels * (1 - farShare))) / fit
      );
  const prefs = { ...DEFAULT_CAMERA, height: cameraHeight, pitch, scale, targetY: 0 };
  const yy = near.y * scale - prefs.height * fit;
  const zz = near.z * scale + prefs.distance * fit;
  const contactDepth = -yy * sa + zz * ca;
  const focal = pixels * contactDepth;
  const originY = origin.y + (yy * ca + zz * sa) * pixels;
  const params: CameraParams = {
    width: keyboard.params.width,
    focal,
    originX: origin.x,
    originY,
    fit,
    prefs,
    ...(keyboard.params.sourceUnits === undefined
      ? {}
      : { sourceUnits: keyboard.params.sourceUnits }),
    ...(keyboard.params.keyboardDepth === undefined
      ? {}
      : { keyboardDepth: keyboard.params.keyboardDepth }),
    ...(direct ? { orthographicScale: pixels } : {})
  };
  const project: WorldCamera["project"] = (x, y, z) => {
    const vertical = y * scale - prefs.height * fit;
    const depthZ = z * scale + prefs.distance * fit;
    const depth = -vertical * sa + depthZ * ca;
    if (depth <= 1) return { x: 0, y: 0, scale: 0 };
    const zoom = direct ? pixels : focal / depth;
    return {
      x: origin.x + x * scale * zoom,
      y: originY - (vertical * ca + depthZ * sa) * zoom,
      scale: zoom * scale * (keyboard.params.sourceUnits ?? 0.5)
    };
  };
  const depthOffset = prefs.height * fit * sa + prefs.distance * fit * ca;
  const clipLimit = direct ? Infinity : (SAFE_VIEW_DEPTH - depthOffset) / (scale * ca);
  const maximum = Math.max(near.z + 1, Math.min(MAX_ROAD_WORLD_Z, clipLimit));
  let low = near.z;
  let high = maximum;
  // Projection is monotone on this plane. The bounded solve also handles unreachable top rows.
  for (let step = 0; step < 48; step++) {
    const middle = (low + high) / 2;
    if (project(0, near.y, middle).y > targetY) low = middle;
    else high = middle;
  }
  const roadFarZ = Math.max(near.z + 1, (low + high) / 2);
  const projectAtProgress: WorldCamera["projectAtProgress"] = (x, y, nearZ, farZ, progress) => {
    if (direct) return project(x, y, farZ + (nearZ - farZ) * Math.max(0, Math.min(1, progress)));
    const vertical = y * scale - prefs.height * fit;
    const nearDepth = -vertical * sa + (nearZ * scale + prefs.distance * fit) * ca;
    const farDepth = -vertical * sa + (farZ * scale + prefs.distance * fit) * ca;
    const depth = depthAtScreenProgress(progress, nearDepth, farDepth);
    return project(x, y, farZ + (nearZ - farZ) * depth);
  };
  return {
    params,
    near,
    sourceX,
    project,
    projectAtProgress,
    roadFarZ,
    road: {
      at: (x, progress) =>
        project(sourceX(x), near.y, near.z + (1 - progress) * (roadFarZ - near.z)),
      progressAt: (depth) => depth,
      depthAt: (progress) => progress
    }
  };
}

/** Keep a requested taper reachable within native GPU clip planes, including fitted 88-key views. */
function calibratedPitch(
  farShare: number | undefined,
  travel: number,
  pixels: number,
  floor: number,
  nearZ: number,
  scale: number,
  fit: number
): number {
  if (farShare === undefined || travel <= 0) return 25;
  const zz = nearZ * scale + DEFAULT_CAMERA.distance * fit;
  const fits = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    const sine = Math.sin(radians),
      cosine = Math.cos(radians);
    const span = (travel * sine) / (pixels * farShare * scale) + (zz * (1 / farShare - 1)) / scale;
    const farDepth = (cosine * ((travel * sine) / (pixels * (1 - farShare)) + zz)) / farShare;
    return (
      nearZ + span < MAX_ROAD_WORLD_Z - 1 &&
      farDepth + floor * scale * sine < SAFE_VIEW_DEPTH * 0.95
    );
  };
  if (fits(25)) return 25;
  let low = 0,
    high = 25;
  for (let step = 0; step < 48; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}
