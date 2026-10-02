import { describe, expect, it } from "vitest";
import { correctedInputTime, performanceToAudio, SongTimeline } from "./timing";

describe("SongTimeline", () => {
  it("maps paused and resumed intervals without losing late input timestamps", () => {
    const clock = new SongTimeline();
    clock.reset(1000, -2, 0.5);
    clock.anchor(3000, -1, 0, false);
    clock.anchor(5000, -1, 0.5);
    expect(clock.at(2000, true)).toBe(-1.5);
    expect(clock.at(4000, true)).toBeUndefined();
    expect(clock.at(6000)).toBe(-0.5);
    expect(clock.performanceAt(0)).toBe(7000);
  });
  it("keeps a wait plateau accepting input and invalidates old intervals on seek", () => {
    const clock = new SongTimeline();
    clock.reset(0, -2, 1);
    clock.anchor(2000, 0, 0);
    expect(clock.at(8000, true)).toBe(0);
    expect(clock.performanceAt(1)).toBeUndefined();
    clock.reset(9000, 4, 1);
    expect(clock.at(2000, true)).toBeUndefined();
  });
  it("keeps audio, visual and input correction separate", () => {
    expect(correctedInputTime(1000, 36, -5)).toBe(969);
    expect(performanceToAudio(1500, { performanceMs: 1000, audioSeconds: 4 })).toBe(4.5);
  });
});
