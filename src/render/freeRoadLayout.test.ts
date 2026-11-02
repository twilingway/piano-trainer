import { describe, expect, it } from "vitest";
import {
  freeFieldReach,
  freeRoadLanes,
  freeRoadPoint,
  normalizeFreeRoadLayout,
  DEFAULT_FREE_DIRECT_FIELD,
  DEFAULT_FREE_PERSPECTIVE_FIELD,
  type FreeRoadLane
} from "./freeRoadLayout";

function laneAt(lanes: readonly FreeRoadLane[], index: number): FreeRoadLane {
  const lane = lanes.at(index);
  if (!lane) throw new Error(`Missing lane ${String(index)}`);
  return lane;
}
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
      normalizeFreeRoadLayout({ tilt: Infinity, length: -1, width: 100, shape: "sphere" })
    ).toEqual({ tilt: 90, length: 0.05, width: 100, radius: 100, shape: "line" });
    expect(normalizeFreeRoadLayout({ tilt: 0 }).tilt).toBe(0);
  });
  it("turns an older height and distance into a tilt and length of the same far edge", () => {
    expect(normalizeFreeRoadLayout({ height: 2, distance: 4, width: 6 })).toMatchObject({
      tilt: 26.57,
      length: 4.47
    });
    expect(normalizeFreeRoadLayout({ height: 0.45, distance: 0 })).toMatchObject({
      tilt: 90,
      length: 0.45
    });
    expect(normalizeFreeRoadLayout({ height: 0, distance: 59.52 })).toMatchObject({
      tilt: 0,
      length: 59.52
    });
    expect(normalizeFreeRoadLayout({ height: -30.05, distance: 82.25 })).toMatchObject({
      tilt: -20.07,
      length: 87.57
    });
    // A lone old field takes the other from the fallback's edge: the direct one has no run.
    expect(normalizeFreeRoadLayout({ height: 3 })).toMatchObject({ tilt: 90, length: 3 });
    expect(normalizeFreeRoadLayout({ tilt: 10, length: 5, height: 2, distance: 4 })).toMatchObject({
      tilt: 10,
      length: 5
    });
    expect(normalizeFreeRoadLayout({ height: Number.NaN })).toEqual(DEFAULT_FREE_DIRECT_FIELD);
  });
  it("uses every selected semitone including black lanes, irrespective of played notes", () => {
    const lanes = freeRoadLanes(contacts, DEFAULT_FREE_PERSPECTIVE_FIELD);
    const top = 22 + 1000 * freeFieldReach(DEFAULT_FREE_PERSPECTIVE_FIELD).rise;
    expect(lanes).toHaveLength(88);
    const spacing = 6000 / 87;
    for (let index = 1; index < lanes.length; index++) {
      const current = lanes[index],
        previous = lanes[index - 1];
      expect((current?.far.x ?? 0) - (previous?.far.x ?? 0)).toBeCloseTo(spacing, 8);
      expect(current?.far.y).toBe(top);
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
      const layout = { tilt: 90, length: 2, width: 6, shape };
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
  it("moves the far edge along the field by length and turns it by tilt alone", () => {
    for (const shape of ["line", "convex", "concave"] as const) {
      const config = { tilt: 30, length: 17, width: 29, shape };
      const lanes = freeRoadLanes(contacts, config),
        longer = freeRoadLanes(contacts, { ...config, length: 18 }),
        steeper = freeRoadLanes(contacts, { ...config, tilt: 40 }),
        wider = freeRoadLanes(contacts, { ...config, width: 30 });
      for (const [index, lane] of lanes.entries()) {
        // One metre more along a 30° field: 500 mm up, 866 mm back, the tilt unchanged.
        expect(longer[index]?.far.y).toBeCloseTo(lane.far.y + 500, 8);
        expect(longer[index]?.far.z).toBeCloseTo(lane.far.z - 1000 * Math.cos(Math.PI / 6), 8);
        expect(wider[index]?.far.z).toBe(lane.far.z);
        expect(steeper[index]?.near).toBe(lane.near);
      }
      const single = freeRoadLanes(contacts.slice(7, 8), config);
      expect(single[0]?.far.y).toBeCloseTo(22 + 8500, 8);
      expect(single[0]?.far.x).toBe(single[0]?.near.x);
      // A steeper field keeps its length: the straight edge stays 17 m from the back line.
      const steep = freeRoadLanes(contacts.slice(7, 8), { ...config, tilt: 40 })[0];
      const back = steep?.near.z ?? 0;
      expect(Math.hypot((steep?.far.y ?? 0) - 22, (steep?.far.z ?? 0) - back)).toBeCloseTo(
        17000,
        6
      );
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

it("preserves the recorded large negative-height layout through JSON persistence", () => {
  const layout = normalizeFreeRoadLayout({
    tilt: -20.07,
    length: 87.57,
    width: 95.25,
    radius: 120,
    shape: "convex"
  });
  expect(normalizeFreeRoadLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  expect(layout).toMatchObject({ tilt: -20.07, length: 87.57, width: 95.25, radius: 120 });
  const { rise, run } = freeFieldReach(layout);
  const lanes = freeRoadLanes(contacts, layout);
  expect(lanes.every((lane) => Object.values(lane.far).every(Number.isFinite))).toBe(true);
  expect(Math.min(...lanes.map((lane) => lane.far.y))).toBeCloseTo(22 + rise * 1000, 7);
  // Within a centimetre of the recorded H-30.05 m / D82.25 m edge.
  expect(Math.abs(rise + 30.05)).toBeLessThan(0.01);
  expect(Math.abs(run - 82.25)).toBeLessThan(0.01);
  expect(laneAt(lanes, -1).far.x - laneAt(lanes, 0).far.x).toBeCloseTo(95250, 6);
  expect(laneAt(lanes, 0).far.z).toBeCloseTo(-149.1938 - run * 1000, 6);
});

it.each(["convex", "concave"] as const)(
  "migrates every old %s source without moving it",
  (shape) => {
    const legacy = { height: 2, distance: 4, width: 6, shape };
    const migrated = normalizeFreeRoadLayout(legacy);
    const top = 22 + 1000 * freeFieldReach(migrated).rise;
    expect(migrated.radius).toBe(6);
    const lanes = freeRoadLanes(contacts, migrated);
    const minSag = Math.min(
      ...contacts.map(
        (lane) => 6000 * (1 - Math.cos(((((lane.pitch - 21) / 87) * 2 - 1) * Math.PI) / 6))
      )
    );
    for (let i = 0; i < lanes.length; i++) {
      const theta = (((2 * i) / 87 - 1) * Math.PI) / 6;
      const sag = 6000 * (1 - Math.cos(theta));
      expect(laneAt(lanes, i).far.x).toBeCloseTo(6000 * Math.sin(theta), 7);
      expect(laneAt(lanes, i).far.y).toBeCloseTo(
        top + (shape === "convex" ? 6000 * (1 - Math.cos(Math.PI / 6)) - sag : sag - minSag),
        7
      );
    }
  }
);

it("changes curvature without moving the chord ends, contacts or distance", () => {
  const small = freeRoadLanes(contacts, {
    tilt: 0,
    length: 82.25,
    width: 95.25,
    radius: 50,
    shape: "convex"
  });
  const large = freeRoadLanes(contacts, {
    tilt: 0,
    length: 82.25,
    width: 95.25,
    radius: 10000,
    shape: "convex"
  });
  expect(laneAt(small, 0).far).toEqual(laneAt(large, 0).far);
  expect(laneAt(small, -1).far).toEqual(laneAt(large, -1).far);
  expect(laneAt(small, 43).far.y).toBeGreaterThan(laneAt(large, 43).far.y + 10000);
  for (let i = 0; i < small.length; i++) {
    expect(laneAt(small, i).near).toBe(laneAt(large, i).near);
    expect(laneAt(small, i).far.z).toBe(laneAt(large, i).far.z);
  }
});

it("limits radius to a valid circle while preserving zero height and line settings", () => {
  expect(
    normalizeFreeRoadLayout({ tilt: -1000, length: 2000, width: 2000, radius: -1 })
  ).toMatchObject({ tilt: -90, length: 1000, width: 1000, radius: 500 });
  expect(normalizeFreeRoadLayout({ tilt: 0, width: 6, radius: Number.NaN })).toMatchObject({
    tilt: 0,
    radius: 4
  });
  const value = { ...DEFAULT_FREE_DIRECT_FIELD, width: 20, radius: 120 };
  const line = freeRoadLanes(contacts, value);
  const alternateRadius = freeRoadLanes(contacts, { ...value, radius: 10 });
  expect(alternateRadius).toEqual(line);
  expect(normalizeFreeRoadLayout(value).radius).toBe(120);
  for (const shape of ["line", "convex", "concave"] as const) {
    const lanes = freeRoadLanes(contacts.slice(8, 9), {
      tilt: -90,
      length: 100,
      width: 1000,
      radius: 500,
      shape
    });
    expect(laneAt(lanes, 0).far.y).toBe(-99978);
    expect(Object.values(freeRoadPoint(laneAt(lanes, 0), 0.5, 0, 3)).every(Number.isFinite)).toBe(
      true
    );
  }
});
