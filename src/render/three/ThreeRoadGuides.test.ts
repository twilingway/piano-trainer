import { BufferAttribute, LineBasicMaterial, LineSegments, Vector3 } from "three";
import type { Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { layoutKeyboard } from "../keyboardLayout";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { CAMERA_PRESETS, PANEL_EDGE, worldCamera } from "../worldCamera";
import { keyBoxes } from "./keyBoxes";
import { projectionMatrix, viewMatrix } from "./threeCamera";
import { ROAD_BEAT_GUIDE_LIMIT, ThreeRoadGuides } from "./ThreeRoadGuides";

function scene(low = 21, high = 108): KeysScene {
  const keys = layoutKeyboard(1280, low, high);
  return {
    faces: [...keys.values()].map((key) => ({
      key,
      source: key.black ? { y: 0, height: 60 } : { y: 60, height: 40 }
    })),
    texture: { width: 1280, height: 100 } as Texture,
    camera: worldCamera(1280, 640, CAMERA_PRESETS.player, PANEL_EDGE),
    pan: 0,
    offset: { x: 0, y: 0 },
    version: 1
  };
}

function line(guides: ThreeRoadGuides, index: number): LineSegments {
  const child = guides.group.children[index];
  if (!(child instanceof LineSegments)) throw new Error("Expected native Three line segments");
  return child as LineSegments;
}

function positions(item: LineSegments): BufferAttribute {
  const value = item.geometry.getAttribute("position");
  if (!(value instanceof BufferAttribute)) throw new Error("Expected a reusable position buffer");
  return value;
}

describe("native road guides", () => {
  it("draws one guide through every white and black key center in all camera presets", () => {
    for (const [low, high] of [
      [36, 83],
      [36, 84],
      [24, 84],
      [21, 108]
    ] as const) {
      for (const prefs of Object.values(CAMERA_PRESETS)) {
        const keys = scene(low, high);
        const camera = worldCamera(1280, 640, prefs, PANEL_EDGE);
        const boxes = keyBoxes(keys);
        const guides = new ThreeRoadGuides();
        guides.update(boxes, camera, [camera.near.z, camera.roadFarZ]);
        expect(guides.group.children).toHaveLength(3);
        expect(
          line(guides, 0).geometry.drawRange.count + line(guides, 1).geometry.drawRange.count
        ).toBe(boxes.length * 2);
        for (const black of [false, true]) {
          const lanes = line(guides, black ? 1 : 0);
          const data = positions(lanes);
          const expectedBoxes = boxes.filter((box) => box.black === black);
          expect(lanes.geometry.drawRange.count).toBe(expectedBoxes.length * 2);
          for (const [index, box] of expectedBoxes.entries()) {
            expect(data.getX(index * 2)).toBeCloseTo(box.x, 4);
            expect(data.getX(index * 2 + 1)).toBeCloseTo(box.x, 4);
            expect(data.getZ(index * 2)).toBeCloseTo(-camera.roadFarZ, 3);
            expect(data.getZ(index * 2 + 1)).toBeCloseTo(-camera.near.z, 3);
          }
          for (const pan of [0, 160]) {
            const offset = { x: 35, y: -60 };
            const view = viewMatrix(camera.params);
            const projection = projectionMatrix(camera.params, 1280, 720, offset);
            for (let vertex = 0; vertex < lanes.geometry.drawRange.count; vertex++) {
              const x = data.getX(vertex),
                y = data.getY(vertex),
                z = data.getZ(vertex);
              const box = expectedBoxes[Math.floor(vertex / 2)];
              if (!box) throw new Error("Expected the guide's matching key");
              const expected = camera.project(box.x - pan / 2, y, -z);
              const ndc = new Vector3((x - pan / 2) * prefs.scale, y * prefs.scale, z * prefs.scale)
                .applyMatrix4(view)
                .applyMatrix4(projection);
              // Positions are Float32; the sub-millipixel tolerance includes buffer quantization.
              expect((ndc.x + 1) * 640).toBeCloseTo(expected.x + offset.x, 3);
              expect((1 - ndc.y) * 360).toBeCloseTo(expected.y + offset.y, 3);
            }
          }
        }
        guides.dispose();
      }
    }
  });

  it("reuses buffers, respects the active beat count and clips invalid or out-of-road beats", () => {
    const keys = scene();
    const boxes = keyBoxes(keys);
    const guides = new ThreeRoadGuides();
    const laneBuffer = positions(line(guides, 0)).array;
    const blackBuffer = positions(line(guides, 1)).array;
    const beatBuffer = positions(line(guides, 2)).array;
    expect(laneBuffer.length).toBe(89 * 6);
    expect(blackBuffer.length).toBe(89 * 6);
    expect(beatBuffer.length).toBe(ROAD_BEAT_GUIDE_LIMIT * 6);
    const near = keys.camera.near.z,
      far = keys.camera.roadFarZ;
    guides.update(boxes, keys.camera, [near, far], 1);
    expect(line(guides, 2).geometry.drawRange.count).toBe(2);
    guides.update(boxes, keys.camera, [NaN, near - 1, far + 1, (near + far) / 2]);
    expect(line(guides, 2).geometry.drawRange.count).toBe(2);
    expect(positions(line(guides, 2)).getZ(0)).toBeCloseTo(-(near + far) / 2, 3);
    guides.update(
      boxes,
      keys.camera,
      Array.from({ length: 1000 }, () => near)
    );
    expect(line(guides, 2).geometry.drawRange.count).toBe(ROAD_BEAT_GUIDE_LIMIT * 2);
    expect(positions(line(guides, 0)).array).toBe(laneBuffer);
    expect(positions(line(guides, 1)).array).toBe(blackBuffer);
    expect(positions(line(guides, 2)).array).toBe(beatBuffer);
    guides.update(boxes, keys.camera, [near, far], 0);
    expect(line(guides, 2).geometry.drawRange.count).toBe(0);
    guides.dispose();
  });

  it("clears and resumes unchanged layouts and disposes resources once", () => {
    const keys = scene();
    const boxes = keyBoxes(keys);
    const guides = new ThreeRoadGuides();
    const lane = line(guides, 0),
      black = line(guides, 1),
      beat = line(guides, 2);
    const destroyLane = vi.spyOn(lane.geometry, "dispose");
    const destroyBeat = vi.spyOn(beat.geometry, "dispose");
    const destroyBlack = vi.spyOn(black.geometry, "dispose");
    if (
      !(lane.material instanceof LineBasicMaterial) ||
      !(beat.material instanceof LineBasicMaterial) ||
      !(black.material instanceof LineBasicMaterial)
    )
      throw new Error("Expected simple guide materials");
    const destroyLaneMaterial = vi.spyOn(lane.material, "dispose");
    const destroyBeatMaterial = vi.spyOn(beat.material, "dispose");
    const destroyBlackMaterial = vi.spyOn(black.material, "dispose");
    guides.update(boxes, keys.camera, [keys.camera.near.z]);
    const count = lane.geometry.drawRange.count;
    guides.clear();
    expect(guides.group.visible).toBe(false);
    expect(lane.geometry.drawRange.count).toBe(0);
    guides.update(boxes, keys.camera, [keys.camera.near.z]);
    expect(guides.group.visible).toBe(true);
    expect(lane.geometry.drawRange.count).toBe(count);
    guides.update([], keys.camera, []);
    expect(guides.group.visible).toBe(false);
    guides.dispose();
    guides.dispose();
    for (const spy of [
      destroyLane,
      destroyBlack,
      destroyBeat,
      destroyLaneMaterial,
      destroyBlackMaterial,
      destroyBeatMaterial
    ])
      expect(spy).toHaveBeenCalledTimes(1);
    guides.update(boxes, keys.camera, [keys.camera.near.z]);
    expect(guides.group.children).toHaveLength(0);
    expect(guides.group.visible).toBe(false);
  });

  it("makes white-key guides more than three times brighter with one guide per physical key", () => {
    const keys = scene();
    const guides = new ThreeRoadGuides();
    guides.update(keyBoxes(keys), keys.camera, []);
    const white = line(guides, 0),
      black = line(guides, 1);
    if (
      !(white.material instanceof LineBasicMaterial) ||
      !(black.material instanceof LineBasicMaterial)
    )
      throw new Error("Expected distinct guide materials");
    expect(white.geometry.drawRange.count).toBe(52 * 2);
    expect(black.geometry.drawRange.count).toBe(36 * 2);
    expect(white.material.opacity).toBeCloseTo(0.38);
    expect(black.material.opacity).toBeCloseTo(0.12);
    expect(white.material.opacity / black.material.opacity).toBeGreaterThan(3);
    expect(white.material.color.getHex()).toBe(black.material.color.getHex());
    guides.dispose();
  });
});
