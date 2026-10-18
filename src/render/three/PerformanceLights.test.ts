import { PerformanceScene } from "./PerformanceScene";
import { describe, it, expect } from "vitest";
import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  PerspectiveCamera,
  ShaderMaterial,
  Scene,
  SpotLight,
  Vector3
} from "three";
import { PerformanceLights } from "./PerformanceLights";
import { performanceSceneTimeline } from "./performanceSceneTimeline";
import { performanceStageLayout } from "./performanceStageLayout";
describe("performance hand/face lighting cues", () => {
  it("keeps the surroundings black before twelve, reveals hands through seventeen and dims by nineteen", () => {
    const lights = new PerformanceLights(),
      centre = new Vector3(0, 22, 30),
      stage = performanceStageLayout({
        min: { x: -650, y: -700, z: -200 },
        max: { x: 650, y: 1200, z: 700 }
      });
    const owner = new Group();
    owner.add(lights.group);
    lights.setStageLayout(stage);
    lights.setFaceTarget(0, 1000, 300);
    const points = lights.group.children.filter(
        (child): child is PointLight => child instanceof PointLight
      ),
      spots = lights.group.children.filter(
        (child): child is SpotLight => child instanceof SpotLight
      );
    lights.layout(centre, 1200, performanceSceneTimeline(10).spotFade, 352, 1, 10);
    expect(points[0]?.intensity).toBe(0.8);
    expect(spots.every((s) => s.intensity === 0)).toBe(true);
    expect(points.slice(1).every((s) => s.intensity === 0)).toBe(true);
    lights.layout(centre, 1200, performanceSceneTimeline(14).spotFade, 352, 1, 14);
    expect(spots.map((s) => s.intensity)).toEqual([0.425, 0.525]);
    expect(points[0]?.intensity).toBeCloseTo(0.95);
    lights.layout(centre, 1200, performanceSceneTimeline(16).spotFade, 352, 1, 16);
    expect(points[0]?.intensity).toBeCloseTo(0.95);
    lights.layout(centre, 1200, performanceSceneTimeline(19).spotFade, 352, 1, 19);
    expect(points[0]?.intensity).toBeCloseTo(0.04);
    expect(points.slice(1).map((s) => s.intensity)).toEqual([1, 0.5]);
    for (const light of points.slice(1)) {
      expect(light.position.distanceTo(centre)).toBeGreaterThan(light.distance);
      expect(light.distance).toBe(650);
    }
    for (const spot of spots) {
      expect(spot.distance).toBeCloseTo(stage.radius * 4);
      expect(spot.intensity).toBeLessThanOrEqual(1.05);
      expect(spot.penumbra).toBeGreaterThan(0.75);
    }
    lights.dispose();
    expect(owner.children).not.toContain(lights.group);
  });
  it("reproduces face and beam intensity after a backwards seek", () => {
    const lights = new PerformanceLights(),
      centre = new Vector3(0, 22, 30);
    const intensities = () =>
      lights.group.children
        .filter(
          (c): c is PointLight | SpotLight => c instanceof PointLight || c instanceof SpotLight
        )
        .map((l) => l.intensity);
    lights.layout(centre, 1200, 0.5, 352, 1, 14);
    const expected = intensities();
    lights.layout(centre, 1200, 1, 352, 1, 70);
    lights.layout(centre, 1200, 0.5, 352, 1, 14);
    expect(intensities()).toEqual(expected);
    lights.dispose();
  });
  it("ignites visible floor pools by12.3 and lands each beam axis inside the circular stage", () => {
    const lights = new PerformanceLights(),
      centre = new Vector3(0, 22, 30),
      stage = performanceStageLayout({
        min: { x: -650, y: -700, z: -200 },
        max: { x: 650, y: 1200, z: 700 }
      });
    lights.setStageLayout(stage);
    lights.setFaceTarget(0, 1000, 300);
    lights.layout(centre, 1200, performanceSceneTimeline(12.3).spotFade, 352, 1, 12.3);
    lights.group.updateMatrixWorld(true);
    const pools = lights.group.children.filter((child) => child.name === "performance-floor-pool"),
      spots = lights.group.children.filter(
        (child): child is SpotLight => child instanceof SpotLight
      );
    expect(pools).toHaveLength(2);
    const beams = lights.group.children.filter(
      (child) => child instanceof Mesh && child.geometry instanceof ConeGeometry
    );
    for (const [index, spot] of spots.entries()) {
      const beam = beams[index];
      if (!(beam instanceof Mesh)) throw new Error("Missing beam shell");
      expect(
        new Vector3(0, 0.5, 0).applyMatrix4(beam.matrixWorld).distanceTo(spot.position)
      ).toBeLessThan(1e-8);
      expect(
        new Vector3(0, -0.5, 0).applyMatrix4(beam.matrixWorld).distanceTo(spot.target.position)
      ).toBeLessThan(1e-8);
      expect(spot.intensity).toBeGreaterThan(0.23);
      expect(spot.target.position.y).toBe(stage.top);
      expect(
        Math.hypot(spot.target.position.x - stage.centre.x, spot.target.position.z - stage.centre.z)
      ).toBeLessThan(stage.radius * 0.3);
      const axis = spot.target.position.clone().sub(spot.position),
        floorHit = spot.position
          .clone()
          .addScaledVector(axis, (stage.top - spot.position.y) / axis.y);
      expect(floorHit.distanceTo(spot.target.position)).toBeLessThan(1e-8);
    }
    for (const pool of pools) {
      if (!(pool instanceof Mesh) || !(pool.material instanceof ShaderMaterial))
        throw new Error("Missing floor light mesh");
      expect(pool.position.y).toBeCloseTo(stage.top + 1.5);
      expect(pool.material.depthTest).toBe(true);
      expect(pool.material.depthWrite).toBe(false);
      expect(pool.material.uniforms.density?.value).toBeGreaterThan(0.035);
      expect(
        Math.hypot(pool.position.x - stage.centre.x, pool.position.z - stage.centre.z) +
          Math.max(pool.scale.x, pool.scale.y)
      ).toBeLessThan(stage.radius);
    }
    lights.layout(centre, 1200, 0, 352, 1, 12);
    expect(pools.every((pool) => !pool.visible)).toBe(true);
    lights.dispose();
  });
  it.each([1.6, 3440 / 1313, 390 / 844])(
    "frames platform and physical fixtures throughout16–21s at aspect%s",
    (aspect) => {
      const scene = new Group(),
        subject = new Group(),
        geometry = new BoxGeometry(1300, 1900, 900),
        material = new MeshBasicMaterial(),
        body = new Mesh(geometry, material);
      body.position.set(0, 250, 250);
      subject.add(body);
      scene.add(subject);
      const performance = new PerformanceScene(new Scene()),
        stage = performanceStageLayout({
          min: { x: -650, y: -700, z: -200 },
          max: { x: 650, y: 1200, z: 700 }
        });
      performance.lights.setStageLayout(stage);
      performance.lights.group.visible = true;
      for (let time = 16; time <= 21.001; time += 0.1) {
        performance.update(time, aspect * 1000, 1000, subject);
        performance.lights.group.updateMatrixWorld(true);
        const fixtures = performance.lights.group.getObjectByName("performance-light-fixtures");
        if (!fixtures) throw new Error("Missing physical fixtures");
        const box = new Box3().setFromObject(fixtures),
          points: Vector3[] = [];
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) points.push(new Vector3(x, y, z));
        for (let i = 0; i < 24; i++)
          points.push(
            new Vector3(
              stage.centre.x + Math.sin((i * Math.PI) / 12) * stage.radius,
              stage.top,
              stage.centre.z + Math.cos((i * Math.PI) / 12) * stage.radius
            )
          );
        for (const point of points) {
          const p = point.project(performance.camera);
          expect(Math.abs(p.x), String(time)).toBeLessThan(1);
          expect(Math.abs(p.y), String(time)).toBeLessThan(1);
        }
        expect(box.clone().expandByScalar(12).containsPoint(performance.camera.position)).toBe(
          false
        );
      }
      performance.dispose();
      geometry.dispose();
      material.dispose();
    }
  );
});

