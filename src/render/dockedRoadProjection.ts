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
/** From this vertical bend, as a share of the view height, the lane leaves its key in full keyboard perspective. */
export const DOCKED_ROAD_LEAN_BEND = 0.025;
/**
 * Horizontal shift that moves a bent point onto the lane's keyboard projection (the line through
 * the contact and `keyboard`) at the point's own screen height. Weighted by the vertical bend, so a
 * straight join stays straight. Pure x in any space scaled per axis from NDC (clip or pixels), with
 * `full` in that space's y units.
 */
export function dockedRoadLean(
  bent: { readonly x: number; readonly y: number },
  anchor: { readonly x: number; readonly y: number },
  contact: { readonly x: number; readonly y: number },
  keyboard: { readonly x: number; readonly y: number },
  full: number,
  rest: { readonly y: number } = contact
): number {
  const keyRise = keyboard.y - contact.y;
  if (!(full > 0) || !(Math.abs(keyRise) > 1e-9)) return 0;
  // The bend is measured from the key at rest: a pressed key's dip is not a bend.
  const lean = Math.min(1, Math.abs(rest.y - anchor.y) / full);
  return lean * (contact.x + ((keyboard.x - contact.x) * (bent.y - contact.y)) / keyRise - bent.x);
}
function straightGain(progress: number, tilt: number): number {
  return Math.max(0, Math.min(1, 1 - tilt * (Number.isFinite(progress) ? progress : 1)));
}
/**
 * The straight join: a homogeneous offset linear in route progress keeps every straight road line
 * straight and lands exactly on the fitted contact at progress 0. The far end keeps its height;
 * sideways, `tilt` 1 leaves it in place, so the lane leans with the keyboard's perspective, and 0
 * shifts the whole lane, keeping the world camera's lean (and vanishing point); shares lie between.
 */
export function straightDockedClip(
  world: RoadClipPoint,
  worldAnchor: RoadClipPoint,
  fitted: RoadClipPoint,
  progress: number,
  tilt = 1
): RoadClipPoint {
  if (!(world.w > 0 && worldAnchor.w > 0 && fitted.w > 0)) return world;
  const gain = worldAnchor.w * straightGain(progress, 1),
    side = worldAnchor.w * straightGain(progress, tilt);
  return {
    x: world.x + side * (fitted.x / fitted.w - worldAnchor.x / worldAnchor.w),
    y: world.y + gain * (fitted.y / fitted.w - worldAnchor.y / worldAnchor.w),
    z: world.z + gain * (fitted.z / fitted.w - worldAnchor.z / worldAnchor.w),
    w: world.w
  };
}
/**
 * Translate by the contact delta; never project a distant horizon through the keyboard camera.
 * A fitted contact first straightens the whole route onto it; the bend then covers the rest, leaving
 * the key along the lane's own keyboard projection (`keyboard`) as far as the join is bent. `press`
 * is the key's dip already added to `keyboardAnchor` and `keyboard`; it never counts as bend.
 */
