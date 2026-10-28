import { expect, it } from "vitest";
import { normalizeWorldFov } from "./cameraComposition";
it("rejects a corrupt world FOV", () => {
  expect(normalizeWorldFov(Number.NaN)).toBe(45);
  expect(normalizeWorldFov("80")).toBe(45);
  expect(normalizeWorldFov(180)).toBe(100);
  expect(normalizeWorldFov(1)).toBe(20);
});
