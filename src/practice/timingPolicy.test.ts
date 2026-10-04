import { describe, expect, it } from "vitest";
import type { Hand } from "../fingering/fingering";
import { timingPolicy } from "./timingPolicy";

describe("applied timing policy", () => {
  it("uses educational policy only for player attacks in tempo", () => {
    const options = {
      mode: "tempo",
      hands: new Set<Hand>(["right"]),
      learningWindow: true
    } as const;
    expect(timingPolicy(options)).toBe("learning");
    expect(timingPolicy({ ...options, learningWindow: false })).toBe("strict");
    expect(timingPolicy({ mode: "tempo", hands: options.hands })).toBe("strict");
    expect(timingPolicy({ ...options, mode: "wait" })).toBe("waiting");
    expect(timingPolicy({ ...options, hands: new Set() })).toBe("listening");
    expect(timingPolicy({ ...options, mode: "wait", hands: new Set() })).toBe("listening");
  });
});