it("brightens the actual face smoothly during approach while keeping hands outside the light", () => {
  const lights = new PerformanceLights(),
    face = new Vector3(0, 1000, 300),
    keyboard = new Vector3(0, 22, 30),
    camera = new PerspectiveCamera(35, 1.6, 1, 10000);
  lights.setFaceTarget(face.x, face.y, face.z);
  const points = lights.group.children.filter(
    (child): child is PointLight => child instanceof PointLight
  );
  const sample = (distance: number, time = 69) => {
    camera.position.set(0, 1080, 300 - distance);
    camera.lookAt(face);
    camera.updateMatrixWorld();
    lights.setView(camera, 1);
    lights.layout(keyboard, 1200, 1, 352, 1, time);
    return points.map((light) => light.intensity);
  };
  const far = sample(3500),
    approach = sample(1000),
    close = sample(500);
  expect(approach[1]).toBeGreaterThan(3);
  expect(close[1]).toBeCloseTo(4.2);
  expect(far[1]).toBe(1);
  expect(close[0]).toBe(0.04);
  for (const light of points.slice(1))
    expect(light.position.distanceTo(keyboard)).toBeGreaterThan(light.distance);
  const a = sample(1000.01),
    b = sample(999.99);
  expect(Math.abs((a[1] ?? 0) - (b[1] ?? 0))).toBeLessThan(0.001);
  expect(sample(1000)).toEqual(approach);
  expect(sample(1000, 24)).toEqual(approach);
  expect(sample(1000, 68)).toEqual(approach);
  lights.dispose();
});

