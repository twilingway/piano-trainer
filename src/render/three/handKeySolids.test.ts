import { expect, it } from "vitest";
import { keyDistance, keyPenetration } from "./handKeySolids";

it("keeps the front/neck join inside a white key solid", () => {
  expect(keyDistance(60, [0, 55.8, -5])).toBeCloseTo(-4.7);
  expect(keyPenetration(60, [0, 55.8, -5], 0.3)).toBeCloseTo(5);
  expect(keyDistance(60, [0, 55.79, -5])).toBeCloseTo(keyDistance(60, [0, 55.81, -5]), 2);
});
