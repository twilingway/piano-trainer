// @vitest-environment happy-dom
import {
  Box3,
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

function setup(autoFrame = false) {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  const view = new FreeSceneCamera(canvas, autoFrame);
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
  it("flies along the full view direction with frame delta, preserving orientation and stopping on release", () => {
    const v = setup();
    v.view.setMovement(true);
    const direction = v.view.camera.getWorldDirection(new Vector3());
    const before = v.view.camera.position.clone();
    const rotation = v.view.camera.quaternion.clone();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    v.view.update(800, 600, v.subject, 0.02);
    const step = v.view.camera.position.clone().sub(before);
    expect(step.length()).toBeGreaterThan(1);
    expect(step.clone().normalize().distanceTo(direction)).toBeLessThan(0.00001);
    expect(v.view.camera.quaternion.angleTo(rotation)).toBeLessThan(0.00001);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    const stopped = v.view.camera.position.clone();
    v.view.update(800, 600, v.subject, 0.02);
    expect(v.view.camera.position.distanceTo(stopped)).toBeLessThan(0.00001);
    v.dispose();
  });

  it("normalizes diagonals, caps background delta and clears movement on reset or mode exit", () => {
    const v = setup();
    v.view.setMovement(true);
    const before = v.view.camera.position.clone();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    v.view.update(800, 600, v.subject, 0.05);
    const single = v.view.camera.position.distanceTo(before);
    const diagonal = v.view.camera.position.clone();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    v.view.update(800, 600, v.subject, 10);
    expect(v.view.camera.position.distanceTo(diagonal)).toBeCloseTo(single, 5);
    v.view.invalidate();
    v.view.update(800, 600, v.subject, 0.05);
    const reset = v.view.camera.position.clone();
    v.view.update(800, 600, v.subject, 0.05);
    expect(v.view.camera.position.distanceTo(reset)).toBeLessThan(0.00001);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    v.view.setEnabled(false);
    v.view.setEnabled(true);
    v.view.update(800, 600, v.subject, 0.05);
    expect(v.view.camera.position.distanceTo(reset)).toBeLessThan(0.00001);
    v.dispose();
  });
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

  it("preserves orbit, pan and zoom through layout and bounds updates until an explicit reset", () => {
    const v = setup();
    const initial = v.view.camera.position.clone();
    v.down();
    v.move();
    v.up();
    v.down(1, true);
    v.move(360, 270);
    v.up();
    v.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    const position = v.view.camera.position.clone();
    const rotation = v.view.camera.quaternion.clone();
    expect(position.distanceTo(initial)).toBeGreaterThan(1);
    const geometry = (v.subject.children[0] as Mesh).geometry;
    const bounds = vi.spyOn(geometry, "computeBoundingBox");
    v.subject.add(new Mesh(new BoxGeometry(700, 900, 500)));
    v.view.invalidate(false);
    v.view.setEnabled(false);
    v.view.setEnabled(true);
    v.view.update(1200, 500, v.subject);
    expect(bounds).toHaveBeenCalledOnce();
    expect(v.view.camera.position.distanceTo(position)).toBeLessThan(0.00001);
    expect(v.view.camera.quaternion.angleTo(rotation)).toBeLessThan(0.00001);
    v.view.invalidate();
    v.view.update(1200, 500, v.subject);
    expect(v.view.camera.position.distanceTo(position)).toBeGreaterThan(1);
    v.dispose();
  });

  it.each([-100, 100])("preserves extreme zoom %s when bounds shrink or grow", (deltaY) => {
    const v = setup();
    for (let n = 0; n < 220; n++)
      v.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY, cancelable: true }));
    const position = v.view.camera.position.clone();
    for (const scale of [0.01, 100]) {
      v.subject.scale.setScalar(scale);
      v.view.invalidate(false);
      v.view.update(1600, 400, v.subject);
      expect(v.view.camera.position.distanceTo(position)).toBeLessThan(0.00001);
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

it("keeps submillimetre depth detail and fits far to orbit distance without rescanning meshes", () => {
  const v = setup();
  const camera = v.view.camera;
  expect(camera.near).toBeCloseTo(Math.sqrt(600 ** 2 + 800 ** 2 + 400 ** 2) / 400);
  expect(camera.far).toBeLessThan(100000);
  expect(Math.abs(new Vector3(0, 0, -25000).project(camera).z)).toBeLessThan(1);
  const direction = camera.getWorldDirection(new Vector3());
  const at = camera.position.clone().addScaledVector(direction, 1000).project(camera).z;
  const beyond = camera.position.clone().addScaledVector(direction, 1000.06).project(camera).z;
  // More than two 24-bit depth steps separate the AO fringe from its receiver.
  expect(((beyond - at) * (2 ** 24 - 1)) / 2).toBeGreaterThan(2);
  const geometry = (v.subject.children[0] as Mesh).geometry;
  const bounds = vi.spyOn(geometry, "computeBoundingBox");
  const originalFar = camera.far;
  for (let i = 0; i < 100; i++)
    v.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));
  v.view.update(800, 600, v.subject);
  expect(camera.far).toBeGreaterThan(originalFar);
  for (const point of [new Vector3(300, 400, 200), new Vector3(-300, -400, -200)]) {
    expect(Math.abs(point.project(camera).z)).toBeLessThan(1);
  }
  expect(bounds).not.toHaveBeenCalled();
  v.dispose();
});

