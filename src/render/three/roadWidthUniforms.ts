import { Matrix4 } from "three";
import type { WorldCamera } from "../worldCamera";

/** Shared only by road materials; each stage sets these immediately before its own draw. */
export const roadWidthUniforms = {
  roadDockOffsets: { value: new Float32Array(88) },
  roadDockEnabled: { value: 0 },
  roadDockTransform: { value: new Matrix4() },
  /** World clip to the straightening keyboard's clip; identity keeps the plain bend. */
  roadDockFitTransform: { value: new Matrix4() },
  /** How far a straightened lane follows the keyboard's perspective: 0 world direction, 1 full. */
  roadDockTilt: { value: 0 },
  roadDockInverse: { value: new Matrix4() },
  roadWidth: { value: [0, 1, 1, 0] },
  roadVertical: { value: 0 },
  roadFree: { value: 0 },
  roadFreeDepth: { value: -149.1938 }
};

export function setRoadWidthUniforms(camera: WorldCamera, vertical = false, free = false): void {
  roadWidthUniforms.roadFree.value = free ? 1 : 0;
  roadWidthUniforms.roadVertical.value = vertical ? 2000 : 0;
  const warp = camera.roadWidth;
  const value = roadWidthUniforms.roadWidth.value;
  value[0] = warp?.nearZ ?? 0;
  value[1] = warp?.farZ ?? 1;
  value[2] = warp?.farScale ?? 1;
  value[3] = warp?.axis ?? 0;
}
