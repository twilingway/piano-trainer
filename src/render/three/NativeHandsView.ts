import { Mesh, SkinnedMesh } from "three";
import type { BufferGeometry, Object3D } from "three";

/** Keep the source skeleton and skin; only cut away triangles outside the forearms and hands. */
function handGeometry(mesh: SkinnedMesh): BufferGeometry | undefined {
  const geometry = mesh.geometry;
  if (!geometry.hasAttribute("skinIndex") || !geometry.hasAttribute("skinWeight")) return undefined;
  const joints = geometry.getAttribute("skinIndex"),
    weights = geometry.getAttribute("skinWeight");
  const arms = new Set(
    mesh.skeleton.bones.flatMap((bone, index) =>
      /^(lowerarm\d*|wrist|finger\d-\d|metacarpal\d)\.?[LR]$/.test(bone.name) ? [index] : []
    )
  );
  if (!arms.size) return undefined;
  const isHand = (vertex: number): boolean => {
    let weight = 0;
    for (let i = 0; i < joints.itemSize; i++)
      if (arms.has(joints.getComponent(vertex, i))) weight += weights.getComponent(vertex, i);
    return weight >= 0.5;
  };
  const original = geometry.index;
  const count = original?.count ?? geometry.getAttribute("position").count;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
  const copy = geometry.clone(),
    indices: number[] = [];
  copy.clearGroups();
  for (const group of groups) {
    const start = indices.length;
    for (let i = group.start; i + 2 < Math.min(count, group.start + group.count); i += 3) {
      const a = original?.getX(i) ?? i,
        b = original?.getX(i + 1) ?? i + 1,
        c = original?.getX(i + 2) ?? i + 2;
      if (isHand(a) && isHand(b) && isHand(c)) indices.push(a, b, c);
    }
    copy.addGroup(start, indices.length - start, group.materialIndex);
  }
  copy.setIndex(indices);
  return copy;
}

/** Multi-material glTF nails become child meshes whose names differ from their source node. */
function isNail(node: Object3D): boolean {
  let part: Object3D | null = node;
  while (part) {
    if (
      /^AnatomicalNail(?:Surface)?_[1-5]_[LR](?:_\d+)?$/.test(part.name) ||
      part.name === "HandNails"
    )
      return true;
    part = part.parent;
  }
  return false;
}

/** The whole body and the hands share a mesh in native performances. */
export class NativeHandsView {
  private readonly meshes: {
    mesh: Mesh;
    visible: boolean;
    original: BufferGeometry;
    hands: BufferGeometry | undefined;
    nail: boolean;
  }[] = [];

  constructor(scene: Object3D) {
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mesh = node as Mesh;
      this.meshes.push({
        mesh,
        visible: mesh.visible,
        original: mesh.geometry,
        hands:
          node instanceof SkinnedMesh && node.name === "PianistBody"
            ? handGeometry(node as SkinnedMesh)
            : undefined,
        nail: isNail(mesh)
      });
    });
  }

  restore(): void {
    for (const { mesh, visible, original } of this.meshes) {
      mesh.visible = visible;
      mesh.geometry = original;
    }
  }

  showHands(): void {
    for (const { mesh, visible, hands, nail } of this.meshes) {
      mesh.visible = visible && (hands !== undefined || nail);
      if (hands) mesh.geometry = hands;
    }
  }

  dispose(): void {
    this.restore();
    for (const { hands } of this.meshes) hands?.dispose();
  }
}