it("includes the structural score only on reset and never moves an existing pose when a tile becomes ready", () => {
  const v = setup();
  const position = v.view.camera.position.clone();
  v.view.setScoreBounds(new Box3(new Vector3(-750, 2200, -260), new Vector3(750, 2600, -260)));
  v.view.update(800, 600, v.subject);
  expect(v.view.camera.position.distanceTo(position)).toBeLessThan(1e-6);
  v.view.reset(v.subject);
  for (const x of [-750, 750])
    for (const y of [2200, 2600]) {
      const point = new Vector3(x, y, -260).project(v.view.camera);
      expect(Math.abs(point.x)).toBeLessThan(1);
      expect(Math.abs(point.y)).toBeLessThan(1);
    }
  v.dispose();
});

it("changes world FOV without resetting the saved pose or keyboard projection", () => {
  const f = setup();
  const pose = f.view.camera.position.clone();
  const rotation = f.view.camera.quaternion.clone();
  f.view.setFov(80);
  f.view.update(800, 600, f.subject);
  expect(f.view.camera.fov).toBe(80);
  expect(f.view.camera.position.equals(pose)).toBe(true);
  expect(f.view.camera.quaternion.angleTo(rotation)).toBeLessThan(0.000001);
  f.view.setFov(500);
  expect(f.view.camera.fov).toBe(100);
  f.view.setFov(Number.NaN);
  expect(f.view.camera.fov).toBe(45);
  f.dispose();
});

it("refits the fixed game view after structural field, score and aspect changes", () => {
  const f = setup(true);
  const original = f.view.camera.position.clone();
  const field = new Box3(new Vector3(-50000, -30000, -90000), new Vector3(50000, 8000, -1000));
  f.view.setRoadBounds(field);
  f.view.update(800, 600, f.subject);
  expect(f.view.camera.position.distanceTo(original)).toBeGreaterThan(10000);
  const framed = f.view.camera.position.clone();
  f.view.setRoadBounds(field.clone());
  f.view.update(800, 600, f.subject);
  expect(f.view.camera.position.distanceTo(framed)).toBeLessThan(0.000001);
  const score = new Box3(new Vector3(-60000, 50000, -30000), new Vector3(60000, 70000, -20000));
  f.view.setScoreBounds(score);
  f.view.update(800, 600, f.subject);
  const withScore = f.view.camera.position.clone();
  expect(withScore.distanceTo(framed)).toBeGreaterThan(1000);
  f.view.update(320, 600, f.subject);
  expect(f.view.camera.position.distanceTo(withScore)).toBeGreaterThan(1000);
  for (const bounds of [field, score])
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const clip = new Vector3(x, y, z).project(f.view.camera);
          expect(Math.abs(clip.x)).toBeLessThanOrEqual(1.000001);
          expect(Math.abs(clip.y)).toBeLessThanOrEqual(1.000001);
        }
  f.dispose();
});

it("preserves the free manual pose when structural field, score and aspect change", () => {
  const f = setup();
  const before = f.view.camera.position.clone();
  f.view.setRoadBounds(
    new Box3(new Vector3(-50000, -30000, -90000), new Vector3(50000, 8000, -1000))
  );
  f.view.setScoreBounds(
    new Box3(new Vector3(-60000, 50000, -30000), new Vector3(60000, 70000, -20000))
  );
  f.view.update(320, 600, f.subject);
  expect(f.view.camera.position.distanceTo(before)).toBeLessThan(0.000001);
  f.dispose();
});
