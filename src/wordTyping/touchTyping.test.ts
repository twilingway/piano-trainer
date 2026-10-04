import { describe, expect, it } from "vitest";
import { tokenPool } from "./inputTokens";
import { typingFinger } from "./touchTyping";

describe("typingFinger", () => {
  it("gives every key the generator can assign a finger", () => {
    for (const language of ["ru", "en"] as const) {
      for (const token of tokenPool(language)) {
        expect(typingFinger(token.physicalKey), token.physicalKey).toBeDefined();
      }
    }
  });

  it("follows the standard zones", () => {
    expect(typingFinger("KeyA")).toEqual({ hand: "left", finger: 5 });
    expect(typingFinger("KeyL")).toEqual({ hand: "right", finger: 4 });
    expect(typingFinger("Digit6")).toEqual({ hand: "right", finger: 2 });
    expect(typingFinger("Digit5")).toEqual({ hand: "left", finger: 2 });
    expect(typingFinger("Comma")).toEqual({ hand: "right", finger: 3 });
    expect(typingFinger("Quote")).toEqual({ hand: "right", finger: 5 });
  });

  it("leaves keys outside the zones without a finger", () => {
    expect(typingFinger("Space")).toBeUndefined();
  });
});
