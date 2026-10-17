import { BufferGeometry, Float32BufferAttribute, Mesh, Uint32BufferAttribute } from "three";
import type { Object3D } from "three";
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
 * Orders the triangles so those facing up, the rounded edges too, come first, as group 0, and the rest as group 1; with
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
    (y > 0.25 ? up : rest).push(...tri);
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

/**
 * Keep only complete board triangles on the player's side of the road contact plane.
 * The kit's flat front lies on this plane; its bevels, end caps and underside extend behind
 * it and otherwise occlude the native road's transparent mist. This is a board-specific trim,
 * The remaining front is clipped at the white-key top (kit y=0), with attribute interpolation.
 * No cap is added over the road and the source kit stays shared.
 */
export function roadContactBoard(source: BufferGeometry, contactZ: number): BufferGeometry {
  if (!Number.isFinite(contactZ)) throw new RangeError("Board contact must be finite");
  const geometry = splitUp(source.clone(), true);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const kept: number[] = [];
  if (index) {
    // Metre-space float32 export can put the flat front a few nanometres behind the plane.
    const limit = contactZ - 1e-7;
    for (let vertex = 0; vertex < index.count; vertex += 3) {
      const a = index.getX(vertex),
        b = index.getX(vertex + 1),
        c = index.getX(vertex + 2);
      if (position.getZ(a) >= limit && position.getZ(b) >= limit && position.getZ(c) >= limit)
        kept.push(a, b, c);
    }
  }
  geometry.setIndex(new Uint32BufferAttribute(kept, 1));
  geometry.clearGroups();
  const front = geometry.toNonIndexed();
  geometry.dispose();
  const trimmed = clipBelowWhiteTop(front);
  front.dispose();
  trimmed.computeBoundingBox();
  trimmed.computeBoundingSphere();
  return trimmed;
}

/** Sutherland–Hodgman against y<=0; rebuilding only the few retained front-panel triangles. */
function clipBelowWhiteTop(front: BufferGeometry): BufferGeometry {
  let stride = 0;
  const attributes = Object.entries(front.attributes).map(([name, attribute]) => {
    const offset = stride;
    stride += attribute.itemSize;
    return { name, attribute, offset, values: [] as number[] };
  });
  const position = attributes.find(({ name }) => name === "position");
  if (!position) throw new Error("Board has no position attribute");
  const yOffset = position.offset + 1;
  for (let start = 0; start < position.attribute.count; start += 3) {
    const polygon = Array.from({ length: 3 }, (_, vertex) => {
      const values: number[] = [];
      for (const { attribute } of attributes)
        for (let component = 0; component < attribute.itemSize; component++)
          values.push(attribute.getComponent(start + vertex, component));
      return values;
    });
    const clipped: number[][] = [];
    for (let vertex = 0; vertex < polygon.length; vertex++) {
      const previous = polygon[(vertex + polygon.length - 1) % polygon.length];
      const current = polygon[vertex];
      if (!previous || !current) continue;
      const previousY = previous[yOffset] ?? Infinity;
      const currentY = current[yOffset] ?? Infinity;
      if (previousY <= 0 !== currentY <= 0) {
        const progress = previousY / (previousY - currentY);
        if (progress > 0 && progress < 1) {
          const intersection = previous.map(
            (value, component) => value + ((current[component] ?? value) - value) * progress
          );
          intersection[yOffset] = 0;
          clipped.push(intersection);
        }
      }
      if (currentY <= 0) clipped.push(current);
    }
    for (let triangle = 1; triangle < clipped.length - 1; triangle++)
      for (const vertex of [clipped[0], clipped[triangle], clipped[triangle + 1]]) {
        if (!vertex) continue;
        for (const attribute of attributes)
          for (let component = 0; component < attribute.attribute.itemSize; component++)
            attribute.values.push(vertex[attribute.offset + component] ?? 0);
      }
  }
  const result = new BufferGeometry();
  for (const { name, attribute, values } of attributes)
    result.setAttribute(
      name,
      new Float32BufferAttribute(values, attribute.itemSize, attribute.normalized)
    );
  result.normalizeNormals();
  return result;
}
