import { Raycaster, SkinnedMesh, Vector3 } from "three";
import type { Object3D } from "three";
import type { Finger } from "../../fingering/fingering";
import type { Key } from "./handScene.testSupport";

const NAMES = { 1: "thumb", 2: "index", 3: "middle", 4: "ring", 5: "pinky" };
/** Signed actual posed-skin gap to the hinged key top, independent of analytic contact caches. */
export function pianistActualFingerGap(space: Object3D, key: Key, finger: Finger): number {
  space.updateWorldMatrix(true, false);
  space.updateMatrixWorld(true);
  key.box.setFromObject(key.mesh);
  const point = new Vector3(),
    origin = new Vector3(),
    down = new Vector3(0, -1, 0);
  const ray = new Raycaster();
  let gap = Infinity;
  space.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const skin = node as SkinnedMesh;
    skin.skeleton.update();
    const index = skin.geometry.getAttribute("skinIndex"),
      weight = skin.geometry.getAttribute("skinWeight");
    for (let i = 0; i < index.count; i++) {
      let dominant = 0;
      for (let j = 1; j < 4; j++)
        if (weight.getComponent(i, j) > weight.getComponent(i, dominant)) dominant = j;
      const bone = skin.skeleton.bones[index.getComponent(i, dominant)];
      if (
        !bone ||
        !(
          bone.name.startsWith(`${NAMES[finger]}_`) ||
          bone.name.startsWith(`finger${String(finger)}-`)
        )
      )
        continue;
      skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld);
      if (
        point.x < key.box.min.x ||
        point.x > key.box.max.x ||
        point.z < key.box.min.z ||
        point.z > key.box.max.z
      )
        continue;
      origin.set(point.x, key.box.max.y + 100, point.z);
      ray.set(origin, down);
      const top = ray.intersectObject(key.mesh, false)[0]?.point.y;
      if (top !== undefined) gap = Math.min(gap, point.y - top);
    }
  });
  return gap;
}
