import { depthAtScreenProgress } from "./perspective";
import { normalizeRoadHorizon } from "./roadHorizon";
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
  if (
    ![origin.x, origin.y, origin.scale, fit, scale, near.y, near.z].every(Number.isFinite) ||
    fit <= 0 ||
    scale <= 0
  )
    return keyboard;
  const height = Number.isFinite(viewportHeight)
    ? Math.max(1, viewportHeight)
    : Math.max(1, origin.y);
  const direct = projection === "direct";
  const share = normalizeRoadHorizon(horizonShare);
  const legacyTarget = (value: number) => Math.max(0, Math.min(height * 0.9, origin.y * value));
  const targetY = direct
    ? legacyTarget(Math.min(0.95, share))
    : share <= 0.6
      ? legacyTarget(share)
      : share < 1
        ? legacyTarget(0.6) + ((origin.y - legacyTarget(0.6)) * (share - 0.6)) / 0.4
        : origin.y * share;
  const farShare = direct ? 0.1 : farWidthBudget(near.z, scale, fit);
  if (farShare === undefined) return keyboard;
  const travel = origin.y - targetY;
  const pitch = direct
    ? 90
    : Math.sign(travel) *
      Math.min(
        calibratedPitch(farShare, Math.abs(travel), pixels, near.y, near.z, scale, fit),
        25 * Math.min(1, Math.abs(1 - share) / 0.4)
      );
  const angle = (pitch * Math.PI) / 180;
  const ca = direct ? 0 : Math.cos(angle);
  const sa = direct ? 1 : Math.sin(angle);
  // Keep the perspective vanishing row beyond the desired horizon even for a fitted 88-key view.
  const cameraHeight = direct
    ? 1000
    : (near.y * scale + (travel * ca) / (pixels * (1 - farShare))) / fit;
  const prefs = { ...DEFAULT_CAMERA, height: cameraHeight, pitch, scale, targetY: 0 };
  const yy = near.y * scale - prefs.height * fit;
  const zz = near.z * scale + prefs.distance * fit;
  const contactDepth = -yy * sa + zz * ca;
  const focal = pixels * contactDepth;
  const originY = origin.y + (yy * ca + zz * sa) * pixels;
  if (![cameraHeight, contactDepth, focal, originY].every(Number.isFinite) || contactDepth <= 1)
    return keyboard;
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
  const direction = Math.sign(targetY - origin.y);
  // A horizontal plane still needs finite depth to reach the requested width taper.
  if (!direct && direction === 0) {
    high = low = Math.min(maximum, near.z + (contactDepth * (1 / farShare - 1)) / (scale * ca));
  } else {
    for (let step = 0; step < 48; step++) {
      const middle = (low + high) / 2;
      if (
        direct
          ? project(0, near.y, middle).y > targetY
          : (project(0, near.y, middle).y - targetY) * direction < 0
      )
        low = middle;
      else high = middle;
    }
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

/** Increase the internal far width only when even a level plane exceeds the existing budgets. */
function farWidthBudget(nearZ: number, scale: number, fit: number): number | undefined {
  const distance = DEFAULT_CAMERA.distance * fit;
  const contact = nearZ * scale + distance;
  const required = Math.max(
    contact / (scale * (MAX_ROAD_WORLD_Z - 1) + distance),
    contact / (SAFE_VIEW_DEPTH * 0.95)
  );
  if (!Number.isFinite(required) || required >= 1 || contact <= 1) return undefined;
  return required < 0.1 ? 0.1 : required + (1 - required) * 1e-8;
}
