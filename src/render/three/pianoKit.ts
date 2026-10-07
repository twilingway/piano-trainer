import { Mesh, Uint32BufferAttribute } from "three";
import type { Object3D, BufferGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** The parts of `tools/hand-rig/piano_kit.py`: metres, Y up, keys toward -Z, white top at 0. */
export type KitPart =
  | "black"
  | "board"
  | "cheek"
  | "felt"
  | "slip"
  | "table"
  | "white-cut-both"
  | "white-cut-left"
  | "white-cut-right"
  | "white-full";

export type PianoKit = ReadonlyMap<KitPart, BufferGeometry>;

/** The kit's white slot, 23.5 mm: one app white key across. */
export const KIT_WHITE = 0.0235;
/** Kit metres to app units along the key: 150 mm of key are the app's 142. */
export const KIT_DEPTH = (1000 * 142) / 150;
/** The white keys' top in app units: kit y 0 sits there. */
export const KIT_TOP = 22;

export async function loadPianoKit(): Promise<PianoKit> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/piano-kit.glb`);
  const parts = new Map<KitPart, BufferGeometry>();
  gltf.scene.traverse((node: Object3D) => {
    if (node instanceof Mesh) parts.set(node.name as KitPart, node.geometry as BufferGeometry);
  });
  return parts;
}

/** The white part for a key whose neighbours below and above are black or not. */
export function whitePart(blackBelow: boolean, blackAbove: boolean): KitPart {
  if (blackBelow && blackAbove) return "white-cut-both";
  if (blackBelow) return "white-cut-left";
  if (blackAbove) return "white-cut-right";
  return "white-full";
}

/**
 * Orders the triangles so those facing up come first, as group 0, and the rest as group 1; with
 * `dropUp` the upward ones are left out.
 */
export function splitUp(geometry: BufferGeometry, dropUp = false): BufferGeometry {
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  const count = index ? index.count : normal.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const up: number[] = [];
  const rest: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const tri = [at(i), at(i + 1), at(i + 2)];
    const y = tri.reduce((sum, v) => sum + normal.getY(v), 0) / 3;
    (y > 0.7 ? up : rest).push(...tri);
  }
  const kept = dropUp ? rest : [...up, ...rest];
  geometry.setIndex(new Uint32BufferAttribute(kept, 1));
  geometry.clearGroups();
  if (dropUp) geometry.addGroup(0, rest.length, 1);
  else {
    geometry.addGroup(0, up.length, 0);
    geometry.addGroup(up.length, rest.length, 1);
  }
  return geometry;
}
