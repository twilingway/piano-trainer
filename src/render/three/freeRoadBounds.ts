import { Box3, Vector3 } from "three";
import type { Object3D, Matrix4 } from "three";
import type { FreeRoadLane } from "../freeRoadLayout";
import type { FreeSceneCamera } from "./FreeSceneCamera";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";

/** Structural endpoints cover every selected lane, even when the song is paused or empty. */
export function freeRoadBounds(lanes: readonly FreeRoadLane[], target = new Box3()): Box3 {
  target.makeEmpty();
  const point = new Vector3();
  for (const lane of lanes) {
    const margin = Math.max(1, lane.width / 2);
    for (const end of [lane.near, lane.far]) {
      target.expandByPoint(point.set(end.x - margin, end.y - margin, end.z - margin));
      target.expandByPoint(point.set(end.x + margin, end.y + margin, end.z + margin));
    }
  }
  return target;
}
const caches = new WeakMap<
  Object3D,
  { lanes: readonly FreeRoadLane[]; matrix: Matrix4; bounds: Box3 }
>();
export function prepareFreeRoadBounds(
  camera: FreeSceneCamera,
  road: Object3D,
  frame: ThreeRoadFrame | undefined,
  on: boolean
): void {
  if (!on || !frame?.freeLanes.length) {
    camera.setRoadBounds(undefined);
    return;
  }
  road.updateWorldMatrix(true, false);
  let cache = caches.get(road);
  if (cache?.lanes !== frame.freeLanes || !cache.matrix.equals(road.matrixWorld)) {
    cache = {
      lanes: frame.freeLanes,
      matrix: road.matrixWorld.clone(),
      bounds: freeRoadBounds(frame.freeLanes).applyMatrix4(road.matrixWorld)
    };
    caches.set(road, cache);
  }
  camera.setRoadBounds(cache.bounds);
}
