import {
  Vector3,
  type Camera,
  type Mesh,
  type Object3D,
  type Raycaster,
  type Scene,
  type Vector2
} from "three";

/** Existing mesh picking against the displayed keyboard. */
export function pickKeyboardKey(
  raycaster: Raycaster,
  pointer: Vector2,
  scene: Scene,
  hinged: readonly { readonly pitch: number; readonly mesh: Mesh; readonly pickMesh?: Mesh }[],
  occluders: Object3D[],
  camera: Camera,
  x: number,
  y: number,
  width: number,
  height: number,
  surface?: Vector2
): number | undefined {
  pointer.set((2 * x) / Math.max(1, width) - 1, 1 - (2 * y) / Math.max(1, height));
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  const origin = new Vector3(pointer.x, pointer.y, -1).unproject(camera);
  const direction = new Vector3(pointer.x, pointer.y, 1).unproject(camera).sub(origin).normalize();
  raycaster.set(origin, direction);
  for (const key of hinged) key.pickMesh?.matrixWorld.copy(key.mesh.matrixWorld);
  const hits = raycaster.intersectObjects(
    [...hinged.map(({ mesh, pickMesh }) => pickMesh ?? mesh), ...occluders],
    true
  );
  const hit = hits.find(({ object }) => {
    let part: Object3D | null =
      hinged.find((key) => (key.pickMesh ?? key.mesh) === object)?.mesh ?? object;
    while (part) {
      if (!part.visible) return false;
      part = part.parent;
    }
    return true;
  });
  if (hit?.uv) surface?.copy(hit.uv);
  return hit && hinged.find(({ mesh, pickMesh }) => (pickMesh ?? mesh) === hit.object)?.pitch;
}
