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
attribute vec4 noteProjection;
uniform vec4 roadWidth;
attribute vec4 noteContact;
uniform float roadVertical;
uniform float roadFreeDepth;
uniform float roadFree;
vec4 roadInstancePoint(vec4 localPoint) {
  vec4 point = instanceMatrix * localPoint;
  float t = clamp((noteProjection.w - localPoint.z - noteContact.y) / max(roadWidth.y - noteContact.y, 0.000001), 0.0, 1.0);
  if (roadFree > 0.0) {
    float progress = (noteProjection.w-localPoint.z-noteContact.y) / max(roadWidth.y-noteContact.y,0.000001);
    vec3 origin = vec3(instanceMatrix[3].x,noteContact.x,-noteContact.y);
    vec3 direction = vec3(noteContact.z,noteContact.w,roadFreeDepth)-origin;
    vec3 normal = normalize(vec3(0.0,-direction.z,direction.y));
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
vec4 projectNoteLane(vec4 point) {
  point.x = noteProjection.x * point.x + noteProjection.y * point.w;
  point.y += noteProjection.z * point.w;
  return point;
}
`;
