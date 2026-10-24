import { describe, expect, it } from "vitest";
import {
  freeRoadLanes,
  freeRoadPoint,
  normalizeFreeRoadLayout,
  DEFAULT_FREE_DIRECT_FIELD,
  DEFAULT_FREE_PERSPECTIVE_FIELD
} from "./freeRoadLayout";

const contacts = Array.from({ length: 88 }, (_, index) => ({
  pitch: index + 21,
  width: 22,
  near: { x: index * 14 - 609, y: index % 2 ? 34 : 22, z: index % 2 ? -145.8 : -149.1938 }
}));
describe("metric fixed free-world note sources", () => {
  it("normalizes metre preferences and preserves the two mode defaults", () => {
    expect(normalizeFreeRoadLayout(undefined)).toEqual(DEFAULT_FREE_DIRECT_FIELD);
    expect(normalizeFreeRoadLayout({}, DEFAULT_FREE_PERSPECTIVE_FIELD)).toEqual(
      DEFAULT_FREE_PERSPECTIVE_FIELD
    );
    expect(
      normalizeFreeRoadLayout({ height: Infinity, distance: -1, width: 100, shape: "sphere" })
    ).toEqual({ height: 2, distance: 0, width: 30, shape: "line" });
    expect(normalizeFreeRoadLayout({ height: 0 }).height).toBe(0.25);
  });
  it("uses every selected semitone including black lanes, irrespective of played notes", () => {
    const lanes = freeRoadLanes(contacts, DEFAULT_FREE_PERSPECTIVE_FIELD);
    expect(lanes).toHaveLength(88);
    const spacing = 6000 / 87;
    for (let index = 1; index < lanes.length; index++) {
      const current = lanes[index],
        previous = lanes[index - 1];
      expect((current?.far.x ?? 0) - (previous?.far.x ?? 0)).toBeCloseTo(spacing, 8);
      expect(current?.far.y).toBe(2022);
    }
    const subset = freeRoadLanes(contacts.slice(39, 44), DEFAULT_FREE_PERSPECTIVE_FIELD);
    expect(subset.map((l) => l.pitch)).toEqual([60, 61, 62, 63, 64]);
    expect((subset.at(-1)?.far.x ?? 0) - (subset[0]?.far.x ?? 0)).toBe(6000);
  });
  it("centres a single lane without division by zero", () => {
    const lanes = freeRoadLanes(contacts.slice(5, 6), DEFAULT_FREE_DIRECT_FIELD);
    expect(lanes[0]?.far.x).toBe(lanes[0]?.near.x);
    expect(Object.values(lanes[0]?.far ?? {}).every(Number.isFinite)).toBe(true);
    expect(freeRoadLanes([], DEFAULT_FREE_DIRECT_FIELD)).toEqual([]);
  });
  it.each(["convex", "concave"] as const)(
    "keeps equal arc spacing and nearest distance in %s",
    (shape) => {
      const layout = { height: 2, distance: 0, width: 6, shape };
      const lanes = freeRoadLanes(contacts, layout),
        distances = lanes.map((l) => -l.far.z - 149.1938);
      expect(Math.min(...distances)).toBeCloseTo(0, 8);
      expect(Math.max(...distances)).toBeCloseTo(0, 8);
      expect(Math.min(...lanes.map((l) => l.far.y))).toBeCloseTo(2022, 8);
      const middle = lanes[Math.floor(lanes.length / 2)]?.far.y ?? 0;
      const edge = lanes[0]?.far.y ?? 0;
      if (shape === "convex") expect(middle).toBeGreaterThan(edge);
      else expect(middle).toBeLessThan(edge);
      const chords = lanes
        .slice(1)
        .map((l, index) =>
          Math.hypot(l.far.x - (lanes[index]?.far.x ?? 0), l.far.y - (lanes[index]?.far.y ?? 0))
        );
      expect(Math.max(...chords) - Math.min(...chords)).toBeLessThan(1e-8);
      const first = lanes[0],
        last = lanes.at(-1);
      expect((last?.far.x ?? 0) - (first?.far.x ?? 0)).toBeCloseTo(6000, 8);
    }
  );
  it("keeps distance common and independent from shape, height and width", () => {
    for (const shape of ["line", "convex", "concave"] as const) {
      const config = { height: 2, distance: 17, width: 29, shape };
      const lanes = freeRoadLanes(contacts, config),
        farther = freeRoadLanes(contacts, { ...config, distance: 18 }),
        higher = freeRoadLanes(contacts, { ...config, height: 3 }),
        wider = freeRoadLanes(contacts, { ...config, width: 30 });
      for (const [index, lane] of lanes.entries()) {
        expect(farther[index]?.far.z).toBeCloseTo(lane.far.z - 1000, 8);
        expect(farther[index]?.far.y).toBe(lane.far.y);
        expect(higher[index]?.far.y).toBeCloseTo(lane.far.y + 1000, 8);
        expect(higher[index]?.far.z).toBe(lane.far.z);
        expect(wider[index]?.far.z).toBe(lane.far.z);
        expect(higher[index]?.near).toBe(lane.near);
      }
      const single = freeRoadLanes(contacts.slice(7, 8), config);
      expect(single[0]?.far.y).toBe(2022);
      expect(single[0]?.far.x).toBe(single[0]?.near.x);
    }
  });

  it("preserves physical near points and uses a perpendicular closed-slab normal", () => {
    for (const shape of ["line", "convex", "concave"] as const) {
      const lanes = freeRoadLanes(contacts, { ...DEFAULT_FREE_PERSPECTIVE_FIELD, shape });
      for (const lane of lanes) {
        expect(freeRoadPoint(lane, 0)).toEqual(lane.near);
        expect(freeRoadPoint(lane, 1)).toEqual(lane.far);
        const raised = freeRoadPoint(lane, 0.5, 0, 4),
          surface = freeRoadPoint(lane, 0.5);
        const dy = lane.far.y - lane.near.y,
          dz = lane.far.z - lane.near.z;
        expect((raised.y - surface.y) * dy + (raised.z - surface.z) * dz).toBeCloseTo(0, 7);
        expect(Math.hypot(raised.y - surface.y, raised.z - surface.z)).toBeCloseTo(4, 8);
      }
    }
  });
});
