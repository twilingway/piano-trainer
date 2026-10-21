import { describe, expect, it } from "vitest";
import {
  indexKeyboard88Atlas,
  selectKeyboard88Frame,
  selectKeyboard88Rest,
  validateKeyboard88Atlas
} from "./keyboard88Atlas";
import type { Keyboard88Atlas, Keyboard88Frame } from "./keyboard88Atlas";

const a = [60, 62, 64, 65, 67] as const;
const b = [62, 64, 65, 67, 69] as const;
function atlas(frames: readonly Keyboard88Frame[]): Keyboard88Atlas {
  return {
    frames,
    boneNames: ["Pelvis"],
    rotations: new Float32Array(frames.flatMap(() => [0, 0, 0, 1]))
  };
}
function index(frames: readonly Keyboard88Frame[]) {
  return indexKeyboard88Atlas(atlas([{ id: 308, assignment: a, pressedMask: 0 }, ...frames]));
}

describe("keyboard88 pure index and nearest selector", () => {
  it("validates buffer lengths, finite unit quaternions, assignments, masks and IDs", () => {
    const good = atlas([{ id: 308, assignment: a, pressedMask: 0 }]);
    expect(() => {
      validateKeyboard88Atlas(good);
    }).not.toThrow();
    expect(() => {
      validateKeyboard88Atlas({ ...good, rotations: new Float32Array(8) });
    }).toThrow();
    expect(() => {
      validateKeyboard88Atlas({ ...good, rotations: new Float32Array([0, NaN, 0, 1]) });
    }).toThrow();
    expect(() => {
      validateKeyboard88Atlas({ ...good, rotations: new Float32Array([0, 0, 0, 2]) });
    }).toThrow();
    expect(() => {
      validateKeyboard88Atlas({ ...good, frames: [...good.frames, ...good.frames] });
    }).toThrow();
    expect(() => index([{ id: 309, assignment: a, pressedMask: 32 }])).toThrow();
    expect(() => {
      validateKeyboard88Atlas({ ...good, roots: new Float32Array([0, Infinity, 0]) });
    }).toThrow();
  });

  it("prefers the pressed finger set to MIDI distance and ignores audit", () => {
    const data = index([
      { id: 310, assignment: b, pressedMask: 1, audit: "RED" },
      { id: 309, assignment: a, pressedMask: 3, audit: "GREEN" }
    ]);
    const selected = selectKeyboard88Frame(data, [{ id: "c", midi: 60, finger: 1 }], "right");
    expect(selected.frameId).toBe(310);
    expect(selected.distance).toBe(2);
    expect(selected.exact).toBe(false);
  });

  it("ranks MIDI L1, then chronological previous assignment, then lower source ID", () => {
    const data = index([
      { id: 311, assignment: a, pressedMask: 1 },
      { id: 310, assignment: b, pressedMask: 1 },
      { id: 309, assignment: a, pressedMask: 1 }
    ]);
    expect(selectKeyboard88Frame(data, [{ id: 1, midi: 60, finger: 1 }], "right", b).frameId).toBe(
      309
    );
    expect(selectKeyboard88Frame(data, [{ id: 1, midi: 61, finger: 1 }], "right", a).frameId).toBe(
      309
    );
    expect(selectKeyboard88Frame(data, [{ id: 1, midi: 61, finger: 1 }], "right", b).frameId).toBe(
      310
    );
    expect(selectKeyboard88Frame(data, [{ id: 1, midi: 61, finger: 1 }], "right").frameId).toBe(
      309
    );
  });

  it("resolves missing fingers by key with lower finger tie and leaves notes immutable", () => {
    const data = index([{ id: 309, assignment: a, pressedMask: 2 }]);
    const notes = Object.freeze([Object.freeze({ id: "missing", midi: 63 })]);
    const selected = selectKeyboard88Frame(data, notes, "right");
    expect(selected.notes).toEqual([{ id: "missing", finger: 2 }]);
    expect(selected.requestedMask).toBe(2);
    expect(notes[0]).not.toHaveProperty("finger");
  });

  it("counts both conflicting notes and always chooses nearest for crossing/black/outside", () => {
    const data = index([{ id: 309, assignment: a, pressedMask: 1 }]);
    const selected = selectKeyboard88Frame(
      data,
      [
        { id: "a", midi: 21, finger: 1 },
        { id: "b", midi: 108, finger: 1 }
      ],
      "right"
    );
    expect(selected.frameId).toBe(309);
    expect(selected.distance).toBe(87);
    expect(selected.exact).toBe(false);
    expect(
      selectKeyboard88Frame(
        data,
        [
          { id: 1, midi: 61, finger: 5 },
          { id: 2, midi: 80, finger: 1 }
        ],
        "right"
      ).frameId
    ).toBeDefined();
  });

  it("ranks left requests in reflected MIDI space including targets outside the 88 keys", () => {
    const data = index([{ id: 309, assignment: a, pressedMask: 4 }]);
    const selected = selectKeyboard88Frame(data, [{ id: 1, midi: 36, finger: 3 }], "left");
    expect(selected.frameId).toBe(309);
    expect(selected.assignment).toEqual([40, 38, 36, 35, 33]);
    expect(selected.exact).toBe(true);
    expect(selectKeyboard88Frame(data, [{ id: 1, midi: -1, finger: 3 }], "left").exact).toBe(false);
  });

  it("uses same-position mask0, or recorded nearest full assignment when it is missing", () => {
    const data = index([
      { id: 310, assignment: b, pressedMask: 0 },
      { id: 309, assignment: [61, 63, 64, 66, 68], pressedMask: 1 }
    ]);
    expect(selectKeyboard88Rest(data, b, "right").frameId).toBe(310);
    const approximate = selectKeyboard88Rest(data, [61, 63, 64, 66, 68], "right");
    expect(approximate.frameId).toBe(308);
    expect(approximate.pressedMask).toBe(0);
    expect(approximate.exact).toBe(false);
    expect(approximate.distance).toBe(4);
  });
});
