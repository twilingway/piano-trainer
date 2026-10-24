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
        const { notes, blackLane } = flatRoadCamera(width, height, hitY, perspective, 0.1, offset);
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
