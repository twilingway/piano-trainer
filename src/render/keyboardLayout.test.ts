import { describe, expect, it } from "vitest";

import { parseMidiMessage } from "../input/midiInput";
import { layoutKeyboard } from "./keyboardLayout";

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

describe("parseMidiMessage", () => {
  it("reads note on, note off and the note-on-with-zero-velocity release", () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 100]))).toEqual({
      type: "down",
      pitch: 60,
      velocity: 100
    });
    expect(parseMidiMessage(new Uint8Array([0x91, 60, 0]))?.type).toBe("up");
    expect(parseMidiMessage(new Uint8Array([0x80, 60, 40]))?.type).toBe("up");
    expect(parseMidiMessage(new Uint8Array([0xb0, 64, 127]))).toBeUndefined();
  });
});
