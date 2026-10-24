import { describe, expect, it } from "vitest";
import type { BufferAttribute } from "three";
import {
  buildProjectionLayout,
  DEFAULT_PROJECTION_PARAMETERS,
  projectionLaneX
} from "../stylizedProjection";
import { ProjectionNoteBatch } from "./ProjectionNoteBatch";

function layout(height = 900, keyY = 740) {
  return buildProjectionLayout(
    1440,
    height,
    Array.from({ length: 88 }, (_, i) => ({
      pitch: i + 21,
      x: 20 + i * 16,
      y: keyY - (i % 2) * 15,
      width: i % 2 ? 10 : 16
    })),
    { ...DEFAULT_PROJECTION_PARAMETERS, mode: "stylizedProjection" }
  );
}

describe("artistic note ribbons", () => {
  it("uses shared horizontal slices, exact landing, filled colors and alpha", () => {
    const map = layout();
    const lane = map.lanes[39];
    if (!lane) throw new Error("missing C4");
    const batch = new ProjectionNoteBatch();
    batch.begin(0.7);
    batch.add(map, lane, 1, 0.1, 0x20ff40, 0.6);
    batch.end();
    const geometry = batch.mesh.geometry,
      positions = geometry.getAttribute("position"),
      colors = geometry.getAttribute("tint");
    expect(geometry.drawRange.count).toBeGreaterThan(6);
    for (let v = 0; v < geometry.drawRange.count; v += 6) {
      const x = (positions.getX(v) + positions.getX(v + 1)) / 2;
      const y = positions.getY(v);
      expect(x).toBeCloseTo(projectionLaneX(map, lane, y), 3);
      expect(colors.getY(v)).toBe(1);
      expect(colors.getW(v)).toBeCloseTo(0.6);
    }
    const end = geometry.drawRange.count - 1;
    expect(positions.getY(end)).toBeCloseTo(lane.key.y, 3);
    expect((positions.getX(end) + positions.getX(end - 2)) / 2).toBeCloseTo(lane.key.x, 3);
    batch.dispose();
  });
  it("clips a very distant screen target without exceeding its fixed geometry", () => {
    const map = layout(900, 100000);
    const lane = map.lanes[20];
    if (!lane) throw new Error("missing pitch");
    const batch = new ProjectionNoteBatch();
    batch.begin(0);
    batch.add(map, lane, 1, 0, 0xff00ff);
    batch.end();
    const geometry = batch.mesh.geometry,
      positions = geometry.getAttribute("position");
    expect(geometry.drawRange.count).toBeLessThanOrEqual(66 * 6);
    for (let i = 0; i < geometry.drawRange.count; i++)
      expect(positions.getY(i)).toBeLessThanOrEqual(900);
    batch.begin(0);
    const version = (positions as BufferAttribute).version;
    batch.end();
    expect(geometry.drawRange.count).toBe(0);
    expect((positions as BufferAttribute).version).toBe(version);
    batch.dispose();
  });
});
