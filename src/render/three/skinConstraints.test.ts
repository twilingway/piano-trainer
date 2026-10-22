import { expect, it } from "vitest";
import { keyTarget } from "./handSolver/mech";
import type { Angles, Vec3 } from "./handSolver/mech";
import { STUDIO_REST } from "./handSolver/rest";
import { SkinConstraints } from "./skinConstraints";

const long = { mcp: 20, pip: 30, dip: 20, abd: 0 };
const angles: Angles = {
  1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: 30, t_ip: 25 },
  2: long,
  3: long,
  4: long,
  5: long
};
function point(offset: Vec3): SkinConstraints {
  const skin = new SkinConstraints(
    { vertices: [{ source: 0, finger: 1, segment: 2, terms: [{ anchor: 0, offset, weight: 1 }] }] },
    STUDIO_REST
  );
  skin.evaluate(angles, [0, 0, 0, 0, 0, 0]);
  return skin;
}
it("keeps an unpressed white-key seam above the shared floor", () => {
  const skin = point([11.75, 20, -3]);
  expect(Math.max(...skin.clearance(1, false))).toBeCloseTo(3.3);
  expect(Math.max(...skin.clearance(1, false, 60))).toBeCloseTo(3.3);
});
it("does not satisfy a target with a low terminal pad outside its footprint", () => {
  const skin = point([50, 20, -8]);
  const error = skin.contact(keyTarget(60, 1, false), false);
  expect(error.every(Number.isFinite)).toBe(true);
  expect(Math.abs(error[3] ?? 0)).toBeGreaterThan(10);
});
