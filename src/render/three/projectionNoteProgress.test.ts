import { describe, expect, it } from "vitest";
import type { NoteLaneProjection } from "../noteLaneProjection";
import { PANEL_EDGE, worldCamera } from "../worldCamera";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import { projectionNoteProgress } from "./projectionNoteProgress";

const world = worldCamera(1440, 900, undefined, PANEL_EDGE);
const blackLane: NoteLaneProjection = {
  y: 34,
  depth: 145.8,
  scaleX: 1,
  offsetX: 0,
  offsetY: 0,
  width: 1,
  height: 1
};

function snapshot(time: number, start = 8, duration = 2, lane?: NoteLaneProjection) {
  const approach = 6;
  const hitY = 600;
  const head = hitY * (1 - (start - time) / approach);
  const tail = hitY * (1 - (start + duration - time) / approach);
  const frame = new ThreeRoadFrame();
  frame.songTime = time;
  frame.add(720, tail, head, 32, 0x00ff88, 1, hitY, world, duration, "held", 0, lane, 61);
  return frame;
}

describe("projection progress from real road snapshots", () => {
  it.each([undefined, blackLane])(
    "keeps the six-second head and duration-driven tail for lane %s",
    (lane) => {
      const target = { head: -1, tail: -1 };
      const approaching = snapshot(5, 8, 2, lane).notes[0];
      if (!approaching) throw new Error("missing approaching note");
      expect(projectionNoteProgress(approaching, world, target)).toBe(target);
      expect(target.head).toBeCloseTo(0.5, 12);
      expect(target.tail).toBeCloseTo(1 / 6, 12);
      const impact = snapshot(8, 8, 2, lane).notes[0];
      if (!impact) throw new Error("missing impact note");
      projectionNoteProgress(impact, world, target);
      expect(target.head).toBe(1);
      expect(target.tail).toBeCloseTo(2 / 3, 12);
      const releasing = snapshot(10 - 1e-6, 8, 2, lane).notes[0];
      if (!releasing) throw new Error("missing releasing note");
      projectionNoteProgress(releasing, world, target);
      expect(target.head).toBe(1);
      expect(target.tail).toBeCloseTo(1, 5);
      expect(snapshot(10, 8, 2, lane).noteCount).toBe(0);
    }
  );

  it("clips a long tail at the horizon without shortening its time duration", () => {
    const frame = snapshot(3, 8, 12);
    const note = frame.notes[0];
    if (!note) throw new Error("missing clipped note");
    const target = projectionNoteProgress(note, world, { head: 0, tail: 0 });
    expect(target.head).toBeCloseTo(1 / 6, 12);
    expect(target.tail).toBe(0);
    expect(note.duration).toBe(12);
    const held = snapshot(15, 8, 12).notes[0];
    if (!held) throw new Error("missing held note");
    projectionNoteProgress(held, world, target);
    expect(target.head).toBe(1);
    expect(target.tail).toBeCloseTo(1 / 6, 12);
    expect(snapshot(20, 8, 12).noteCount).toBe(0);
  });

  it("seeks and pauses deterministically regardless of visual frame count", () => {
    const target = { head: 0, tail: 0 };
    const expected = { head: 0.5, tail: 1 / 6 };
    for (const time of [5, 8, 9, 5, 5, 5]) {
      const note = snapshot(time).notes[0];
      if (!note) throw new Error("missing note");
      projectionNoteProgress(note, world, target);
      if (time === 5) {
        expect(target.head).toBeCloseTo(expected.head, 12);
        expect(target.tail).toBeCloseTo(expected.tail, 12);
      }
    }
  });

  it("uses each black contact depth rather than the generic white panel depth", () => {
    const note = snapshot(8, 8, 2, blackLane).notes[0];
    if (!note) throw new Error("missing black note");
    expect(note.bottom).toBe(145.8);
    expect(world.near.z).not.toBe(145.8);
    expect(projectionNoteProgress(note, world, { head: 0, tail: 0 }).head).toBe(1);
  });

  it("bounds malformed depths and unavailable cameras without leaking NaN", () => {
    const note = snapshot(5).notes[0];
    if (!note) throw new Error("missing note");
    const target = { head: 1, tail: 1 };
    projectionNoteProgress(note, { ...world, roadFarZ: world.near.z }, target);
    expect(target).toEqual({ head: 0, tail: 0 });
    projectionNoteProgress({ ...note, bottom: Infinity, top: NaN }, world, target);
    expect(target).toEqual({ head: 0, tail: 0 });
  });
});
