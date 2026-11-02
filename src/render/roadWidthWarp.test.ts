import { roadNotePlace } from "./roadScenePoints";
import { describe, expect, it } from "vitest";
import { flatRoadCamera } from "./flatRoadCamera";
import { roadWidthCamera, roadWidthScale, roadWidthX, roadWorldPoint } from "./roadWidthWarp";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { NOTE_LANE_SHADER } from "./noteLaneProjection";
import { setRoadWidthUniforms, roadWidthUniforms } from "./three/roadWidthUniforms";

describe("independent road transverse geometry", () => {
  const keyboard = flatRoadCamera(1280, 720, 500, false, 0.1).keyboard;
  const canonical = noteProjectionCamera(keyboard, "perspective", 720, 0.1);

  it("keeps longitudinal geometry and camera identical for point, taper and inverse widths", () => {
    for (const share of [-1, -0.5, 0, 0.1, 0.5, 0.9]) {
      const road = roadWidthCamera(canonical, share);
      expect(road.params).toBe(canonical.params);
      expect(road.roadFarZ).toBe(canonical.roadFarZ);
      expect(road.near).toBe(canonical.near);
      for (const progress of [0, 0.3, 0.8, 1]) {
        const z = canonical.near.z + (canonical.roadFarZ - canonical.near.z) * progress;
        expect(road.project(120, 22, z).y).toBe(canonical.project(120, 22, z).y);
      }
      const nearWidth =
        canonical.project(300, 22, canonical.near.z).x -
        canonical.project(-300, 22, canonical.near.z).x;
      const farWidth =
        road.project(300, 22, road.roadFarZ).x - road.project(-300, 22, road.roadFarZ).x;
      if (share >= 0) expect(farWidth / nearWidth).toBeCloseTo(share, 7);
      expect(farWidth).toBeGreaterThanOrEqual(0);
    }
  });

  it("defines inverse maximum using reference viewport and full source keyboard", () => {
    const road = roadWidthCamera(canonical, -1, 2288);
    const left = road.project(canonical.sourceX(0), 22, road.roadFarZ);
    const right = road.project(canonical.sourceX(2288), 22, road.roadFarZ);
    expect(right.x - left.x).toBeCloseTo(1280, 7);
  });

  it("subtracts pan only once and keeps each contact fixed", () => {
    const contacts = [
      { y: 22, z: 149.1938 },
      { y: 34, z: 145.8 }
    ];
    const road = roadWidthCamera(canonical, 0.9, 1280, contacts);
    const warp = road.roadWidth;
    if (!warp) throw new Error("Missing road width metadata");
    warp.pan = 60;
    for (const contact of contacts) {
      expect(road.project(40, contact.y, contact.z)).toEqual(
        canonical.project(40, contact.y, contact.z)
      );
      const z = (contact.z + warp.farZ) / 2;
      const worldX = 100 * roadWidthScale(warp, z, contact.z) - 60;
      expect(road.project(40, contact.y, z).x).toBeCloseTo(
        canonical.project(worldX, contact.y, z).x,
        8
      );
    }
  });

  it("keeps the whole wide keyboard axis aligned after pan and lifted white labels on their lane", () => {
    const contacts = [
      { y: 22, z: 149.1938 },
      { y: 34, z: 145.8 }
    ];
    const road = roadWidthCamera(canonical, 0, 2288, contacts);
    const warp = road.roadWidth;
    if (!warp) throw new Error("Missing width transform");
    warp.pan = 180;
    expect(warp.axis).toBe((canonical.sourceX(0) + canonical.sourceX(2288)) / 2);
    expect(road.projectRoad?.(warp.axis - 180, 22, warp.farZ, 149.1938).x).toBeCloseTo(
      canonical.project(warp.axis - 180, 22, warp.farZ).x,
      8
    );
    const lane = {
      y: 22,
      depth: 149.1938,
      scaleX: 1,
      offsetX: 0,
      offsetY: 0,
      width: 1280,
      height: 720
    };
    const actual = roadNotePlace(road, road.road, 500, 360, 700, 250, 0, 23, lane, 22);
    const depth = (149.1938 + road.roadFarZ) / 2;
    const expected = road.projectRoad?.(road.sourceX(340), 33.5, depth, 149.1938);
    expect(actual?.x).toBeCloseTo(expected?.x ?? NaN, 8);
  });

  it("has finite point geometry without mirrored coordinates", () => {
    const warp = roadWidthCamera(canonical, 0).roadWidth;
    if (!warp) throw new Error("Missing road width metadata");
    expect(roadWidthX(warp, 90, warp.farZ)).toBe(0);
    for (const z of [warp.nearZ - 1, warp.nearZ, warp.farZ, warp.farZ + 1])
      expect(Number.isFinite(roadWidthX(warp, 90, z))).toBe(true);
  });

  it("maps direct free roads to exactly two metres above both physical contacts", () => {
    const road = roadWidthCamera(canonical, 0.1);
    const warp = road.roadWidth;
    if (!warp) throw new Error("Missing road width metadata");
    for (const [y, z] of [
      [22, 149.1938],
      [34, 145.8]
    ] as const) {
      expect(roadWorldPoint(warp, 40, y, z, y, z, true)).toEqual({ x: 40, y, z });
      const far = roadWorldPoint(warp, 40, y, warp.farZ, y, z, true);
      expect(far.y - y).toBe(2000);
      expect(far.z).toBe(z);
      const lift = roadWorldPoint(warp, 40, y + 3, z, y, z, true);
      expect(lift.y).toBe(y);
      expect(lift.z).toBe(z - 3);
    }
  });

  it("enables the same shared road transform independently from camera pose", () => {
    const road = roadWidthCamera(canonical, 0.9);
    setRoadWidthUniforms(road, true);
    expect(roadWidthUniforms.roadVertical.value).toBe(2000);
    expect(roadWidthUniforms.roadWidth.value[2]).toBe(road.roadWidth?.farScale);
    setRoadWidthUniforms(road, false);
    expect(roadWidthUniforms.roadVertical.value).toBe(0);
    expect(NOTE_LANE_SHADER).toContain("noteContact");
    expect(NOTE_LANE_SHADER).toContain("noteProjection.w - localPoint.z");
  });
});
