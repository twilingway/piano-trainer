import type { Keyboard88Atlas } from "./keyboard88Atlas";
import type { Keyboard88HandPlan, Keyboard88Plan } from "./keyboard88Plan";
import { slerpKeyboard88Rotations } from "./keyboard88Quaternion";

export interface Keyboard88HandSample {
  readonly rotations: Float32Array;
  readonly root: Float32Array;
  frameId: number;
  fromFrameId: number;
  alpha: number;
  exact: boolean;
}

export interface Keyboard88Sample {
  readonly right: Keyboard88HandSample;
  readonly left: Keyboard88HandSample;
}

export function createKeyboard88HandSample(atlas: Keyboard88Atlas): Keyboard88HandSample {
  return {
    rotations: new Float32Array(atlas.boneNames.length * 4),
    root: new Float32Array(3),
    frameId: 0,
    fromFrameId: 0,
    alpha: 1,
    exact: false
  };
}

export function createKeyboard88Sample(atlas: Keyboard88Atlas): Keyboard88Sample {
  return { right: createKeyboard88HandSample(atlas), left: createKeyboard88HandSample(atlas) };
}

/** Writes a random-access sample into reusable buffers; no frame history, delta or timers. */
export function sampleKeyboard88Hand(
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
  const alpha = transition
    ? transition.end <= transition.start
      ? 1
      : Math.min(
          1,
          Math.max(0, (songTime - transition.start) / (transition.end - transition.start))
        )
    : 1;
  if (transition && alpha < 1) {
    slerpKeyboard88Rotations(
      transition.fromRotations,
      atlas.rotations,
      offset,
      alpha,
      out.rotations
    );
  } else {
    for (let i = 0; i < out.rotations.length; i++) {
      out.rotations[i] = atlas.rotations[offset + i] ?? 0;
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

/** Left rotations are still right-atlas local rotations; the view's mirror adapter composes bones. */
export function sampleKeyboard88Plan(
  atlas: Keyboard88Atlas,
  plan: Keyboard88Plan,
  songTime: number,
  out: Keyboard88Sample = createKeyboard88Sample(atlas)
): Keyboard88Sample {
  sampleKeyboard88Hand(atlas, plan.right, songTime, out.right);
  sampleKeyboard88Hand(atlas, plan.left, songTime, out.left);
  return out;
}
