import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { keyboard88At as at } from "./keyboard88Bones";
import { LEFT_TIPS, RIGHT_TIPS } from "./keyboard88Bones.testSupport";
import { keyboard88PinFixture, measureKeyboard88Pins } from "./keyboard88Pins.testSupport";
import { Keyboard88Mirror } from "./keyboard88Mirror";
import { createKeyboard88Plan } from "./keyboard88Plan";
import { createKeyboard88Sample, sampleKeyboard88Plan } from "./keyboard88Sample";
import { keyboard88MinJerk } from "./keyboard88Motion";

function scalePlan(atlas: Parameters<typeof createKeyboard88Plan>[0], releaseOffset = 0) {
  const fingers = [1, 2, 3, 1, 2, 3, 4, 5];
  return createKeyboard88Plan(atlas, {
    right: [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({
      id: midi,
      midi,
      finger: at(fingers, i),
      start: 1 + i * 0.25,
      duration: 0.25 + (i === 2 ? releaseOffset : 0)
    })),
    left: []
  });
}

describe("keyboard88 held fingertips on the real atlas", () => {
  it.each([
    { offset: -0.0005, start: 1.5, end: 1.7495 },
    { offset: 0, start: 1.5, end: 1.75 },
    { offset: 0.05, start: 1.5, end: 1.75 },
    { offset: 0.051, start: 1.761, end: 1.801 },
    // The early release becomes the previous distinct event: the preparation window is too short.
    { offset: -0.02, start: 1.69, end: 1.73 }
  ])(
    "uses the legato fade or usual fallback at release offset $offset",
    ({ offset, start, end }) => {
      const fixture = keyboard88PinFixture();
      try {
        const plan = scalePlan(fixture.atlas, offset);
        for (const time of [1.625, 1.71, 1.74, 1.76, 1.781]) {
          if (time >= 1.75 + offset) continue;
          const sample = sampleKeyboard88Plan(fixture.atlas, plan, time).right;
          const pin = sample.pins.find((pin, i) => i < sample.pinCount && pin.finger === 3);
          expect(pin?.weight).toBeCloseTo(keyboard88MinJerk((end - time) / (end - start)), 10);
        }
      } finally {
        fixture.dispose();
      }
    }
  );

  it("keeps the C4-C5 thumb-under wrist peak within 1.5x the unpinned transition", () => {
    const fixture = keyboard88PinFixture();
    try {
      const { atlas, mirror, rig, output } = fixture;
      const plan = scalePlan(atlas);
      const sample = createKeyboard88Sample(atlas, plan);
      const options = { rightPins: sample.right, leftPins: sample.left };
      const wrist = rig.boneNames.indexOf("m_avg_R_Wrist");
      const previous = new Vector3(),
        point = new Vector3();
      const peaks: number[] = [];
      expect(
        plan.right.events.find((event) => event.time === 1.5 && event.kind === "onset")?.selection
          .assignment
      ).not.toEqual(
        plan.right.events.find((event) => event.time === 1.75 && event.kind === "onset")?.selection
          .assignment
      );
      for (const pinned of [false, true]) {
        let peak = 0;
        for (let ms = 1500; ms <= 1750; ms++) {
          sampleKeyboard88Plan(atlas, plan, ms / 1000, sample);
          mirror.compose(
            sample.right.rotations,
            sample.left.rotations,
            output,
            pinned ? options : undefined
          );
          mirror.skeleton.head(wrist, point);
          if (ms > 1500) peak = Math.max(peak, point.distanceTo(previous) * 1_000_000);
          previous.copy(point);
          if (pinned && ms >= 1540 && ms < 1750) {
            expect(sample.right.pins[0]?.weight).toBeCloseTo(
              1 - keyboard88MinJerk((ms - 1500) / 250),
              10
            );
          }
        }
        peaks.push(peak);
      }
      expect(at(peaks, 0)).toBeGreaterThan(500);
      expect(at(peaks, 1)).toBeLessThanOrEqual(1.5 * at(peaks, 0));
    } finally {
      fixture.dispose();
    }
  });

  it("keeps a same-position legato held tip pinned within 1mm until its usual fade", () => {
    const fixture = keyboard88PinFixture();
    try {
      const { atlas, mirror, output, fk } = fixture;
      const plan = scalePlan(atlas);
      const sample = createKeyboard88Sample(atlas, plan);
      const options = { rightPins: sample.right, leftPins: sample.left };
      const first = plan.right.events[0]?.selection;
      const next = plan.right.events.find((event) => event.time === 1.25 && event.kind === "onset");
      if (!first || !next) throw new Error("Missing same-position scale events");
      expect(first.assignment).toEqual(next.selection.assignment);
      fk.set(atlas.rotations, first.frameIndex * output.length);
      const target = fk.tail(at(RIGHT_TIPS, 0));
      const point = new Vector3();
      let maxMm = 0;
      for (let ms = 1040; ms <= 1210; ms++) {
        sampleKeyboard88Plan(atlas, plan, ms / 1000, sample);
        expect(sample.right.pins[0]?.weight).toBeCloseTo(1);
        mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
        maxMm = Math.max(
          maxMm,
          mirror.skeleton.tail(at(RIGHT_TIPS, 0), point).distanceTo(target) * 1000
        );
      }
      expect(maxMm).toBeLessThanOrEqual(1);
      sampleKeyboard88Plan(atlas, plan, 1.23, sample);
      expect(sample.right.pins[0]?.weight).toBeCloseTo(0.5);
    } finally {
      fixture.dispose();
    }
  });

  it("reproduces the thumb-under fade, composed wrist and buffers after arbitrary seeks", () => {
    const fixture = keyboard88PinFixture();
    try {
      const { atlas, mirror, output } = fixture;
      const plan = scalePlan(atlas);
      const sample = createKeyboard88Sample(atlas, plan);
      const options = { rightPins: sample.right, leftPins: sample.left };
      const wrist = fixture.rig.boneNames.indexOf("m_avg_R_Wrist");
      const pins = sample.right.pins,
        rotations = sample.right.rotations;
      for (const time of [1.625, 1.501, 1.74, 1.75, 1.54]) {
        const expected = sampleKeyboard88Plan(atlas, plan, time);
        mirror.compose(expected.right.rotations, expected.left.rotations, output, {
          rightPins: expected.right,
          leftPins: expected.left
        });
        const expectedOutput = output.slice();
        const expectedWrist = mirror.skeleton.head(wrist);
        for (const seek of [3, 0, 1.8, 1.5, time]) {
          sampleKeyboard88Plan(atlas, plan, seek, sample);
          mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
        }
        expect(sample).toEqual(expected);
        expect(output).toEqual(expectedOutput);
        expect(mirror.skeleton.head(wrist)).toEqual(expectedWrist);
        expect(sample.right.pins).toBe(pins);
        expect(sample.right.rotations).toBe(rotations);
      }
    } finally {
      fixture.dispose();
    }
  });

  it.each(["right", "left"] as const)(
    "keeps the wrist continuous when a new pin joins a held note with nonzero miss (%s)",
    (hand) => {
      const fixture = keyboard88PinFixture();
      try {
        const { output } = fixture;
        const atlas = { ...fixture.atlas, rotations: fixture.atlas.rotations.slice() };
        const rightWrist = fixture.rig.boneNames.indexOf("m_avg_R_Wrist");
        const heldFrame = fixture.plan.right.events[0]?.selection.frameIndex;
        if (heldFrame === undefined) throw new Error("Missing held-note frame");
        // Isolate the averaging discontinuity with a controlled nonzero held-tip miss.
        const offset = heldFrame * output.length + rightWrist * 4;
        new Quaternion()
          .fromArray(atlas.rotations, offset)
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.15))
          .toArray(atlas.rotations, offset);
        const notes = [
          { id: "held", midi: 67, finger: 5, start: 1, duration: 3 },
          { id: "new", midi: 64, finger: 3, start: 1.5, duration: 0.25 }
        ];
        const plan = createKeyboard88Plan(atlas, {
          right: notes,
          left: notes.map((note) => ({ ...note, midi: 100 - note.midi }))
        });
        const sample = createKeyboard88Sample(atlas, plan);
        const mirror = new Keyboard88Mirror(fixture.rig, atlas);
        const options = { rightPins: sample.right, leftPins: sample.left };
        const wrist = fixture.rig.boneNames.indexOf(
          hand === "right" ? "m_avg_R_Wrist" : "m_avg_L_Wrist"
        );
        sampleKeyboard88Plan(atlas, plan, 1.499, sample);
        mirror.compose(sample.right.rotations, sample.left.rotations, output);
        const unpinned = mirror.skeleton.head(wrist);
        mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
        const before = mirror.skeleton.head(wrist);
        expect(before.distanceTo(unpinned)).toBeGreaterThan(0.002);
        expect(sample[hand].pinCount).toBe(1);
        expect(mirror.unreachableMask).toBe(0);
        expect(mirror.pinClampMask).toBe(0);

        sampleKeyboard88Plan(atlas, plan, 1.501, sample);
        expect(sample[hand].pinCount).toBe(2);
        mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
        expect(mirror.skeleton.head(wrist).distanceTo(before)).toBeLessThan(0.001);
        expect(mirror.unreachableMask).toBe(0);
        expect(mirror.pinClampMask).toBe(0);
      } finally {
        fixture.dispose();
      }
    }
  );

  it.each(["right", "left"] as const)(
    "pins G4 finger 5 while finger 3 plays E4 and D4 (%s, left notes mirrored)",
    (hand) => {
      const fixture = keyboard88PinFixture();
      try {
        const stats = measureKeyboard88Pins(fixture);
        expect(stats[hand].count).toBe(2961);
        expect(stats.clamps).toBe(0);
        expect(stats.unreachable).toBe(0);
        expect(stats[hand].maxMm).toBeLessThanOrEqual(1);
      } finally {
        fixture.dispose();
      }
    }
  );

  it("restores a single retained pin on both hands to submillimetre accuracy", () => {
    const fixture = keyboard88PinFixture();
    try {
      const { atlas, plan, sample, mirror, output } = fixture;
      const options = {
        rightPins: { pins: [{ finger: 5, frameIndex: 0, weight: 1 }], pinCount: 1 },
        leftPins: { pins: [{ finger: 5, frameIndex: 0, weight: 1 }], pinCount: 1 }
      };
      const point = new Vector3();
      let maxMm = 0;
      for (let step = 1000; step <= 3960; step++) {
        sampleKeyboard88Plan(atlas, plan, step / 1000, sample);
        const right = sample.right.pins.find(
          (pin, i) => i < sample.right.pinCount && pin.finger === 5
        );
        const left = sample.left.pins.find(
          (pin, i) => i < sample.left.pinCount && pin.finger === 5
        );
        if (!right || !left) throw new Error("Missing held pinky pin");
        Object.assign(at(options.rightPins.pins, 0), right);
        Object.assign(at(options.leftPins.pins, 0), left);
        mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
        expect(mirror.pinClampMask).toBe(0);
        for (let side = 0; side < 2; side++) {
          const target = side ? fixture.leftTarget : fixture.rightTarget;
          const tip = at(side ? LEFT_TIPS : RIGHT_TIPS, 4);
          maxMm = Math.max(maxMm, mirror.skeleton.tail(tip, point).distanceTo(target) * 1000);
        }
      }
      expect(maxMm).toBeLessThan(0.001);
    } finally {
      fixture.dispose();
    }
  });

  it("fades a single pin's correction and resets clamp diagnostics on every compose", () => {
    const fixture = keyboard88PinFixture();
    try {
      const { atlas, plan, sample, mirror, output } = fixture;
      sampleKeyboard88Plan(atlas, plan, 2.5, sample);
      const pin = sample.right.pins.find((pin, i) => i < sample.right.pinCount && pin.finger === 5);
      if (!pin) throw new Error("Missing held pinky pin");
      const pins = { pins: [{ ...pin }], pinCount: 1 };
      const wrist = fixture.rig.boneNames.indexOf("m_avg_R_Wrist");
      mirror.compose(sample.right.rotations, sample.left.rotations, output);
      const own = mirror.skeleton.head(wrist);
      mirror.compose(sample.right.rotations, sample.left.rotations, output, { rightPins: pins });
      const full = mirror.skeleton.head(wrist).sub(own);
      at(pins.pins, 0).weight = 0.5;
      mirror.compose(sample.right.rotations, sample.left.rotations, output, { rightPins: pins });
      const half = mirror.skeleton.head(wrist).sub(own);
      expect(half.distanceTo(full.multiplyScalar(0.5))).toBeLessThan(1e-6);

      const far = { pins: [{ finger: 5, frameIndex: 1185, weight: 1 }], pinCount: 1 };
      const first = atlas.rotations.subarray(0, output.length);
      fixture.fk.set(first);
      const before = fixture.fk.tail(at(RIGHT_TIPS, 4));
      fixture.fk.set(atlas.rotations, 1185 * output.length);
      expect(fixture.fk.tail(at(RIGHT_TIPS, 4)).distanceTo(before)).toBeGreaterThan(0.05);
      mirror.compose(first, first, output, { rightPins: far, leftPins: far });
      expect(mirror.pinClampMask).toBe(3);
      expect(mirror.pinClampCount).toBe(2);
      mirror.compose(first, first, output);
      expect(mirror.pinClampMask).toBe(0);
      expect(mirror.pinClampCount).toBe(0);

      mirror.compose(first, first, output, { correction: false });
      const unshiftedLeft = mirror.skeleton.tail(at(LEFT_TIPS, 4));
      const sameFrame = { pins: [{ finger: 5, frameIndex: 0, weight: 1 }], pinCount: 1 };
      mirror.compose(first, first, output, { correction: false, leftPins: sameFrame });
      expect(mirror.skeleton.tail(at(LEFT_TIPS, 4)).distanceTo(unshiftedLeft)).toBeLessThan(1e-7);
    } finally {
      fixture.dispose();
    }
  });

  it("reproduces both hands and diagnostics after a random-access seek", () => {
    const fixture = keyboard88PinFixture();
    try {
      const { atlas, plan, sample, mirror, output, options } = fixture;
      sampleKeyboard88Plan(atlas, plan, 2.52, sample);
      mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
      const expected = output.slice();
      const expectedClamps = mirror.pinClampCount;
      const expectedUnreachable = mirror.unreachableMask;
      for (const time of [0, 4.1, 1.7, 2.52]) {
        sampleKeyboard88Plan(atlas, plan, time, sample);
        mirror.compose(sample.right.rotations, sample.left.rotations, output, options);
      }
      expect(output).toEqual(expected);
      expect(mirror.pinClampCount).toBe(expectedClamps);
      expect(mirror.unreachableMask).toBe(expectedUnreachable);
    } finally {
      fixture.dispose();
    }
  });
});
