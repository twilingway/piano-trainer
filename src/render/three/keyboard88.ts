import { Group, LinearSRGBColorSpace, Mesh, MeshStandardMaterial, PropertyBinding } from "three";
import type { BufferGeometry, Object3D, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KEYBOARD_C4, KEYBOARD_METRES, metricKeyX } from "../keyboardMetrics";

export interface Keyboard88Key {
  readonly geometry: BufferGeometry;
  readonly materials: readonly [MeshStandardMaterial, MeshStandardMaterial];
}
export interface Keyboard88 {
  readonly keys: ReadonlyMap<number, Keyboard88Key>;
  readonly case: Group;
  readonly dispose: () => void;
}

/** Extract only stable named parts, preserving shared baked maps and the atlas' metric shape. */
export function keyboard88Model(scene: Object3D): Keyboard88 {
  scene.updateMatrixWorld(true);
  const keys = new Map<number, Keyboard88Key>();
  const cabinet = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const maps = new Set<Texture>();
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const array = Array.isArray(node.material) ? node.material : [node.material];
    geometries.add(node.geometry as BufferGeometry);
    for (const material of array) {
      if (!(material instanceof MeshStandardMaterial))
        throw new Error("keyboard88 requires PBR materials");
      materials.add(material);
      for (const map of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap
      ])
        if (map) {
          maps.add(map);
          if (map === material.map) map.colorSpace = LinearSRGBColorSpace;
        }
    }
  });
  for (let pitch = 21; pitch <= 108; pitch++) {
    const node = scene.getObjectByName(`key-${String(pitch)}`);
    if (!node) throw new Error(`keyboard88 is missing key ${String(pitch)}`);
    const parts: (BufferGeometry | undefined)[] = [];
    const finish: (MeshStandardMaterial | undefined)[] = [];
    node.traverse((child) => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return;
      const material = child.material as MeshStandardMaterial;
      const role = material.userData.role as unknown;
      const index = role === "top" ? 0 : role === "body" ? 1 : -1;
      if (index < 0)
        throw new Error(`keyboard88 key ${String(pitch)} has an unknown material role`);
      const geometry = (child.geometry as BufferGeometry).clone().applyMatrix4(child.matrixWorld);
      geometry.translate(
        -KEYBOARD_C4.x - metricKeyX(pitch) / KEYBOARD_METRES,
        -KEYBOARD_C4.y,
        -KEYBOARD_C4.z
      );
      geometry.scale(KEYBOARD_METRES, KEYBOARD_METRES, KEYBOARD_METRES);
      parts[index] = geometry;
      finish[index] = material;
    });
    const [top, body] = parts;
    const [topFinish, bodyFinish] = finish;
    if (!top || !body || !topFinish || !bodyFinish)
      throw new Error(`keyboard88 key ${String(pitch)} needs top and body`);
    const geometry = mergeGeometries([top, body], true) as BufferGeometry | null;
    top.dispose();
    body.dispose();
    if (!geometry) throw new Error(`keyboard88 key ${String(pitch)} attributes do not match`);
    geometries.add(geometry);
    keys.set(pitch, { geometry, materials: [topFinish, bodyFinish] });
  }
  for (const name of [
    "slip.001",
    "board.001",
    "felt.001",
    "table.001",
    "cheek-left",
    "cheek-right",
    "panel-left",
    "panel-right"
  ]) {
    const node =
      scene.getObjectByName(name) ?? scene.getObjectByName(PropertyBinding.sanitizeNodeName(name));
    if (!node) throw new Error(`keyboard88 is missing case ${name}`);
    node.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      // The asset averages case normals across hard edges: the rim light then lands on the board's
      // back face and its glossy clearcoat turns the LTC noise into white speckles. Shade it flat.
      const source = child.geometry as BufferGeometry;
      const geometry = (source.index ? source.toNonIndexed() : source.clone()).applyMatrix4(
        child.matrixWorld
      );
      geometry.translate(-KEYBOARD_C4.x, -KEYBOARD_C4.y, -KEYBOARD_C4.z);
      geometry.computeVertexNormals();
      geometries.add(geometry);
      const mesh = new Mesh(geometry, child.material);
      mesh.name = name;
      cabinet.add(mesh);
    });
  }
  let disposed = false;
  return {
    keys,
    case: cabinet,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const map of maps) map.dispose();
    }
  };
}

export async function loadKeyboard88(): Promise<Keyboard88> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/keyboard88.glb`);
  return keyboard88Model(gltf.scene);
}
