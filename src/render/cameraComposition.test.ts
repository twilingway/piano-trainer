import { expect, it } from "vitest";
import {
  normalizeCameraComposition,
  normalizeWorldFov,
  interactiveWorldCamera
} from "./cameraComposition";
it("keeps old preferences safe and rejects corrupt camera fields", () => {
  for (const value of [null, undefined, "wrong", 1, {}])
    expect(normalizeCameraComposition(value)).toBe("standard");
  expect(normalizeCameraComposition("game")).toBe("game");
  expect(normalizeCameraComposition("free")).toBe("free");
  expect(normalizeWorldFov(Number.NaN)).toBe(45);
  expect(normalizeWorldFov("80")).toBe(45);
  expect(normalizeWorldFov(180)).toBe(100);
  expect(normalizeWorldFov(1)).toBe(20);
});
it("reserves movement only for the effective interactive composition", () => {
  expect(interactiveWorldCamera("game", true)).toBe(false);
  expect(interactiveWorldCamera("free", false)).toBe(true);
  expect(interactiveWorldCamera("standard", true)).toBe(true);
  expect(interactiveWorldCamera("standard", false)).toBe(false);
});
