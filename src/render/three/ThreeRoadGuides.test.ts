import { freeRoadLanes, freeRoadPoint, DEFAULT_FREE_PERSPECTIVE_FIELD } from "../freeRoadLayout";
import { roadWidthCamera } from "../roadWidthWarp";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  Points,
  PointsMaterial
} from "three";
import type { Texture } from "../flatThree";
import { describe, expect, it, vi } from "vitest";
import { layoutKeyboard } from "../keyboardLayout";
import type { KeysScene } from "../NativeKeyboardScene";
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
        expect(guides.group.children).toHaveLength(4);
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
    expect(laneBuffer.length).toBe(89 * 6 * 16);
    expect(blackBuffer.length).toBe(89 * 6 * 16);
    expect(beatBuffer.length).toBe(ROAD_BEAT_GUIDE_LIMIT * 6 * 88);
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

it("puts direct inspection guides on the same two-metre board at each physical lane", () => {
  const keys = scene();
  const camera = roadWidthCamera(
    keys.camera,
    0.9,
    1280,
    [
      { y: 22, z: 149.1938 },
      { y: 34, z: 145.8 }
    ],
    false
  );
  const guides = new ThreeRoadGuides();
  guides.update(keyBoxes(keys), camera, [camera.roadFarZ], 1, true);
  for (const [index, y, z] of [
    [0, 22, 149.1938],
    [1, 34, 145.8]
  ] as const) {
    const data = positions(line(guides, index));
    expect(data.getY(0)).toBeCloseTo(y + 2000, 3);
    expect(data.getY(1)).toBeCloseTo(y, 3);
    expect(data.getZ(0)).toBeCloseTo(-z + 0.025, 3);
    expect(data.getZ(1)).toBeCloseTo(-z + 0.025, 3);
  }
  guides.dispose();
});

it("connects beat segments across every selected curved source instead of drawing a straight shortcut", () => {
  const keys = scene(60, 64),
    boxes = keyBoxes(keys),
    camera = keys.camera;
  const routes = freeRoadLanes(
    boxes.map((box) => ({
      pitch: box.pitch,
      width: box.width,
      near: { x: box.x, y: box.top, z: -box.back }
    })),
    { ...DEFAULT_FREE_PERSPECTIVE_FIELD, shape: "concave" }
  );
  const guides = new ThreeRoadGuides();
  guides.update(boxes, camera, [(camera.near.z + camera.roadFarZ) / 2], 1, false, routes);
  const beat = line(guides, 2),
    data = positions(beat);
  expect(beat.geometry.drawRange.count).toBe((routes.length - 1) * 2);
  for (let index = 0; index < routes.length - 1; index++) {
    const route = routes[index];
    if (!route) throw new Error("Missing selected lane");
    const point = freeRoadPoint(route, 0.5, 0, 0.025);
    expect(data.getX(index * 2)).toBeCloseTo(point.x, 3);
    expect(data.getY(index * 2)).toBeCloseTo(point.y, 3);
    expect(data.getZ(index * 2)).toBeCloseTo(point.z, 3);
  }
  guides.dispose();
});

it.each(["line", "convex", "concave"] as const)(
  "keeps all 88 fixed %s source markers stable when paused and frees them once",
  (shape) => {
    const keys = scene(),
      boxes = keyBoxes(keys),
      camera = keys.camera;
    const routes = freeRoadLanes(
      boxes.map((box) => ({
        pitch: box.pitch,
        width: box.width,
        near: { x: box.x, y: box.top, z: -box.back }
      })),
      { ...DEFAULT_FREE_PERSPECTIVE_FIELD, shape }
    );
    const guides = new ThreeRoadGuides();
    guides.update(boxes, camera, [], 0, false, routes);
    const markers = guides.group.children[3];
    if (!(markers instanceof Points) || !(markers.material instanceof PointsMaterial))
      throw new Error("Expected fixed source points");
    const rawGeometry: unknown = markers.geometry;
    if (!(rawGeometry instanceof BufferGeometry)) throw new Error("Expected point geometry");
    const geometry = rawGeometry;
    const data: unknown = geometry.getAttribute("position");
    if (!(data instanceof BufferAttribute))
      throw new Error("Expected reusable fixed-source buffer");
    expect(geometry.drawRange.count).toBe(88);
    expect(markers.material.size).toBe(2);
    expect(markers.material.sizeAttenuation).toBe(false);
    for (let index = 0; index < routes.length; index++) {
      const far = routes[index]?.far;
      expect(data.getX(index)).toBeCloseTo(far?.x ?? NaN, 3);
      expect(data.getY(index)).toBeCloseTo(far?.y ?? NaN, 3);
      expect(data.getZ(index)).toBeCloseTo(far?.z ?? NaN, 3);
    }
    const version = data.version,
      buffer = data.array;
    for (let frame = 0; frame < 300; frame++) guides.update(boxes, camera, [], 0, false, routes);
    expect(data.array).toBe(buffer);
    expect(data.version).toBe(version);
    guides.clear();
    expect(markers.visible).toBe(false);
    expect(geometry.drawRange.count).toBe(0);
    guides.update(boxes, camera, [], 0, false, routes);
    expect(markers.visible).toBe(true);
    expect(data.version).toBe(version);
    guides.update(boxes, camera, []);
    expect(markers.visible).toBe(false);
    expect(geometry.drawRange.count).toBe(0);
    const geometryDispose = vi.spyOn(geometry, "dispose"),
      materialDispose = vi.spyOn(markers.material, "dispose");
    guides.dispose();
    guides.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  }
);

it("joins segmented free guides to their own physical black and white contacts", () => {
  const keys = scene(60, 64),
    camera = keys.camera;
  const contacts = keyBoxes(keys).map((box) => ({
    pitch: box.pitch,
    width: box.width,
    near: { x: box.x, y: box.black ? 34 : 22, z: box.black ? -145.8 : -149.1938 }
  }));
  const routes = freeRoadLanes(contacts, DEFAULT_FREE_PERSPECTIVE_FIELD);
  const guides = new ThreeRoadGuides();
  guides.setDocked(true);
  guides.update(keyBoxes(keys), camera, [], 0, false, routes);
  const white = line(guides, 0),
    black = line(guides, 1);
  expect(white.geometry.drawRange.count + black.geometry.drawRange.count).toBe(routes.length * 32);
  for (const item of [white, black]) {
    const progress = item.geometry.getAttribute("roadDockProgress");
    for (let index = 0; index < item.geometry.drawRange.count; index += 32) {
      expect(progress.getX(index)).toBe(1);
      expect(progress.getX(index + 31)).toBe(0);
      expect(progress.getX(index + 25)).toBeLessThan(0.25);
    }
  }
  guides.setDocked(false);
  guides.update(keyBoxes(keys), camera, [], 0, false, routes);
  expect(white.geometry.drawRange.count + black.geometry.drawRange.count).toBe(routes.length * 2);
  guides.dispose();
});
