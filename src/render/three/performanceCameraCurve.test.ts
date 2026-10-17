import { expect, it } from "vitest";
import { cameraCurvePoint, cameraCurveVelocity } from "./performanceCameraCurve";
import { distance, point } from "./performanceCameraMath";

it("matches physical endpoint velocities when two flight segments join", () => {
  const a = point(-20, 50, 40),
    b = point(300, 50, 40),
    c = point(700, 120, 40),
    v = point(160, 0, 0),
    epsilon = 1e-6;
  const left = cameraCurvePoint(a, b, 1 - epsilon, 2, undefined, v),
    at = cameraCurvePoint(a, b, 1, 2, undefined, v),
    right = cameraCurvePoint(b, c, epsilon, 4, v);
  expect(at).toEqual(b);
  const before = point(
      (at.x - left.x) / (epsilon * 2),
      (at.y - left.y) / (epsilon * 2),
      (at.z - left.z) / (epsilon * 2)
    ),
    after = point(
      (right.x - at.x) / (epsilon * 4),
      (right.y - at.y) / (epsilon * 4),
      (right.z - at.z) / (epsilon * 4)
    );
  expect(distance(before, v)).toBeLessThan(0.002);
  expect(distance(after, v)).toBeLessThan(0.002);
});
it("rescales duration and physical velocity without changing the route", () => {
  const a = point(10, 20, 30),
    b = point(100, 500, -1000),
    v = point(20, 40, -90);
  for (let u = 0; u <= 1; u += 0.01)
    expect(cameraCurvePoint(a, b, u, 4, v, v)).toEqual(
      cameraCurvePoint(a, b, u, 8, point(10, 20, -45), point(10, 20, -45))
    );
});

it("matches the exact flight tangent to finite differences across accelerating C2 segments", () => {
  const a = point(-80, 200, -500),
    b = point(80, 340, -1700),
    va = point(0, 80, -400),
    vb = point(0, 100, -500),
    h = 1e-6;
  for (const u of [0.001, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]) {
    const before = cameraCurvePoint(a, b, u - h, 2.4, va, vb),
      after = cameraCurvePoint(a, b, u + h, 2.4, va, vb),
      v = cameraCurveVelocity(a, b, u, 2.4, va, vb);
    expect(
      distance(
        v,
        point(
          (after.x - before.x) / (h * 4.8),
          (after.y - before.y) / (h * 4.8),
          (after.z - before.z) / (h * 4.8)
        )
      )
    ).toBeLessThan(0.001);
  }
});
