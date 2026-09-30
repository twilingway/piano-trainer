export type GlyphKind = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

/** A written note value: which symbol, and whether it carries a dot. */
export interface NoteGlyph {
  readonly kind: GlyphKind;
  readonly dotted: boolean;
}

const VALUES: readonly (readonly [GlyphKind, number])[] = [
  ["whole", 4],
  ["half", 2],
  ["quarter", 1],
  ["eighth", 0.5],
  ["sixteenth", 0.25]
];

/**
 * Slack for a duration measured from seconds rather than read off the
 * score: a quarter that comes back as 0.98 is still a quarter.
 */
const TOLERANCE = 0.05;

/**
 * The note value to draw for a duration in quarter notes: the longest
 * written value, plain or dotted, that does not exceed it. A tied half and
 * eighth (2.5) is drawn as a half; anything under a sixteenth as one.
 */
export function noteGlyph(quarters: number): NoteGlyph {
  const limit = quarters * (1 + TOLERANCE);
  let best: NoteGlyph & { readonly value: number } = {
    kind: "sixteenth",
    dotted: false,
    value: 0
  };
  for (const [kind, value] of VALUES) {
    for (const dotted of [false, true]) {
      const length = dotted ? value * 1.5 : value;
      if (length <= limit && length > best.value) best = { kind, dotted, value: length };
    }
  }
  return { kind: best.kind, dotted: best.dotted };
}
