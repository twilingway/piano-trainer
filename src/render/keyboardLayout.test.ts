import { describe, expect, it } from "vitest";

import { parseMidiMessage } from "../input/midiInput";
import { layoutKeyboard, whiteKeysBetween, widenRange } from "./keyboardLayout";

describe("layoutKeyboard", () => {
  const keys = layoutKeyboard(520);

  it("spreads 52 white keys over the width", () => {
    expect(keys.size).toBe(88);
    expect(keys.get(21)).toMatchObject({ black: false, x: 0, width: 10 });
    expect(keys.get(108)).toMatchObject({ black: false, x: 510 });
  });

  it("puts C sharp on the seam between C and D", () => {
    const c = keys.get(60);
    const cSharp = keys.get(61);
    if (!c || !cSharp) throw new Error("missing keys");
    expect(cSharp.black).toBe(true);
    expect(cSharp.x + cSharp.width / 2).toBeCloseTo(c.x + c.width);
  });
});

describe("layoutKeyboard with a range", () => {
  it("spreads only the chosen keys, widening a black edge to its white neighbour", () => {
    // C4 to C#5 becomes C4 to D5: nine white keys.
    const keys = layoutKeyboard(900, 60, 73);
    expect(keys.has(59)).toBe(false);
    expect(keys.get(60)).toMatchObject({ x: 0, width: 100 });
    expect(keys.get(74)).toMatchObject({ x: 800, width: 100 });
    expect(keys.has(75)).toBe(false);
  });
});

describe("parseMidiMessage", () => {
  it("reads note on, note off and the note-on-with-zero-velocity release", () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 100]))).toEqual({
      type: "down",
      pitch: 60,
      velocity: 100
    });
    expect(parseMidiMessage(new Uint8Array([0x91, 60, 0]))?.type).toBe("up");
    expect(parseMidiMessage(new Uint8Array([0x80, 60, 40]))?.type).toBe("up");
    expect(parseMidiMessage(new Uint8Array([0xe0, 0, 64]))).toBeUndefined();
  });

  it("reads the sustain pedal, pressed from value 64 up", () => {
    expect(parseMidiMessage(new Uint8Array([0xb0, 64, 127]))).toEqual({
      type: "pedal",
      down: true
    });
    expect(parseMidiMessage(new Uint8Array([0xb0, 64, 0]))).toEqual({ type: "pedal", down: false });
    expect(parseMidiMessage(new Uint8Array([0xb0, 7, 100]))).toBeUndefined();
  });
});

describe("widenRange", () => {
  it("adds white keys on both sides until the count is reached", () => {
    // C4-G4 is five white keys; four more, alternately below and above: A3-B4.
    const [low, high] = widenRange(60, 67, 9);
    expect(whiteKeysBetween(low, high)).toBe(9);
    expect(low).toBe(57);
    expect(high).toBe(71);
  });

  it("stops at the ends of the piano and leaves a wide range alone", () => {
    expect(widenRange(21, 30, 100)).toEqual([21, 108]);
    expect(widenRange(48, 84, 5)).toEqual([48, 84]);
  });
});
