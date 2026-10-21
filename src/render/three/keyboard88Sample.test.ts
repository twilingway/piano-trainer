import { describe, expect, it } from "vitest";
import type { Keyboard88Atlas } from "./keyboard88Atlas";
import { createKeyboard88Plan } from "./keyboard88Plan";
import type { Keyboard88Note } from "./keyboard88Plan";
import { createKeyboard88Sample, sampleKeyboard88Plan } from "./keyboard88Sample";
import { keyboard88MinJerk } from "./keyboard88Motion";

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
  it("starts 500ms before onset, is halfway at onset-250ms and reaches the exact endpoint", () => {
    const { at } = prepare([{ id: 1, midi: 60, finger: 1, start: 1, duration: 1 }]);
    expect([...at(0.49).rotations]).toEqual([0, 0, 0, 1]);
    expect(at(0.5).alpha).toBeCloseTo(0);
    expect(at(0.75).rotations[2]).toBeCloseTo(Math.sin(Math.PI / 8));
    expect([...at(0.75).root]).toEqual([1, 2, 3]);
    expect(at(0.501).alpha).toBeLessThan(1e-7);
    expect(1 - at(0.999).alpha).toBeLessThan(1e-7);
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

  it("travels halfway 250ms before an onset with a one-second gap after the previous event", () => {
    const { at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 0, duration: 1 },
      { id: 2, midi: 64, finger: 3, start: 2, duration: 0.5 }
    ]);
    expect([...at(1.5).root]).toEqual([0, 0, 0]);
    expect(at(1.75).alpha).toBeCloseTo(0.5);
    expect([...at(1.75).root]).toEqual([2, 4, 6]);
    expect(at(1.75).rotations[2]).toBeCloseTo(Math.SQRT1_2);
    expect([...at(2).root]).toEqual([4, 8, 12]);
  });

  it("uses the endpoint for a zero-duration hand transition", () => {
    const { plan } = prepare([{ id: 1, midi: 60, finger: 1, start: 1, duration: 1 }]);
    const transition = plan.right.transitions[0];
    if (!transition) throw new Error("Missing onset transition");
    const instant = {
      ...plan,
      right: { ...plan.right, transitions: [{ ...transition, start: 1, end: 1 }] }
    };
    const sample = sampleKeyboard88Plan(atlas, instant, 1).right;
    expect(sample.alpha).toBe(1);
    expect([...sample.root]).toEqual([2, 4, 6]);
    expect(sample.rotations[2]).toBeCloseTo(Math.SQRT1_2);
  });

  it("releases the hand to mask0 in 300ms and starts preparing 500ms before the repeat", () => {
    const { at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 1, duration: 0.5 },
      { id: 2, midi: 60, finger: 1, start: 3.5, duration: 0.5 }
    ]);
    expect(at(1.5).rotations[2]).toBeCloseTo(Math.SQRT1_2);
    expect(at(1.65).rotations[2]).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(at(1.8).rotations[2]).toBeCloseTo(0);
    expect(at(3).rotations[2]).toBe(0);
    expect(at(3.25).rotations[2]).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(at(3.5).rotations[2]).toBeCloseTo(Math.SQRT1_2);
  });

  it("holds the hand after release at 1s until preparation at 1.1s for onset at 1.6s", () => {
    const { plan, at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 0, duration: 1 },
      { id: 2, midi: 64, finger: 3, start: 1.6, duration: 0.2 }
    ]);
    expect(plan.right.transitions.some((transition) => transition.start === 1)).toBe(false);
    const held = at(1);
    for (let ms = 1000; ms <= 1100; ms++) {
      expect(at(ms / 1000).rotations).toEqual(held.rotations);
      expect(at(ms / 1000).root).toEqual(held.root);
    }
    expect(plan.right.transitions.find((transition) => transition.end === 1.6)?.start).toBe(1.1);
    expect(at(1.1).alpha).toBeCloseTo(0);
    expect(at(1.35).alpha).toBeCloseTo(0.5);
    expect([...at(1.35).root]).toEqual([3, 6, 9]);
    expect(at(1.6).rotations[2]).toBeCloseTo(1);
  });

  it("completes the full rest transition over 1s to 1.3s when the next onset is at 3s", () => {
    const { plan, at } = prepare([
      { id: 1, midi: 60, finger: 1, start: 0, duration: 1 },
      { id: 2, midi: 64, finger: 3, start: 3, duration: 0.2 }
    ]);
    const release = plan.right.transitions.find((transition) => transition.start === 1);
    expect(release?.end).toBe(1.3);
    for (let ms = 1000; ms <= 1300; ms++) {
      const alpha = keyboard88MinJerk((ms - 1000) / 300);
      const sample = at(ms / 1000);
      expect(sample.rotations[2]).toBeCloseTo(Math.sin((Math.PI / 4) * (1 - alpha)));
      for (let i = 0; i < 3; i++) expect(sample.root[i]).toBeCloseTo(2 * (i + 1) * (1 - alpha));
    }
    expect([...at(2.5).root]).toEqual([0, 0, 0]);
    expect(at(2.5).alpha).toBe(0);
    expect(at(3).rotations[2]).toBeCloseTo(1);
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
    const out = createKeyboard88Sample(atlas, plan);
    const expected = sampleKeyboard88Plan(atlas, plan, 0.75);
    sampleKeyboard88Plan(atlas, plan, 10, out);
    expect(sampleKeyboard88Plan(atlas, plan, 0.75, out)).toBe(out);
    expect(out).toEqual(expected);
    expect(sampleKeyboard88Plan(atlas, plan, 0.75, out)).toEqual(expected);
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
    expect(sampleKeyboard88Plan(opposite, plan, 0.75).right.rotations[2]).toBeCloseTo(
      Math.sin(Math.PI / 8)
    );
    const empty = createKeyboard88Plan(atlas, { right: [], left: [] });
    expect(sampleKeyboard88Plan(atlas, empty, -10)).toEqual(
      sampleKeyboard88Plan(atlas, empty, 100)
    );
  });
});

