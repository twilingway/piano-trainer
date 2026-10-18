import { expect, it } from "vitest";
import { performanceRingField } from "./performanceRingField";

const note = (alpha = 1) => ({
  pitch: 60,
  color: 0xff2299,
  alpha,
  x: 0,
  top: 5000,
  bottom: 4900,
  width: 20
});
it("adds every visible note's energy and spreads less energy into neighboring keys", () => {
  const result = performanceRingField([note(), note(0.5)], 2);
  expect(result.map((n) => n.pitch)).toEqual([58, 59, 60, 61, 62]);
  expect(result.find((n) => n.pitch === 60)?.strength).toBe(1.5);
  expect(result.find((n) => n.pitch === 59)?.strength).toBeCloseTo(0.6);
  expect(result.find((n) => n.pitch === 58)?.strength).toBeCloseTo(0.225);
  expect(result.every((n) => n.color === 0xff2299)).toBe(true);
});
it("excludes old reused entries, invisible notes and out-of-keyboard spill", () => {
  expect(performanceRingField([note(), note()], 1).find((n) => n.pitch === 60)?.strength).toBe(1);
  expect(performanceRingField([note(0)], 1)).toEqual([]);
  expect(performanceRingField([{ ...note(), pitch: 21 }], 1).map((n) => n.pitch)).toEqual([
    21, 22, 23
  ]);
});
