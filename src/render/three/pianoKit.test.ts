import { BoxGeometry } from "three";
import { describe, expect, it } from "vitest";
import { splitUp, whitePart } from "./pianoKit";

describe("whitePart", () => {
  it("cuts the white key where a black one stands beside it", () => {
    expect(whitePart(false, true)).toBe("white-cut-right"); // C
    expect(whitePart(true, true)).toBe("white-cut-both"); // D
    expect(whitePart(true, false)).toBe("white-cut-left"); // E
    expect(whitePart(false, false)).toBe("white-full");
  });
});

describe("splitUp", () => {
  it("puts the upward faces first as group 0", () => {
    const geometry = splitUp(new BoxGeometry(1, 1, 1));
    expect(geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 30, materialIndex: 1 }
    ]);
  });

  it("drops the upward faces", () => {
    const geometry = splitUp(new BoxGeometry(1, 1, 1), true);
    expect(geometry.getIndex()?.count).toBe(30);
  });
});
