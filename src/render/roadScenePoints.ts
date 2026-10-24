import type { Projected, RoadProjection } from "./perspective";
import { BLACK_NOTE_FLOOR, WHITE_NOTE_FLOOR } from "./noteDimensions";
import type { KeyRect } from "./keyboardLayout";
import { KEYBOARD_BLACK_BACK } from "./keyboardMetrics";
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
  height: 1,
  depth: KEYBOARD_BLACK_BACK
};

export function roadKeyHeights(
  keys: ReadonlyMap<number, KeyRect>,
  native: boolean
): Map<number, number> {
  const black = native ? BLACK_NOTE_FLOOR : 36;
  return new Map(
    [...keys.values()].map((key) => [key.x + key.width / 2, key.black ? black : WHITE_NOTE_FLOOR])
  );
}

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
      (keyHeight ?? near.y) + lift * (camera.params.sourceUnits ?? 0.5),
      (lane?.depth ?? near.z) + (1 - progress) * (camera.roadFarZ - (lane?.depth ?? near.z))
    ),
    lane
  );
}

export function freeRoadKeyPoint(
  three: ThreeKeysHost | undefined,
  x: number,
  y: number,
  keyboardTop: number
): { x: number; y: number; pitch?: number } | undefined {
  const point = three?.freeKeysPointAt(x, y);
  return point && { ...point, y: point.y + keyboardTop };
}
