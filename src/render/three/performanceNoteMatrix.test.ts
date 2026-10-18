import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
describe("vertical lane contact", () => {
  it.each([22, 36])("keeps the hit anchor at lane height %s", (laneY) => {
    const matrix = new Matrix4();
    performanceNoteMatrix(matrix, 12, laneY, -145, laneY, 145, Math.PI / 2);
    const point = new Vector3().applyMatrix4(matrix);
    expect(point.toArray()).toEqual([12, laneY, -145]);
  });
  it("moves distance before the key vertically upward", () => {
    const matrix = new Matrix4();
    performanceNoteMatrix(matrix, 12, 22, -245, 22, 145, Math.PI / 2);
    const point = new Vector3().applyMatrix4(matrix);
    expect(point.y).toBeCloseTo(122);
    expect(point.z).toBeCloseTo(-145);
  });
});
