import { describe, expect, it } from "vitest";
import { PerformanceCameraPath } from "./performanceCameraPath";
import type { PerformanceCameraGeometry } from "./performanceCameraPath";
import { PerspectiveCamera, Vector3 } from "three";
import { distance, inside, point, segmentBlocked } from "./performanceCameraMath";

export const geometry: PerformanceCameraGeometry = {
  bounds: { min: point(-650, -700, -200), max: point(650, 1200, 700) },
  avatar: { min: point(-200, -650, 70), max: point(200, 1200, 650) },
  obstacles: [
    { min: point(-650, -600, -200), max: point(650, 50, 0) },
    { min: point(-200, 200, 150), max: point(200, 900, 480) },
    { min: point(-110, 900, 190), max: point(110, 1200, 400) }
  ],
  keyboard: point(-100, 22, 30),
  handSpan: 352,
  unit: 1,
  keyboardFlight: {
    start: point(-650, 37, 140),
    end: point(650, 37, 140),
    targetStart: point(-100, 92, 30),
    targetEnd: point(-100, 92, 30),
    underHands: true
  },
  top: point(0, 2500, 250),
  road: {
    lanes: [
      point(-330, 22, -142),
      point(-150, 22, -142),
      point(60, 34, -142),
      point(330, 22, -142)
    ],
    height: 1900
  }
};
describe("finite performance route", () => {
  it("flies all154.5seconds without a repeated trace, teleport, or unbounded lens", () => {
    const path = new PerformanceCameraPath(geometry);
    let previous = path.sample(16),
      travelled = 0;
    const shots = new Set<string>();
    for (let time = 16; time <= 154.5; time += 0.05) {
      const pose = path.sample(time);
      shots.add(pose.shot);
      const step = distance(pose.position, previous.position);
      expect(step, String(time)).toBeLessThan(180);
      travelled += step;
      expect(pose.fov).toBeGreaterThanOrEqual(28);
      expect(pose.fov).toBeLessThanOrEqual(60);
      expect(Math.hypot(pose.direction.x, pose.direction.y, pose.direction.z)).toBeCloseTo(1);
      previous = pose;
    }
    expect(travelled).toBeGreaterThan(10000);
    expect(shots.has("top-whole-keyboard")).toBe(true);
    expect(shots.has("top-hands")).toBe(true);
    for (let time = 22; time < 94; time += 0.1)
      expect(distance(path.sample(time).position, path.sample(time + 60).position)).toBeGreaterThan(
        5
      );
    expect(path.sample(200)).toEqual(path.sample(154.5));
  });
  it("is history independent and rolls through internal joins with continuous physical velocity", () => {
    const path = new PerformanceCameraPath(geometry),
      saved = path.sample(125.3);
    path.sample(20);
    path.sample(154.5);
    expect(path.sample(125.3)).toEqual(saved);
    const h = 0.0001;
    for (const time of [
      22, 27, 29, 31, 34, 35, 38, 40, 42, 44, 46, 48.3, 50.7, 53, 55, 58, 60, 64, 68, 72, 78, 84,
      88, 90, 94, 100, 104, 112, 116, 120, 124, 128, 130, 138, 140, 144
    ]) {
      const before = path.sample(time - h),
        at = path.sample(time),
        after = path.sample(time + h);
      const incoming = point(
        (at.position.x - before.position.x) / h,
        (at.position.y - before.position.y) / h,
        (at.position.z - before.position.z) / h
      );
      const outgoing = point(
        (after.position.x - at.position.x) / h,
        (after.position.y - at.position.y) / h,
        (after.position.z - at.position.z) / h
      );
      expect(Math.hypot(incoming.x, incoming.y, incoming.z), String(time)).toBeGreaterThan(10);
      expect(distance(incoming, outgoing), String(time)).toBeLessThan(0.05);
      expect(distance(before.direction, after.direction) / (2 * h), String(time)).toBeLessThan(3);
    }
    for (const time of [16, path.duration]) {
      const before = path.sample(time - h),
        at = path.sample(time),
        after = path.sample(time + h);
      expect(distance(before.position, at.position), String(time)).toBeLessThan(0.001);
      expect(distance(after.position, at.position), String(time)).toBeLessThan(0.001);
    }
  });
  it("flies along centred tilted planes, finishing morph before travel and starting it after unhook", () => {
    const path = new PerformanceCameraPath(geometry);
    for (const [start, anchor, angle] of [[104, point(-45, 28, -142), 0.42]] as const) {
      const firstPosition = path.sample(start).position;
      const first =
        (firstPosition.y - anchor.y) * Math.sin(angle) -
        (firstPosition.z - anchor.z) * Math.cos(angle);
      for (let t = start; t <= start + 8; t += 0.05) {
        const p = path.sample(t),
          dy = p.position.y - anchor.y,
          dz = p.position.z - anchor.z;
        const normal = dy * Math.cos(p.noteAngle) + dz * Math.sin(p.noteAngle),
          length = dy * Math.sin(p.noteAngle) - dz * Math.cos(p.noteAngle);
        expect(p.position.x).toBeCloseTo(anchor.x);
        expect(p.noteAngle).toBeCloseTo(angle);
        expect(normal).toBeCloseTo(140);
        if (t > start + 7.9) expect(Math.abs(length - first)).toBeGreaterThan(900);
      }
      expect(path.sample(start - 4).noteAngle).toBeCloseTo(angle);
      expect(path.sample(start + 16).noteAngle).toBeCloseTo(angle);
    }
  });
  it.each([1.6, 3440 / 1313, 390 / 844])(
    "frames the whole subject through the one rear sector at aspect%s",
    (aspect) => {
      const path = new PerformanceCameraPath({ ...geometry, aspect });
      let rearSeconds = 0,
        rearEntries = 0,
        wasRear = false;
      for (let t = 22; t < 154.5; t += 0.02) {
        const pose = path.sample(t),
          rear = pose.position.z > geometry.avatar.max.z;
        if (rear && !wasRear) rearEntries++;
        wasRear = rear;
        if (!rear) continue;
        rearSeconds += 0.02;
        const camera = new PerspectiveCamera(pose.fov, aspect, 1, 50000);
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        camera.up.set(pose.up.x, pose.up.y, pose.up.z);
        camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
        camera.updateMatrixWorld();
        for (const x of [geometry.bounds.min.x, geometry.bounds.max.x])
          for (const y of [geometry.bounds.min.y, geometry.bounds.max.y])
            for (const z of [geometry.bounds.min.z, geometry.bounds.max.z]) {
              const p = new Vector3(x, y, z).project(camera);
              expect(Math.abs(p.x), String(t)).toBeLessThan(1);
              expect(Math.abs(p.y), String(t)).toBeLessThan(1);
            }
      }
      expect(rearEntries).toBe(1);
      expect(rearSeconds).toBeLessThan(6);
    }
  );
  it("keeps close hand targets on an open sightline", () => {
    const torso = geometry.obstacles[1];
    if (!torso) throw new Error("Missing torso");
    const path = new PerformanceCameraPath(geometry);
    for (let time = 22; time < 154.5; time += 0.02) {
      const pose = path.sample(time);
      if (pose.shot.includes("hands"))
        expect(segmentBlocked(pose.position, pose.target, torso, 0), String(time)).toBe(false);
    }
  });
  it("avoids every mesh and detours an actual blocked connector", () => {
    const test = {
      ...geometry,
      obstacles: [
        ...geometry.obstacles,
        { min: point(1800, 0, 1800), max: point(2600, 4000, 3200) }
      ]
    };
    const path = new PerformanceCameraPath(test);
    expect(path.detours).toBeGreaterThan(0);
    let minimum = Infinity;
    for (let time = 16; time <= path.duration; time += 1 / 120) {
      const pose = path.sample(time);
      for (const box of test.obstacles)
        expect(inside(pose.position, box, path.clearance - 0.01), String(time)).toBe(false);
      if (time > 16.5 && time < path.duration - 1)
        minimum = Math.min(
          minimum,
          distance(path.sample(time - 0.001).position, path.sample(time + 0.001).position) / 0.002
        );
    }
    expect(minimum).toBeGreaterThan(8);
  });
  it("traverses the entire keyboard at low height for eight seconds when its real corridor is clear", () => {
    const flight = {
      start: point(-650, 47, 140),
      end: point(650, 47, 140),
      targetStart: point(-430, 92, 15),
      targetEnd: point(650, 92, 15),
      underHands: true
    };
    const path = new PerformanceCameraPath({ ...geometry, keyboardFlight: flight });
    expect(path.sample(130).position).toEqual(flight.start);
    expect(path.sample(138).position).toEqual(flight.end);
    for (let t = 130; t <= 138; t += 0.05) {
      const pose = path.sample(t);
      expect(pose.position.y).toBeCloseTo(47);
      expect(pose.position.z).toBeCloseTo(140);
      expect(pose.shot).toBe("under-hands-traverse");
    }
  });
  it("has exactly one forward hero directly after the rear/under-hand chain", () => {
    const path = new PerformanceCameraPath(geometry);
    expect(path.sample(34).shot).toBe("rear-wide");
    expect(path.sample(44).shot).toBe("hero-under-hands");
    for (let t = 46.05; t < 52.95; t += 0.02) {
      const p = path.sample(t),
        a = path.sample(t - 0.001),
        b = path.sample(t + 0.001),
        velocity = point(
          b.position.x - a.position.x,
          b.position.y - a.position.y,
          b.position.z - a.position.z
        ),
        speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      expect(p.shot).toBe("hero-forward-travel");
      expect(speed).toBeGreaterThan(0.01);
      expect(
        (p.direction.x * velocity.x + p.direction.y * velocity.y + p.direction.z * velocity.z) /
          speed
      ).toBeGreaterThan(0.9);
      expect(Math.abs(p.position.x)).toBeLessThanOrEqual(80.001);
      expect(p.roadScale).toBeCloseTo(2.5);
    }
    for (const t of [46, 48.3, 50.7, 53, 55, 58, 60, 64, 68, 72, 78, 130, 138]) {
      const a = path.sample(t - 0.0001).position,
        b = path.sample(t).position,
        c = path.sample(t + 0.0001).position;
      const before = point((b.x - a.x) / 0.0001, (b.y - a.y) / 0.0001, (b.z - a.z) / 0.0001),
        after = point((c.x - b.x) / 0.0001, (c.y - b.y) / 0.0001, (c.z - b.z) / 0.0001);
      expect(distance(before, after), String(t)).toBeLessThan(2);
    }
    expect(path.sample(55).up.x).not.toBe(0);
    for (const [time, normal, x, fov] of [
      [46, 140, 0, 48],
      [48.3, 220, -80, 58],
      [50.7, 160, 80, 51],
      [53, 100, 0, 43]
    ] as const) {
      const p = path.sample(time);
      expect(
        (p.position.y - 22) * Math.cos(0.24) + (p.position.z + 142) * Math.sin(0.24)
      ).toBeCloseTo(normal);
      expect(p.position.x).toBeCloseTo(x);
      expect(p.fov).toBeCloseTo(fov);
    }
    expect(path.sample(58).noteAngle).toBeCloseTo(0.24);
    expect(path.sample(60).shot).toBe("face");
  });
  it("brakes without stopping after hero and joins with continuous velocity and acceleration", () => {
    const path = new PerformanceCameraPath(geometry),
      h = 0.001;
    for (const t of [55, 58, 60, 64, 68, 72, 78]) {
      const a = path.sample(t - h).position,
        b = path.sample(t).position,
        c = path.sample(t + h).position;
      expect(distance(a, c) / (2 * h), String(t)).toBeGreaterThan(50);
      expect(
        Math.hypot(
          (c.x - 2 * b.x + a.x) / (h * h),
          (c.y - 2 * b.y + a.y) / (h * h),
          (c.z - 2 * b.z + a.z) / (h * h)
        ),
        String(t)
      ).toBeLessThan(5);
    }
  });
  it("flows through the bass and treble edges with nonzero matched velocity", () => {
    const path = new PerformanceCameraPath(geometry),
      start = path.sample(130),
      end = path.sample(138);
    expect(start.shot).toBe("under-hands-traverse");
    expect(end.shot).toBe("under-hands-traverse");
    expect(end.position.x - start.position.x).toBeCloseTo(1300);
    for (const t of [130, 132, 134, 136, 138]) {
      const a = path.sample(t - 0.0001),
        b = path.sample(t + 0.0001);
      expect((b.position.x - a.position.x) / 0.0002).toBeCloseTo(162.5, 1);
      expect(a.target.x).toBe(geometry.keyboard.x);
    }
  });
});

