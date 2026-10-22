import { SkinnedMesh } from "three";
import type { BufferGeometry, Object3D } from "three";

/** Pelvis and both leg chains define hips-down, independently of the sampled pose. */
const LOWER_BODY = new Set([
  "m_avg_Pelvis",
  ...["L", "R"].flatMap((side) =>
    ["Hip", "Knee", "Ankle", "Foot"].map((joint) => `m_avg_${side}_${joint}`)
  )
]);

/** Keep whole triangles above the skin-weight boundary; never stretch or move bones. */
export function keyboard88UpperBodyIndices(
  geometry: BufferGeometry,
  boneNames: readonly string[]
): number[] {
  const joints = geometry.getAttribute("skinIndex");
  const weights = geometry.getAttribute("skinWeight");
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const lower = new Uint8Array(position.count);
  for (let vertex = 0; vertex < position.count; vertex++) {
    let weight = 0;
    for (let component = 0; component < 4; component++)
      if (LOWER_BODY.has(boneNames[joints.getComponent(vertex, component)] ?? ""))
        weight += weights.getComponent(vertex, component);
    lower[vertex] = weight >= 0.5 ? 1 : 0;
  }
  const upper: number[] = [];
  const count = index?.count ?? position.count;
  for (let face = 0; face < count; face += 3) {
    const a = index?.getX(face) ?? face;
    const b = index?.getX(face + 1) ?? face + 1;
    const c = index?.getX(face + 2) ?? face + 2;
    if (!lower[a] && !lower[b] && !lower[c]) upper.push(a, b, c);
  }
  return upper;
}

/** Cache one alternate body index at load time; the original GLB and full skin stay intact. */
export function bindKeyboard88RoadBody(scene: Object3D) {
  const parts: { mesh: SkinnedMesh; full: BufferGeometry; road: BufferGeometry }[] = [];
  scene.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const mesh = node as SkinnedMesh;
    if (mesh.geometry.userData.role !== "body") return;
    const full = mesh.geometry;
    const road = full.clone();
    road.setIndex(
      keyboard88UpperBodyIndices(
        full,
        mesh.skeleton.bones.map((bone) => bone.name)
      )
    );
    parts.push({ mesh, full, road });
  });
  let disposed = false;
  return {
    setSeparateCameras(separate: boolean): void {
      if (disposed) return;
      for (const { mesh, full, road } of parts) mesh.geometry = separate ? road : full;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const { mesh, full, road } of parts) {
        mesh.geometry = full;
        road.dispose();
      }
    }
  };
}