it("scales the bright head light to a lower seated face without reaching the hands", () => {
  const lights = new PerformanceLights(),
    centre = new Vector3(0, 22, 30),
    face = new Vector3(0, 350, 70),
    camera = new PerspectiveCamera(35, 1.6, 1, 10000);
  lights.setFaceTarget(face.x, face.y, face.z);
  camera.position.set(0, 400, -400);
  camera.lookAt(face);
  camera.updateMatrixWorld();
  lights.setView(camera, 1);
  lights.layout(centre, 600, 1, 352, 1, 68);
  const points = lights.group.children.filter((c): c is PointLight => c instanceof PointLight);
  for (const light of points.slice(1)) {
    expect(light.position.distanceTo(face)).toBeLessThan(light.distance);
    expect(light.position.distanceTo(centre)).toBeGreaterThan(light.distance);
    expect(light.intensity).toBeGreaterThan(1.5);
  }
  expect(points[0]?.intensity).toBe(0.04);
  lights.dispose();
});

it("holds a soft hand reveal from13.5 through17 and releases continuously to19", () => {
  const lights = new PerformanceLights(),
    centre = new Vector3(0, 22, 30),
    fill = lights.group.children.find((c): c is PointLight => c instanceof PointLight);
  if (!fill) throw new Error("No hand light");
  const sample = (time: number, outro = 1) => {
    lights.layout(centre, 1200, performanceSceneTimeline(time).spotFade * outro, 352, 1, time);
    return fill.intensity;
  };
  expect(sample(12)).toBeCloseTo(0.8);
  expect(sample(12.5)).toBeGreaterThan(0.8);
  for (const t of [13.5, 14, 16, 16.8, 17]) {
    expect(sample(t)).toBeGreaterThan(0.9);
    expect(sample(t)).toBeLessThanOrEqual(1);
  }
  expect(sample(18)).toBeGreaterThan(0.04);
  expect(sample(18)).toBeLessThan(0.6);
  expect(sample(19)).toBeCloseTo(0.04);
  expect(sample(24)).toBeCloseTo(0.04);
  for (const t of [12, 13.5, 16.8, 19])
    expect(Math.abs(sample(t + 0.0005) - sample(t - 0.0005))).toBeLessThan(0.00001);
  const held = sample(14);
  sample(70);
  expect(sample(14)).toBe(held);
  expect(sample(18, 0.5)).toBeCloseTo(sample(18) * 0.5);
  expect(sample(154.5, 0)).toBe(0);
  expect(fill.distance).toBeLessThanOrEqual(260);
  lights.dispose();
});
