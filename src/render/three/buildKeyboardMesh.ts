import { Mesh, type MeshStandardMaterial, type Texture } from "three";
import type { Keyboard88 } from "./keyboard88";
import type { KeyBox } from "./keyBoxes";
import type { ThreeKeyEmission } from "./ThreeKeyEmission";
import { keyboard88Geometry, paintedKeyboardTop } from "./keyboard88Geometry";
import { computerKeyboardSlabGeometry } from "./computerKeyboardSlab";

/** Existing key construction, extracted to keep the stage responsible for composition only. */
export function buildKeyboardMesh(
  box: KeyBox,
  keyboard: Keyboard88,
  picture: Texture,
  emission: ThreeKeyEmission,
  fallback: { top: MeshStandardMaterial; white: MeshStandardMaterial }
): Mesh {
  const key = keyboard.keys.get(box.pitch);
  if (!key && box.pitch !== 0) throw new Error(`keyboard88 has no key ${String(box.pitch)}`);
  const geometry = key ? keyboard88Geometry(key.geometry, box) : computerKeyboardSlabGeometry(box);
  const painted = key
    ? paintedKeyboardTop(key.materials[0], picture, box.black, box.uv.u1 > box.uv.u0)
    : fallback.top;
  const materials = emission.create(
    box.pitch,
    painted,
    key?.materials[1] ?? fallback.white,
    key ? (box.black ? "black" : "white") : undefined
  );
  if (key) emission.ownTemplate(painted);
  const mesh = new Mesh(geometry, materials);
  mesh.position.set(box.x, 22, 0);
  return mesh;
}
