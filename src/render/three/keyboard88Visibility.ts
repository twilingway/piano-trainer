import { Mesh } from "three";
import type { Object3D } from "three";

export interface Keyboard88Masks {
  readonly body: readonly number[];
  readonly rightHand: readonly number[];
  readonly leftHand: readonly number[];
  readonly nails: readonly number[];
}

type Part = "body" | "rightHand" | "leftHand";
const PARTS: readonly Part[] = ["body", "rightHand", "leftHand"];

export interface Keyboard88Visibility {
  setVisibility(options: { body: boolean; hands: boolean; left?: boolean; right?: boolean }): void;
  dispose(): void;
}

/** Source face IDs, rather than names, define the three disjoint visibility regions. */
export function validateKeyboard88Masks(masks: Keyboard88Masks): void {
  if (!Array.isArray(masks.nails) || masks.nails.length !== 0)
    throw new Error("keyboard88 nail geometry is forbidden");
  const seen = new Set<number>();
  for (const role of PARTS) {
    const ids = masks[role];
    if (!Array.isArray(ids) || ids.length === 0) throw new Error(`keyboard88 empty ${role} mask`);
    for (const id of ids as unknown[]) {
      if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || seen.has(id))
        throw new Error("keyboard88 masks must contain distinct source face IDs");
      seen.add(id);
    }
  }
}

/** Shares the existing skin/geometry; toggling a region never constructs a second pair of hands. */
export function bindKeyboard88Visibility(
  scene: Object3D,
  masks: Keyboard88Masks
): Keyboard88Visibility {
  validateKeyboard88Masks(masks);
  const expected = new Map(PARTS.map((part) => [part, new Set(masks[part])]));
  const found = new Set<number>();
  const nodes: { node: Mesh; role: Part; visible: boolean }[] = [];
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const mesh = node as Mesh;
    const geometryData: Record<string, unknown> = mesh.geometry.userData;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const role: unknown = geometryData.role ?? node.userData.role ?? materials[0]?.userData.role;
    if (role !== "body" && role !== "rightHand" && role !== "leftHand")
      throw new Error("keyboard88 mesh has no explicit visibility role");
    const ids: unknown = geometryData.sourceFaceIds ?? node.userData.sourceFaceIds;
    if (!Array.isArray(ids) || ids.length === 0)
      throw new Error("keyboard88 mesh has no source face IDs");
    const region = expected.get(role);
    for (const id of ids as unknown[]) {
      if (typeof id !== "number" || !region?.has(id) || found.has(id))
        throw new Error("keyboard88 primitive does not match source face mask");
      found.add(id);
    }
    nodes.push({ node: mesh, role, visible: node.visible });
  });
  const total = PARTS.reduce((count, role) => count + masks[role].length, 0);
  if (found.size !== total) throw new Error("keyboard88 model is missing masked faces");
  let disposed = false;
  return {
    setVisibility: ({ body, hands, left = true, right = true }) => {
      if (disposed) return;
      for (const item of nodes)
        item.node.visible =
          item.role === "body" ? body : hands && (item.role === "leftHand" ? left : right);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const item of nodes) item.node.visible = item.visible;
    }
  };
}
