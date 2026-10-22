import { describe, expect, it, vi } from "vitest";

import { createReaderFrameBeat } from "./readerGeometry";

describe("shared reader frame beat", () => {
  it("samples the session once when two readers draw in the same frame", () => {
    const read = createReaderFrameBeat();
    const clock = vi.fn().mockReturnValueOnce(2.1).mockReturnValueOnce(2.2);
    expect(read(100, clock)).toBe(2.1);
    expect(read(100, clock)).toBe(2.1);
    expect(clock).toHaveBeenCalledTimes(1);
    expect(read(116, clock)).toBe(2.2);
    expect(clock).toHaveBeenCalledTimes(2);
  });

  it("takes the real session beat each new frame including pause and backward seek", () => {
    const read = createReaderFrameBeat();
    expect(read(100, () => 5)).toBe(5);
    expect(read(116, () => 5)).toBe(5);
    expect(read(132, () => 1)).toBe(1);
  });

  it("has no cross-workspace cache and starts fresh for a replaced score", () => {
    const oldScore = createReaderFrameBeat();
    const newScore = createReaderFrameBeat();
    expect(oldScore(100, () => 8)).toBe(8);
    expect(newScore(100, () => 0)).toBe(0);
    expect(oldScore(100, () => 9)).toBe(8);
  });
});
