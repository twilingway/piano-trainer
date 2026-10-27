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
/** Translate by the contact delta; never project a distant horizon through the keyboard camera. */
export function anchorRelativeDockedClip(
  world: RoadClipPoint,
  worldAnchor: RoadClipPoint,
  keyboardAnchor: RoadClipPoint,
  progress: number,
  target: RoadClipPoint = { x: 0, y: 0, z: 0, w: 1 }
): RoadClipPoint {
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
  const w = Math.sign(kw) * weight + Math.sign(pw) * t;
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
export function dockedScreenPoint<T extends { x: number; y: number }>(
  point: T,
  worldAnchor: { readonly x: number; readonly y: number },
  keyboardAnchor: { readonly x: number; readonly y: number },
  progress: number
): T {
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
vec4 anchorRelativeRoadClip(vec4 point, vec4 anchor, vec4 pinned, float progress) {
  float t = clamp(progress / 0.25, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  if (t <= 0.0) return pinned;
  if (t >= 1.0) return point;
  float pw = dockSafeW(point.w), aw = dockSafeW(anchor.w), kw = dockSafeW(pinned.w);
  float gain = 1.0 - t;
  float w = sign(kw) * gain + sign(pw) * t;
  vec2 xy = point.xy / pw + gain * (pinned.xy / kw - anchor.xy / aw);
  float z = mix(pinned.z / kw, point.z / pw, t);
  return vec4(xy * w, z * w, w);
}
`;
