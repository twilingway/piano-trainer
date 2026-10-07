import { mkdir, writeFile } from "node:fs/promises";
import type { Finger } from "../../fingering/fingering";
import { HandSprings, knuckleSide, liveTarget } from "./handMotion.ts";
import { LIFT_S, STRIKE_S, planHand } from "./handPlacement.ts";
import type { FingeredNote } from "./handPlacement.ts";

// The live hand on one phrase, frame by frame, for Blender (tools/hand-rig/live_demo.py) to key.
// Run with: node --experimental-strip-types src/render/three/handDemo.ts
const FPS = 30;
const BEAT = 0.4;

const C4 = 60;
const phrase: (readonly [beat: number, beats: number, pitch: number, finger: Finger])[] = [
  // Five fingers up and down: the hand stays.
  ...([0, 2, 4, 5, 7, 5, 4, 2, 0] as const).map(
    (step, index) =>
      [index, 1, C4 + step, ([1, 2, 3, 4, 5, 4, 3, 2, 1] as const)[index] ?? 1] as const
  ),
  // A triad, then a stretch of the fifth finger to A and the index finger to E flat.
  [9, 2, C4, 1],
  [9, 2, C4 + 4, 3],
  [9, 2, C4 + 7, 5],
  [11, 1, C4, 1],
  [12, 1, C4 + 9, 5],
  [13, 1, C4 + 3, 2],
  // The thumb to F: out of reach, the hand moves; then back to C.
  [15, 1, C4 + 5, 1],
  [16, 1, C4 + 7, 2],
  [17, 1, C4 + 9, 3],
  [18, 1, C4 + 11, 4],
  [19, 2, C4 + 12, 5],
  [22, 2, C4, 1]
];
const notes: FingeredNote[] = phrase.map(([beat, beats, pitch, finger], index) => ({
  start: beat * BEAT,
  duration: beats * BEAT * 0.95,
  pitch,
  finger,
  // A player's uneven touch: velocities 70..109.
  velocity: 70 + ((index * 37) % 40)
}));

const plan = planHand(notes, "right");
if (!plan) throw new Error("The phrase has no fingered note");
const end = Math.max(...notes.map((note) => note.start + note.duration)) + 0.5;
/** The finger touches its key only near the end of its way down; the key travels the rest. */
const TOUCH = 0.6;
const springs = new HandSprings();
const frames = [];
for (let frame = 0; frame <= Math.ceil(end * FPS); frame++) {
  const time = frame / FPS - 0.3;
  const hand = springs.step(liveTarget(plan, time), 1 / FPS);
  // A key goes down under the finger on it, from the strike until the finger has lifted.
  const keys: Record<number, number> = {};
  for (const note of notes) {
    if (note.finger === undefined) continue;
    if (time < note.start - STRIKE_S || time > note.start + note.duration + LIFT_S) continue;
    const dip = (hand.fingers[note.finger].bend[0] - TOUCH) / (1 - TOUCH);
    keys[note.pitch] = Math.max(keys[note.pitch] ?? 0, Math.min(1, Math.max(0, dip)));
  }
  const fingers = Object.fromEntries(
    ([1, 2, 3, 4, 5] as const).map((finger) => [
      finger,
      { ...hand.fingers[finger], side: knuckleSide(hand, finger) }
    ])
  );
  frames.push({ anchor: hand.anchor, wrist: hand.wrist, fingers, keys });
}
const out = new URL("../../../blender/exports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(
  new URL("hand-demo.json", out),
  JSON.stringify({ fps: FPS, hand: "right", frames })
);
console.log(
  `hand-demo.json: ${frames.length.toString()} frames, ${plan.moves.length.toString()} moves`
);
