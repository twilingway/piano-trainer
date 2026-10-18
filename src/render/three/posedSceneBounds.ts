import { Box3, Mesh, SkinnedMesh } from "three";
import type { Object3D } from "three";

/** Refresh skinned bounds in the current world scale, never the glTF bind pose. */
export function posedSceneBounds(subject: Object3D, bounds: Box3): Box3 {
  subject.updateWorldMatrix(true, false);
  subject.updateMatrixWorld(true);
  bounds.makeEmpty();
  const part = new Box3();
  subject.traverseVisible((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    if (object instanceof SkinnedMesh) {
      object.skeleton.update();
      object.computeBoundingBox();
      part.copy(object.boundingBox);
    } else {
      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      part.copy(mesh.geometry.boundingBox);
    }
    bounds.union(part.applyMatrix4(object.matrixWorld));
  });
  return bounds;
}
