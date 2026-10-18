import { performanceFaceTarget } from "./performanceFaceTarget";
import { performanceMeshObstacles } from "./performanceMeshObstacles";
import { performanceKeyboardFlight } from "./performanceKeyboardFlight";
import { Box3, Matrix4, Mesh, SkinnedMesh, Vector3 } from "three";
import type { Object3D } from "three";
import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import type { PerformanceCameraGeometry, PerformanceCameraRoad } from "./performanceCameraPath";
import type { KeyBox } from "./keyBoxes";
import { performanceNoteMatrix } from "./performanceNoteMatrix";

export interface PerformanceRoadDimensions {
  readonly floorY: number;
  readonly nearZ: number;
  readonly farZ: number;
  readonly lanes: readonly { readonly x: number; readonly y: number }[];
}
const copyPoint = (value: Vector3): CameraPoint => ({ x: value.x, y: value.y, z: value.z });
const copyBounds = (box: Box3): CameraBounds => ({
  min: copyPoint(box.min),
  max: copyPoint(box.max)
});

/** The very same lane anchor and X rotation as the note instance matrix. */
export function performanceRoadGeometry(
  dimensions: PerformanceRoadDimensions,
  world: Matrix4
): PerformanceCameraRoad {
  const matrix = new Matrix4(),
    position = new Vector3();
  const lanes: CameraPoint[] = dimensions.lanes.map((lane) => {
    performanceNoteMatrix(
      matrix,
      lane.x,
      lane.y,
      -dimensions.nearZ,
      lane.y,
      dimensions.nearZ,
      Math.PI / 2
    );
    position.setFromMatrixPosition(matrix).applyMatrix4(world);
    return copyPoint(position);
  });
  const scale = new Vector3().setFromMatrixScale(world).y;
  return {
    lanes,
    height: 2000 * scale,
    horizontalHeight: Math.max(0, dimensions.farZ - dimensions.nearZ) * scale
  };
}

/** Snapshot actual posed meshes once per layout, never on every animation frame. */
export function performanceCameraGeometry(
  subject: Object3D,
  bounds: Box3,
  keyboard: Vector3,
  handSpan: number,
  top: Vector3,
  boxes: readonly KeyBox[],
  road: PerformanceRoadDimensions | undefined
): PerformanceCameraGeometry {
  const obstacles: CameraBounds[] = [],
    avatar = new Box3(),
    part = new Box3();
  subject.updateWorldMatrix(true, false);
  subject.updateMatrixWorld(true);
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
    part.applyMatrix4(object.matrixWorld);
    if (!part.isEmpty()) {
      if (object instanceof SkinnedMesh)
        obstacles.push(...performanceMeshObstacles(object, Math.max(0.001, subject.scale.y)));
      else obstacles.push(copyBounds(part));
      if (object instanceof SkinnedMesh) avatar.union(part);
    }
  });
  if (avatar.isEmpty()) avatar.copy(bounds);
  const unit = Math.max(0.001, subject.scale.y);
  const dimensions =
    road && road.lanes.length > 0
      ? road
      : road && {
          ...road,
          lanes: boxes.map((box) => ({ x: box.x, y: box.top }))
        };
  const whiteKeys = boxes.filter((box) => !box.black),
    keyboardPoint = new Vector3();
  let left = Infinity,
    right = -Infinity,
    keyTop = -Infinity;
  for (const box of whiteKeys)
    for (const x of [box.x - box.width / 2, box.x + box.width / 2]) {
      keyboardPoint.set(x, box.top, 0).applyMatrix4(subject.matrixWorld);
      left = Math.min(left, keyboardPoint.x);
      right = Math.max(right, keyboardPoint.x);
      keyTop = Math.max(keyTop, keyboardPoint.y);
    }
  keyboardPoint.set(0, 0, 0).applyMatrix4(subject.matrixWorld);
  const keyboardFlight = whiteKeys.length
    ? performanceKeyboardFlight(
        left,
        right,
        keyTop,
        keyboardPoint.z,
        unit,
        obstacles,
        Math.max(12 * unit, handSpan * 0.035)
      )
    : undefined;
  return {
    bounds: copyBounds(bounds),
    avatar: copyBounds(avatar),
    face: performanceFaceTarget(subject, copyBounds(avatar)),
    obstacles,
    keyboard: copyPoint(keyboard),
    handSpan,
    unit,
    top: copyPoint(top),
    ...(keyboardFlight ? { keyboardFlight } : {}),
    ...(dimensions ? { road: performanceRoadGeometry(dimensions, subject.matrixWorld) } : {})
  };
}
