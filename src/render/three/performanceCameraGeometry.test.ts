import { point, segmentBlocked } from "./performanceCameraMath";
import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import {
  performanceRoadGeometry,
  performanceRoadAnchors,
  performanceTopPosition
} from "./performanceCameraGeometry";
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

it("uses the unchanged played-lane midpoint and nearest central gap without mutating input", () => {
  const lanes = [
    point(330, 22, -142),
    point(-150, 22, -142),
    point(-330, 22, -142),
    point(60, 34, -142)
  ];
  const before = structuredClone(lanes),
    anchors = performanceRoadAnchors(lanes);
  expect(anchors.centre).toEqual(point(0, 22, -142));
  expect(anchors.gap).toEqual(point(-45, 28, -142));
  expect(lanes).toEqual(before);
  expect(performanceRoadAnchors([])).toEqual({});
});
it("keeps late top cameras on the player side and under an obstructing hat", () => {
  const hat = { min: point(-200, 870, -100), max: point(200, 1130, 350) };
  const geometry = { keyboard: point(0, 22, 30), handSpan: 400, unit: 1, obstacles: [hat] };
  for (const original of [point(0, 3000, 180), point(0, 950, 110)]) {
    const top = performanceTopPosition(original, geometry);
    expect(top.z).toBeGreaterThanOrEqual(geometry.keyboard.z);
    expect(top.y).toBeLessThan(hat.min.y);
    expect(top.y).toBeGreaterThan(geometry.keyboard.y + 250);
    for (const target of [
      geometry.keyboard,
      point(0, 92, 180),
      point(-200, 22, -142),
      point(200, 22, 180)
    ])
      expect(segmentBlocked(top, target, hat, 0)).toBe(false);
  }
  expect(performanceTopPosition(point(0, 500, 130), { ...geometry, obstacles: [] })).toEqual(
    point(0, 500, 130)
  );
});
