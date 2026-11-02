import { expect, it } from "vitest";
import { nativeLightingProfile } from "./nativeLightingProfile";

it("keeps full lighting without a coarse primary pointer and selects mobile only for coarse", () => {
  expect(nativeLightingProfile()).toBe("full");
  expect(nativeLightingProfile(false)).toBe("full");
  expect(nativeLightingProfile(true)).toBe("mobile");
});
