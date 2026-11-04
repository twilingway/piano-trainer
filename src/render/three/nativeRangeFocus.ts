import { Box3, Vector3 } from "three";
import type { KeyBox } from "./keyBoxes";
import type { HingedKey } from "./stageKeyboardLayout";

/** Hide only the display outside a chosen range; all physical key meshes and metrics survive. */
export function applyNativeRange(
  hinged: readonly HingedKey[],
  boxes: readonly KeyBox[],
  enabled: boolean
): void {
  const shown = enabled ? new Set(boxes.map((box) => box.pitch)) : undefined;
  for (const key of hinged) key.hinge.visible = !shown || shown.has(key.pitch);
}

/** Local coordinates, before the common keyboard transform; cached once per range layout. */
export function nativeRangeBounds(boxes: readonly KeyBox[]): Box3 | undefined {
  if (!boxes.length) return undefined;
  return new Box3(
    new Vector3(
      Math.min(...boxes.map((b) => b.x - b.width / 2)),
      0,
      -Math.max(...boxes.map((b) => b.back))
    ),
    new Vector3(
      Math.max(...boxes.map((b) => b.x + b.width / 2)),
      Math.max(...boxes.map((b) => b.top)),
      0
    )
  );
}
