import { describe, expect, it } from "vitest";
import { plasmaLoopSamples } from "./bakePlasmaLoop";

describe("plasma loop seam", () => {
  it("continues the incoming simulation through the boundary instead of restarting particles", () => {
    const tail = plasmaLoopSamples(4 - 0.001, 4, 1);
    const head = plasmaLoopSamples(0, 4, 1);
    expect(tail.blend).toBeGreaterThan(0.99999);
    expect(tail.incoming).toBeCloseTo(head.outgoing, 2);
    expect(head.blend).toBe(0);
  });

  it("keeps normal motion until the final second and eases the transition", () => {
    expect(plasmaLoopSamples(2.9, 4, 1).blend).toBe(0);
    expect(plasmaLoopSamples(3.5, 4, 1).blend).toBeCloseTo(0.5);
    expect(plasmaLoopSamples(7.5, 4, 1)).toEqual(plasmaLoopSamples(3.5, 4, 1));
  });
});
