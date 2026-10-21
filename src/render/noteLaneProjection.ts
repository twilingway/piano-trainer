import type { Projected } from "./perspective";
import type { WorldCamera } from "./worldCamera";

export interface NoteLaneProjection {
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
attribute vec3 noteProjection;
vec4 projectNoteLane(vec4 point) {
  point.x = noteProjection.x * point.x + noteProjection.y * point.w;
  point.y += noteProjection.z * point.w;
  return point;
}
`;
