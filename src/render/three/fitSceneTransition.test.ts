import { expect, it } from "vitest";
import { fitSceneTransition } from "./fitSceneTransition";
import type { HandAt } from "./handSolver/track";
import { STUDIO_REST } from "./handSolver/rest";
import { SkinConstraints } from "./skinConstraints";
import type { SkinGeometry } from "./skinGeometry";

it("raises a transferring wrist when fixed finger angles cannot clear an unpressed key", () => {
  const long = { mcp: 20, pip: 30, dip: 20, abd: 0 };
  const pose: HandAt = {
    root: [0, 0, 0, 0, 0, 0],
    angles: {
      1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: 30, t_ip: 25 },
      2: long,
      3: long,
      4: long,
      5: long
    }
  };
  const geometry: SkinGeometry = {
    vertices: [
      { source: 0, finger: 2, segment: 0, terms: [{ anchor: 0, offset: [0, 20, -2], weight: 1 }] }
    ]
  };
  const corrected = fitSceneTransition(pose, STUDIO_REST, false, geometry, []);
  const skin = new SkinConstraints(geometry, STUDIO_REST);
  skin.evaluate(corrected.angles, corrected.root);
  expect(Math.max(...skin.clearance(2, false))).toBeLessThan(0.05);
  expect(corrected.root.slice(0, 5)).toEqual(pose.root.slice(0, 5));
  expect(corrected.angles).toEqual(pose.angles);
  expect(corrected.root[5]).toBeGreaterThan(2);
  expect(corrected.root[5]).toBeLessThanOrEqual(30);
  expect(fitSceneTransition(corrected, STUDIO_REST, false, geometry, [])).toBe(corrected);
});
