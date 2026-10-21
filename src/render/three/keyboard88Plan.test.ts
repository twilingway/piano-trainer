import { describe, expect, it } from "vitest";
import type { Keyboard88Atlas } from "./keyboard88Atlas";
import { createKeyboard88Plan } from "./keyboard88Plan";
import type { Keyboard88Note } from "./keyboard88Plan";

const assignment = [60, 62, 64, 65, 67] as const;
const atlas: Keyboard88Atlas = {
  frames: [0, 1, 4, 16, 20].map((pressedMask, i) => ({ id: 308 + i, assignment, pressedMask })),
  boneNames: ["Pelvis"],
  rotations: new Float32Array([0, 1, 2, 3, 4].flatMap(() => [0, 0, 0, 1]))
};
function plan(right: readonly Keyboard88Note[], left: readonly Keyboard88Note[] = []) {
  return createKeyboard88Plan(atlas, { right, left });
}

describe("keyboard88 immutable chronological plan", () => {
  it("preserves held note IDs across overlapping onsets and releases", () => {
    const value = plan([
      { id: "g", midi: 67, finger: 5, start: 0, duration: 2 },
      { id: "e", midi: 64, finger: 3, start: 1, duration: 0.5 }
    ]);
    expect(
      value.right.events.map((event) => [event.time, event.kind, event.selection.pressedMask])
    ).toEqual([
      [0, "onset", 16],
      [1, "onset", 20],
      [1.5, "release", 16],
      [2, "release", 0]
    ]);
    expect(value.right.events[1]?.held.map((note) => note.id)).toEqual(["e", "g"]);
  });

  it("does not lose a repeated same-key hold when the earlier duplicate ID ends", () => {
    const value = plan([
      { id: "same", midi: 60, finger: 1, start: 0, duration: 1 },
      { id: "same", midi: 60, finger: 1, start: 0.5, duration: 1 }
    ]);
    expect(value.right.events.find((event) => event.time === 1)?.held).toHaveLength(1);
    expect(value.right.events.find((event) => event.time === 1)?.selection.pressedMask).toBe(1);
    expect(value.right.events.at(-1)?.selection.pressedMask).toBe(0);
  });

  it("keeps touching release and onset as ordered separate events without a rest transition", () => {
    const value = plan([
      { id: "a", midi: 60, finger: 1, start: 0, duration: 1 },
      { id: "b", midi: 64, finger: 3, start: 1, duration: 1 }
    ]);
    expect(
      value.right.events.filter((event) => event.time === 1).map((event) => event.kind)
    ).toEqual(["release", "onset"]);
    expect(value.right.transitions.filter((transition) => transition.start === 1)).toHaveLength(1);
    expect(
      value.right.transitions.find((transition) => transition.start === 1)?.selection.pressedMask
    ).toBe(4);
  });

  it("plans deterministically regardless of input order and can be rebuilt after any seek", () => {
    const notes = [
      { id: "g", midi: 67, finger: 5, start: 1, duration: 1 },
      { id: "e", midi: 64, finger: 3, start: 1, duration: 0.5 }
    ];
    expect(plan(notes)).toEqual(plan([...notes].reverse()));
    expect(plan(notes)).toEqual(plan(notes));
    expect(notes).toHaveLength(2);
  });

  it("separates left-space matching, stable empty song rest and zero-length intervals", () => {
    const value = plan([], [{ id: 1, midi: 36, finger: 3, start: 2, duration: 1 }]);
    expect(value.right.events).toEqual([]);
    expect(value.right.initial.frameId).toBe(308);
    expect(value.left.events[0]?.selection.frameId).toBe(310);
    expect(value.left.events[0]?.selection.exact).toBe(true);
    expect(plan([{ id: 1, midi: 60, start: 0, duration: 0 }]).right.events).toEqual([]);
    expect(() => plan([{ id: 1, midi: NaN, start: 0, duration: 1 }])).toThrow();
  });
});
