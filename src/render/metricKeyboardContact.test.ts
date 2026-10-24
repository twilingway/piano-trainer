import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { nativeViewCameras } from "./nativeViewCameras";
import { CAMERA_PRESETS } from "./worldCamera";
import { projectNoteLane } from "./noteLaneProjection";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";
import { InstancedMesh, Matrix4, PerspectiveCamera, Vector3, type BufferGeometry } from "three";
import { holdBounds } from "./holdBounds";
import { ThreeRoadNotes } from "./three/ThreeRoadNotes";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { metricC4X, metricKeyX } from "./keyboardMetrics";
import { FREE_BLACK_LANE } from "./roadScenePoints";

const PRESETS = Object.entries(CAMERA_PRESETS);

describe("metric note and key contact", () => {
  it.each(PRESETS)("projects the waiting onset onto its own metric key in %s", (_name, prefs) => {
    const width = 1280,
      height = 720,
      sourceWidth = 2288,
      pan = (sourceWidth - width) / 2;
    const keys = layoutKeyboard(sourceWidth, 21, 108);
    for (const overhead of [false, true])
      for (const perspective of [false, true]) {
        const base = metricKeyboardCamera(width, sourceWidth, height, prefs, 0.1, keys.values());
        const { notes, keyboard, blackLane } = nativeViewCameras(
          base,
          150,
          overhead,
          perspective,
          height,
          0.1,
          height,
          height - 8
        );
        const c4 = metricC4X(keys.values(), keyboard.sourceX);
        const bounds = holdBounds(0, 0.5, 0, 6, 500);
        const frame = new ThreeRoadFrame();
        const batch = new ThreeRoadNotes();
        for (const key of keys.values()) {
          const lane = key.black ? blackLane : undefined;
          frame.begin();
          frame.add(
            key.x + key.width / 2,
            bounds.top,
            bounds.bottom,
            key.width,
            0xffffff,
            1,
            500,
            notes,
            0.5,
            "waiting",
            0,
            lane,
            key.pitch
          );
          batch.update(frame.notes, notes.near.y, 0, frame.noteCount);
          const body = batch.group.children[0];
          if (!(body instanceof InstancedMesh)) throw new Error("Missing note body");
          const size = (body.geometry as BufferGeometry).getAttribute("noteSize");
          const matrix = new Matrix4();
          body.getMatrixAt(0, matrix);
          // The near cap's lower centre touches the unpressed key; use actual GPU instance data.
          const world = new Vector3(0, -size.getY(0) / 2, size.getZ(0) / 2).applyMatrix4(matrix);
          world.x -= pan * (notes.params.sourceUnits ?? 0.5);
          const ndc = world
            .clone()
            .multiplyScalar(prefs.scale)
            .applyMatrix4(viewMatrix(notes.params))
            .applyMatrix4(projectionMatrix(notes.params, width, height));
          const actual = projectNoteLane(
            { x: ((ndc.x + 1) * width) / 2, y: ((1 - ndc.y) * height) / 2, scale: 1 },
            lane
          );
          const expected = keyboard.project(
            c4 + metricKeyX(key.pitch) - pan * (keyboard.params.sourceUnits ?? 0.5),
            key.black ? 34 : 22,
            key.black ? 149.8008 : 150
          );
          expect(Math.abs(actual.x - expected.x)).toBeLessThan(0.01);
          expect(Math.abs(actual.y - expected.y)).toBeLessThan(0.01);

          // Inspection has one physical camera and no screen-space lane correction.
          const free = new PerspectiveCamera(45, width / height, 1, 50000);
          free.position.set(200, 800, 900);
          free.lookAt(0, 22, -150);
          free.updateMatrixWorld();
          const physical = new Vector3(
            c4 + metricKeyX(key.pitch),
            key.black ? 34 : 22,
            -(key.black ? 149.8008 : 150)
          );
          const freeLane = key.black ? FREE_BLACK_LANE : undefined;
          frame.begin();
          frame.add(
            key.x + key.width / 2,
            bounds.top,
            bounds.bottom,
            key.width,
            0xffffff,
            1,
            500,
            notes,
            0.5,
            "waiting",
            0,
            freeLane,
            key.pitch
          );
          batch.update(frame.notes, notes.near.y, 0, frame.noteCount);
          body.getMatrixAt(0, matrix);
          const freeContact = new Vector3(0, -size.getY(0) / 2, size.getZ(0) / 2)
            .applyMatrix4(matrix)
            .project(free);
          const keyContact = physical.project(free);
          expect((Math.abs(freeContact.x - keyContact.x) * width) / 2).toBeLessThan(0.01);
          expect((Math.abs(freeContact.y - keyContact.y) * height) / 2).toBeLessThan(0.01);
        }
        batch.dispose();
      }
  });

  it.each([false, true])(
    "puts black notes on the exported149.8008mm key back, overhead=%s",
    (overhead) => {
      const keys = layoutKeyboard(1320, 48, 84);
      const base = metricKeyboardCamera(800, 1320, 640, CAMERA_PRESETS.player, 0.1, keys.values());
      const { notes, keyboard, blackLane } = nativeViewCameras(
        base,
        150,
        overhead,
        true,
        640,
        0.1,
        720
      );
      const key = keys.get(61);
      if (!key) throw new Error("Missing C#4");
      const source = key.x + key.width / 2;
      const x = notes.sourceX(source);
      const frame = new ThreeRoadFrame();
      frame.add(source, 50, 600, key.width, 0x00ffaa, 1, 600, notes, 1, "black", 0, blackLane, 61);
      const note = frame.notes[0];
      expect(note?.bottom).toBe(149.8008);
      const actual = projectNoteLane(notes.project(x, 34, 149.8008), blackLane);
      const expected = keyboard.project(x, 34, 149.8008);
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
      expect(note?.x).toBeCloseTo(notes.sourceX(source), 9);
      expect(note?.width).toBeCloseTo(key.width * (notes.params.sourceUnits ?? 0.5), 9);
    }
  );
});