export function anchorRelativeDockedClip(
  world: RoadClipPoint,
  worldAnchor: RoadClipPoint,
  keyboardAnchor: RoadClipPoint,
  progress: number,
  target: RoadClipPoint = { x: 0, y: 0, z: 0, w: 1 },
  fitted?: RoadClipPoint,
  keyboard?: RoadClipPoint,
  press?: RoadClipPoint,
  tilt = 1
): RoadClipPoint {
  if (fitted) {
    const straight = straightDockedClip(world, worldAnchor, fitted, progress, tilt);
    if (straight !== world) [world, worldAnchor] = [straight, fitted];
  }
  const t = dockedRoadBlend(progress);
  if (t >= 1) {
    Object.assign(target, world);
    return target;
  }
  const pw = safeClipW(world.w),
    aw = safeClipW(worldAnchor.w),
    kw = safeClipW(keyboardAnchor.w);
  const sameSide = Math.sign(kw) === Math.sign(pw);
  if (t <= 0) {
    // The contact itself, carried at the point's own w: the same pixel, no w step at the keys.
    const scale = sameSide ? pw / kw : 1;
    target.x = keyboardAnchor.x * scale;
    target.y = keyboardAnchor.y * scale;
    target.z = keyboardAnchor.z * scale;
    target.w = keyboardAnchor.w * scale;
    return target;
  }
  const weight = 1 - t;
  // The point's own w. A w mixed in from the keyboard camera keeps the pixels but bends
  // perspective-correct varyings (rims, halo) inside every strip of the near quarter.
  const w = sameSide ? pw : Math.sign(kw) * weight + Math.sign(pw) * t;
  const x = world.x / pw + weight * (keyboardAnchor.x / kw - worldAnchor.x / aw),
    y = world.y / pw + weight * (keyboardAnchor.y / kw - worldAnchor.y / aw);
  const lean =
    keyboard && keyboard.w > 0 && kw > 0 && pw > 0
      ? dockedRoadLean(
          { x, y },
          { x: worldAnchor.x / aw, y: worldAnchor.y / aw },
          { x: keyboardAnchor.x / kw, y: keyboardAnchor.y / kw },
          { x: keyboard.x / keyboard.w, y: keyboard.y / keyboard.w },
          DOCKED_ROAD_LEAN_BEND * 2,
          press && keyboardAnchor.w - press.w > 0
            ? { y: (keyboardAnchor.y - press.y) / (keyboardAnchor.w - press.w) }
            : undefined
        )
      : 0;
  target.x = (x + weight * lean) * w;
  target.y = y * w;
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
  fitted?: { readonly x: number; readonly y: number },
  keyboard?: { readonly x: number; readonly y: number },
  viewHeight = 0,
  tilt = 1
): T {
  // Screen scale is inverse to clip w, so scale ratios give the straight offset's 1/w factor.
  if (fitted && (point.scale ?? 0) > 0 && (worldAnchor.scale ?? 0) > 0) {
    const ratio = (point.scale ?? 0) / (worldAnchor.scale ?? 1);
    const gain = straightGain(progress, 1) * ratio,
      side = straightGain(progress, tilt) * ratio;
    point = {
      ...point,
      x: point.x + side * (fitted.x - worldAnchor.x),
      y: point.y + gain * (fitted.y - worldAnchor.y)
    };
    worldAnchor = fitted;
  }
  const weight = 1 - dockedRoadBlend(progress);
  if (weight <= 0) return point;
  const bent = {
    x: point.x + weight * (keyboardAnchor.x - worldAnchor.x),
    y: point.y + weight * (keyboardAnchor.y - worldAnchor.y)
  };
  const lean = keyboard
    ? dockedRoadLean(
        bent,
        worldAnchor,
        keyboardAnchor,
        keyboard,
        DOCKED_ROAD_LEAN_BEND * viewHeight
      )
    : 0;
  return { ...point, x: bent.x + weight * lean, y: bent.y };
}
/** The CPU labels and every road material use this exact anchor-relative policy. */
export const DOCKED_ROAD_SHADER = /* glsl */ `
uniform float roadDockTilt;
float dockSafeW(float w) {
  return w < 0.0 ? min(-0.000001, w) : max(0.000001, w);
}
float dockLean(vec2 bent, vec2 a, vec2 c, vec2 k, float rest) {
  float keyRise = k.y - c.y;
  if (abs(keyRise) <= 1e-9) return 0.0;
  float lean = min(1.0, abs(rest - a.y) / ${(DOCKED_ROAD_LEAN_BEND * 2).toFixed(6)});
  return lean * (c.x + (k.x - c.x) * (bent.y - c.y) / keyRise - bent.x);
}
vec4 anchorRelativeRoadClip(vec4 point, vec4 anchor, vec4 fitted, vec4 pinned, float progress, vec4 keyboard, vec4 press) {
  if (point.w > 0.0 && anchor.w > 0.0 && fitted.w > 0.0) {
    vec3 delta = fitted.xyz / fitted.w - anchor.xyz / anchor.w;
    point.x += anchor.w * clamp(1.0 - roadDockTilt * progress, 0.0, 1.0) * delta.x;
    point.yz += anchor.w * clamp(1.0 - progress, 0.0, 1.0) * delta.yz;
    anchor = fitted;
  }
  float t = clamp(progress / 0.25, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  if (t >= 1.0) return point;
  float pw = dockSafeW(point.w), aw = dockSafeW(anchor.w), kw = dockSafeW(pinned.w);
  bool sameSide = sign(kw) == sign(pw);
  if (t <= 0.0) return sameSide ? pinned * (pw / kw) : pinned;
  float gain = 1.0 - t;
  float w = sameSide ? pw : sign(kw) * gain + sign(pw) * t;
  vec2 xy = point.xy / pw + gain * (pinned.xy / kw - anchor.xy / aw);
  vec4 rest = pinned - press;
  if (keyboard.w > 0.0 && kw > 0.0 && pw > 0.0 && rest.w > 0.0)
    xy.x += gain * dockLean(xy, anchor.xy / aw, pinned.xy / kw, keyboard.xy / keyboard.w, rest.y / rest.w);
  float z = mix(pinned.z / kw, point.z / pw, t);
  return vec4(xy * w, z * w, w);
}
`;