const fingerAtlas: Keyboard88Atlas = {
  frames: atlas.frames,
  boneNames: [
    "m_avg_Pelvis",
    "m_avg_rmiddle0",
    "m_avg_rmiddle1",
    "m_avg_rmiddle2",
    "m_avg_rindex0"
  ],
  // Pressed frames deliberately differ on the idle index too: it must stay at mask0.
  rotations: new Float32Array(
    atlas.frames.flatMap((frame) =>
      [0, 1, 2, 3, 4].flatMap((bone) => {
        const angle = bone === 0 ? frame.pressedMask / 10 : frame.pressedMask ? Math.PI / 2 : 0;
        return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
      })
    )
  )
};

describe("keyboard88 independent finger envelopes and pins", () => {
  const note = { id: "e", midi: 64, finger: 3, start: 1, duration: 0.5 };
  function prepareFingers(notes: readonly Keyboard88Note[] = [note]) {
    const plan = createKeyboard88Plan(fingerAtlas, { right: notes, left: [] });
    return { plan, at: (time: number) => sampleKeyboard88Plan(fingerAtlas, plan, time).right };
  }

  it("presses finger 3 over 50ms and lifts over 80ms, keeping unplayed fingers at mask0", () => {
    const { at } = prepareFingers();
    for (const [time, weight] of [
      [0.95, 0],
      [0.975, 0.5],
      [1, 1],
      [1.5, 1],
      [1.54, 0.5],
      [1.58, 0]
    ]) {
      const sample = at(time ?? 0);
      expect(sample.fingerWeights[2]).toBeCloseTo(weight ?? 0);
      for (const index of [0, 1, 3, 4]) expect(sample.fingerWeights[index]).toBe(0);
      for (const bone of [1, 2, 3]) {
        expect(sample.rotations[bone * 4 + 2]).toBeCloseTo(Math.sin((Math.PI / 4) * (weight ?? 0)));
      }
      expect([...sample.rotations.slice(16, 20)]).toEqual([0, 0, 0, 1]);
    }
  });

  it("takes the maximum of overlapping envelopes of the same finger", () => {
    const { at } = prepareFingers([note, { ...note, id: "overlap", duration: 0.7 }]);
    for (let ms = 1490; ms <= 1620; ms++) {
      const t = ms / 1000;
      const first = t <= 1.5 ? 1 : 1 - keyboard88MinJerk((t - 1.5) / 0.08);
      const second = 1;
      const weight = Math.max(first, second);
      expect(at(t).fingerWeights[2]).toBeCloseTo(weight, 6);
      expect(at(t).rotations[6]).toBeCloseTo(Math.sin((Math.PI / 4) * weight));
    }
  });

  it.each([0.5, 0.1, 0.01])(
    "fully lifts between repeated same-finger notes spaced %ss apart",
    (interval) => {
      const onset = 1 + interval;
      const release = onset - Math.min(0.13, interval / 2);
      const scale = Math.min(1, interval / 0.26);
      const liftEnd = release + 0.08 * scale;
      const pressStart = onset - 0.05 * scale;
      const { at } = prepareFingers([
        { ...note, duration: interval },
        { ...note, id: "repeat", start: onset, duration: interval }
      ]);
      expect(at(release).fingerWeights[2]).toBeCloseTo(1);
      expect(at(release + 0.04 * scale).fingerWeights[2]).toBeCloseTo(0.5);
      expect(at(liftEnd).fingerWeights[2]).toBeCloseTo(0);
      expect(at(pressStart).fingerWeights[2]).toBeCloseTo(0);
      expect(at(onset - 0.025 * scale).fingerWeights[2]).toBeCloseTo(0.5);
      expect(at(onset).fingerWeights[2]).toBe(1);
      expect(at(release - Math.min(0.02, interval / 4)).pins[0]?.weight).toBeLessThan(1);
      expect(at(release).pinCount).toBe(0);
      expect(at(onset).pinCount).toBe(1);
    }
  );

  it("releases a repeated key even when the next note is played with another finger", () => {
    const { at } = prepareFingers([note, { ...note, id: "other finger", finger: 1, start: 1.5 }]);
    expect(at(1.41).fingerWeights[2]).toBeCloseTo(0.5);
    expect(at(1.45).fingerWeights[2]).toBeCloseTo(0);
    expect(at(1.45).fingerWeights[0]).toBeCloseTo(0);
    expect(at(1.475).fingerWeights[0]).toBeCloseTo(0.5);
    expect(at(1.5).fingerWeights[0]).toBe(1);
    expect(at(1.37).pinCount).toBe(0);
  });

  it("combines different repeat intervals in a chain connected by key and then by finger", () => {
    const { at } = prepareFingers([
      { ...note, duration: 1 },
      { ...note, id: "key transfer", finger: 1, start: 1.5, duration: 1 },
      { ...note, id: "finger repeat", finger: 1, midi: 60, start: 1.6 }
    ]);
    for (const time of [1.45, 1.55 + 0.08 * (0.1 / 0.26)]) {
      const sample = at(time);
      for (const weight of sample.fingerWeights) expect(weight).toBeCloseTo(0, 6);
      expect(sample.pinCount).toBe(0);
    }
    expect(at(1.5).fingerWeights[0]).toBe(1);
    expect(at(1.6).fingerWeights[0]).toBe(1);
    expect(at(1.6).fingerWeights[2]).toBe(0);
  });

  it("ramps pins in over 40ms after onset and out over the final 40ms before release", () => {
    const { at } = prepareFingers([note, { ...note, id: "zero", start: 1.2, duration: 0 }]);
    expect(at(0.99).pinCount).toBe(0);
    for (const [time, weight] of [
      [1, 0],
      [1.01, keyboard88MinJerk(0.25)],
      [1.02, 0.5],
      [1.04, 1],
      [1.46, 1],
      [1.48, 0.5],
      [1.49, keyboard88MinJerk(0.25)]
    ]) {
      const sample = at(time ?? 0);
      expect(sample.pinCount).toBe(1);
      expect(sample.pins[0]?.finger).toBe(3);
      expect(sample.pins[0]?.frameIndex).toBe(2);
      expect(sample.pins[0]?.weight).toBeCloseTo(weight ?? 0, 6);
    }
    expect(at(1.5).pinCount).toBe(0);
    expect(at(1.54).pinCount).toBe(0);
  });

  it("uses the minimum of pin attack and release ramps for a short note", () => {
    const { at } = prepareFingers([{ ...note, duration: 0.04 }]);
    for (const [time, weight] of [
      [1, 0],
      [1.01, keyboard88MinJerk(0.25)],
      [1.02, 0.5],
      [1.03, keyboard88MinJerk(0.25)]
    ]) {
      expect(at(time ?? 0).pins[0]?.weight).toBeCloseTo(weight ?? 0, 6);
    }
    expect(at(1.04).pinCount).toBe(0);
  });

  it("reuses all output buffers and reproduces finger rotations and pins after arbitrary seeks", () => {
    const { plan } = prepareFingers([note, { ...note, id: "repeat", start: 3.5 }]);
    const out = createKeyboard88Sample(fingerAtlas, plan);
    const rotations = out.right.rotations,
      weights = out.right.fingerWeights,
      pins = out.right.pins;
    for (const time of [3.9, 0.975, 1.48, 2.5, 1.54, 1, 3.475, 1.46, 1.58, 0.95]) {
      expect(sampleKeyboard88Plan(fingerAtlas, plan, time, out)).toEqual(
        sampleKeyboard88Plan(fingerAtlas, plan, time)
      );
      expect(out.right.rotations).toBe(rotations);
      expect(out.right.fingerWeights).toBe(weights);
      expect(out.right.pins).toBe(pins);
    }
  });

  it("allocates enough reusable pins for overlapping notes even with duplicate IDs/fingers", () => {
    const { plan } = prepareFingers(Array.from({ length: 8 }, () => note));
    const out = createKeyboard88Sample(fingerAtlas, plan);
    sampleKeyboard88Plan(fingerAtlas, plan, 1.2, out);
    expect(out.right.pinCount).toBe(8);
    expect(out.right.pins).toHaveLength(8);
  });

  it("takes a missing position's base fingers from the nearest recorded mask0", () => {
    const missingRest = {
      ...fingerAtlas,
      frames: fingerAtlas.frames.map((frame, i) =>
        i === 2 ? { ...frame, assignment: [60, 61, 63, 65, 67] as const } : frame
      )
    };
    const plan = createKeyboard88Plan(missingRest, { right: [{ ...note, midi: 63 }], left: [] });
    const sample = sampleKeyboard88Plan(missingRest, plan, 0.9).right;
    expect(plan.right.events[0]?.selection.frameIndex).toBe(2);
    expect([...sample.rotations.slice(4)]).toEqual(
      Array.from({ length: 4 }, () => [0, 0, 0, 1]).flat()
    );
  });

  it("blends the unplayed finger's mask0 base on the same min-jerk curve as the hand", () => {
    const size = fingerAtlas.boneNames.length * 4;
    const moving: Keyboard88Atlas = {
      ...fingerAtlas,
      frames: [
        { id: 1, assignment: [60, 62, 64, 65, 67], pressedMask: 0 },
        { id: 2, assignment: [60, 62, 64, 65, 67], pressedMask: 4 },
        { id: 3, assignment: [72, 74, 76, 77, 79], pressedMask: 0 },
        { id: 4, assignment: [72, 74, 76, 77, 79], pressedMask: 4 }
      ],
      rotations: new Float32Array(
        [0, 0.2, 1, 1.2].flatMap((angle) =>
          fingerAtlas.boneNames.flatMap(() => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)])
        )
      )
    };
    const plan = createKeyboard88Plan(moving, {
      right: [
        { ...note, start: 0, duration: 1 },
        { ...note, id: "move", midi: 76, start: 2 }
      ],
      left: []
    });
    for (const time of [1.5, 1.625, 1.75, 1.875, 2]) {
      const sample = sampleKeyboard88Plan(moving, plan, time).right;
      const alpha = keyboard88MinJerk((time - 1.5) / 0.5);
      expect(sample.rotations[size - 2]).toBeCloseTo(Math.sin(alpha / 2));
      expect(sample.rotations[2]).toBeCloseTo(Math.sin((1.2 * alpha) / 2));
    }
  });
});
