import { describe, expect, it } from "vitest";

import { noteGlyph } from "./noteGlyph";

describe("noteGlyph", () => {
  it("names the plain values", () => {
    expect(noteGlyph(4)).toEqual({ kind: "whole", dotted: false });
    expect(noteGlyph(2)).toEqual({ kind: "half", dotted: false });
    expect(noteGlyph(1)).toEqual({ kind: "quarter", dotted: false });
    expect(noteGlyph(0.5)).toEqual({ kind: "eighth", dotted: false });
    expect(noteGlyph(0.25)).toEqual({ kind: "sixteenth", dotted: false });
  });

  it("dots a value and a half", () => {
    expect(noteGlyph(3)).toEqual({ kind: "half", dotted: true });
    expect(noteGlyph(1.5)).toEqual({ kind: "quarter", dotted: true });
  });

  it("takes the longest value that fits for a tied length", () => {
    // Half tied to an eighth: a dotted half (3) is too long.
    expect(noteGlyph(2.5)).toEqual({ kind: "half", dotted: false });
  });

  it("forgives a length measured a little short", () => {
    expect(noteGlyph(0.98)).toEqual({ kind: "quarter", dotted: false });
  });

  it("draws anything shorter than a sixteenth as one", () => {
    expect(noteGlyph(0.1)).toEqual({ kind: "sixteenth", dotted: false });
  });
});
