import { Box3, BufferAttribute } from "three";
import type { BufferGeometry } from "three";
import type { KeyBox } from "./keyBoxes";
import { KIT_DEPTH, KIT_TOP, KIT_WHITE, splitUp } from "./pianoKit";
import { blackKeyCap } from "./blackKeyCap";

/**
 * The kit's key sized to the app's key: its width to the slot, millimetres up, 150 mm along to
 * 142; the top faces, group 0, show the key's rect of the picture.
 */
export function keyGeometry(part: BufferGeometry, box: KeyBox): BufferGeometry {
  const geometry = part.clone();
  const { min, max } = new Box3().setFromBufferAttribute(
    geometry.getAttribute("position") as BufferAttribute
  );
  const across = box.black ? box.width / (max.x - min.x) : box.width / KIT_WHITE;
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  const { v0, v1 } = box.uv;
  // The picture is a painted key with its rounded sides drawn in: the model has its own, so the
  // top takes only the flat middle.
  const rim = (box.uv.u1 - box.uv.u0) * (box.black ? 0.08 : 0.07);
  const u0 = box.uv.u0 + rim;
  const u1 = box.uv.u1 - rim;
  for (let vertex = 0; vertex < position.count; vertex++) {
    // Across the key left to right; along it from the back (-z) to the front.
    const u = (position.getX(vertex) - min.x) / (max.x - min.x);
    const v = (position.getZ(vertex) - min.z) / (max.z - min.z);
    uv[vertex * 2] = u0 + u * (u1 - u0);
    uv[vertex * 2 + 1] = v0 + v * (v1 - v0);
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.scale(across, 1000, KIT_DEPTH);
  geometry.translate(0, KIT_TOP, 0);
  if (box.black) return blackKeyCap(geometry);
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(position.count * 3).fill(1), 3)
  );
  return splitUp(geometry);
}
