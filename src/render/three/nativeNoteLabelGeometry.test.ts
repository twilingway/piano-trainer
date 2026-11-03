import { describe, expect, it } from "vitest";
import { createNoteSlabGeometry } from "./noteSlabGeometry";
import { createNativeNoteLabelGeometry } from "./nativeNoteLabelGeometry";

describe("native caption depth geometry", () => {
  it("copies the body's actual top triangles and attributes without a fitted replacement plane", () => {
    const body = createNoteSlabGeometry();
    const decal = createNativeNoteLabelGeometry();
    const profiles = body.getAttribute("slabProfile");
    const selected: number[] = [];
    for (let start = 0; start < profiles.count; start += 3) {
      const vertices = [start, start + 1, start + 2];
      if (
        vertices.every(
          (index) =>
            profiles.getX(index) === 0.5 && profiles.getY(index) === 0 && profiles.getZ(index) === 1
        )
      )
        selected.push(...vertices);
    }
    expect(selected).toHaveLength(84);
    expect(decal.getAttribute("position").count).toBe(selected.length);
    for (const name of ["position", "slabCorner", "slabArc", "slabProfile"]) {
      const original = body.getAttribute(name);
      const actual = decal.getAttribute(name);
      selected.forEach((source, destination) => {
        for (let component = 0; component < original.itemSize; component++)
          expect(actual.getComponent(destination, component)).toBe(
            original.getComponent(source, component)
          );
      });
      expect(actual.array).not.toBe(original.array);
    }
    body.dispose();
    decal.dispose();
  });
});
