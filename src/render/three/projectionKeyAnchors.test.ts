import { Camera, Group, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import type { Texture } from "../flatThree";
import { layoutKeyboard } from "../keyboardLayout";
import type { KeysScene } from "../NativeKeyboardScene";
import { nativeKeyContactPoint } from "../nativeKeyContactAnchors";
import { buildProjectionLayout, PROJECTION_PRESETS } from "../stylizedProjection";
import { CAMERA_PRESETS, worldCamera, type CameraPrefs } from "../worldCamera";
import { fullMetricKeyBoxes } from "./keyBoxes";
import { ProjectionKeyAnchors } from "./projectionKeyAnchors";
import { projectionMatrix, setCameraProjectionKind, viewMatrix } from "./threeCamera";

function fixture(width = 1920, height = 1080, prefs: CameraPrefs = CAMERA_PRESETS.player) {
  const keyboard = layoutKeyboard(1600, 21, 108);
  const metadata: KeysScene = {
    native: true,
    faces: [...keyboard.values()].map((key) => ({
      key,
      source: { y: key.black ? 0 : 60, height: key.black ? 60 : 40 }
    })),
    texture: { width: 1600, height: 100 } as Texture,
    camera: worldCamera(width, height, prefs, undefined, undefined, undefined, 0.5, 150),
    pan: 0,
    offset: { x: 0, y: 0 },
    version: 1
  };
  const boxes = fullMetricKeyBoxes(metadata);
  const camera = new Camera();
  camera.matrixAutoUpdate = false;
  setCameraProjectionKind(camera, metadata.camera.params);
  camera.matrix.copy(viewMatrix(metadata.camera.params)).invert();
  camera.matrixWorldNeedsUpdate = true;
  const offset = { x: 17, y: -9 };
  camera.projectionMatrix.copy(projectionMatrix(metadata.camera.params, width, height, offset));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const group = new Group();
  group.scale.setScalar(prefs.scale);
  const pan = 23;
  group.position.x = -pan * 0.5 * prefs.scale;
  const hinges = boxes.map((box) => {
    const hinge = new Group();
    group.add(hinge);
    return { pitch: box.pitch, hinge };
  });
  group.updateMatrixWorld(true);
  return { metadata, boxes, camera, offset, group, hinges, pan };
}

describe("real Three camera projection of the 88 physical contacts", () => {
  it.each([
    [1920, 1080],
    [1366, 768],
    [375, 667],
    [390, 844]
  ])("keeps 88 real camera routes non-crossing for all three presets at %dx%d", (width, height) => {
    const data = fixture(width, height);
    const projected = new ProjectionKeyAnchors().update(
      data.boxes,
      data.hinges,
      data.camera,
      width,
      height
    );
    for (const { parameters } of PROJECTION_PRESETS) {
      const result = buildProjectionLayout(width, height, projected, parameters, true);
      expect(result.valid).toBe(true);
      expect(result.lanes).toHaveLength(88);
      expect(result.diagnostics.laneCrossings).toBe(0);
      expect(result.diagnostics.nonMonotonicKeyOrder).toBe(0);
      for (const lane of result.lanes) {
        const physical = projected.find((anchor) => anchor.pitch === lane.pitch);
        expect(lane.key).toEqual(physical);
      }
    }
  });

  it.each([
    [1920, 1080],
    [1366, 768],
    [375, 667],
    [390, 844]
  ])("matches the independent world camera in CSS pixels at %dx%d", (width, height) => {
    for (const prefs of [
      CAMERA_PRESETS.player,
      CAMERA_PRESETS.top,
      { ...CAMERA_PRESETS.player, fov: 60, scale: 1.4 }
    ]) {
      const data = fixture(width, height, prefs);
      const projector = new ProjectionKeyAnchors();
      const projected = projector.update(data.boxes, data.hinges, data.camera, width, height);
      expect(projected).toHaveLength(88);
      expect(new Set(projected.map((anchor) => anchor.pitch)).size).toBe(88);
      for (const [index, box] of data.boxes.entries()) {
        const actual = projected[index];
        if (!actual) throw new Error("missing contact");
        const contact = nativeKeyContactPoint(box, box.back);
        // worldCamera is the existing pure projector, independent of Vector3.project.
        const expected = data.metadata.camera.project(
          contact.x - data.pan * 0.5,
          contact.y,
          -contact.z
        );
        const edge = data.metadata.camera.project(
          contact.x + box.width / 2 - data.pan * 0.5,
          contact.y,
          -contact.z
        );
        expect(actual.pitch).toBe(index + 21);
        expect(actual.x).toBeCloseTo(expected.x + data.offset.x, 6);
        expect(actual.y).toBeCloseTo(expected.y + data.offset.y, 6);
        expect(actual.width).toBeCloseTo(Math.abs(edge.x - expected.x) * 2, 6);
        if (index > 0) expect(actual.x).toBeGreaterThan(projected[index - 1]?.x ?? -Infinity);
      }
      expect(projected.find((anchor) => anchor.pitch === 60)?.pitch).toBe(60);
      expect(projected.at(-1)?.pitch).toBe(108);
    }
  });

  it("follows the actual depressed hinge without shifting other keys or allocating anchors", () => {
    const data = fixture();
    const projector = new ProjectionKeyAnchors();
    const first = projector.update(data.boxes, data.hinges, data.camera, 1920, 1080);
    const c4 = first.find((anchor) => anchor.pitch === 60);
    const cSharp = first.find((anchor) => anchor.pitch === 61);
    const hinge = data.hinges.find((entry) => entry.pitch === 60)?.hinge;
    const box = data.boxes.find((entry) => entry.pitch === 60);
    if (!c4 || !cSharp || !hinge || !box) throw new Error("missing C4 fixture");
    const oldC4Y = c4.y;
    const oldSharpY = cSharp.y;
    hinge.position.y = -8;
    const second = projector.update(data.boxes, data.hinges, data.camera, 1920, 1080);
    expect(second).toBe(first);
    expect(second.find((anchor) => anchor.pitch === 60)).toBe(c4);
    expect(c4.y).not.toBe(oldC4Y);
    expect(cSharp.y).toBe(oldSharpY);
    const contact = nativeKeyContactPoint(box, box.back);
    const expected = data.metadata.camera.project(
      contact.x - data.pan * 0.5,
      contact.y - 8,
      -contact.z
    );
    expect(c4.x).toBeCloseTo(expected.x + data.offset.x, 6);
    expect(c4.y).toBeCloseTo(expected.y + data.offset.y, 6);
  });

  it("does not invent targets for missing owners or pitches outside the instrument", () => {
    const data = fixture();
    const projector = new ProjectionKeyAnchors();
    const missingC4 = data.hinges.filter((entry) => entry.pitch !== 60);
    expect(projector.update(data.boxes, missingC4, data.camera, 1920, 1080)).toHaveLength(87);
    expect(projector.anchors.some((anchor) => anchor.pitch === 60)).toBe(false);
  });

  it("marks contacts behind a real perspective camera as invalid rather than mirroring them", () => {
    const data = fixture();
    const camera = new PerspectiveCamera(45, 16 / 9, 5, 50000);
    data.group.position.z = 1000;
    const projected = new ProjectionKeyAnchors().update(
      data.boxes,
      data.hinges,
      camera,
      1920,
      1080
    );
    expect(projected).toHaveLength(88);
    expect(projected.every((anchor) => Number.isNaN(anchor.x))).toBe(true);
  });
});
