import { describe, expect, it } from "vitest";

import { easePose, handPose, upcomingChord } from "./handPose";
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
