import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  Camera,
  Raycaster,
  Vector2,
  Vector3
} from "three";
import { describe, expect, it } from "vitest";
import { applyNativeRange, nativeRangeBounds } from "./nativeRangeFocus";
import { fullMetricKeyBoxes } from "./keyBoxes";
import { layoutKeyboard } from "../keyboardLayout";
import { metricKeyboardCamera } from "../metricKeyboardCamera";
import { CAMERA_PRESETS } from "../worldCamera";
import type { KeysScene } from "../NativeKeyboardScene";
import type { HingedKey } from "./stageKeyboardLayout";
import { pickKeyboardKey } from "./pickKeyboardKey";

function physical() {
  const keys = layoutKeyboard(800, 60, 72),
    camera = metricKeyboardCamera(800, 800, 600, CAMERA_PRESETS.top, 0.1, keys.values(), true);
  const scene = {
    camera,
    faces: [...keys.values()].map((key) => ({ key, source: { y: 0, height: 100 } })),
    texture: { width: 800, height: 100 },
    native: true
  } as unknown as KeysScene;
  return fullMetricKeyBoxes(scene);
}
describe("native visible range without changing the physical instrument", () => {
  it("retains all88 key objects, depth150 and their travel while limiting the visible map", () => {
    const boxes = physical();
    const hinged: HingedKey[] = boxes.map((box) => ({
      pitch: box.pitch,
      hinge: new Group(),
      mesh: new Mesh()
    }));
    const original = hinged.slice();
    const shown = boxes.filter((box) => box.pitch >= 60 && box.pitch <= 72);
    applyNativeRange(hinged, shown, true);
    expect(hinged).toHaveLength(88);
    expect(hinged).toEqual(original);
    expect(hinged.filter((key) => key.hinge.visible).map((key) => key.pitch)).toEqual(
      shown.map((box) => box.pitch)
    );
    expect(boxes.filter((box) => !box.black).every((box) => box.back - box.front === 150)).toBe(
      true
    );
    const held = hinged.find((key) => key.pitch === 60);
    if (!held) throw new Error("missing C4");
    held.hinge.position.y = -8;
    applyNativeRange(hinged, shown, true);
    expect(held.hinge.position.y).toBe(-8);
    const size = nativeRangeBounds(shown)?.getSize(new Vector3());
    expect(size?.z).toBe(150);
    expect(size?.x).toBeCloseTo(23.5 * 8);
    applyNativeRange(hinged, shown, false);
    expect(hinged.every((key) => key.hinge.visible)).toBe(true);
  });
  it("does not accept hits on keys hidden by the selected range", () => {
    const scene = new Scene(),
      camera = new Camera(),
      geometry = new BoxGeometry(1, 1, 1),
      material = new MeshBasicMaterial();
    const near = new Mesh(geometry, material),
      far = new Mesh(geometry, material);
    near.position.z = 0;
    far.position.z = 0.75;
    const hinges = [new Group(), new Group()];
    hinges[0]?.add(near);
    hinges[1]?.add(far);
    scene.add(...hinges);
    const a = hinges[0],
      b = hinges[1];
    if (!a || !b) throw new Error("missing hinge");
    const keys = [
      { pitch: 60, hinge: a, mesh: near },
      { pitch: 62, hinge: b, mesh: far }
    ];
    a.visible = false;
    expect(
      pickKeyboardKey(new Raycaster(), new Vector2(), scene, keys, [], camera, 50, 50, 100, 100)
    ).toBe(62);
    geometry.dispose();
    material.dispose();
  });
});
