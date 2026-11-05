import { expect, it } from "vitest";
import { songCourseStartPlacement } from "./songCourseStartGeometry";
const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom
});
it("places start and its learner cue in the empty band below all notation", () => {
  const value = songCourseStartPlacement(
    rect(0, 0, 390, 844),
    rect(30, 280, 360, 420),
    rect(0, 650, 390, 844)
  );
  expect(value?.overKeyboard).toBe(false);
  expect(value?.size).toBe(112);
  expect(requireValue(value).top).toBeGreaterThan(420);
  expect(requireValue(value).top + requireValue(value).size + 32).toBeLessThan(650);
  expect(requireValue(value).left + requireValue(value).size / 2).toBe(195);
});
it("uses keyboard rather than the first notes in short landscape", () => {
  const value = songCourseStartPlacement(
    rect(0, 0, 667, 375),
    rect(80, 70, 580, 244),
    rect(0, 250, 667, 375),
    88
  );
  expect(value?.overKeyboard).toBe(true);
  expect(requireValue(value).top).toBeGreaterThan(250);
  expect(requireValue(value).top + requireValue(value).size + 32).toBeLessThanOrEqual(375);
  expect(requireValue(value).left + requireValue(value).size / 2).toBe(333.5);
});
it("clamps to the zoomed visual viewport and its offset", () => {
  const value = songCourseStartPlacement(
    rect(120, 80, 520, 700),
    rect(140, 110, 490, 360),
    rect(0, 540, 900, 850)
  );
  expect(requireValue(value).left).toBeGreaterThanOrEqual(120);
  expect(requireValue(value).left + requireValue(value).size).toBeLessThanOrEqual(520);
  expect(requireValue(value).top).toBeGreaterThan(360);
  expect(requireValue(value).top + requireValue(value).size + 32).toBeLessThan(540);
});
it("does not invent a placement over notation if even the keyboard is unavailable", () => {
  expect(
    songCourseStartPlacement(rect(0, 0, 320, 240), rect(0, 40, 320, 230), rect(0, 230, 320, 240))
  ).toBeNull();
});

function requireValue<T>(value: T | null): T {
  if (value === null) throw new Error("missing fixture value");
  return value;
}
