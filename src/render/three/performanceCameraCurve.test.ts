import { expect, it } from "vitest";
import { cameraCurvePoint, cameraCurveVelocity, cameraFlowNodes } from "./performanceCameraCurve";
import { distance, point, segmentBlocked } from "./performanceCameraMath";

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

it("gives every internal node one nonzero physical tangent, independent of named shot times", () => {
  const source = [
    { time: 1, position: point(0, 0, 0) },
    { time: 3.7, position: point(300, 100, 0) },
    { time: 6, position: point(500, 400, -200) },
    { time: 9.2, position: point(800, 200, -400) }
  ];
  const frozen = structuredClone(source),
    nodes = cameraFlowNodes(source, 1);
  expect(source).toEqual(frozen);
  for (let i = 1; i < nodes.length - 1; i++) {
    const a = nodes[i - 1],
      b = nodes[i],
      c = nodes[i + 1];
    if (!a || !b || !c) throw Error("Missing route node");
    const incoming = cameraCurveVelocity(
      a.position,
      b.position,
      1,
      b.time - a.time,
      a.velocity,
      b.velocity
    );
    const outgoing = cameraCurveVelocity(
      b.position,
      c.position,
      0,
      c.time - b.time,
      b.velocity,
      c.velocity
    );
    expect(distance(incoming, outgoing)).toBeLessThan(1e-9);
    expect(Math.hypot(incoming.x, incoming.y, incoming.z)).toBeGreaterThan(12);
  }
});
it("keeps explicit hero/keyboard tangents and rounds protected bends without collisions or new stops", () => {
  const obstacle = { min: point(-80, 210, -10), max: point(-20, 230, 10) };
  const source = [
    { time: 0, position: point(-100, 0, 0) },
    { time: 2, position: point(-100, 200, 0) },
    { time: 4, position: point(100, 200, 0) },
    { time: 6, position: point(100, 0, 0) }
  ];
  const nodes = cameraFlowNodes(source, 1, (a, b) => segmentBlocked(a, b, obstacle, 0));
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1],
      b = nodes[i];
    if (!a || !b) throw Error("Missing bend");
    let previous = a.position;
    for (let step = 1; step <= 1000; step++) {
      const current = cameraCurvePoint(
        a.position,
        b.position,
        step / 1000,
        b.time - a.time,
        a.velocity,
        b.velocity
      );
      expect(segmentBlocked(previous, current, obstacle, 0)).toBe(false);
      previous = current;
    }
  }
  for (const node of nodes.slice(1, -1))
    expect(
      Math.hypot(node.velocity?.x ?? 0, node.velocity?.y ?? 0, node.velocity?.z ?? 0)
    ).toBeGreaterThan(10);
  const explicit = point(90, 30, 0),
    hero = cameraFlowNodes(
      [
        { ...source[0], time: 0, position: point(0, 0, 0) },
        { time: 2, position: point(200, 0, 0), velocity: explicit },
        { time: 4, position: point(400, 0, 0) }
      ],
      1
    );
  expect(hero[1]?.velocity).toEqual(explicit);
});
