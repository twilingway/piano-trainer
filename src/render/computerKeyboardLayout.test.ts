import { describe, expect, it } from "vitest";
import { KEYBOARD_ROWS, keyColumn } from "../wordTyping/keyboardRows";
import { computerGeometry, computerWidth, layoutComputerKeys } from "./computerKeyboardLayout";
import { USUAL_PLACEMENT } from "./viewGeometry";

const ALL = { notes: true, keys: true, hands: false };

describe("computer keyboard layout", () => {
  const total = 840;
  const geometry = computerGeometry(800, total, ALL);
  const { faces, keys } = layoutComputerKeys(total, geometry);
  const face = (code: string) => faces.find((item) => item.code === code);
  const unit = total / 15;

  it("lays a full keyboard: every typing key among the service keys, rows filling the width", () => {
    for (const code of KEYBOARD_ROWS.flat()) expect(face(code)?.pitch).toBe(keyColumn(code));
    for (const code of ["Tab", "CapsLock", "ShiftLeft", "Enter", "Backspace", "Space"]) {
      expect(face(code)?.pitch).toBeUndefined();
    }
    expect(face("Tab")?.caption).toBe("Tab");
    for (const last of ["Backspace", "Backslash", "Enter", "ShiftRight", "ControlRight"]) {
      const item = face(last);
      expect((item?.x ?? 0) + (item?.width ?? 0)).toBeCloseTo(total - unit * 0.05);
    }
  });

  it("staggers the rows as a real keyboard: Q after Tab, A after Caps, Z after Shift", () => {
    expect((face("KeyQ")?.x ?? 0) - (face("Digit1")?.x ?? 0)).toBeCloseTo(unit / 2);
    expect((face("KeyA")?.x ?? 0) - (face("KeyQ")?.x ?? 0)).toBeCloseTo(unit / 4);
    expect((face("KeyZ")?.x ?? 0) - (face("KeyA")?.x ?? 0)).toBeCloseTo(unit / 2);
    expect(face("KeyZ")?.y ?? 0).toBeGreaterThan(face("KeyA")?.y ?? 0);
    for (const item of faces) {
      expect(item.y).toBeGreaterThan(geometry.hitY);
      expect(item.y + item.height).toBeLessThanOrEqual(800);
    }
  });

  it("gives each typing key a column as wide as its face", () => {
    const l = keyColumn("KeyL") ?? -1;
    expect(keys.get(l)).toEqual({
      pitch: l,
      black: false,
      x: face("KeyL")?.x,
      width: face("KeyL")?.width
    });
    expect(keys.size).toBe(KEYBOARD_ROWS.flat().length);
  });

  it("is no wider than a real keyboard, and leaves the notes most of the view", () => {
    expect(computerWidth(600)).toBe(600);
    expect(computerWidth(1920)).toBeLessThan(900);
    expect(computerGeometry(300, total, ALL).keyboardHeight).toBeLessThanOrEqual(300 * 0.4);
    const lifted = computerGeometry(800, total, ALL, { ...USUAL_PLACEMENT, lift: 0.25, scale: 1 });
    expect(lifted.keyboardHeight).toBeCloseTo(geometry.keyboardHeight);
    expect(lifted.keyboardTop).toBeCloseTo(geometry.keyboardTop - 200);
    expect(computerWidth(2000, 1.5)).toBe(15 * 56 * 1.5);
    expect(
      computerGeometry(300, total, ALL, { ...USUAL_PLACEMENT, lift: 0.4, scale: 1 }).hitY
    ).toBeGreaterThanOrEqual(75 - 1e-6);
    expect(computerGeometry(300, total, { ...ALL, notes: false }).keyboardHeight).toBeGreaterThan(
      120
    );
    expect(computerGeometry(300, total, { ...ALL, keys: false }).hitY).toBe(300);
  });
});

describe("narrow computer keyboard", () => {
  const total = 390;
  const narrow = layoutComputerKeys(total, computerGeometry(800, total, ALL));
  const face = (code: string) => narrow.faces.find((item) => item.code === code);

  it("keeps every typing key and drops the service keys", () => {
    for (const code of KEYBOARD_ROWS.flat()) expect(face(code)?.pitch).toBe(keyColumn(code));
    expect(narrow.faces).toHaveLength(KEYBOARD_ROWS.flat().length);
    expect(narrow.keys.size).toBe(KEYBOARD_ROWS.flat().length);
    for (const item of narrow.faces) expect(item.x + item.width).toBeLessThanOrEqual(total);
    expect(face("KeyQ")?.x ?? 0).toBeGreaterThan(face("Backquote")?.x ?? 0);
    expect(face("KeyZ")?.y ?? 0).toBeGreaterThan(face("KeyA")?.y ?? 0);
  });

  it("has wider and taller keys than a full keyboard as wide", () => {
    // What a full keyboard 390 px wide would give a key: a fifteenth of the width, 0.8 of it tall.
    const fullUnit = total / 15;
    const key = face("KeyL");
    expect(key?.width ?? 0).toBeGreaterThan(fullUnit * 0.95);
    expect(key?.height ?? 0).toBeGreaterThan(fullUnit * 0.8);
    expect(face("Equal")?.pitch).toBe(keyColumn("Equal"));
  });

  it("stays full above the threshold", () => {
    const wide = layoutComputerKeys(641, computerGeometry(800, 641, ALL));
    expect(wide.faces.some((item) => item.code === "Space")).toBe(true);
  });
});
