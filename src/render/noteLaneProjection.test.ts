import { Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { createNoteLaneProjection, projectNoteLane } from "./noteLaneProjection";
import { BLACK_NOTE_FLOOR, noteSlabHeight, WHITE_NOTE_FLOOR } from "./noteDimensions";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { readableRoadTop } from "./readableRoadNote";
import { roadLayoutCamera } from "./roadLayoutCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { CAMERA_PRESETS } from "./worldCamera";

describe("raised black note lanes", () => {
  it("joins both key heights in every independent projection without changing the piano", () => {
    for (const preset of Object.values(CAMERA_PRESETS))
      for (const width of [320, 1440]) {
        const keyboard = roadLayoutCamera(width, 2288, 700, preset, true, 0.1);
        const before = JSON.stringify(keyboard.params);
        for (const mode of ["direct", "perspective"] as const) {
          const notes = noteProjectionCamera(keyboard, mode, 700);
          for (const y of [WHITE_NOTE_FLOOR, BLACK_NOTE_FLOOR]) {
            const lane = createNoteLaneProjection(notes, keyboard, y, width, 900);
            for (const pan of [0, 424, 1300])
              for (const source of [0, 440, 1200, 2288]) {
                const x = notes.sourceX(source - pan);
                const expected = keyboard.project(x, y, 142);
                const actual = projectNoteLane(notes.project(x, y, 142), lane);
                expect(actual.x).toBeCloseTo(expected.x, 7);
                expect(actual.y).toBeCloseTo(expected.y, 7);
                expect(actual.scale).toBeCloseTo(expected.scale, 7);
              }
          }
          expect(JSON.stringify(keyboard.params)).toBe(before);
        }
      }
  });

  it("matches the shared clip-space shader correction on the CPU at contact and mid-flight", () => {
    const width = 1440,
      height = 900;
    const keyboard = roadLayoutCamera(width, 2288, 700, CAMERA_PRESETS.top, true, 0.1);
    for (const mode of ["direct", "perspective"] as const) {
      const notes = noteProjectionCamera(keyboard, mode, 700);
      const lane = createNoteLaneProjection(notes, keyboard, BLACK_NOTE_FLOOR, width, height);
      for (const z of [142, notes.roadFarZ / 2, notes.roadFarZ])
        for (const x of [-200, 120]) {
          const y = BLACK_NOTE_FLOOR + 2;
          const scale = notes.params.prefs.scale;
          const clip = new Vector4(x * scale, y * scale, -z * scale, 1)
            .applyMatrix4(viewMatrix(notes.params))
            .applyMatrix4(projectionMatrix(notes.params, width, height));
          clip.x = lane.scaleX * clip.x + lane.offsetX * clip.w;
          clip.y += lane.offsetY * clip.w;
          const expected = projectNoteLane(notes.project(x, y, z), lane);
          expect(((clip.x / clip.w + 1) * width) / 2).toBeCloseTo(expected.x, 7);
          expect(((1 - clip.y / clip.w) * height) / 2).toBeCloseTo(expected.y, 7);
        }
    }
  });

  it("fits readable black-note labels against the same raised and corrected top face", () => {
    const keyboard = roadLayoutCamera(1440, 2288, 700, CAMERA_PRESETS.top, true, 0.1);
    for (const mode of ["direct", "perspective"] as const) {
      const notes = noteProjectionCamera(keyboard, mode, 700);
      const lane = createNoteLaneProjection(notes, keyboard, BLACK_NOTE_FLOOR, 1440, 900);
      const hitY = notes.project(0, 22, 142).y;
      const width = 28,
        bottom = hitY * 0.8;
      const top = readableRoadTop(720, bottom - 0.1, bottom, width, hitY, notes, 0.05, lane);
      if (notes.params.orthographicScale === undefined) {
        expect(top).toBe(bottom - 0.1);
        continue;
      }
      const surface = (sourceY: number) =>
        projectNoteLane(
          notes.project(
            0,
            lane.y + noteSlabHeight(width / 2, lane.y),
            notes.near.z + (1 - sourceY / hitY) * (notes.roadFarZ - notes.near.z)
          ),
          lane
        );
      const lower = surface(bottom),
        upper = surface(top);
      const minimum = Math.max(18, Math.min(30, width * lower.scale * 0.8));
      expect(lower.y - upper.y).toBeCloseTo(minimum, 6);
    }
  });

  it("keeps white slabs strictly below the actual black key plane at every width", () => {
    for (const width of [8, 20, 50, 200, 1000]) {
      expect(WHITE_NOTE_FLOOR + noteSlabHeight(width, WHITE_NOTE_FLOOR)).toBeLessThan(
        BLACK_NOTE_FLOOR
      );
      expect(noteSlabHeight(width, BLACK_NOTE_FLOOR)).toBeCloseTo(width * 0.18);
    }
    const point = { x: 10, y: 20, scale: 1 };
    expect(projectNoteLane(point)).toBe(point);
  });
});
