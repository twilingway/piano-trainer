import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { nextSamePitchStarts, separateRepeatTail } from "./noteSeparation";

const note = (id: string, start: number, pitch = 60): SongNote => ({
  id,
  start,
  pitch,
  startBeat: start * 2,
  duration: 0.02,
  hand: "right"
});

describe("repeated note separation after readability expansion", () => {
  it("finds distinct attacks by pitch without changing song data or relying on input order", () => {
    const input = [
      note("later", 0.12),
      note("first", 0),
      note("second", 0.06),
      note("other", 0.03, 62)
    ];
    const before = structuredClone(input);
    const following = nextSamePitchStarts(input);
    expect(following.get("first")).toBe(0.06);
    expect(following.get("second")).toBe(0.12);
    expect(following.has("later")).toBe(false);
    expect(following.has("other")).toBe(false);
    expect(input).toEqual(before);
  });
  it("does not split simultaneous same-pitch chord voices into false reattacks", () => {
    const following = nextSamePitchStarts([note("a", 0), note("b", 0), note("c", 0.1)]);
    expect(following.get("a")).toBe(0.1);
    expect(following.get("b")).toBe(0.1);
  });
  it("clips an inflated far tail to the next head plus a screen-space gap", () => {
    expect(separateRepeatTail(250, 400, 380)).toBe(383);
    expect(separateRepeatTail(250, 400, 380, 0.5)).toBe(386);
    expect(separateRepeatTail(250, 400, 380, -0.5)).toBe(386);
  });
  it("preserves a tiny body and never extends into the next attack", () => {
    const top = separateRepeatTail(200, 400, 399, 0.01);
    expect(top).toBeCloseTo(399.3);
    expect(top).toBeLessThan(400);
    expect(separateRepeatTail(390, 400, 380)).toBe(390);
  });
  it("consumes the previous visual hold when the next attack reaches the hit line", () => {
    expect(separateRepeatTail(200, 400, 400)).toBe(400);
    expect(separateRepeatTail(200, 400, 410)).toBe(400);
  });
  it("leaves malformed projection data harmless", () => {
    expect(separateRepeatTail(300, 400, 380, NaN)).toBe(300);
  });
});
