import { describe, expect, it } from "vitest";
import type { Finger } from "../../fingering/fingering";
import { LIFT_S, PREP_S, STRIKE_S, placeHand, planHand, whitePosition } from "./handPlacement";
import type { FingeredNote } from "./handPlacement";

const C4 = 60,
  D4 = 62,
  E4 = 64,
  F4 = 65,
  G4 = 67,
  A4 = 69,
  B4 = 71,
  C3 = 48,
  G3 = 55;

/** One note a beat (0.5 s), each half a second long. */
function line(...pairs: readonly (readonly [number, Finger | undefined])[]): FingeredNote[] {
  return pairs.map(([pitch, finger], index) => ({
    start: index * 0.5,
    duration: 0.5,
    pitch,
    finger
  }));
}

function plan(notes: readonly FingeredNote[], hand: "left" | "right" = "right") {
  const planned = planHand(notes, hand);
  if (!planned) throw new Error("no plan");
  return planned;
}

describe("whitePosition", () => {
  it("counts white keys from C4 and puts a black key on the seam", () => {
    expect(whitePosition(C4)).toBe(0);
    expect(whitePosition(G4)).toBe(4);
    expect(whitePosition(61)).toBe(0.5);
    expect(whitePosition(C3)).toBe(-7);
    expect(whitePosition(70)).toBe(5.5);
  });
});

describe("planHand", () => {
  it("has no plan without a fingered note", () => {
    expect(planHand(line([C4, undefined]), "right")).toBeUndefined();
  });

  it("keeps the hand still over five fingers up and down", () => {
    const notes = line(
      [C4, 1],
      [D4, 2],
      [E4, 3],
      [F4, 4],
      [G4, 5],
      [F4, 4],
      [E4, 3],
      [D4, 2],
      [C4, 1]
    );
    const planned = plan(notes);
    expect(planned.first).toBe(0);
    expect(planned.moves).toEqual([]);
    // Each finger is down on its own key at its note and up between.
    const at = placeHand(planned, 1.25);
    expect(at.fingers[3].press).toBe(1);
    expect(at.fingers[3].offset).toBe(0);
    expect(at.fingers[1].press).toBe(0);
  });

  it("stretches the fifth finger to A without moving the hand", () => {
    const notes = line([C4, 1], [G4, 5], [C4, 1], [A4, 5]);
    const planned = plan(notes);
    expect(planned.moves).toEqual([]);
    const at = placeHand(planned, 1.6);
    expect(at.anchor).toBe(0);
    expect(at.fingers[5].offset).toBe(1);
    expect(at.fingers[5].press).toBe(1);
  });

  it("moves the hand when the thumb goes to F and arrives at the strike", () => {
    const notes = line([C4, 1], [E4, 3], [G4, 5], [F4, 1], [A4, 3]);
    const planned = plan(notes);
    expect(planned.moves).toHaveLength(1);
    const [move] = planned.moves;
    expect(move?.from).toBe(0);
    expect(move?.to).toBe(3);
    expect(move?.arrive).toBe(1.5);
    // The hand leaves once G is released, no sooner than the lead.
    expect(placeHand(planned, 1.2).anchor).toBe(0);
    expect(placeHand(planned, 1.5).anchor).toBe(3);
    expect(placeHand(planned, 1.4).anchor).toBeGreaterThan(0);
    expect(placeHand(planned, 1.6).fingers[1].offset).toBe(0);
    expect(placeHand(planned, 2.1).fingers[3].offset).toBe(0);
  });

  it("puts the hand between the notes of a chord no position reaches", () => {
    // C and C two octaves up with 1 and 5: no position reaches both.
    const planned = plan([
      { start: 0, duration: 1, pitch: C4, finger: 1 },
      { start: 0, duration: 1, pitch: 84, finger: 5 }
    ]);
    expect(planned.first).toBe(5);
  });

  it("ignores a note without a finger", () => {
    const planned = plan(line([C4, 1], [B4, undefined], [E4, 3]));
    expect(planned.moves).toEqual([]);
    const at = placeHand(planned, 0.75);
    for (const finger of [1, 2, 3, 4, 5] as const) expect(at.fingers[finger].press).toBe(0);
  });

  it("runs the left hand down the keyboard from the thumb", () => {
    // Left hand five-finger position C3..G3: the thumb on G3, the fifth finger on C3.
    const planned = plan(line([G3, 1], [C3, 5]), "left");
    expect(planned.first).toBe(whitePosition(G3));
    expect(planned.moves).toEqual([]);
    expect(placeHand(planned, 0.75).fingers[5].offset).toBe(0);
  });
});

describe("placeHand", () => {
  it("lifts a finger between two strikes of the same key", () => {
    const planned = plan(line([E4, 3], [E4, 3]));
    expect(placeHand(planned, 0.25).fingers[3].press).toBe(1);
    // Between the notes the finger comes up before striking again.
    const between = [0.36, 0.38, 0.4, 0.42].map(
      (time) => placeHand(planned, time).fingers[3].press
    );
    expect(Math.min(...between)).toBeLessThan(0.5);
    expect(placeHand(planned, 0.5).fingers[3].press).toBe(1);
  });

  it("goes down before the strike and up after the release, smoothly", () => {
    const planned = plan([{ start: 1, duration: 0.5, pitch: E4, finger: 3 }]);
    expect(placeHand(planned, 1 - STRIKE_S).fingers[3].press).toBe(0);
    const half = placeHand(planned, 1 - STRIKE_S / 2).fingers[3].press;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(placeHand(planned, 1).fingers[3].press).toBe(1);
    expect(placeHand(planned, 1.5 + LIFT_S).fingers[3].press).toBe(0);
  });

  it("reaches for a black key during the rest before it", () => {
    // Index finger on D, a long rest, then E flat with the same finger.
    const planned = plan([
      { start: 0, duration: 0.5, pitch: C4, finger: 1 },
      { start: 0, duration: 0.5, pitch: G4, finger: 5 },
      { start: 2, duration: 0.5, pitch: 63, finger: 2 }
    ]);
    const strike = 2 - STRIKE_S;
    const early = placeHand(planned, 1).fingers[2];
    expect(early.offset).toBe(0);
    expect(early.depth).toBe(0);
    const reaching = placeHand(planned, strike - PREP_S / 2).fingers[2];
    expect(reaching.offset).toBeGreaterThan(0);
    expect(reaching.depth).toBeGreaterThan(0);
    const ready = placeHand(planned, strike).fingers[2];
    expect(ready.offset).toBe(0.5);
    expect(ready.depth).toBe(1);
  });
});
