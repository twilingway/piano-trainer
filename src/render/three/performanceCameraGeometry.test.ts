import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { performanceRoadGeometry } from "./performanceCameraGeometry";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
describe("FPV road coordinates", () => {
  it("uses the same black and white hit anchors and vertical transformation as note meshes", () => {
    const world = new Matrix4().makeScale(1.4, 1.4, 1.4).setPosition(10, 20, 30);
    const dimensions = {
      floorY: 22,
      nearZ: 142,
      farZ: 2042,
      lanes: [
        { x: -330, y: 22 },
        { x: 60, y: 34 }
      ]
    };
    const road = performanceRoadGeometry(dimensions, world);
    expect(road.height).toBeCloseTo(2800);
    expect(road.horizontalHeight).toBeCloseTo(2660);
    dimensions.lanes.forEach((lane, index) => {
      const matrix = new Matrix4();
      performanceNoteMatrix(
        matrix,
        lane.x,
        lane.y,
        -dimensions.nearZ,
        lane.y,
        dimensions.nearZ,
        Math.PI / 2
      );
      const actual = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(world);
      expect(road.lanes[index]).toEqual({ x: actual.x, y: actual.y, z: actual.z });
      performanceNoteMatrix(
        matrix,
        lane.x,
        lane.y,
        -(dimensions.nearZ + 1900 * 0.58),
        lane.y,
        dimensions.nearZ,
        Math.PI / 2,
        2000 / 1900
      );
      const crossing = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(world);
      expect(crossing.y).toBeCloseTo(actual.y + road.height * 0.58);
      expect(crossing.z).toBeCloseTo(actual.z);
    });
  });
});
