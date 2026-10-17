// @vitest-environment happy-dom
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeSceneCamera } from "./FreeSceneCamera";

function setup() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  const view = new FreeSceneCamera(canvas);
  const subject = new Group();
  subject.add(new Mesh(new BoxGeometry(600, 800, 400)));
  view.setEnabled(true);
  view.update(800, 600, subject);
  function down(button = 1, shiftKey = false) {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        pointerType: "mouse",
        button,
        buttons: button === 1 ? 4 : 1,
        clientX: 200,
        clientY: 200,
        shiftKey,
        bubbles: true,
        cancelable: true
      })
    );
  }
  function move(x = 350, y = 240) {
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
        buttons: 4,
        bubbles: true
      })
    );
  }
  function up() {
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        pointerType: "mouse",
        button: 1,
        bubbles: true
      })
    );
  }
  const dispose = () => {
    view.dispose();
    canvas.remove();
  };
  return { view, canvas, subject, down, move, up, dispose };
}
afterEach(() => vi.restoreAllMocks());

describe("inspection camera gestures", () => {
  it("orbits on MMB; Shift+MMB pans without rotating; LMB stays piano input", () => {
    const v = setup();
    const initial = v.view.camera.position.clone();
    v.down(0);
    v.move();
    v.up();
    expect(v.view.camera.position.distanceTo(initial)).toBeLessThan(0.00001);
    v.down();
    v.move();
    v.up();
    expect(v.view.camera.position.distanceTo(initial)).toBeGreaterThan(1);
    const direction = v.view.camera.getWorldDirection(new Vector3());
    const orbit = v.view.camera.position.clone();
    v.down(1, true);
    v.move(360, 270);
    v.up();
    expect(v.view.camera.position.distanceTo(orbit)).toBeGreaterThan(1);
    expect(v.view.camera.getWorldDirection(new Vector3()).distanceTo(direction)).toBeLessThan(
      0.00001
    );
    v.dispose();
  });

  it("zooms within finite bounds and resets to frame the subject after resize", () => {
    const v = setup();
    const initial = v.view.camera.position.clone();
    v.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    expect(v.view.camera.position.distanceTo(initial)).toBeGreaterThan(1);
    for (let n = 0; n < 160; n++)
      v.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    expect(v.view.camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(v.view.camera.position.length()).toBeGreaterThan(1);
    v.view.invalidate();
    v.view.update(400, 800, v.subject);
    for (const x of [-300, 300])
      for (const y of [-400, 400])
        for (const z of [-200, 200]) {
          const point = new Vector3(x, y, z).project(v.view.camera);
          expect(Math.abs(point.x)).toBeLessThan(1);
          expect(Math.abs(point.y)).toBeLessThan(1);
          expect(Math.abs(point.z)).toBeLessThan(1);
        }
    v.dispose();
  });

  it.each(["blur", "pointercancel"])(
    "cancels %s and rebinds cleanly; exit and dispose release gestures",
    (kind) => {
      const v = setup();
      v.down();
      if (kind === "blur") window.dispatchEvent(new Event("blur"));
      else v.canvas.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
      const before = v.view.camera.position.clone();
      v.move();
      expect(v.view.camera.position.equals(before)).toBe(true);
      v.down();
      v.move();
      v.up();
      expect(v.view.camera.position.equals(before)).toBe(false);
      v.view.setEnabled(false);
      const disabled = v.view.camera.position.clone();
      v.down();
      v.move();
      v.up();
      v.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
      expect(v.view.camera.position.equals(disabled)).toBe(true);
      v.dispose();
    }
  );
});

describe("scaled skinned inspection bounds", () => {
  it("refreshes the attached bind matrix before framing and ignores hidden studio meshes", () => {
    const v = setup();
    const subject = new Group();
    const skin = new SkinnedMesh(new BoxGeometry(1, 2, 1));
    const count = skin.geometry.getAttribute("position").count;
    skin.geometry.setAttribute(
      "skinIndex",
      new Uint16BufferAttribute(new Uint16Array(count * 4), 4)
    );
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    skin.geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    const bone = new Bone();
    skin.add(bone);
    subject.add(skin);
    skin.bind(new Skeleton([bone]));
    subject.scale.setScalar(936);
    const hidden = new Mesh(new BoxGeometry(100000, 100000, 100000));
    hidden.visible = false;
    subject.add(hidden);
    v.view.reset(subject);
    expect(v.view.camera.position.length()).toBeLessThan(10000);
    expect(v.view.camera.position.length()).toBeGreaterThan(1000);
    for (const x of [-468, 468])
      for (const y of [-936, 936]) {
        const point = new Vector3(x, y, 0).project(v.view.camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
      }
    v.dispose();
  });
});
