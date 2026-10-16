import { describe, expect, it } from "vitest";
import { overlappingInkSpace, staffNoteInk } from "./uniformStaffInk";

/** Captured VexFlow contract: absoluteX=100, 12px head; headBegin and stem
 * include the voice displacement, while a LEFT modifier starts at absoluteX-2.
 * The natural glyph is physically at x=80..88 for either voice displacement.
 */
function shiftedNote(shift: number): Parameters<typeof staffNoteInk>[0] {
  return {
    getYs: () => [60],
    getMetrics: () => ({
      noteWidth: 12,
      extraLeftPx: 0,
      extraRightPx: 0,
      modLeftPx: 18,
      modRightPx: 0
    }),
    getGlyphWidth: () => 12,
    getXShift: () => shift,
    getNoteHeadBeginX: () => 100 + shift,
    getModifierStartXY: () => ({ x: 98, y: 60 }),
    getModifiers: () => [
      {
        getCategory: () => "accidentals",
        getPosition: () => 1,
        getIndex: () => 0,
        getXShift: () => -10,
        getWidth: () => 8,
        y_shift: 0,
        glyph: {
          bbox: { getX: () => 0, getY: () => -15, getW: () => 8, getH: () => 30 },
          originShift: { x: -8, y: 0 }
        }
      }
    ],
    hasStem: () => true,
    getStemExtents: () => ({ topY: 25, baseY: 60 }),
    getStemX: () => 111 + shift,
    getStemDirection: () => 1,
    hasFlag: () => true,
    beam: null,
    renderFlag: true,
    stem: { getHeight: () => 35 },
    flag: {
      bbox: { getX: () => 0, getY: () => 0, getW: () => 10, getH: () => 12 },
      originShift: { x: 0, y: 0 }
    }
  };
}

describe("staff ink in the shared attack coordinate system", () => {
  it.each([12, -9])("normalizes heads, natural, stem and flag for voice shift %s", (shift) => {
    const [head, accidental, stem, flag] = staffNoteInk(shiftedNote(shift));
    expect(head).toMatchObject({ left: 8 - shift, right: 8 + shift });
    // The actual natural outline stays at x=80..88 relative to attack x=106.
    expect(accidental).toMatchObject({ left: 26, right: -18 });
    expect(stem).toMatchObject({ left: -4 - shift, right: 6 + shift });
    expect(flag).toMatchObject({ left: -5 - shift, right: 15 + shift });
  });

  it("reserves the physical shifted flag against a following head", () => {
    const flag = staffNoteInk(shiftedNote(12))[3];
    if (!flag) throw new Error("Missing flag in regression fixture");
    expect(overlappingInkSpace([flag], [{ left: 6, right: 6, top: 24, bottom: 30 }])).toBe(33);
    expect(overlappingInkSpace([flag], [{ left: 6, right: 6, top: 100, bottom: 110 }])).toBe(0);
  });
});
