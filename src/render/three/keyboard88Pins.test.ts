import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { keyboard88At as at } from "./keyboard88Bones";
import { LEFT_TIPS, RIGHT_TIPS } from "./keyboard88Bones.testSupport";
import { keyboard88PinFixture, measureKeyboard88Pins } from "./keyboard88Pins.testSupport";
import { Keyboard88Mirror } from "./keyboard88Mirror";
import { createKeyboard88Plan } from "./keyboard88Plan";
import { createKeyboard88Sample, sampleKeyboard88Plan } from "./keyboard88Sample";

describe("keyboard88 held fingertips on the real atlas", () => {
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