it("keeps the real finite note plane filling the S-flight middle and foreground", () => {
  const path = new PerformanceCameraPath(geometry),
    camera = new PerspectiveCamera(),
    anchor = new Vector3(0, 22, -142),
    normal = new Vector3(0, Math.cos(0.24), Math.sin(0.24));
  for (let time = 46; time <= 53; time += 0.05) {
    const pose = path.sample(time),
      position = new Vector3(pose.position.x, pose.position.y, pose.position.z),
      along = (position.y - 22) * Math.sin(0.24) - (position.z + 142) * Math.cos(0.24);
    expect(along).toBeLessThanOrEqual(2800.000001);
    camera.aspect = 3440 / 1313;
    camera.fov = pose.fov;
    camera.position.copy(position);
    camera.up.set(pose.up.x, pose.up.y, pose.up.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const ray = camera.getWorldDirection(new Vector3()),
      hit = anchor.clone().sub(position).dot(normal) / ray.dot(normal),
      centre = position.clone().addScaledVector(ray, hit),
      foot = position.clone().addScaledVector(normal, -position.clone().sub(anchor).dot(normal)),
      planar = centre.clone().sub(foot);
    expect(hit).toBeGreaterThan(100);
    expect(hit).toBeLessThan(1400);
    expect(Math.abs(centre.x)).toBeLessThan(330);
    const centreLength = (centre.y - 22) * Math.sin(0.24) - (centre.z + 142) * Math.cos(0.24);
    expect(centreLength).toBeGreaterThan(along);
    expect(centreLength).toBeLessThan(5000);
    const mid = centre.clone().project(camera),
      near = foot.clone().addScaledVector(planar, 0.32).project(camera),
      far = foot.clone().addScaledVector(planar, 2).project(camera);
    expect(Math.abs(mid.y)).toBeLessThan(0.001);
    expect(near.y, String(time)).toBeLessThan(-0.6);
    expect(far.y, String(time)).toBeGreaterThan(0.1);
  }
  const end = path.sample(53).position,
    closest = Math.min(
      ...(geometry.road?.lanes ?? []).map((lane) => Math.hypot(end.x - lane.x, 100))
    );
  expect(closest).toBeLessThan(130);
});

it("keeps the higher final pullback within a natural25degree front gaze", () => {
  const path = new PerformanceCameraPath(geometry),
    final = path.sample(154.5),
    cx = (geometry.avatar.min.x + geometry.avatar.max.x) / 2,
    cz = geometry.avatar.min.z;
  expect(
    (Math.abs(Math.atan2(final.position.x - cx, cz - final.position.z)) * 180) / Math.PI
  ).toBeLessThan(25);
  expect(final.position.y).toBeGreaterThan(geometry.avatar.max.y);
});

it("keeps a visible drift through former rear/top holds and never parks during visible flight", () => {
  const path = new PerformanceCameraPath(geometry);
  for (const [start, end] of [
    [34, 35],
    [84, 88],
    [90, 94]
  ])
    expect(
      distance(path.sample(start ?? 0).position, path.sample(end ?? 0).position)
    ).toBeGreaterThan(100);
  let minimum = Infinity,
    slowest = 0;
  for (let time = 16.5; time < path.duration - 1; time += 0.01) {
    const speed =
      distance(path.sample(time - 0.001).position, path.sample(time + 0.001).position) / 0.002;
    if (speed < minimum) {
      minimum = speed;
      slowest = time;
    }
  }
  expect(minimum, String(slowest)).toBeGreaterThan(8);
});
