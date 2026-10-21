import { describe, expect, it } from "vitest";
import type { Keyboard88Atlas } from "./keyboard88Atlas";
import { createKeyboard88Plan } from "./keyboard88Plan";
import type { Keyboard88Note } from "./keyboard88Plan";
import { createKeyboard88Sample, sampleKeyboard88Plan } from "./keyboard88Sample";

const atlas: Keyboard88Atlas = {
  frames: [0, 1, 4, 5].map((pressedMask, i) => ({
    id: 308 + i,
    assignment: [60, 62, 64, 65, 67],
    pressedMask
  })),
  boneNames: ["Pelvis"],
  rotations: new Float32Array(
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].flatMap((angle) => [
      0,
      0,
      Math.sin(angle / 2),
      Math.cos(angle / 2)
    ])
  ),
  roots: new Float32Array([0, 0, 0, 2, 4, 6, 4, 8, 12, 6, 12, 18])
};
function prepare(notes: readonly Keyboard88Note[]) {
  const plan = createKeyboard88Plan(atlas, { right: notes, left: [] });
  return { plan, at: (time: number) => sampleKeyboard88Plan(atlas, plan, time).right };
}

describe("keyboard88 random-access song-time sampler", () => {
  it("starts 80ms before onset and reaches the exact press at onset", () => {
    const { at } = prepare([{ id: 1, midi: 60, finger: 1, start: 1, duration: 1 }]);
    expect([...at(0.9).rotations]).toEqual([0, 0, 0, 1]);
    expect(at(0.92).alpha).toBeCloseTo(0);
    expect(at(0.96).rotations[2]).toBeCloseTo(Math.sin(Math.PI / 8));
    expect([...at(0.96).root]).toEqual([1, 2, 3]);
    expect(at(1).alpha).toBe(1);
    expect(at(1).rotations[2]).toBeCloseTo(Math.SQRT1_2);
    expect(at(1).frameId).toBe(309);
  });

  it("shortens onset preparation to the previous event and handles zero boundaries", () => {
    const { plan, at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 1, duration: 0.04 },
      { id: 2, midi: 64, finger: 3, start: 1.08, duration: 0.2 }
    ]);
    expect(plan.right.transitions.find((transition) => transition.end === 1.08)?.start).toBe(1.04);
    expect(at(1.04).rotations[2]).toBeCloseTo(Math.SQRT1_2);
    expect(at(1.08).rotations[2]).toBeCloseTo(1);
    expect(Number.isFinite(at(1.04).rotations[3])).toBe(true);
  });

  it("releases to recorded mask0 in 80ms, holds it, and prepares the repeated press", () => {
    const { at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 1, duration: 0.5 },
      { id: 2, midi: 60, finger: 1, start: 2, duration: 0.5 }
    ]);
    expect(at(1.5).rotations[2]).toBeCloseTo(Math.SQRT1_2);
    expect(at(1.54).rotations[2]).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(at(1.58).rotations[2]).toBeCloseTo(0);
    expect(at(1.8).rotations[2]).toBe(0);
    expect(at(2).rotations[2]).toBeCloseTo(Math.SQRT1_2);
  });

  it("clips release at the next preparation, preserving continuity at that boundary", () => {
    const { plan, at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 1, duration: 0.1 },
      { id: 2, midi: 64, finger: 3, start: 1.24, duration: 0.2 }
    ]);
    const release = plan.right.transitions.find((transition) => transition.start === 1.1);
    expect(release?.end).toBeCloseTo(1.16);
    expect(at(1.16).rotations[2]).toBeCloseTo(0);
    expect(at(1.24).rotations[2]).toBeCloseTo(1);
  });

  it("gives onset priority at touching boundaries without a fabricated rest sample", () => {
    const { at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 1, duration: 0.5 },
      { id: 2, midi: 64, finger: 3, start: 1.5, duration: 0.5 }
    ]);
    expect(at(1.5).frameId).toBe(310);
    expect(at(1.5).alpha).toBe(1);
    expect(at(1.5).rotations[2]).toBeCloseTo(1);
  });

  it("reuses buffers and returns identical values after backwards seeks and repeated times", () => {
    const { plan } = prepare([{ id: 1, midi: 60, finger: 1, start: 1, duration: 1 }]);
    const out = createKeyboard88Sample(atlas);
    const expected = sampleKeyboard88Plan(atlas, plan, 0.96);
    sampleKeyboard88Plan(atlas, plan, 10, out);
    expect(sampleKeyboard88Plan(atlas, plan, 0.96, out)).toBe(out);
    expect(out).toEqual(expected);
    expect(sampleKeyboard88Plan(atlas, plan, 0.96, out)).toEqual(expected);
    expect(() => sampleKeyboard88Plan(atlas, plan, NaN, out)).toThrow();
  });

  it("takes the short quaternion hemisphere and keeps an empty song stable", () => {
    const opposite = {
      ...atlas,
      rotations: atlas.rotations.map((v, i) => (i >= 4 && i < 8 ? -v : v))
    };
    const plan = createKeyboard88Plan(opposite, {
      right: [{ id: 1, midi: 60, finger: 1, start: 1, duration: 1 }],
      left: []
    });
    expect(sampleKeyboard88Plan(opposite, plan, 0.96).right.rotations[2]).toBeCloseTo(
      Math.sin(Math.PI / 8)
    );
    const empty = createKeyboard88Plan(atlas, { right: [], left: [] });
    expect(sampleKeyboard88Plan(atlas, empty, -10)).toEqual(
      sampleKeyboard88Plan(atlas, empty, 100)
    );
  });
});
