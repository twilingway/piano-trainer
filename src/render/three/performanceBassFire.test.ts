import { describe, expect, it } from "vitest";
import { BASS_FIRE_SECONDS, bassFireStrength, performanceBassOnsets } from "./performanceBassFire";

describe("bass fire", () => {
  it("takes the lowest note of each left-hand onset, loose chords included", () => {
    expect(
      performanceBassOnsets([
        { start: 2.1, pitch: 48 },
        { start: 0, pitch: 41 },
        { start: 1.43, pitch: 53 },
        { start: 1.45, pitch: 45 },
        { start: 2.1, pitch: 41 }
      ])
    ).toEqual([
      { time: 0, pitch: 41 },
      { time: 1.43, pitch: 45 },
      { time: 2.1, pitch: 41 }
    ]);
    expect(performanceBassOnsets([])).toEqual([]);
  });
  it("flares at each onset and dies out before the next one, the same after any seek", () => {
    const onsets = performanceBassOnsets([
      { start: 1, pitch: 41 },
      { start: 3, pitch: 36 }
    ]);
    expect(bassFireStrength(0.99, onsets)).toBe(0);
    expect(bassFireStrength(1, onsets)).toBe(1);
    expect(bassFireStrength(1 + BASS_FIRE_SECONDS, onsets)).toBe(0);
    expect(bassFireStrength(2.5, onsets)).toBe(0);
    expect(bassFireStrength(3, onsets)).toBe(1);
    let previous = 1;
    for (let time = 1.01; time < 1 + BASS_FIRE_SECONDS; time += 0.01) {
      const strength = bassFireStrength(time, onsets);
      expect(strength).toBeLessThan(previous);
      previous = strength;
    }
    const saved = bassFireStrength(3.2, onsets);
    bassFireStrength(1.1, onsets);
    expect(bassFireStrength(3.2, onsets)).toBe(saved);
    expect(bassFireStrength(NaN, onsets)).toBe(0);
    expect(bassFireStrength(5, [])).toBe(0);
  });
});
