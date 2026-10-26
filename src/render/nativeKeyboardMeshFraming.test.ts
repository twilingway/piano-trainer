import { readFileSync } from "node:fs";
import {
  BufferGeometry,
  Camera,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Scene,
  Vector2,
  Vector3
} from "three";
import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { KEYBOARD_C4, metricC4X } from "./keyboardMetrics";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { naturalNativeKeyboardHeight } from "./nativeKeyboardFraming";
import { nativeViewCameras } from "./nativeViewCameras";
import { viewGeometry, USUAL_PLACEMENT } from "./viewGeometry";
import { CAMERA_PRESETS } from "./worldCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { pickKeyboardKey } from "./three/pickKeyboardKey";

interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
}
interface Glb {
  readonly nodes: readonly {
    readonly mesh: number;
    readonly translation: readonly number[];
    readonly extras: { readonly midi?: number };
  }[];
  readonly meshes: readonly {
    readonly primitives: readonly {
      readonly attributes: { readonly POSITION: number };
      readonly indices: number;
    }[];
  }[];
  readonly accessors: readonly Accessor[];
  readonly bufferViews: readonly { readonly byteOffset: number; readonly byteStride?: number }[];
}
const bytes = readFileSync("public/models/keyboard88.glb"),
  jsonSize = bytes.readUInt32LE(12);
const glb = JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize)) as Glb;
const binary = 20 + jsonSize + 8;
function data(index: number, components: number): number[] {
  const accessor = glb.accessors[index];
  if (!accessor) throw new Error("Missing accessor");
  const view = glb.bufferViews[accessor.bufferView];
  if (!view) throw new Error("Missing buffer view");
  const size = accessor.componentType === 5123 ? 2 : 4;
  const stride = view.byteStride ?? components * size;
  return Array.from({ length: accessor.count * components }, (_, offset) => {
    const at =
      binary +
      view.byteOffset +
      (accessor.byteOffset ?? 0) +
      Math.floor(offset / components) * stride +
      (offset % components) * size;
    return accessor.componentType === 5126
      ? bytes.readFloatLE(at)
      : accessor.componentType === 5123
        ? bytes.readUInt16LE(at)
        : bytes.readUInt32LE(at);
  });
}
function physicalKeys(low: number, high: number, anchorX: number) {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const keys = glb.nodes.flatMap((node) => {
    const pitch = node.extras.midi;
    if (
      pitch === undefined ||
      pitch < low ||
      pitch > high ||
      ![low, low + 1, 60, 61, 62, 64, 65, high].includes(pitch)
    )
      return [];
    const source = glb.meshes[node.mesh];
    if (!source) throw new Error("Missing mesh");
    const positions: number[] = [],
      indices: number[] = [];
    for (const primitive of source.primitives) {
      const first = positions.length / 3;
      for (const [offset, value] of data(primitive.attributes.POSITION, 3).entries()) {
        const axis = offset % 3;
        positions.push(
          (value +
            (node.translation[axis] ?? 0) -
            ([KEYBOARD_C4.x, KEYBOARD_C4.y, KEYBOARD_C4.z][axis] ?? 0)) *
            1000 +
            (axis === 0 ? anchorX : axis === 1 ? 22 : 0)
        );
      }
      indices.push(...data(primitive.indices, 1).map((index) => index + first));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return [{ pitch, mesh: new Mesh(geometry, material) }];
  });
  return {
    keys,
    dispose: () => {
      for (const key of keys) key.mesh.geometry.dispose();
      material.dispose();
    }
  };
}

describe("published native mesh framing and picking", () => {
  it.each([
    [2913, 1126],
    [2904, 1076],
    [2904, 803],
    [390, 844],
    [667, 180],
    [2904, 100]
  ] as const)(
    "keeps actual GLB faces and picking on the same GPU camera at %s×%s",
    (width, height) => {
      for (const [low, high] of [
        [48, 72],
        [36, 84],
        [21, 108]
      ] as const)
        for (const prefs of [CAMERA_PRESETS.top, CAMERA_PRESETS.player])
          for (const scale of [0.6, 1, 1.8]) {
            const layout = layoutKeyboard(width, low, high);
            const base = metricKeyboardCamera(width, width, height, prefs, 0.1, layout.values());
            const placement = { ...USUAL_PLACEMENT, scale };
            const geometry = viewGeometry(
              height,
              layout.get(low)?.width ?? 0,
              { notes: true, keys: true, hands: false },
              false,
              true,
              placement,
              naturalNativeKeyboardHeight(base, false)
            );
            const camera = nativeViewCameras(
              base,
              geometry.keyboardHeight,
              false,
              true,
              height,
              0.1,
              height,
              geometry.keyboardTop + geometry.keyboardHeight,
              undefined,
              undefined,
              width,
              scale
            ).keyboard;
            const physical = physicalKeys(low, high, metricC4X(layout.values(), base.sourceX));
            const scene = new Scene();
            for (const key of physical.keys) scene.add(key.mesh);
            scene.scale.setScalar(prefs.scale);
            const gpu = new Camera();
            const gpuView = viewMatrix(camera.params);
            gpu.matrixAutoUpdate = false;
            gpu.matrix.copy(gpuView.clone().invert());
            gpu.updateMatrixWorld(true);
            gpu.projectionMatrix.copy(projectionMatrix(camera.params, width, height));
            gpu.projectionMatrixInverse.copy(gpu.projectionMatrix).invert();
            const combined = gpu.projectionMatrix.clone().multiply(gpuView);
            for (const travel of [0, -8]) {
              for (const key of physical.keys) key.mesh.position.y = travel;
              scene.updateMatrixWorld(true);
              for (const key of physical.keys) {
                const positions = key.mesh.geometry.getAttribute("position");
                const world = new Vector3(),
                  projected = new Vector3();
                let top = Infinity,
                  bottom = -Infinity,
                  error = 0;
                for (let index = 0; index < positions.count; index++) {
                  world.fromBufferAttribute(positions, index);
                  world.y += travel;
                  const cpu = camera.project(world.x, world.y, -world.z);
                  projected.copy(world).multiplyScalar(prefs.scale).applyMatrix4(combined);
                  error = Math.max(error, Math.abs(((1 - projected.y) * height) / 2 - cpu.y));
                  top = Math.min(top, cpu.y);
                  bottom = Math.max(bottom, cpu.y);
                }
                expect(error).toBeLessThan(1e-6);
                expect(top).toBeGreaterThanOrEqual(-0.01);
                expect(bottom).toBeLessThanOrEqual(height + 0.01);
              }
              for (const pitch of [60, 61, 62]) {
                const key = layout.get(pitch);
                if (!key) throw new Error("Missing reference key");
                const x = base.sourceX(key.x + key.width / 2);
                const at = camera.project(x, (key.black ? 34 : 22) + travel, key.black ? 95 : 20);
                expect(
                  pickKeyboardKey(
                    new Raycaster(),
                    new Vector2(),
                    scene,
                    physical.keys,
                    [],
                    gpu,
                    at.x,
                    at.y,
                    width,
                    height
                  )
                ).toBe(pitch);
              }
            }
            physical.dispose();
          }
    }
  );
});
