import { BoxGeometry, Float32BufferAttribute } from "three";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { fullMetricKeyBoxes, keyBoxes, type KeyBox } from "./keyBoxes";

/** Word mode supplies a single synthetic face carrying the entire computer-keyboard picture. */
export function keyboardSceneBoxes(scene: KeysScene): KeyBox[] {
  return scene.faces.length === 1 && scene.faces[0]?.key.pitch === 0
    ? keyBoxes(scene)
    : fullMetricKeyBoxes(scene);
}

/** Keep the computer plate at its projected size; it is not one 23.5 mm piano key. */
export function computerKeyboardSlabGeometry(box: KeyBox): BoxGeometry {
  const depth = box.back - box.front;
  const geometry = new BoxGeometry(box.width, box.top - box.bottom, depth);
  geometry.translate(0, -(box.top - box.bottom) / 2, -(box.back + box.front) / 2);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  // Side hits project to the nearest painted edge instead of an unrelated texture row.
  for (let index = 0; index < position.count; index++) {
    uv.setXY(
      index,
      box.uv.u0 + (position.getX(index) / box.width + 0.5) * (box.uv.u1 - box.uv.u0),
      box.uv.v0 + ((position.getZ(index) + box.back) / depth) * (box.uv.v1 - box.uv.v0)
    );
  }
  for (const group of geometry.groups) group.materialIndex = group.materialIndex === 2 ? 0 : 1;
  geometry.setAttribute(
    "color",
    new Float32BufferAttribute(new Float32Array(position.count * 3).fill(1), 3)
  );
  return geometry;
}
