import { expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { STAFF_LINE_PITCHES, staffLineTargets } from "./staffLineTargets";

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
