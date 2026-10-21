import { describe, expect, it } from "vitest";
import { indexKeyboard88Atlas } from "./keyboard88Atlas";
import type { Keyboard88Assignment, Keyboard88Atlas } from "./keyboard88Atlas";
import { generatedKeyboard88Atlas, legacyKeyboard88Selection } from "./keyboard88Atlas.testSupport";
import { createKeyboard88Plan } from "./keyboard88Plan";
import type { Keyboard88Note } from "./keyboard88Plan";
import { createKeyboard88HandSample, sampleKeyboard88Hand } from "./keyboard88Sample";

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
  it("matches the exhaustive selector for every event of a generated 2000-note song per hand", () => {
    const generated = generatedKeyboard88Atlas();
    const index = indexKeyboard88Atlas(generated);
    const makeNotes = (left: boolean) =>
      Array.from({ length: 2000 }, (_, i) => {
        const assignment = generated.frames[(i * 17) % generated.frames.length]?.assignment ?? [60];
        const finger = 1 + (i % 5);
        const midi = assignment[finger - 1] ?? 60;
        return {
          id: i,
          midi: left ? 100 - midi : midi,
          finger: i % 4 ? finger : undefined,
          start: i * 0.25,
          duration: i % 7 ? 0.2 : 0.45
        };
      });
    const notes = { right: makeNotes(false), left: makeNotes(true) };
    const value = createKeyboard88Plan(generated, notes, index);
    for (const hand of ["right", "left"] as const) {
      let previous: Keyboard88Assignment | undefined;
      for (const event of value[hand].events) {
        expect(event.selection).toEqual(
          legacyKeyboard88Selection(index, event.held, hand, previous)
        );
        previous = event.selection.assignment;
      }
    }
    expect(createKeyboard88Plan(generated, notes, index)).toEqual(value);
  });

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
    expect(value.right.transitions.filter((transition) => transition.end === 1)).toHaveLength(1);
    expect(
      value.right.transitions.find((transition) => transition.end === 1)?.selection.pressedMask
    ).toBe(4);
    expect(value.right.transitions.find((transition) => transition.end === 1)?.start).toBe(0.92);
  });

  it.each([0, -1e-10, 1e-10, -0.0009, 0.0009])(
    "prepares touching legato throughout all 80ms with release offset %s",
    (releaseOffset) => {
      const moving: Keyboard88Atlas = {
        ...atlas,
        rotations: new Float32Array(
          [0, 0.4, 0.8, 1.2, 1.6].flatMap((angle) => [
            0,
            0,
            Math.sin(angle / 2),
            Math.cos(angle / 2)
          ])
        )
      };
      const value = createKeyboard88Plan(moving, {
        right: [
          { id: "a", midi: 60, finger: 1, start: 0, duration: 0.25 + releaseOffset },
          { id: "b", midi: 64, finger: 3, start: 0.25, duration: 0.25 }
        ],
        left: []
      });
      const transition = value.right.transitions.find((item) => item.end === 0.25);
      expect(transition?.start).toBeCloseTo(0.17);
      expect(transition?.selection.pressedMask).toBe(4);
      const sample = createKeyboard88HandSample(moving);
      for (let millisecond = 0; millisecond <= 80; millisecond++) {
        sampleKeyboard88Hand(moving, value.right, 0.17 + millisecond / 1000, sample);
        expect(sample.alpha).toBeCloseTo(millisecond / 80);
        expect(sample.frameId).toBe(310);
        expect(sample.rotations[2]).toBeCloseTo(Math.sin((0.4 + (0.4 * millisecond) / 80) / 2));
      }
    }
  );

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

  it("does not leave a positive sub-millisecond interval held after its collapsed boundary", () => {
    const value = plan([{ id: "short", midi: 60, finger: 1, start: 0, duration: 0.0005 }]);
    expect(value.right.events.every((event) => event.held.length === 0)).toBe(true);
    expect(value.right.events.at(-1)?.selection.pressedMask).toBe(0);
    const sample = createKeyboard88HandSample(atlas);
    expect(sampleKeyboard88Hand(atlas, value.right, 1, sample).frameId).toBe(308);
  });
});
