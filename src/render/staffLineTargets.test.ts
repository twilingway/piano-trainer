import { expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { STAFF_LINE_PITCHES, staffLineTargets, extendedStaffTargets } from "./staffLineTargets";

it("lands each bass and treble line on its own natural piano key", () => {
  const keys = layoutKeyboard(52 * 44);
  const targets = staffLineTargets(keys);
  STAFF_LINE_PITCHES.forEach((pitch, index) => {
    const key = keys.get(pitch);
    expect(targets[index]).toBe((key?.x ?? 0) + (key?.width ?? 0) / 2);
  });
});

it("continues absent bass keys outside a narrow range without mapping them to a visible key", () => {
  const targets = staffLineTargets(layoutKeyboard(8 * 44, 60, 72));
  expect(targets[0]).toBeLessThan(0);
  expect(targets[5]).toBe(110);
});

it("extends the staff on both sides with uniform spacing and no wrong key endpoints", () => {
  const keys = layoutKeyboard(52 * (44 / 0.6));
  const edges = extendedStaffTargets(keys);
  const targets = staffLineTargets(keys);
  expect(edges[0]).toBeLessThan(Math.min(...targets));
  expect(edges.at(-1)).toBeGreaterThan(Math.max(...targets));
  targets.forEach((target) => {
    expect(edges.some((edge) => Math.abs(edge - target) < 1e-7)).toBe(true);
  });
  const centers = [...keys.values()]
    .filter((key) => !key.black)
    .map((key) => key.x + key.width / 2);
  edges.forEach((edge, index) => {
    expect(centers.some((center) => Math.abs(edge - center) < 1e-7)).toBe(true);
    const previous = edges[index - 1];
    if (previous !== undefined) expect(edge - previous).toBeCloseTo((2 * 44) / 0.6);
  });
});

it("keeps endpoint lines despite fractional key widths", () => {
  for (const [low, high, count] of [
    [24, 64, 24],
    [81, 108, 17]
  ]) {
    if (low === undefined || high === undefined || count === undefined) continue;
    const keys = layoutKeyboard(count * (44 / 0.6), low, high);
    const edges = extendedStaffTargets(keys);
    const pitch = low === 24 ? 64 : 81;
    const key = keys.get(pitch);
    expect(key).toBeDefined();
    if (!key) continue;
    expect(edges.some((edge) => Math.abs(edge - key.x - key.width / 2) < 1e-7)).toBe(true);
  }
});
