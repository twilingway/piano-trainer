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
            const { keyboard, notes, blackLane } = nativeViewCameras(
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
              [22, 150, undefined],
              [34, 149.8008, blackLane]
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

  it("keeps perspective cameras and hand-visible framing unchanged", () => {
    const base = roadLayoutCamera(1280, 2288, 700, CAMERA_PRESETS.player, true, 0.1);
    const player = nativeViewCameras(base, 150, false, true, 700, 0.1, 700, 692);
    expect(player.keyboard).toBe(base);
    const hands = nativeViewCameras(base, 150, true, true, 700, 0.1, 700);
    expect(hands.keyboard.project(0, 22, 142).y).toBeCloseTo(base.project(0, 22, 142).y, 8);
  });
});
