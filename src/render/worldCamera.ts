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
  height: [25, 420],
  distance: [120, 1200],
  pitch: [-5, 60],
  targetY: [-250, 250],
  scale: [0.55, 1.6]
} as const;
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
export interface WorldCamera {
  readonly project: (x: number, y: number, z: number) => Projected;
  readonly road: RoadProjection;
  readonly sourceX: (x: number) => number;
  readonly roadFarZ: number;
  readonly projectAtProgress: (
    x: number,
    y: number,
    nearZ: number,
    farZ: number,
    progress: number
  ) => Projected;
}
const rad = (angle: number) => (angle * Math.PI) / 180;
/** One calibrated XYZ camera: source pixels map to half-millimetre world coordinates. */
export function worldCamera(
  width: number,
  height: number,
  prefs: CameraPrefs = DEFAULT_CAMERA
): WorldCamera {
  const fit = Math.max(1, height / 375);
  const defaultAngle = rad(DEFAULT_CAMERA.pitch);
  const frontDepth =
    DEFAULT_CAMERA.distance * fit * Math.cos(defaultAngle) +
    (DEFAULT_CAMERA.height * fit - 22) * Math.sin(defaultAngle);
  const focal =
    (frontDepth * 2 * Math.tan(rad(DEFAULT_CAMERA.fov) / 2)) / Math.tan(rad(prefs.fov) / 2);
  const defaultFocal = frontDepth * 2;
  const defaultBottomDepth =
    DEFAULT_CAMERA.distance * fit * Math.cos(defaultAngle) +
    DEFAULT_CAMERA.height * fit * Math.sin(defaultAngle);
  const defaultBottomY =
    ((-DEFAULT_CAMERA.height * fit * Math.cos(defaultAngle) +
      DEFAULT_CAMERA.distance * fit * Math.sin(defaultAngle)) *
      defaultFocal) /
    defaultBottomDepth;
  const originY = height - 8 + defaultBottomY;
  const angle = rad(prefs.pitch),
    ca = Math.cos(angle),
    sa = Math.sin(angle);
  const project = (x: number, y: number, z: number): Projected => {
    const yy = y * prefs.scale - prefs.height * fit;
    const zz = z * prefs.scale + prefs.distance * fit;
    const depth = -yy * sa + zz * ca;
    if (depth <= 1) return { x: 0, y: 0, scale: 0 };
    const scale = focal / depth;
    return {
      x: width / 2 + x * prefs.scale * scale,
      y: originY - (yy * ca + zz * sa) * scale + prefs.targetY,
      scale: (scale * prefs.scale) / 2
    };
  };
  const sourceX = (x: number) => (x - width / 2) / 2;
  const projectAtProgress = (
    x: number,
    y: number,
    nearZ: number,
    farZ: number,
    progress: number
  ): Projected => {
    const yy = y * prefs.scale - prefs.height * fit;
    const nearDepth = -yy * sa + (nearZ * prefs.scale + prefs.distance * fit) * ca;
    const farDepth = -yy * sa + (farZ * prefs.scale + prefs.distance * fit) * ca;
    const depth = depthAtScreenProgress(progress, nearDepth, farDepth);
    return project(x, y, farZ + (nearZ - farZ) * depth);
  };
  const roadFarZ = 142 + 1500 * fit;
  const road: RoadProjection = {
    at: (x, t) => project(sourceX(x), 22, 142 + (1 - t) * (roadFarZ - 142)),
    progressAt: (depth) => depth,
    depthAt: (progress) => progress
  };
  return { project, projectAtProgress, sourceX, roadFarZ, road };
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
  sourceWidth = black ? 26 : 44
) {
  const half = sourceWidth / 4;
  const y = black ? 36 : 22;
  const frontZ = black ? 57 : 0;
  const bottomY = black ? 22 : 0;
  const top: readonly [Projected, Projected, Projected, Projected] = [
    camera.project(centre - half, y, 142),
    camera.project(centre + half, y, 142),
    camera.project(centre + half, y, frontZ),
    camera.project(centre - half, y, frontZ)
  ];
  const leftBottom = camera.project(centre - half, bottomY, frontZ);
  const rightBottom = camera.project(centre + half, bottomY, frontZ);
  const front = [top[3], top[2], rightBottom, leftBottom];
  const side = [top[1], camera.project(centre + half, bottomY, 142), rightBottom, top[2]];
  return { top, front, side, outline: convexHull([...top, ...front, ...(black ? side : [])]) };
}
