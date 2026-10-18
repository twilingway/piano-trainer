import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import type { PerformanceCameraRoad } from "./performanceCameraPath";

/** Tight planes retain depth precision while covering the complete road during its X rotation. */
export function performanceCameraClipping(
  position: CameraPoint,
  bounds: CameraBounds,
  radius: number,
  unit: number,
  road?: PerformanceCameraRoad
): { near: number; far: number } {
  const near = Math.max(0.5 * unit, radius / 200);
  const cx = (bounds.min.x + bounds.max.x) / 2,
    cy = (bounds.min.y + bounds.max.y) / 2,
    cz = (bounds.min.z + bounds.max.z) / 2;
  let extent = Math.hypot(position.x - cx, position.y - cy, position.z - cz) + radius;
  if (road && road.lanes.length > 0) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    const span = Math.max(road.height * 2.5, road.horizontalHeight ?? 0);
    for (const lane of road.lanes) {
      minX = Math.min(minX, lane.x);
      maxX = Math.max(maxX, lane.x);
      minY = Math.min(minY, lane.y);
      maxY = Math.max(maxY, lane.y + span);
      minZ = Math.min(minZ, lane.z - span);
      maxZ = Math.max(maxZ, lane.z);
    }
    const centreX = (minX + maxX) / 2,
      centreY = (minY + maxY) / 2,
      centreZ = (minZ + maxZ) / 2;
    const roadRadius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 80 * unit;
    extent = Math.max(
      extent,
      Math.hypot(position.x - centreX, position.y - centreY, position.z - centreZ) + roadRadius
    );
  }
  return { near, far: Math.max(near * 10, extent * 1.15) };
}
