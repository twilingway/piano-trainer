import { Group } from "three";
import type { Mesh, Texture } from "three";
import { metricKeyX } from "../keyboardMetrics";
import { buildKeyboardMesh } from "./buildKeyboardMesh";
import type { KeyBox } from "./keyBoxes";
import type { Keyboard88 } from "./keyboard88";
import type { ThreeKeyEmission } from "./ThreeKeyEmission";
import type { StageKeyMaterials } from "./StageKeyMaterials";
import type { PianoCase } from "./PianoCase";
export interface HingedKey {
  readonly pitch: number;
  readonly hinge: Group;
  readonly mesh: Mesh;
}

/** Keep mesh allocation and physical case layout outside the frame compositor. */
export function buildStageKeys(
  keys: Group,
  boxes: readonly KeyBox[],
  kit: Keyboard88,
  picture: Texture,
  emission: ThreeKeyEmission,
  materials: StageKeyMaterials,
  cabinet: PianoCase,
  body: Group
): HingedKey[] {
  const hinged: HingedKey[] = [];
  for (const box of boxes) {
    const mesh = buildKeyboardMesh(box, kit, picture, emission, materials);
    const hinge = new Group();
    hinge.add(mesh);
    keys.add(hinge);
    hinged.push({ pitch: box.pitch, hinge, mesh });
  }
  const white = boxes.find((box) => !box.black);
  if (white && white.pitch !== 0) {
    cabinet.layout(white.x - metricKeyX(white.pitch));
    body.add(cabinet.group);
  }
  return hinged;
}
export function clearStageKeys(
  keys: Group,
  hinged: readonly HingedKey[],
  cabinet: PianoCase,
  body: Group
): void {
  for (const { hinge, mesh } of hinged) {
    mesh.geometry.dispose();
    keys.remove(hinge);
  }
  cabinet.clear();
  body.clear();
}
