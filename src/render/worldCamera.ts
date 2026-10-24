import type { RoadWidthWarp } from "./roadWidthWarp";
import type { Projected, RoadProjection } from "./perspective";
import { depthAtScreenProgress } from "./perspective";

export interface CameraPrefs {
  readonly fov: number;
  readonly height: number;
  readonly distance: number;
  readonly pitch: number;
  readonly targetY: number;
  readonly scale: number;
}
export const DEFAULT_CAMERA: CameraPrefs = {
  fov: 43,
  height: 230,
  distance: 720,
  pitch: 25,
  targetY: 0,
  scale: 1
};
export const CAMERA_LIMITS = {
  fov: [25, 85],
  height: [25, 1000],
  distance: [120, 1200],
  pitch: [-5, 90],
  targetY: [-250, 250],
  scale: [0.55, 1.6]
} as const;
/**
 * Ready views of the keys; a preset keeps the keyboard's own scale. Each keeps the default's angle
 * between the view's axis and the keys, so the keys stay low in the frame.
 */
export const CAMERA_PRESETS = {
  player: DEFAULT_CAMERA,
  top: { ...DEFAULT_CAMERA, height: 803, distance: 120, pitch: 90 },
  hands: { ...DEFAULT_CAMERA, height: 212, distance: 300, pitch: 42 }
} as const satisfies Record<string, CameraPrefs>;
export function normalizeCamera(value: unknown): CameraPrefs {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const number = (key: keyof CameraPrefs): number => {
    const v = input[key];
    const [low, high] = CAMERA_LIMITS[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.max(low, Math.min(high, v))
      : DEFAULT_CAMERA[key];
  };
  return {
    fov: number("fov"),
    height: number("height"),
    distance: number("distance"),
    pitch: number("pitch"),
    targetY: number("targetY"),
    scale: number("scale")
  };
}
/** The numbers `project` is built from, for a renderer that has to see the same scene. */
export interface CameraParams {
  /** Standard keyboard-only longitudinal fit; free and performance cameras do not use it. */
  readonly keyboardDepthScale?: number;
  readonly keyboardDepthAnchor?: number;
  readonly width: number;
  /** Pixels per world unit at depth 1. */
  readonly focal: number;
  /** The screen row the camera's axis passes through, before `prefs.targetY`. */
  readonly originY: number;
  /** How much the default distance and height grow with the view's height. */
  readonly fit: number;
  readonly prefs: CameraPrefs;
  /** Constant pixels per world unit before the user's scale, for the strict overhead view. */
  readonly orthographicScale?: number;
  /** Independent vertical fit for the derived overhead keyboard camera. */
  readonly orthographicScaleY?: number;
  /** Off-axis horizontal centre; absent for the ordinary road camera. */
  readonly originX?: number;
  /** Metric world units per source pixel; legacy projections use one half. */
  readonly sourceUnits?: number;
  /** Physical white-key depth; absent for the legacy 142-unit keyboard. */
  readonly keyboardDepth?: number;
}
/** Actual unpanned key bounds in world units; pan retains its source-pixel units. */
export interface OverheadFit {
  readonly left: number;
  readonly right: number;
  readonly pan: number;
  readonly margin?: number;
}
export interface RoadNear {
  readonly y: number;
  readonly z: number;
}
/** The road starts behind the keys, on the white keys' top. */
export const KEYS_BACK: RoadNear = { y: 22, z: 142 };
/** The road of the "3d" style starts on the back panel's front top edge, 28 mm over the keys. */
export const PANEL_EDGE: RoadNear = { y: 50, z: (151.5 * 142) / 150 };

export interface WorldCamera {
  readonly roadWidth?: RoadWidthWarp;
  readonly projectRoad?: (x: number, y: number, z: number, contactZ: number) => Projected;
  readonly params: CameraParams;
  readonly project: (x: number, y: number, z: number) => Projected;
  readonly road: RoadProjection;
  readonly sourceX: (x: number) => number;
  readonly roadFarZ: number;
  /** Where the road starts: the hit line's height and depth. */
  readonly near: RoadNear;
  readonly projectAtProgress: (
    x: number,
    y: number,
    nearZ: number,
    farZ: number,
    progress: number
  ) => Projected;
}
const rad = (angle: number) => (angle * Math.PI) / 180;
/** Keep the fitted road within Three's 50000-unit clip plane, including scaled note bodies. */
export const MAX_ROAD_WORLD_Z = 25000;
export const SAFE_VIEW_DEPTH = 48000;
/** One calibrated XYZ camera: source pixels map to half-millimetre world coordinates. */
export function worldCamera(
  width: number,
  height: number,
  prefs: CameraPrefs = DEFAULT_CAMERA,
  near: RoadNear = KEYS_BACK,
  horizonShare?: number,
  overheadFit?: OverheadFit,
  sourceUnits = 0.5,
  keyboardDepth?: number
): WorldCamera {
  const fit = Math.max(1, height / 375);
  const defaultAngle = rad(DEFAULT_CAMERA.pitch);
  const frontDepth =
    DEFAULT_CAMERA.distance * fit * Math.cos(defaultAngle) +
    (DEFAULT_CAMERA.height * fit - 22) * Math.sin(defaultAngle);
  let focal =
    ((frontDepth * 2 * Math.tan(rad(DEFAULT_CAMERA.fov) / 2)) / Math.tan(rad(prefs.fov) / 2)) *
    (0.5 / sourceUnits);
  const defaultFocal = frontDepth * 2 * (0.5 / sourceUnits);
  const defaultBottomDepth =
    DEFAULT_CAMERA.distance * fit * Math.cos(defaultAngle) +
    DEFAULT_CAMERA.height * fit * Math.sin(defaultAngle);
  const defaultBottomY =
    ((-DEFAULT_CAMERA.height * fit * Math.cos(defaultAngle) +
      DEFAULT_CAMERA.distance * fit * Math.sin(defaultAngle)) *
      defaultFocal) /
    defaultBottomDepth;
  let originY = height - 8 + defaultBottomY;
  const angle = rad(prefs.pitch),
    ca = prefs.pitch === 90 ? 0 : Math.cos(angle),
    sa = prefs.pitch === 90 ? 1 : Math.sin(angle);
  if (keyboardDepth !== undefined && prefs.pitch !== 90 && overheadFit && width > 24) {
    const extent = Math.max(
      Math.abs(overheadFit.left - overheadFit.pan * sourceUnits),
      Math.abs(overheadFit.right - overheadFit.pan * sourceUnits)
    );
    // The front is the widest projected piano row; fit the song there, not by scaling the mesh.
    const frontHeight = sa < 0 ? 0 : 34;
    const depth = (prefs.height * fit - frontHeight * prefs.scale) * sa + prefs.distance * fit * ca;
    if (extent > 0 && depth > 1) {
      const zoom = Math.min(1, ((width / 2 - 12) * depth) / (extent * prefs.scale * focal));
      const yy = near.y * prefs.scale - prefs.height * fit;
      const zz = near.z * prefs.scale + prefs.distance * fit;
      const before = ((yy * ca + zz * sa) * focal) / (-yy * sa + zz * ca);
      focal *= zoom;
      originY -= before * (1 - zoom);
    }
  }
  const initialOrthoScale =
    prefs.pitch === 90 ? focal / Math.max(1, prefs.height * fit - 22 * prefs.scale) : undefined;
  let fitScale = 1;
  if (initialOrthoScale !== undefined && overheadFit && width > 1) {
    const { left, right, pan } = overheadFit;
    if (Number.isFinite(left) && Number.isFinite(right) && right > left && Number.isFinite(pan)) {
      const requestedMargin = overheadFit.margin;
      const margin = Math.min(
        width * 0.25,
        Math.max(0, Number.isFinite(requestedMargin) ? (requestedMargin ?? 12) : 12)
      );
      const extent = Math.max(
        Math.abs(left - pan * sourceUnits),
        Math.abs(right - pan * sourceUnits)
      );
      const projectedExtent = extent * prefs.scale * initialOrthoScale;
      if (projectedExtent > 0) fitScale = Math.min(1, (width / 2 - margin) / projectedExtent);
    }
  }
  const orthographicScale =
    initialOrthoScale === undefined ? undefined : initialOrthoScale * fitScale;
  if (initialOrthoScale !== undefined && orthographicScale !== undefined)
    originY -=
      (near.z * prefs.scale + prefs.distance * fit) * (initialOrthoScale - orthographicScale);
  const project = (x: number, y: number, z: number): Projected => {
    const yy = y * prefs.scale - prefs.height * fit;
    const zz = z * prefs.scale + prefs.distance * fit;
    const depth = -yy * sa + zz * ca;
    if (depth <= 1) return { x: 0, y: 0, scale: 0 };
    const scale = orthographicScale ?? focal / depth;
    return {
      x: width / 2 + x * prefs.scale * scale,
      y: originY - (yy * ca + zz * sa) * scale + prefs.targetY,
      scale: scale * prefs.scale * sourceUnits
    };
  };
  const sourceX = (x: number) => (x - width / 2) * sourceUnits;
  const projectAtProgress = (
    x: number,
    y: number,
    nearZ: number,
    farZ: number,
    progress: number
  ): Projected => {
    if (orthographicScale !== undefined)
      return project(x, y, farZ + (nearZ - farZ) * Math.max(0, Math.min(1, progress)));
    const yy = y * prefs.scale - prefs.height * fit;
    const nearDepth = -yy * sa + (nearZ * prefs.scale + prefs.distance * fit) * ca;
    const farDepth = -yy * sa + (farZ * prefs.scale + prefs.distance * fit) * ca;
    const depth = depthAtScreenProgress(progress, nearDepth, farDepth);
    return project(x, y, farZ + (nearZ - farZ) * depth);
  };
  const fallbackSpan = 1500 * fit;
  let roadFarZ = near.z + fallbackSpan;
  if (horizonShare !== undefined && Number.isFinite(horizonShare) && height > 0) {
    const hit = project(0, near.y, near.z);
    if (hit.scale > 0 && hit.y > 0) {
      const share = Math.max(0, Math.min(0.95, horizonShare));
      const targetY = Math.max(0, Math.min(height * 0.9, hit.y * share));
      const q = (originY + prefs.targetY - targetY) / focal;
      const denominator = q * ca - sa;
      const depthOffset = prefs.height * fit * sa + prefs.distance * fit * ca;
      const clipLimit = ca > 1e-8 ? (SAFE_VIEW_DEPTH - depthOffset) / (prefs.scale * ca) : Infinity;
      const maxFarZ = Math.min(MAX_ROAD_WORLD_Z, clipLimit);
      if (Number.isFinite(maxFarZ) && maxFarZ >= near.z + Math.max(1, fit)) {
        const yy = near.y * prefs.scale - prefs.height * fit;
        const zz =
          orthographicScale !== undefined
            ? (originY + prefs.targetY - targetY) / orthographicScale
            : Math.abs(denominator) > 1e-8
              ? (yy * (ca + q * sa)) / denominator
              : NaN;
        const solved = (zz - prefs.distance * fit) / prefs.scale;
        const span = solved - near.z;
        // At or above the vanishing point, approach the furthest safe row instead of snapping near.
        const fitted =
          Number.isFinite(solved) && span > 0
            ? Math.max(near.z + Math.max(1, fit), Math.min(maxFarZ, solved))
            : maxFarZ;
        const far = project(0, near.y, fitted);
        if (far.scale > 0 && Number.isFinite(far.y) && far.y < hit.y) roadFarZ = fitted;
      }
    }
  }
  const road: RoadProjection = {
    at: (x, t) => project(sourceX(x), near.y, near.z + (1 - t) * (roadFarZ - near.z)),
    progressAt: (depth) => depth,
    depthAt: (progress) => progress
  };
  const params: CameraParams = {
    width,
    focal,
    originY,
    fit,
    prefs,
    ...(sourceUnits === 0.5 ? {} : { sourceUnits }),
    ...(keyboardDepth === undefined ? {} : { keyboardDepth })
  };
  const projectionParams =
    orthographicScale === undefined ? params : { ...params, orthographicScale };
  return { params: projectionParams, project, projectAtProgress, sourceX, roadFarZ, road, near };
}
export function insidePolygon(x: number, y: number, points: readonly Projected[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (!a || !b) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The convex outline of the visible faces of a projected physical key. */
export function convexHull(points: readonly Projected[]): readonly Projected[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Projected, b: Projected, c: Projected) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (values: readonly Projected[]): Projected[] => {
    const result: Projected[] = [];
    for (const point of values) {
      while (result.length >= 2) {
        const a = result[result.length - 2],
          b = result[result.length - 1];
        if (!a || !b || cross(a, b, point) > 0) break;
        result.pop();
      }
      result.push(point);
    }
    result.pop();
    return result;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
export function keySurface(
  camera: WorldCamera,
  centre: number,
  black: boolean,
  sourceWidth = black ? 26 : 44,
  blackTop = 36
) {
  const metric = camera.params.keyboardDepth !== undefined;
  const half = metric ? (black ? 13.31152 : 22.5) / 2 : sourceWidth / 4;
  const y = black ? blackTop : 22;
  const frontZ = black ? (metric ? 55.7766 : 57) : 0;
  const back = metric ? (black ? 149.8008 : 150) : 142;
  const bottomY = black ? 22 : 0;
  const top: readonly [Projected, Projected, Projected, Projected] = [
    camera.project(centre - half, y, back),
    camera.project(centre + half, y, back),
    camera.project(centre + half, y, frontZ),
    camera.project(centre - half, y, frontZ)
  ];
  const leftBottom = camera.project(centre - half, bottomY, frontZ);
  const rightBottom = camera.project(centre + half, bottomY, frontZ);
  const front = [top[3], top[2], rightBottom, leftBottom];
  const side = [top[1], camera.project(centre + half, bottomY, back), rightBottom, top[2]];
  return { top, front, side, outline: convexHull([...top, ...front, ...(black ? side : [])]) };
}
