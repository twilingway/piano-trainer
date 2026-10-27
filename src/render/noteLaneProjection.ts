import { DOCKED_ROAD_SHADER } from "./dockedRoadProjection";
import type { FreeRoadPoint } from "./freeRoadLayout";
import type { Projected } from "./perspective";
import type { WorldCamera } from "./worldCamera";

export interface NoteLaneProjection {
  readonly freeFar?: FreeRoadPoint;
  /** Physical displacement from the wide front-key axis to its rear contact surface. */
  readonly worldOffsetX?: number;
  readonly y: number;
  readonly scaleX: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly depth?: number;
}

/** A layout-only affine correction joins raised black-note lanes to their physical key backs. */
export function createNoteLaneProjection(
  notes: WorldCamera,
  keyboard: WorldCamera,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  depth?: number
): NoteLaneProjection {
  const width = Math.max(1, viewportWidth),
    height = Math.max(1, viewportHeight);
  const from = notes.project(0, y, depth ?? notes.near.z);
  const to = keyboard.project(0, y, depth ?? keyboard.near.z);
  const scaleX = from.scale > 0 && to.scale > 0 ? to.scale / from.scale : 1;
  const offsetX = (2 * to.x) / width - 1 - scaleX * ((2 * from.x) / width - 1);
  const offsetY = (-2 * (to.y - from.y)) / height;
  return { y, scaleX, offsetX, offsetY, width, height, ...(depth === undefined ? {} : { depth }) };
}

export function projectNoteLane(point: Projected, lane?: NoteLaneProjection): Projected {
  if (!lane) return point;
  return {
    x: ((lane.scaleX * ((2 * point.x) / lane.width - 1) + lane.offsetX + 1) * lane.width) / 2,
    y: point.y - (lane.offsetY * lane.height) / 2,
    scale: point.scale * lane.scaleX
  };
}

/** The same correction is shared by every visible layer, including screen-space halo corners. */
export const NOTE_LANE_SHADER = /* glsl */ `
${DOCKED_ROAD_SHADER}
attribute vec4 noteProjection;
uniform vec4 roadWidth;
attribute vec4 noteContact;
uniform float roadVertical;
uniform float roadFreeDepth;
uniform float roadFree;
uniform float roadDockEnabled;
uniform float roadDockOffsets[88];
uniform vec4 roadDockY;
#ifdef NOTE_META_PACKED
attribute vec2 noteAlphaPitch;
#define notePitch noteAlphaPitch.y
#define noteAlpha noteAlphaPitch.x
#else
attribute vec4 noteSize;
#define notePitch noteSize.w
#endif
uniform mat4 roadDockTransform;
uniform mat4 roadDockFitTransform;
uniform mat4 roadDockInverse;
float roadNoteProgress(float localZ) {
  return (noteProjection.w - localZ - noteContact.y) / max(roadWidth.y - noteContact.y, 0.000001);
}
vec4 roadInstancePoint(vec4 localPoint) {
  vec4 point = instanceMatrix * localPoint;
  float t = clamp((noteProjection.w - localPoint.z - noteContact.y) / max(roadWidth.y - noteContact.y, 0.000001), 0.0, 1.0);
  if (roadFree > 0.0) {
    float progress = (noteProjection.w-localPoint.z-noteContact.y) / max(roadWidth.y-noteContact.y,0.000001);
    vec3 origin = vec3(instanceMatrix[3].x,noteContact.x,-noteContact.y);
    vec3 direction = vec3(noteContact.z,noteContact.w,roadFreeDepth)-origin;
    vec3 normal = vec3(0.0,-direction.z,direction.y) / max(length(direction.yz), 0.000001);
    vec3 routed = origin+direction*progress+vec3(point.x-origin.x,0.0,0.0)+normal*(point.y-noteContact.x);
    return vec4(routed,1.0);
  }
  point.x = roadWidth.w + (point.x-roadWidth.w) * mix(1.0, roadWidth.z, t);
  if (roadVertical > 0.0) {
    float lift = point.y - noteContact.x;
    point.y = noteContact.x + (noteProjection.w - localPoint.z - noteContact.y) / max(roadWidth.y - noteContact.y, 0.000001) * roadVertical;
    point.z = -noteContact.y + lift;
  }
  return point;
}
vec4 projectRoadPoint(vec4 localPoint) {
  return projectionMatrix * modelViewMatrix * roadInstancePoint(localPoint);
}
// One unit of progress along this note's straight route: free lanes carry their far point, the
// legacy road is its width taper plus the depth span (or the direct view's vertical rise).
vec3 roadRouteDirection() {
  if (roadFree > 0.0)
    return vec3(noteContact.z - instanceMatrix[3].x,
      vec2(noteContact.w, roadFreeDepth) - vec2(noteContact.x, -noteContact.y));
  float taper = (instanceMatrix[3].x - roadWidth.w) * (roadWidth.z - 1.0);
  if (roadVertical > 0.0) return vec3(taper, roadVertical, 0.0);
  return vec3(taper, 0.0, -(roadWidth.y - noteContact.y));
}
vec4 projectNoteLane(vec4 point, float localZ) {
  if (roadDockEnabled > 0.0) {
    vec4 local = roadDockInverse * point;
    float progress = roadNoteProgress(localZ);
    vec3 contact = local.xyz / max(abs(local.w), 0.000001) - roadRouteDirection() * progress;
    vec4 anchor = projectionMatrix * modelViewMatrix * vec4(contact, 1.0);
    vec4 pinned = roadDockTransform * anchor;
    if (notePitch >= 21.0 && notePitch <= 108.0) pinned += roadDockY * roadDockOffsets[int(floor(notePitch + 0.5)) - 21];
    return anchorRelativeRoadClip(point, anchor, roadDockFitTransform * anchor, pinned, progress);
  }
  point.x = noteProjection.x * point.x + noteProjection.y * point.w;
  point.y += noteProjection.z * point.w;
  return point;
}
vec4 projectRoadLanePoint(vec4 localPoint) {
  return projectNoteLane(projectRoadPoint(localPoint), localPoint.z);
}
`;
