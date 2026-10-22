import { keyboard88Assignment, selectKeyboard88Rest } from "./keyboard88Atlas";
import type {
  Keyboard88Assignment,
  Keyboard88Atlas,
  Keyboard88Hand,
  Keyboard88Index,
  Keyboard88RequestedNote,
  Keyboard88Selection
} from "./keyboard88Atlas";

/** Exhaustive selector from 744db3f, kept independent of the indexed candidate implementation. */
export function legacyKeyboard88Selection(
  index: Keyboard88Index,
  notes: readonly Keyboard88RequestedNote[],
  hand: Keyboard88Hand,
  previous?: Keyboard88Assignment
): Keyboard88Selection {
  if (!notes.length) return selectKeyboard88Rest(index, previous, hand);
  let best: Keyboard88Selection | undefined;
  let bestRank: readonly number[] = [Infinity];
  index.atlas.frames.forEach((frame, frameIndex) => {
    const assignment = keyboard88Assignment(frame, hand);
    let requestedMask = 0,
      distance = 0;
    const resolved = notes.map((note) => {
      let finger = 1,
        nearest = Infinity;
      if (
        note.finger !== undefined &&
        Number.isInteger(note.finger) &&
        note.finger >= 1 &&
        note.finger <= 5
      ) {
        finger = note.finger;
      } else {
        for (let i = 0; i < 5; i++) {
          const next = Math.abs(note.midi - (assignment[i] ?? NaN));
          if (next < nearest) {
            nearest = next;
            finger = i + 1;
          }
        }
      }
      requestedMask |= 1 << (finger - 1);
      distance += Math.abs(note.midi - (assignment[finger - 1] ?? NaN));
      return { id: note.id, finger };
    });
    const maskMatches = frame.pressedMask === requestedMask;
    const rank = [
      Number(!maskMatches),
      distance,
      Number(!previous || !assignment.every((midi, i) => midi === previous[i])),
      frame.id
    ];
    let lower = false;
    for (let i = 0; i < rank.length; i++) {
      if (rank[i] !== bestRank[i]) {
        lower = (rank[i] ?? Infinity) < (bestRank[i] ?? Infinity);
        break;
      }
    }
    if (lower) {
      bestRank = rank;
      best = {
        frameIndex,
        frameId: frame.id,
        assignment,
        pressedMask: frame.pressedMask,
        requestedMask,
        distance,
        exact: maskMatches && distance === 0,
        notes: resolved
      };
    }
  });
  if (!best) throw new Error("Keyboard88 selection has no finite candidate");
  return best;
}

export function generatedKeyboard88Atlas(): Keyboard88Atlas {
  const frames = Array.from({ length: 1215 }, (_, i) => {
    const root = 36 + Math.floor(i / 32);
    return {
      id: 1522 - i,
      assignment: [root, root + 2, root + 4, root + 5, root + 7] as Keyboard88Assignment,
      pressedMask: i % 32
    };
  });
  return {
    frames,
    boneNames: ["Pelvis"],
    rotations: new Float32Array(frames.flatMap(() => [0, 0, 0, 1]))
  };
}
