import { Vector3 } from "three";
import type { Keyboard88Assignment, Keyboard88Atlas } from "./keyboard88Atlas";
import { keyboard88At as at } from "./keyboard88Bones";
import { keyboard88BoneFixture, LEFT_TIPS, RIGHT_TIPS } from "./keyboard88Bones.testSupport";
import { Keyboard88Mirror, KEYBOARD88_ARM_SHIFT } from "./keyboard88Mirror";
import { createKeyboard88Plan } from "./keyboard88Plan";
import type { Keyboard88Note } from "./keyboard88Plan";
import { createKeyboard88Sample, sampleKeyboard88Plan } from "./keyboard88Sample";

export function keyboard88PinFixture() {
  const fixture = keyboard88BoneFixture();
  const atlas: Keyboard88Atlas = {
    boneNames: fixture.rig.boneNames,
    rotations: fixture.rotations,
    frames: fixture.index.frames.map((frame) => ({
      ...frame,
      assignment: frame.assignment as unknown as Keyboard88Assignment
    }))
  };
  const notes: Keyboard88Note[] = [
    { id: "held", midi: 67, finger: 5, start: 1, duration: 3 },
    { id: "E4", midi: 64, finger: 3, start: 1.5, duration: 0.25 },
    { id: "D4", midi: 62, finger: 3, start: 2, duration: 0.25 }
  ];
  const plan = createKeyboard88Plan(atlas, {
    right: notes,
    left: notes.map((note) => ({ ...note, midi: 100 - note.midi }))
  });
  const sample = createKeyboard88Sample(atlas, plan);
  const mirror = new Keyboard88Mirror(fixture.rig, atlas);
  const output = new Float32Array(atlas.boneNames.length * 4);
  const options = { rightPins: sample.right, leftPins: sample.left };
  const firstOnset = plan.right.events.find((event) => event.kind === "onset");
  if (!firstOnset) throw new Error("Missing held-note onset");
  const frameIndex = firstOnset.selection.frameIndex;
  const onset = atlas.rotations.subarray(
    frameIndex * output.length,
    (frameIndex + 1) * output.length
  );
  fixture.fk.set(onset);
  const rightTarget = fixture.fk.tail(at(RIGHT_TIPS, 4));
  fixture.fk.set(mirror.mirror(onset));
  const leftTarget = fixture.fk.tail(at(LEFT_TIPS, 4)).add(new Vector3(KEYBOARD88_ARM_SHIFT, 0, 0));
  return { ...fixture, atlas, plan, sample, mirror, output, options, rightTarget, leftTarget };
}

export function measureKeyboard88Pins(
  fixture: ReturnType<typeof keyboard88PinFixture>,
  retainedFingerOnly = false
) {
  const { atlas, plan, sample, mirror, output, options } = fixture;
  const errors: number[][] = [[], []];
  const unclampedErrors: number[][] = [[], []];
  let clamps = 0;
  let unreachable = 0;
  const point = new Vector3();
  const retained = {
    rightPins: { pins: [{ finger: 5, frameIndex: 0, weight: 1 }], pinCount: 1 },
    leftPins: { pins: [{ finger: 5, frameIndex: 0, weight: 1 }], pinCount: 1 }
  };
  for (let step = 1000; step <= 3960; step++) {
    sampleKeyboard88Plan(atlas, plan, step / 1000, sample);
    if (retainedFingerOnly) {
      for (const hand of ["right", "left"] as const) {
        const own = sample[hand];
        const pin = own.pins.find((pin, i) => i < own.pinCount && pin.finger === 5);
        if (!pin) throw new Error("Missing held pinky pin");
        Object.assign(at(retained[hand === "right" ? "rightPins" : "leftPins"].pins, 0), pin);
      }
    }
    mirror.compose(
      sample.right.rotations,
      sample.left.rotations,
      output,
      retainedFingerOnly ? retained : options
    );
    clamps += mirror.pinClampCount;
    unreachable += Number(mirror.unreachableMask !== 0);
    for (let side = 0; side < 2; side++) {
      const tip = at(side ? LEFT_TIPS : RIGHT_TIPS, 4);
      const target = side ? fixture.leftTarget : fixture.rightTarget;
      const error = mirror.skeleton.tail(tip, point).distanceTo(target) * 1000;
      at(errors, side).push(error);
      if (!(mirror.pinClampMask & (1 << side))) at(unclampedErrors, side).push(error);
    }
  }
  const stats = (values: number[]) => ({
    count: values.length,
    maxMm: Math.max(...values),
    rmsMm: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
  });
  return {
    right: stats(at(errors, 0)),
    left: stats(at(errors, 1)),
    rightUnclamped: stats(at(unclampedErrors, 0)),
    leftUnclamped: stats(at(unclampedErrors, 1)),
    clamps,
    unreachable
  };
}
