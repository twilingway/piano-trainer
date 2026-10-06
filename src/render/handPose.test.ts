import { describe, expect, it } from "vitest";

import {
  blendPose,
  chordGlide,
  easePose,
  handPose,
  handHintChord,
  upcomingChord
} from "./handPose";
import { layoutKeyboard } from "./keyboardLayout";

// C4 to C6: fifteen white keys of 20 px.
const keys = layoutKeyboard(300, 60, 84);
const middle = (pitch: number) => {
  const key = keys.get(pitch);
  if (!key) throw new Error(`no key ${String(pitch)}`);
  return key.x + key.width / 2;
};

describe("handPose", () => {
  it("puts 1-3-5 over a C major triad and the free fingers between them", () => {
    const pose = handPose(
      "right",
      [
        { pitch: 60, finger: 1 },
        { pitch: 64, finger: 3 },
        { pitch: 67, finger: 5 }
      ],
      keys
    );
    expect(pose?.tips[1].x).toBe(middle(60));
    expect(pose?.tips[3].x).toBe(middle(64));
    expect(pose?.tips[5].x).toBe(middle(67));
    expect(pose?.tips[2].x).toBe((middle(60) + middle(64)) / 2);
    expect(pose?.tips[4].x).toBe((middle(64) + middle(67)) / 2);
    expect([...(pose?.down ?? [])].sort()).toEqual([1, 3, 5]);
  });

  it("runs the left hand down the keyboard from the thumb", () => {
    const pose = handPose("left", [{ pitch: 72, finger: 1 }], keys);
    expect(pose?.tips[1].x).toBe(middle(72));
    expect(pose?.tips[2].x).toBe(middle(72) - 20);
    expect(pose?.tips[5].x).toBe(middle(72) - 80);
  });

  it("reaches in for a black key", () => {
    const pose = handPose("right", [{ pitch: 66, finger: 3 }], keys);
    expect(pose?.tips[3]).toEqual({ x: middle(66), reach: 1 });
    expect(pose?.tips[4].reach).toBe(0);
  });

  it("lays the free fingers a key apart below the only placed one", () => {
    // Right hand, only the fifth finger on G: the thumb lies four keys lower, on C.
    const pose = handPose("right", [{ pitch: 67, finger: 5 }], keys);
    expect(pose?.tips[4].x).toBe(middle(67) - 20);
    expect(pose?.tips[1].x).toBe(middle(67) - 80);
  });

  it("keeps the first key of a finger given two", () => {
    const pose = handPose(
      "right",
      [
        { pitch: 60, finger: 1 },
        { pitch: 62, finger: 1 }
      ],
      keys
    );
    expect(pose?.tips[1].x).toBe(middle(60));
  });

  it("keeps the last pose, lifted, when nothing is fingered", () => {
    const before = handPose("right", [{ pitch: 60, finger: 1 }], keys);
    const after = handPose("right", [{ pitch: 62 }], keys, before);
    expect(after?.tips).toEqual(before?.tips);
    expect(after?.down.size).toBe(0);
    expect(handPose("right", [], keys)).toBeUndefined();
  });
});

