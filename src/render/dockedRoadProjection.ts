/** Shared CPU/GLSL policy for the near quarter of a route. */
export const DOCKED_ROAD_TRANSITION = 0.25;
export function dockedRoadBlend(progress: number): number {
  const t = Math.max(
    0,
    Math.min(1, Number.isFinite(progress) ? progress / DOCKED_ROAD_TRANSITION : 1)
  );
  return t * t * (3 - 2 * t);
}
export interface RoadClipPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}
function safeClipW(w: number): number {
  return w < 0 ? Math.min(-0.000001, w) : Math.max(0.000001, w);
}
function straightGain(progress: number): number {
  return Math.max(0, Math.min(1, 1 - (Number.isFinite(progress) ? progress : 1)));
}
/**
 * The straight join: a homogeneous offset linear in route progress keeps every straight road line
 * straight, lands exactly on the fitted contact at progress 0 and leaves the far end in place.
 */
export function straightDockedClip(
  world: RoadClipPoint,
  worldAnchor: RoadClipPoint,
  fitted: RoadClipPoint,
  progress: number
): RoadClipPoint {
  if (!(world.w > 0 && worldAnchor.w > 0 && fitted.w > 0)) return world;
  const gain = worldAnchor.w * straightGain(progress);
  return {
    x: world.x + gain * (fitted.x / fitted.w - worldAnchor.x / worldAnchor.w),
    y: world.y + gain * (fitted.y / fitted.w - worldAnchor.y / worldAnchor.w),
    z: world.z + gain * (fitted.z / fitted.w - worldAnchor.z / worldAnchor.w),
    w: world.w
  };
}
/**
 * Translate by the contact delta; never project a distant horizon through the keyboard camera.
 * A fitted contact first straightens the whole route onto it; the bend then covers the rest.
 */
export function anchorRelativeDockedClip(
  world: RoadClipPoint,
  worldAnchor: RoadClipPoint,
  keyboardAnchor: RoadClipPoint,
  progress: number,
  target: RoadClipPoint = { x: 0, y: 0, z: 0, w: 1 },
  fitted?: RoadClipPoint
): RoadClipPoint {
  if (fitted) {
    const straight = straightDockedClip(world, worldAnchor, fitted, progress);
    if (straight !== world) [world, worldAnchor] = [straight, fitted];
  }
  const t = dockedRoadBlend(progress);
  if (t <= 0) {
    Object.assign(target, keyboardAnchor);
    return target;
  }
  if (t >= 1) {
    Object.assign(target, world);
    return target;
  }
  const pw = safeClipW(world.w),
    aw = safeClipW(worldAnchor.w),
    kw = safeClipW(keyboardAnchor.w);
  const weight = 1 - t;
  // A real homogeneous w, continuous with both ends, keeps varyings perspective-correct across t=1.
  const w =
    Math.sign(kw) === Math.sign(pw)
      ? kw * weight + pw * t
      : Math.sign(kw) * weight + Math.sign(pw) * t;
  target.x = (world.x / pw + weight * (keyboardAnchor.x / kw - worldAnchor.x / aw)) * w;
  target.y = (world.y / pw + weight * (keyboardAnchor.y / kw - worldAnchor.y / aw)) * w;
  target.z = ((keyboardAnchor.z / kw) * weight + (world.z / pw) * t) * w;
  target.w = w;
  return target;
}
/** Road-local end of a legacy lane's straight route, mirroring the shader's roadRouteDirection. */
export function legacyRouteFar(
  x: number,
  y: number,
  contactZ: number,
  road: { readonly axis: number; readonly farScale: number; readonly farZ: number },
  vertical = 0
): { x: number; y: number; z: number } {
  const far = road.axis + (x - road.axis) * road.farScale;
  return vertical > 0 ? { x: far, y: y + vertical, z: -contactZ } : { x: far, y, z: -road.farZ };
}
/** The screen-pixel form of the same blend for CPU layers that already project to pixels. */
export function dockedScreenPoint<T extends { x: number; y: number; scale?: number }>(
  point: T,
  worldAnchor: { readonly x: number; readonly y: number; readonly scale?: number },
  keyboardAnchor: { readonly x: number; readonly y: number },
  progress: number,
  fitted?: { readonly x: number; readonly y: number }
): T {
  // Screen scale is inverse to clip w, so scale ratios give the straight offset's 1/w factor.
  if (fitted && (point.scale ?? 0) > 0 && (worldAnchor.scale ?? 0) > 0) {
    const gain = (straightGain(progress) * (point.scale ?? 0)) / (worldAnchor.scale ?? 1);
    point = {
      ...point,
      x: point.x + gain * (fitted.x - worldAnchor.x),
      y: point.y + gain * (fitted.y - worldAnchor.y)
    };
    worldAnchor = fitted;
  }
  const weight = 1 - dockedRoadBlend(progress);
  if (weight <= 0) return point;
  return {
    ...point,
    x: point.x + weight * (keyboardAnchor.x - worldAnchor.x),
    y: point.y + weight * (keyboardAnchor.y - worldAnchor.y)
  };
}
/** The CPU labels and every road material use this exact anchor-relative policy. */
export const DOCKED_ROAD_SHADER = /* glsl */ `
float dockSafeW(float w) {
  return w < 0.0 ? min(-0.000001, w) : max(0.000001, w);
}
vec4 anchorRelativeRoadClip(vec4 point, vec4 anchor, vec4 fitted, vec4 pinned, float progress) {
  if (point.w > 0.0 && anchor.w > 0.0 && fitted.w > 0.0) {
    float straight = anchor.w * clamp(1.0 - progress, 0.0, 1.0);
    point.xyz += straight * (fitted.xyz / fitted.w - anchor.xyz / anchor.w);
    anchor = fitted;
  }
  float t = clamp(progress / 0.25, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  if (t <= 0.0) return pinned;
  if (t >= 1.0) return point;
  float pw = dockSafeW(point.w), aw = dockSafeW(anchor.w), kw = dockSafeW(pinned.w);
  float gain = 1.0 - t;
  float w = sign(kw) == sign(pw) ? mix(kw, pw, t) : sign(kw) * gain + sign(pw) * t;
  vec2 xy = point.xy / pw + gain * (pinned.xy / kw - anchor.xy / aw);
  float z = mix(pinned.z / kw, point.z / pw, t);
  return vec4(xy * w, z * w, w);
}
`;
