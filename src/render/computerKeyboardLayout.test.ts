import { describe, expect, it } from "vitest";
import { KEYBOARD_ROWS, keyColumn } from "../wordTyping/keyboardRows";
import { computerGeometry, layoutComputerKeys } from "./computerKeyboardLayout";

const ALL = { notes: true, keys: true, hands: false };

describe("computer keyboard layout", () => {
  const geometry = computerGeometry(800, 1350, ALL);
  const { faces, keys } = layoutComputerKeys(1350, geometry);

  it("lays every key in four staggered rows within the width, under the hit line", () => {
    expect(faces).toHaveLength(KEYBOARD_ROWS.flat().length);
    const firstOf = (code: string) => faces.find((face) => face.code === code);
    // Q sits between 1 and 2, A a quarter key further, Z half a key further still.
    const unit = 1350 / 14.5;
    expect((firstOf("KeyQ")?.x ?? 0) - (firstOf("Digit1")?.x ?? 0)).toBeCloseTo(unit / 2);
    expect((firstOf("KeyA")?.x ?? 0) - (firstOf("KeyQ")?.x ?? 0)).toBeCloseTo(unit / 4);
    expect((firstOf("KeyZ")?.x ?? 0) - (firstOf("KeyA")?.x ?? 0)).toBeCloseTo(unit / 2);
    expect((firstOf("KeyZ")?.y ?? 0) > (firstOf("KeyA")?.y ?? 0)).toBe(true);
    for (const face of faces) {
      expect(face.x).toBeGreaterThanOrEqual(0);
      expect(face.x + face.width).toBeLessThanOrEqual(1350);
      expect(face.y).toBeGreaterThan(geometry.hitY);
      expect(face.y + face.height).toBeLessThanOrEqual(800);
    }
  });

  it("gives each key a column as wide as its face", () => {
    const l = keyColumn("KeyL") ?? -1;
    const face = faces.find((item) => item.code === "KeyL");
    expect(keys.get(l)).toEqual({ pitch: l, black: false, x: face?.x, width: face?.width });
  });

  it("leaves the keys at most part of the view while the notes fall, all of it without them", () => {
    expect(computerGeometry(300, 1350, ALL).keyboardHeight).toBeLessThanOrEqual(300 * 0.42);
    const keysOnly = computerGeometry(300, 1350, { ...ALL, notes: false });
    expect(keysOnly.keyboardHeight).toBeGreaterThan(300 * 0.42);
    const notesOnly = computerGeometry(300, 1350, { ...ALL, keys: false });
    expect(notesOnly.hitY).toBe(300);
  });
});
