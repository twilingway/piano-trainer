import type { Keyboard88Atlas } from "./keyboard88Atlas";
import type { Keyboard88HandPlan, Keyboard88Plan } from "./keyboard88Plan";
import { slerpKeyboard88Rotations, slerpKeyboard88Quaternion } from "./keyboard88Quaternion";
import { keyboard88PressWeight } from "./keyboard88Fingers";
import { KEYBOARD88_PIN_PRESS_SECONDS, keyboard88MinJerk } from "./keyboard88Motion";

export interface Keyboard88Pin {
  finger: number;
  frameIndex: number;
  weight: number;
}

export interface Keyboard88HandSample {
  readonly rotations: Float32Array;
  readonly root: Float32Array;
  readonly fingerWeights: Float32Array;
  readonly pins: readonly Keyboard88Pin[];
  pinCount: number;
  frameId: number;
  fromFrameId: number;
  alpha: number;
  exact: boolean;
}

export interface Keyboard88Sample {
  readonly right: Keyboard88HandSample;
  readonly left: Keyboard88HandSample;
}

export function createKeyboard88HandSample(
  atlas: Keyboard88Atlas,
  plan?: Keyboard88HandPlan
): Keyboard88HandSample {
  return {
    rotations: new Float32Array(atlas.boneNames.length * 4),
    root: new Float32Array(3),
    fingerWeights: new Float32Array(5),
    pins: Array.from({ length: plan?.pinCapacity ?? 5 }, () => ({
      finger: 0,
      frameIndex: 0,
      weight: 0
    })),
    pinCount: 0,
    frameId: 0,
    fromFrameId: 0,
    alpha: 1,
    exact: false
  };
}

export function createKeyboard88Sample(
  atlas: Keyboard88Atlas,
  plan?: Keyboard88Plan
): Keyboard88Sample {
  return {
    right: createKeyboard88HandSample(atlas, plan?.right),
    left: createKeyboard88HandSample(atlas, plan?.left)
  };
}

/** Writes a random-access sample into reusable buffers; no frame history, delta or timers. */
export function sampleKeyboard88HandLayer(
  atlas: Keyboard88Atlas,
  plan: Keyboard88HandPlan,
  songTime: number,
  out: Keyboard88HandSample
): Keyboard88HandSample {
  if (!Number.isFinite(songTime)) throw new Error("Invalid keyboard88 song time");
  let low = 0,
    high = plan.transitions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((plan.transitions[middle]?.start ?? Infinity) <= songTime) low = middle + 1;
    else high = middle;
  }
  const transition = plan.transitions[low - 1];
  const selection = transition?.selection ?? plan.initial;
  const offset = selection.frameIndex * out.rotations.length;
  const alpha = keyboard88MinJerk(
    transition
      ? transition.end <= transition.start
        ? 1
        : Math.min(
            1,
            Math.max(0, (songTime - transition.start) / (transition.end - transition.start))
          )
      : 1
  );
  if (transition && alpha < 1) {
    slerpKeyboard88Rotations(
      transition.fromRotations,
      transition.targetRotations,
      0,
      alpha,
      out.rotations
    );
  } else {
    for (let i = 0; i < out.rotations.length; i++) {
      out.rotations[i] = transition?.targetRotations[i] ?? atlas.rotations[offset + i] ?? 0;
    }
  }
  for (let i = 0; i < 3; i++) {
    const target = atlas.roots?.[selection.frameIndex * 3 + i] ?? 0;
    out.root[i] = transition
      ? (transition.fromRoot[i] ?? 0) * (1 - alpha) + target * alpha
      : target;
  }
  out.frameId = selection.frameId;
  out.fromFrameId = transition?.fromFrameId ?? selection.frameId;
  out.alpha = alpha;
  out.exact = selection.exact;
  return out;
}

/** Binary span lookup plus active overlaps only; buffers belong to this song's caller. */
export function sampleKeyboard88Hand(
  atlas: Keyboard88Atlas,
  plan: Keyboard88HandPlan,
  songTime: number,
  out: Keyboard88HandSample
): Keyboard88HandSample {
  sampleKeyboard88HandLayer(atlas, plan, songTime, out);
  out.pinCount = 0;
  for (let f = 0; f < plan.fingers.length; f++) {
    const finger = plan.fingers[f];
    if (!finger) continue;
    let low = 0,
      high = finger.spans.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((finger.spans[mid]?.start ?? Infinity) <= songTime) low = mid + 1;
      else high = mid;
    }
    let weight = 0,
      frameIndex = 0;
    const envelopes = finger.spans[low - 1]?.envelopes;
    if (envelopes)
      for (const envelope of envelopes) {
        const next = keyboard88PressWeight(envelope, songTime);
        if (next >= weight) {
          weight = next;
          frameIndex = envelope.frameIndex;
        }
        if (songTime >= envelope.onset && songTime < envelope.release) {
          const pin = out.pins[out.pinCount++];
          if (!pin) throw new Error("Keyboard88 sample needs this song's pin capacity");
          pin.finger = envelope.finger;
          pin.frameIndex = envelope.frameIndex;
          pin.weight = Math.min(
            keyboard88MinJerk((songTime - envelope.onset) / KEYBOARD88_PIN_PRESS_SECONDS),
            keyboard88MinJerk(
              (envelope.pinReleaseEnd - songTime) /
                (envelope.pinReleaseEnd - envelope.pinReleaseStart)
            )
          );
        }
      }
    out.fingerWeights[f] = weight;
    if (!weight) continue;
    for (const bone of finger.bones) {
      const offset = bone * 4;
      slerpKeyboard88Quaternion(
        out.rotations,
        offset,
        atlas.rotations,
        frameIndex * out.rotations.length + offset,
        weight,
        out.rotations,
        offset
      );
    }
  }
  // Clear unused slots as well, so deep snapshots are seek-independent.
  for (let i = out.pinCount; i < out.pins.length; i++) {
    const pin = out.pins[i];
    if (pin) {
      pin.finger = 0;
      pin.frameIndex = 0;
      pin.weight = 0;
    }
  }
  return out;
}

/** Left rotations are still right-atlas local rotations; the view's mirror adapter composes bones. */
export function sampleKeyboard88Plan(
  atlas: Keyboard88Atlas,
  plan: Keyboard88Plan,
  songTime: number,
  out: Keyboard88Sample = createKeyboard88Sample(atlas, plan)
): Keyboard88Sample {
  sampleKeyboard88Hand(atlas, plan.right, songTime, out.right);
  sampleKeyboard88Hand(atlas, plan.left, songTime, out.left);
  return out;
}
