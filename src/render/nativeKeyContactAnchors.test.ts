import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nativeKeyContactLanes, nativeKeyContactOffsetX } from "./nativeKeyContactAnchors";
import { layoutKeyboard } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { nativeViewCameras } from "./nativeViewCameras";
import { CAMERA_PRESETS } from "./worldCamera";
import { metricC4X, metricKeyX } from "./keyboardMetrics";
import { projectNoteLane } from "./noteLaneProjection";
import { FREE_BLACK_LANE, roadNotePlace } from "./roadScenePoints";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";

interface Asset {
  nodes: { name: string; mesh: number; translation: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number }; material: number }[] }[];
  materials: { extras: { role: string } }[];
  accessors: { bufferView: number; byteOffset?: number; count: number }[];
  bufferViews: { byteOffset?: number }[];
}
const bytes = readFileSync("public/models/keyboard88.glb");
const jsonSize = bytes.readUInt32LE(12);
const asset = JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize)) as Asset;
function rearSurface(pitch: number) {
  const node = asset.nodes.find((part) => part.name === `key-${String(pitch)}`);
  if (!node) throw new Error("Missing model key");
  const points: number[][] = [];
  for (const primitive of asset.meshes[node.mesh]?.primitives ?? []) {
    if (asset.materials[primitive.material]?.extras.role !== "top") continue;
    const accessor = asset.accessors[primitive.attributes.POSITION];
    if (!accessor) throw new Error("Missing top positions");
    const view = asset.bufferViews[accessor.bufferView];
    const start = 28 + jsonSize + (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let i = 0; i < accessor.count; i++)
      points.push(
        [0, 1, 2].map(
          (axis) => bytes.readFloatLE(start + i * 12 + axis * 4) + (node.translation[axis] ?? 0)
        )
      );
  }
  const top = Math.max(...points.map((point) => point[1] ?? 0));
  const surface = points.filter((point) => (point[1] ?? 0) >= top - 0.00001);
  const back = Math.min(...surface.map((point) => point[2] ?? 0));
  const rear = surface.filter((point) => (point[2] ?? 0) < back + 0.002);
  const x =
    (Math.min(...rear.map((point) => point[0] ?? 0)) +
      Math.max(...rear.map((point) => point[0] ?? 0))) /
    2;
  return { x: (x - 0.36) * 1000, y: (top - 0.74) * 1000 + 22, z: -(back + 0.3) * 1000 };
}

describe("native key rear contacts from the published GLB", () => {
  it("follows all 88 real top surfaces without moving the front-key metric axis", () => {
    const keys = layoutKeyboard(2288);
    for (const key of keys.values()) {
      const rear = rearSurface(key.pitch);
      expect(metricKeyX(key.pitch) + nativeKeyContactOffsetX(key.pitch)).toBeCloseTo(rear.x, 3);
    }
    expect(nativeKeyContactOffsetX(21)).toBe(-3.575);
    expect(nativeKeyContactOffsetX(108)).toBe(0);
  });

  it.each(["player", "top"] as const)(
    "aligns geometry, trails and CPU effect/label origins in %s",
    (preset) => {
      const width = 1366,
        height = 768,
        sourceWidth = 2288;
      for (const [low, high] of [
        [21, 108],
        [48, 84]
      ] as const) {
        const keys = layoutKeyboard(sourceWidth, low, high);
        const base = metricKeyboardCamera(
          width,
          sourceWidth,
          height,
          CAMERA_PRESETS[preset],
          0.1,
          keys.values()
        );
        const { keyboard, notes, blackLane, whiteLane } = nativeViewCameras(
          base,
          230,
          preset === "top",
          true,
          height,
          0.1,
          height,
          height - 8,
          { x: 0, y: 0 },
          0.1
        );
        const lanes = nativeKeyContactLanes(keys, blackLane, whiteLane);
        const physical = nativeKeyContactLanes(keys, FREE_BLACK_LANE);
        const c4 = metricC4X(keys.values(), keyboard.sourceX);
        for (const pan of [0, (sourceWidth - width) / 2])
          for (const key of keys.values()) {
            const source = key.x + key.width / 2,
              lane = lanes.get(source);
            const floor = key.black ? 34 : 22;
            const depth = lane?.depth ?? notes.near.z;
            const frame = new ThreeRoadFrame();
            frame.add(
              source,
              20,
              500,
              key.width,
              0xffffff,
              1,
              500,
              notes,
              1,
              "test",
              0,
              lane,
              key.pitch
            );
            frame.addTrailAnchor(source, key.width, 0xffffff, 1, notes, lane);
            const note = frame.notes[0];
            if (!note) throw new Error("Missing native note");
            const offset = pan * (notes.params.sourceUnits ?? 0.5);
            const actual = projectNoteLane(notes.project(note.x - offset, floor, depth), lane);
            const rear = rearSurface(key.pitch);
            const expected = keyboard.project(c4 + rear.x - offset, rear.y, rear.z);
            expect(actual.x).toBeCloseTo(expected.x, 3);
            expect(actual.y).toBeCloseTo(expected.y, 3);
            const cpu = roadNotePlace(notes, notes.road, 500, pan, source, 500, 0, 0, lane, floor);
            expect(cpu?.x).toBeCloseTo(expected.x, 3);
            expect(frame.trailAnchors[0]?.x).toBeCloseTo(note.x, 8);
            if (key.black) {
              expect(depth).toBeCloseTo(rear.z, 3);
              const top = keyboard.project(c4 + rear.x - offset, floor, rear.z);
              expect(actual.x).toBeCloseTo(top.x, 3);
              expect(actual.y).toBeCloseTo(top.y, 3);
            }
            const inspection = physical.get(source);
            expect(inspection?.worldOffsetX ?? 0).toBe(nativeKeyContactOffsetX(key.pitch));
            expect(inspection?.scaleX ?? 1).toBe(1);
            expect(inspection?.offsetX ?? 0).toBe(0);
          }
      }
    }
  );
});
