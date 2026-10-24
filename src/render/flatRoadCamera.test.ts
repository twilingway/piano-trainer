import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { flatRoadCamera } from "./flatRoadCamera";
import { BLACK_NOTE_FLOOR, WHITE_NOTE_FLOOR } from "./noteDimensions";
import { projectNoteLane } from "./noteLaneProjection";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";

describe("shared road on flat keyboards", () => {
  it.each([false, true])(
    "joins white and black key centres at the unchanged flat row, perspective=%s",
    (perspective) => {
      for (const [width, height, hitY] of [
        [320, 568, 360],
        [390, 844, 680],
        [667, 375, 220],
        [1280, 720, 540]
      ] as const) {
        const offset = { x: 17, y: -23 };
        const { notes, blackLane } = flatRoadCamera(
          width,
          height,
          hitY,
          perspective,
          0.1,
          offset,
          height,
          0.2
        );
        for (const x of [22, width / 2, width - 22]) {
          for (const floor of [WHITE_NOTE_FLOOR, BLACK_NOTE_FLOOR]) {
            const lane = floor === BLACK_NOTE_FLOOR ? blackLane : undefined;
            const point = projectNoteLane(
              notes.project(notes.sourceX(x), floor, notes.near.z),
              lane
            );
            expect(point.x).toBeCloseTo(x + offset.x);
            expect(point.y).toBeCloseTo(hitY + offset.y);
            expect(point.scale).toBeCloseTo(1);
            // The actual native matrices agree with the shell used for labels and pointer alignment.
            const world = new Vector3(notes.sourceX(x), floor, -notes.near.z);
            world
              .applyMatrix4(viewMatrix(notes.params))
              .applyMatrix4(projectionMatrix(notes.params, width, height));
            const native = projectNoteLane(
              { x: ((world.x + 1) * width) / 2, y: ((1 - world.y) * height) / 2, scale: 1 },
              lane
            );
            expect(native.x).toBeCloseTo(point.x);
            expect(native.y).toBeCloseTo(point.y);
          }
        }
        expect(notes.road.at(width / 2, 0).y).toBeLessThan(hitY / 2);
      }
    }
  );
});

it.each([0.1, 0.2, 0.9])("honors horizon width %s without moving flat-key contact", (far) => {
  for (const [width, height, hitY] of [
    [320, 568, 360],
    [390, 844, 680],
    [667, 375, 220],
    [1366, 768, 500]
  ] as const) {
    const { notes } = flatRoadCamera(width, height, hitY, true, 0.1, { x: 0, y: 0 }, height, far);
    const nearLeft = notes.project(notes.sourceX(0), WHITE_NOTE_FLOOR, notes.near.z);
    const nearRight = notes.project(notes.sourceX(width), WHITE_NOTE_FLOOR, notes.near.z);
    const farLeft = notes.project(notes.sourceX(0), WHITE_NOTE_FLOOR, notes.roadFarZ);
    const farRight = notes.project(notes.sourceX(width), WHITE_NOTE_FLOOR, notes.roadFarZ);
    expect(nearLeft.x).toBeCloseTo(0, 7);
    expect(nearRight.x).toBeCloseTo(width, 7);
    expect(nearLeft.y).toBeCloseTo(hitY, 7);
    expect(farLeft.y).toBeCloseTo(hitY * 0.1, 7);
    expect((farRight.x - farLeft.x) / (nearRight.x - nearLeft.x)).toBeCloseTo(far, 7);
  }
});
