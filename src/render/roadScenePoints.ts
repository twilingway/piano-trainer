import type { Projected, RoadProjection } from "./perspective";
import { BLACK_NOTE_FLOOR } from "./noteDimensions";
import { projectNoteLane } from "./noteLaneProjection";
import type { NoteLaneProjection } from "./noteLaneProjection";
import type { WorldCamera } from "./worldCamera";
import type { ThreeKeysHost } from "./three/ThreeKeysHost";

/** Physical black lanes need no correction in the inspection camera. */
export const FREE_BLACK_LANE: NoteLaneProjection = {
  y: BLACK_NOTE_FLOOR,
  scaleX: 1,
  offsetX: 0,
  offsetY: 0,
  width: 1,
  height: 1
};

export function roadNotePlace(
  camera: WorldCamera | undefined,
  projection: RoadProjection | undefined,
  height: number,
  pan: number,
  keyX: number,
  y: number,
  offset: number,
  lift: number,
  lane: NoteLaneProjection | undefined,
  keyHeight: number | undefined
): Projected | undefined {
  if (!projection || height <= 0) return undefined;
  const progress = Math.max(0, Math.min(1, y / height));
  if (!camera) {
    const spot = projection.at(keyX - pan + offset, progress);
    return { ...spot, y: spot.y - lift * spot.scale };
  }
  const { near } = camera;
  return projectNoteLane(
    camera.project(
      camera.sourceX(keyX - pan + offset),
      (keyHeight ?? near.y) + lift / 2,
      near.z + (1 - progress) * (camera.roadFarZ - near.z)
    ),
    lane
  );
}

export function freeRoadKeyPoint(
  three: ThreeKeysHost | undefined,
  x: number,
  y: number,
  keyboardTop: number
): { x: number; y: number } | undefined {
  const point = three?.freeKeysPointAt(x, y);
  return point && { x: point.x, y: point.y + keyboardTop };
}