describe("upcomingChord", () => {
  it("keeps a short active note until its end before moving to the next finger", () => {
    const melody = [
      { id: "thumb", start: 0, duration: 0.18, finger: 1 },
      { id: "index", start: 0.18, duration: 0.18, finger: 2 }
    ];
    expect(upcomingChord(melody, 0)?.notes.map((n) => n.finger)).toEqual([1]);
    expect(upcomingChord(melody, 0.17)?.notes.map((n) => n.finger)).toEqual([1]);
    expect(upcomingChord(melody, 0.18)?.notes.map((n) => n.finger)).toEqual([2]);
  });
  const note = (id: string, start: number, duration = 0.5) => ({ id, start, duration });
  const notes = [note("a", 0), note("b", 0.01), note("c", 1), note("d", 2)];

  it("holds the sounding chord, then moves to the next one", () => {
    expect(upcomingChord(notes, 0.2)?.notes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(upcomingChord(notes, 0.6)).toMatchObject({ start: 1, notes: [{ id: "c" }] });
    expect(upcomingChord(notes, 3)).toBeUndefined();
  });

  it("does not take a note just after the chord's window into the chord", () => {
    const late = [note("a", 0), note("b", 0.05)];
    expect(upcomingChord(late, 0.01)?.notes.map((n) => n.id)).toEqual(["a"]);
  });

  it("follows the notes played over a held bass", () => {
    const bass = [note("bass", 0, 4), note("x", 1), note("y", 2)];
    expect(upcomingChord(bass, 1.2)).toMatchObject({ start: 1, notes: [{ id: "x" }] });
    expect(upcomingChord(bass, 2.1)).toMatchObject({ start: 2, notes: [{ id: "y" }] });
    expect(upcomingChord(bass, 3)).toMatchObject({ start: 0, notes: [{ id: "bass" }] });
  });
});

describe("handHintChord", () => {
  const thumb = { start: 0, duration: 0.1, finger: 1 };
  const index = { start: 0.1, duration: 0.1, finger: 2 };
  it("pins the pending note even when the visual clock has passed its end", () => {
    expect(handHintChord([thumb, index], 0.15, [thumb])?.notes).toEqual([thumb]);
  });
  it("pins every pending chord member until it is played", () => {
    const chordIndex = { ...index, start: 0 };
    expect(handHintChord([thumb, chordIndex], 1, [thumb, chordIndex])?.notes).toEqual([
      thumb,
      chordIndex
    ]);
  });
  it("retains the full chord pose as its notes are pressed separately", () => {
    const chordIndex = { ...index, start: 0.02 };
    const chord = [thumb, chordIndex];
    expect(handHintChord(chord, 1, chord)?.notes).toEqual(chord);
    expect(handHintChord(chord, 1, [chordIndex])?.notes).toEqual(chord);
    expect(handHintChord(chord, 1, [thumb])?.notes).toEqual(chord);
  });
  it("does not reuse played members of a previous nearby chord", () => {
    const chordIndex = { ...index, start: 0.02 };
    const next = { ...index, start: 0.04 };
    expect(handHintChord([thumb, chordIndex, next], 1, [next])?.notes).toEqual([next]);
  });
  it("includes every pending member when the session's chord window advances", () => {
    const chordIndex = { ...index, start: 0.02 };
    const next = { ...index, start: 0.04 };
    expect(handHintChord([thumb, chordIndex, next], 1, [chordIndex, next])?.notes).toEqual([
      thumb,
      chordIndex,
      next
    ]);
  });
  it("resumes the visual melody when the session no longer waits", () => {
    expect(handHintChord([thumb, index], 0.15, [])?.notes).toEqual([index]);
  });
  it("does not predict the other hand while any note of the current chord is unplayed", () => {
    expect(handHintChord([index], 0, [], true)).toBeUndefined();
    expect(handHintChord([thumb], 0, [thumb], true)?.notes).toEqual([thumb]);
    expect(handHintChord([index], 0, [], false)?.notes).toEqual([index]);
  });
});

describe("easePose", () => {
  it("moves part of the way, more with a longer frame", () => {
    const from = handPose("right", [{ pitch: 60, finger: 1 }], keys);
    const to = handPose("right", [{ pitch: 67, finger: 1 }], keys);
    if (!from || !to) throw new Error("no pose");
    const short = easePose(from, to, 0.01, 0.1).tips[1].x;
    const long = easePose(from, to, 0.1, 0.1).tips[1].x;
    expect(short).toBeGreaterThan(middle(60));
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(middle(67));
    expect(easePose(undefined, to, 0.01, 0.1)).toBe(to);
  });

  it("gets as far in two half frames as in one whole frame", () => {
    const from = handPose("right", [{ pitch: 60, finger: 1 }], keys);
    const to = handPose("right", [{ pitch: 66, finger: 1 }], keys);
    if (!from || !to) throw new Error("no pose");
    const once = easePose(from, to, 0.1, 0.12);
    const twice = easePose(easePose(from, to, 0.05, 0.12), to, 0.05, 0.12);
    expect(twice.tips[1].x).toBeCloseTo(once.tips[1].x, 9);
    // Onto a black key the tip slides in with the hand rather than jumping.
    expect(once.tips[1].reach).toBeGreaterThan(0);
    expect(once.tips[1].reach).toBeLessThan(1);
  });
});

describe("chordGlide", () => {
  const note = (id: string, start: number, duration = 0.1) => ({ id, start, duration });
  const ids = (chord: { notes: readonly { id: string }[] }) => chord.notes.map((n) => n.id);

  it("rests on a chord while it is held", () => {
    const melody = [note("a", 0), note("b", 1)];
    const glide = chordGlide(melody, 0.05, 0.3);
    expect(glide && ids(glide.to)).toEqual(["a"]);
    expect(glide?.progress).toBe(1);
  });

  it("glides over the whole pause once the chord is released, easing in and out", () => {
    const melody = [note("a", 0), note("b", 1)];
    const early = chordGlide(melody, 0.12, 0.3);
    const middle = chordGlide(melody, 0.55, 0.3);
    const end = chordGlide(melody, 0.99, 0.3);
    expect(middle && [ids(middle.from), ids(middle.to)]).toEqual([["a"], ["b"]]);
    expect(early?.progress).toBeLessThan(0.01);
    expect(middle?.progress).toBeCloseTo(0.5);
    expect(end?.progress).toBeGreaterThan(0.99);
  });

  it("leaves right after the strike when the chord is held into the next", () => {
    const legato = [note("a", 0, 1), note("b", 1)];
    expect(chordGlide(legato, 0.5, 0.3)?.progress).toBeCloseTo(0.5);
  });

  it("leaves at least the lead after a late release", () => {
    const late = [note("a", 0, 0.95), note("b", 1)];
    expect(chordGlide(late, 0.65, 0.3)?.progress).toBe(1);
    expect(chordGlide(late, 0.85, 0.3)?.progress).toBeCloseTo(0.5);
  });

  it("starts a glide no earlier than the chord it leaves", () => {
    const fast = [note("a", 0, 0.15), note("b", 0.15, 0.15), note("c", 0.3)];
    expect(chordGlide(fast, 0.001, 0.3)?.progress).toBeLessThan(0.01);
    expect(chordGlide(fast, 0.075, 0.3)?.progress).toBeCloseTo(0.5);
    const landed = chordGlide(fast, 0.15, 0.3);
    expect(landed && ids(landed.from)).toEqual(["b"]);
    expect(landed && ids(landed.to)).toEqual(["b"]);
  });

  it("keeps an unevenly struck chord whole", () => {
    const chord = [note("a", 0), note("b", 0.02), note("c", 1)];
    const glide = chordGlide(chord, 0.01, 0.3);
    expect(glide && ids(glide.to)).toEqual(["a", "b"]);
  });

  it("waits on the first chord and stays on the last", () => {
    const melody = [note("a", 1), note("b", 2)];
    const before = chordGlide(melody, 0, 0.3);
    expect(before && ids(before.to)).toEqual(["a"]);
    const after = chordGlide(melody, 5, 0.3);
    expect(after && ids(after.to)).toEqual(["b"]);
    expect(chordGlide([], 0, 0.3)).toBeUndefined();
  });
});

describe("blendPose", () => {
  it("puts every tip part of the way and takes the target's fingers down", () => {
    const from = handPose("right", [{ pitch: 60, finger: 1 }], keys);
    const to = handPose("right", [{ pitch: 64, finger: 3 }], keys);
    if (!from || !to) throw new Error("no pose");
    const half = blendPose(from, to, 0.5);
    expect(half.tips[1].x).toBeCloseTo((from.tips[1].x + to.tips[1].x) / 2);
    expect([...half.down]).toEqual([3]);
  });
});
