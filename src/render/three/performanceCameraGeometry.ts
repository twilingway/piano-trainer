import { performanceFaceTarget } from "./performanceFaceTarget";
import { performanceMeshObstacles } from "./performanceMeshObstacles";
import { performanceKeyboardFlight } from "./performanceKeyboardFlight";
import { Box3, Matrix4, Mesh, SkinnedMesh, Vector3 } from "three";
import type { Object3D } from "three";
import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import { point, pointMix, segmentBlocked } from "./performanceCameraMath";
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
  const geometry: PerformanceCameraGeometry = {
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
  // Keep the reveal on the player's side of tall meshes; the intro clears them before rising.
  const revealZ = obstacles
    .filter((box) => box.min.y > keyboard.y + 300 * unit)
    .reduce((z, box) => Math.max(z, box.max.z + 100 * unit), top.z);
  return { ...geometry, top: { ...geometry.top, z: revealZ } };
}

/** Stable centre/gap of the played lanes, independent of their incoming ordering. */
export function performanceRoadAnchors(lanes: readonly CameraPoint[]): {
  centre?: CameraPoint;
  gap?: CameraPoint;
} {
  const sorted = [...lanes].sort((a, b) => a.x - b.x),
    first = sorted[0],
    last = sorted.at(-1);
  if (!first || !last) return {};
  const centre = pointMix(first, last, 0.5);
  let gap = centre,
    nearest = Infinity;
  for (let index = 1; index < sorted.length; index++) {
    const a = sorted[index - 1],
      b = sorted[index];
    if (!a || !b) continue;
    const middle = pointMix(a, b, 0.5),
      offset = Math.abs(middle.x - centre.x);
    if (offset < nearest) {
      nearest = offset;
      gap = middle;
    }
  }
  return { centre, gap };
}

/** Keep top shots on the player side, below a blocking hat rather than crossing over the keys. */
export function performanceTopPosition(
  position: CameraPoint,
  geometry: Pick<PerformanceCameraGeometry, "keyboard" | "handSpan" | "unit" | "obstacles">,
  span = geometry.handSpan
): CameraPoint {
  const { keyboard: key, unit } = geometry;
  const result = { ...position, z: Math.max(position.z, key.z + 60 * unit) };
  const tall = geometry.obstacles.filter((box) => box.min.y > key.y + 300 * unit);
  const probes = [point(key.x, key.y, key.z), point(key.x, key.y + 70 * unit, key.z + 150 * unit)];
  for (const x of [key.x - span / 2, key.x + span / 2])
    for (const z of [key.z - 172 * unit, key.z + 150 * unit]) probes.push(point(x, key.y, z));
  for (const box of tall)
    if (probes.some((target) => segmentBlocked(result, target, box, 12 * unit)))
      result.y = Math.min(result.y, Math.max(key.y + 260 * unit, box.min.y - 40 * unit));
  return result;
}
