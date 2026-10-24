// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { buildProjectionLayout, DEFAULT_PROJECTION_PARAMETERS } from "../stylizedProjection";
import { ProjectionDebug } from "./ProjectionDebug";

describe("diagnostic texture storage", () => {
  it("releases immutable GPU storage when the canvas grows, without reallocating unchanged sizes", () => {
    const debug = new ProjectionDebug();
    const texture = debug.mesh.material.map;
    if (!texture) throw new Error("missing diagnostic texture");
    const dispose = vi.spyOn(texture, "dispose");
    const mapping = (height: number) =>
      buildProjectionLayout(
        1920,
        height,
        Array.from({ length: 88 }, (_, i) => ({
          pitch: 21 + i,
          x: 20 + i * 21,
          y: height * 0.8,
          width: 15
        })),
        { ...DEFAULT_PROJECTION_PARAMETERS, debugMapping: true }
      );
    debug.update(mapping(806));
    expect(dispose).toHaveBeenCalledTimes(1);
    debug.update(mapping(806));
    expect(dispose).toHaveBeenCalledTimes(1);
    debug.update(mapping(1008));
    expect(dispose).toHaveBeenCalledTimes(2);
    debug.update(mapping(806));
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(debug.mesh.material.map).toBe(texture);
    debug.dispose();
  });
});
