// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { hasCompactInitialTempo } from "./staffTempoLayout";

const direction =
  "<direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>152</per-minute></metronome></direction-type></direction>";
const score = (measures: string) =>
  `<score-partwise><part id="P1">${measures}</part></score-partwise>`;

describe("compact initial tempo", () => {
  it("allows a single initial mark, including a pickup and dotted duration", () => {
    expect(
      hasCompactInitialTempo(
        score(`<measure number="0">${direction}</measure><measure number="1"/>`)
      )
    ).toBe(true);
  });
  it("leaves tempo changes above the staff so they do not overlap later notes", () => {
    expect(
      hasCompactInitialTempo(
        score(
          `<measure number="1">${direction}</measure><measure number="2">${direction}</measure>`
        )
      )
    ).toBe(false);
  });
  it("leaves a mark first appearing in a later measure above the staff", () => {
    expect(
      hasCompactInitialTempo(
        score(`<measure number="1"/><measure number="2">${direction}</measure>`)
      )
    ).toBe(false);
  });
  it("handles namespaced scores", () => {
    expect(
      hasCompactInitialTempo(
        score(`<measure>${direction}</measure>`).replace(
          "<score-partwise>",
          '<score-partwise xmlns="http://www.musicxml.org/ns/musicxml">'
        )
      )
    ).toBe(true);
  });
  it("keeps a mark after notes in the first measure above the staff", () => {
    expect(
      hasCompactInitialTempo(
        score(`<measure><note><duration>1</duration></note>${direction}</measure>`)
      )
    ).toBe(false);
  });
  it("keeps an offset mark above the staff", () => {
    expect(
      hasCompactInitialTempo(
        score(
          `<measure>${direction.replace("</direction>", "<offset>1</offset></direction>")}</measure>`
        )
      )
    ).toBe(false);
  });
  it("does not compact a score without a mark or invalid XML", () => {
    expect(hasCompactInitialTempo(score('<measure number="1"/>'))).toBe(false);
    expect(hasCompactInitialTempo("<broken")).toBe(false);
  });
});
