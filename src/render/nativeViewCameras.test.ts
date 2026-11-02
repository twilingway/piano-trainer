import { roadWidthX } from "./roadWidthWarp";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { nativeViewCameras } from "./nativeViewCameras";
import { roadLayoutCamera } from "./roadLayoutCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { CAMERA_PRESETS } from "./worldCamera";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { layoutKeyboard } from "./keyboardLayout";
import { projectNoteLane } from "./noteLaneProjection";

describe("overhead keyboard bottom docking", () => {
  it("lands both note lanes on the placed metric key backs rather than leaving a 130px band", () => {
    for (const [width, height] of [
      [1365, 768],
      [390, 844]
    ] as const)
      for (const prefs of Object.values(CAMERA_PRESETS))
        for (const perspective of [false, true])
          for (const top of [false, true]) {
            const keys = layoutKeyboard(2288, 21, 108);
            const base = metricKeyboardCamera(width, 2288, height, prefs, 0.1, keys.values());
            const offset = { x: 31, y: 130 };
            const { keyboard, notes, blackLane, whiteLane } = nativeViewCameras(
              base,
              150,
              top,
              perspective,
              height,
              0.1,
              height,
              height - 8,
              offset
            );
            const view = viewMatrix(keyboard.params);
            const projection = projectionMatrix(keyboard.params, width, height, offset);
            for (const [y, z, lane] of [
              [22, 149.1938, whiteLane],
              [34, 145.8, blackLane]
            ] as const) {
              const scale = prefs.scale;
              const key = new Vector3(-75 * scale, y * scale, -z * scale)
                .applyMatrix4(view)
                .applyMatrix4(projection);
              const note = projectNoteLane(notes.project(-75, y, z), lane);
              expect(note.x).toBeCloseTo(((key.x + 1) * width) / 2, 7);
              expect(note.y).toBeCloseTo(((1 - key.y) * height) / 2, 7);
            }
            expect(notes.road.at(width / 2, 1).y).toBeCloseTo(
              keyboard.project(0, 22, 150).y + offset.y,
              7
            );
          }
  });

  it("docks both overhead modes without hands, preserving height, offsets and note contact", () => {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [1920, 900]
    ] as const)
      for (const top of [false, true])
        for (const shift of [-50, 0, 45]) {
          const base = roadLayoutCamera(
            width,
            2288,
            height,
            { ...CAMERA_PRESETS.top, targetY: shift },
            true,
            0.1
          );
          const bottom = height - 8 - height * 0.1;
          for (const perspective of [false, true]) {
            const before = nativeViewCameras(base, 150, top, perspective, height, 0.1, height);
            const { keyboard, notes } = nativeViewCameras(
              base,
              150,
              top,
              perspective,
              height,
              0.1,
              height,
              bottom
            );
            expect(keyboard.project(0, 22, 0).y).toBeCloseTo(bottom + shift, 8);
            expect(keyboard.project(0, 22, 0).y - keyboard.project(0, 22, 142).y).toBeCloseTo(
              before.keyboard.project(0, 22, 0).y - before.keyboard.project(0, 22, 142).y,
              8
            );
            for (const x of [-200, 0, 400]) {
              const rear = keyboard.project(x, 22, 142);
              const contact = notes.project(x, 22, 142);
              expect(contact.x).toBeCloseTo(rear.x, 8);
              expect(contact.y).toBeCloseTo(rear.y, 8);
              const scale = keyboard.params.prefs.scale;
              const ndc = new Vector3(x * scale, 22 * scale, 0)
                .applyMatrix4(viewMatrix(keyboard.params))
                .applyMatrix4(projectionMatrix(keyboard.params, width, height, { x: 30, y: -25 }));
              expect(((1 - ndc.y) * height) / 2).toBeCloseTo(bottom + shift - 25, 7);
            }
          }
        }
  });

  it("fits perspective depth while preserving the camera pose and overhead contact", () => {
    const base = roadLayoutCamera(1280, 2288, 700, CAMERA_PRESETS.player, true, 0.1);
    const player = nativeViewCameras(base, 150, false, true, 700, 0.1, 700, 692);
    expect(player.keyboard.params.prefs).toBe(base.params.prefs);
    expect(player.keyboard.project(0, 22, 0).y - player.keyboard.project(0, 22, 142).y).toBeCloseTo(
      150,
      7
    );
    const hands = nativeViewCameras(base, 150, true, true, 700, 0.1, 700);
    expect(hands.keyboard.project(0, 22, 142).y).toBeCloseTo(base.project(0, 22, 142).y, 8);
  });
});

it.each([0.1, 0.5, 0.9])(
  "uses horizon width %s on metric 3D without changing the keyboard",
  (far) => {
    const keys = layoutKeyboard(2288, 21, 108);
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [1366, 768]
    ] as const) {
      for (const preset of Object.values(CAMERA_PRESETS)) {
        const base = metricKeyboardCamera(width, 2288, height, preset, 0.1, keys.values());
        const { notes, keyboard } = nativeViewCameras(
          base,
          150,
          false,
          true,
          height,
          0.1,
          height,
          undefined,
          { x: 0, y: 0 },
          far
        );
        expect(keyboard.params.prefs).toBe(base.params.prefs);
        const nearLeft = notes.project(-100, notes.near.y, notes.near.z);
        const farLeft = notes.project(-100, notes.near.y, notes.roadFarZ);
        const farRight = notes.project(100, notes.near.y, notes.roadFarZ);
        expect(nearLeft.y).toBeCloseTo(base.project(-100, base.near.y, base.near.z).y, 7);
        const canonicalWidth =
          base.project(100, notes.near.y, notes.near.z).x -
          base.project(-100, notes.near.y, notes.near.z).x;
        expect((farRight.x - farLeft.x) / canonicalWidth).toBeCloseTo(far, 6);
        const world = new Vector3(
          notes.roadWidth ? roadWidthX(notes.roadWidth, -100, notes.roadFarZ) : -100,
          notes.near.y,
          -notes.roadFarZ
        )
          .multiplyScalar(notes.params.prefs.scale)
          .applyMatrix4(viewMatrix(notes.params))
          .applyMatrix4(projectionMatrix(notes.params, width, height));
        expect(((world.x + 1) * width) / 2).toBeCloseTo(farLeft.x, 6);
        expect(((1 - world.y) * height) / 2).toBeCloseTo(farLeft.y, 6);
        expect(world.z).toBeLessThan(1);
      }
    }
  }
);

it("keeps the full white front in the viewport for player framing at every height", () => {
  const keys = layoutKeyboard(2288, 48, 84);
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [667, 375]
  ] as const) {
    const base = metricKeyboardCamera(
      width,
      2288,
      height,
      CAMERA_PRESETS.player,
      0.1,
      keys.values()
    );
    for (const desired of [60, 120, 240]) {
      const bottom = height - 16;
      const { keyboard, notes } = nativeViewCameras(
        base,
        desired,
        false,
        true,
        height,
        0.1,
        height,
        bottom
      );
      expect(keyboard.project(0, -8, 0).y).toBeCloseTo(bottom, 7);
      expect(keyboard.project(0, 0, 0).y).toBeLessThan(bottom);
      expect(keyboard.project(0, 22, 0).y).toBeLessThan(bottom);
      expect(keyboard.project(0, 22, 0).y - keyboard.project(0, 22, 150).y).toBeCloseTo(desired, 7);
      expect(notes.project(0, 22, 150).y).toBeCloseTo(keyboard.project(0, 22, 150).y, 7);
    }
  }
});
