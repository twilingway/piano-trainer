import { Box3, Vector3 } from "three";
import type { Object3D } from "three";
import { posedSceneBounds } from "./posedSceneBounds";
import type { CameraPoint, CameraBounds } from "./performanceCameraMath";
/** Source eye geometry remains valid even before the optional eye-expression helper is attached. */
export function performanceFaceTarget(subject: Object3D, fallback: CameraBounds): CameraPoint {
  const eyes = new Box3(),
    part = new Box3();
  for (const name of ["Eye_1", "Eye_-1", "Eye_L", "Eye_R"]) {
    const eye = subject.getObjectByName(name);
    if (eye) eyes.union(posedSceneBounds(eye, part));
  }
  if (!eyes.isEmpty()) {
    const centre = eyes.getCenter(new Vector3());
    return { x: centre.x, y: centre.y, z: centre.z };
  }
  const head = subject.getObjectByName("head");
  if (head) {
    const centre = head.getWorldPosition(new Vector3());
    return { x: centre.x, y: centre.y, z: centre.z };
  }
  return {
    x: (fallback.min.x + fallback.max.x) / 2,
    y: fallback.max.y - (fallback.max.y - fallback.min.y) * 0.12,
    z: fallback.min.z + (fallback.max.z - fallback.min.z) * 0.3
  };
}
