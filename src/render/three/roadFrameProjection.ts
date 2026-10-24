export { prepareFreeRoadBounds } from "./freeRoadBounds";
import type { WorldCamera } from "../worldCamera";
import type { KeyBox } from "./keyBoxes";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import type { ThreeRoadGuides } from "./ThreeRoadGuides";
import { roadWidthUniforms, setRoadWidthUniforms } from "./roadWidthUniforms";

/** One geometry transform feeds every native road layer without moving the piano. */
export function prepareRoadProjection(
  guides: ThreeRoadGuides,
  boxes: readonly KeyBox[],
  camera: WorldCamera,
  frame: ThreeRoadFrame | undefined,
  mode: "standard" | "free" | "performance"
): void {
  const free = mode === "free",
    performance = mode === "performance";
  roadWidthUniforms.roadFreeDepth.value = frame?.freeLanes[0]?.far.z ?? -149.1938;
  const vertical = free && !performance && frame?.direct === true;
  setRoadWidthUniforms(
    camera,
    vertical,
    free && !performance && (frame?.freeLanes.length ?? 0) > 0
  );
  if (frame?.guides && !performance)
    guides.update(
      boxes,
      camera,
      frame.beats,
      frame.beatCount,
      vertical,
      free && frame.freeLayout ? frame.freeLanes : undefined
    );
  else guides.clear();
}
