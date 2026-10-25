import { describe, expect, it, vi } from "vitest";
import type { ShaderMaterial } from "three";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  OrthographicCamera,
  PerspectiveCamera,
  Vector4
} from "three";
import {
  configureDockedRoad,
  updateDockedKeyOffsets,
  dockedKeyOffset
} from "./dockedRoadProjection";
import { roadWidthUniforms } from "./roadWidthUniforms";
import { ThreeRoadNotes } from "./ThreeRoadNotes";
import { runInNewContext } from "node:vm";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";

describe("native docked road projection", () => {
  it("maps actual world clip to the shown keyboard camera under a scaled road parent", () => {
    const root = new Group();
    root.scale.setScalar(3);
    root.position.set(200, -50, 20);
    const world = new PerspectiveCamera(70, 1.6, 0.1, 100000);
    world.position.set(2500, 900, 1500);
    world.lookAt(0, 0, 0);
    const keyboard = new OrthographicCamera(-1500, 1500, 800, -800, 0.1, 100000);
    keyboard.position.set(0, 2000, 2000);
    keyboard.lookAt(0, 0, 0);
    configureDockedRoad(root, world, keyboard, true, 149.1938, 5000);
    const point = new Vector4(33, 34, -145.8, 1).applyMatrix4(root.matrixWorld);
    const from = point
      .clone()
      .applyMatrix4(world.matrixWorldInverse)
      .applyMatrix4(world.projectionMatrix);
    const actual = from.clone().applyMatrix4(roadWidthUniforms.roadDockTransform.value);
    const expected = point
      .clone()
      .applyMatrix4(keyboard.matrixWorldInverse)
      .applyMatrix4(keyboard.projectionMatrix);
    actual.toArray().forEach((v, i) => {
      expect(v).toBeCloseTo(expected.toArray()[i] ?? 0, 7);
    });
    const local = from.clone().applyMatrix4(roadWidthUniforms.roadDockInverse.value);
    expect(local.toArray()).toEqual([
      expect.closeTo(33, 5),
      expect.closeTo(34, 5),
      expect.closeTo(-145.8, 5),
      expect.closeTo(1, 5)
    ]);
    configureDockedRoad(root, world, keyboard, false, 149.1938, 5000);
    expect(roadWidthUniforms.roadDockEnabled.value).toBe(0);
  });
  it("adds guide projection only once and preserves existing compile hooks", () => {
    const root = new Group();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
    const material = new LineBasicMaterial();
    const original = vi.fn();
    material.onBeforeCompile = original;
    root.add(new LineSegments(geometry, material));
    const camera = new PerspectiveCamera();
    configureDockedRoad(root, camera, camera, true, 0, 1);
    const version = material.version;
    configureDockedRoad(root, camera, camera, true, 0, 1);
    expect(material.version).toBe(version);
    const shader = {
      uniforms: {},
      vertexShader: "void main() { #include <project_vertex> }",
      fragmentShader: ""
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(original).toHaveBeenCalledOnce();
    expect(shader.vertexShader).toContain(
      "anchorRelativeRoadClip(gl_Position, anchor, pinned, roadDockProgress)"
    );
    expect(shader.uniforms).toHaveProperty(
      "roadDockTransform",
      roadWidthUniforms.roadDockTransform
    );
    geometry.dispose();
    material.dispose();
  });
  it("subdivides long slabs only in docked mode and shares live instance buffers", () => {
    const notes = new ThreeRoadNotes(4);
    const child = notes.group.children[0];
    if (!(child instanceof InstancedMesh)) throw new Error("missing slab");
    const mesh = child as InstancedMesh<BufferGeometry, ShaderMaterial>;
    const base = mesh.geometry;
    const camera = new PerspectiveCamera();
    configureDockedRoad(notes.group, camera, camera, true, 0, 5000);
    const segmented = mesh.geometry;
    expect(segmented.getAttribute("position").count).toBeGreaterThan(
      base.getAttribute("position").count * 2
    );
    expect(segmented.getAttribute("noteSize")).toBe(base.getAttribute("noteSize"));
    const corner = segmented.getAttribute("slabCorner");
    expect(
      Array.from({ length: corner.count }, (_, i) => corner.getY(i)).some((v) => v > 0.1 && v < 0.9)
    ).toBe(true);
    const dispose = vi.spyOn(segmented, "dispose");
    configureDockedRoad(notes.group, camera, camera, false, 0, 5000);
    expect(mesh.geometry).toBe(base);
    notes.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(NOTE_LANE_SHADER).toContain(
      "return anchorRelativeRoadClip(point, anchor, pinned, progress)"
    );
  });
});

it("projects each pressed key at its own damped hinge depth without shifting another pitch", () => {
  const root = new Group();
  root.scale.setScalar(2.75);
  root.position.set(50, 20, -30);
  const world = new PerspectiveCamera(70, 1.6, 0.1, 100000);
  world.position.set(3500, 900, 1500);
  world.lookAt(0, 0, 0);
  const keyboard = new OrthographicCamera(-1500, 1500, 800, -800, 0.1, 100000);
  keyboard.position.set(0, 2000, 2000);
  keyboard.lookAt(0, 0, 0);
  const hinge = new Group();
  hinge.position.y = -4.8;
  updateDockedKeyOffsets([{ pitch: 61, hinge }]);
  configureDockedRoad(root, world, keyboard, true, 149.1938, 5000);
  const staticPoint = new Vector4(33, 34, -145.8, 1).applyMatrix4(root.matrixWorld);
  const from = staticPoint
    .clone()
    .applyMatrix4(world.matrixWorldInverse)
    .applyMatrix4(world.projectionMatrix);
  const actual = from
    .clone()
    .applyMatrix4(roadWidthUniforms.roadDockTransform.value)
    .addScaledVector(roadWidthUniforms.roadDockY.value, dockedKeyOffset(61));
  const expected = new Vector4(33, 34 - 4.8, -145.8, 1)
    .applyMatrix4(root.matrixWorld)
    .applyMatrix4(keyboard.matrixWorldInverse)
    .applyMatrix4(keyboard.projectionMatrix);
  expect(Math.abs((actual.x / actual.w - expected.x / expected.w) * 960)).toBeLessThan(1);
  expect(Math.abs((actual.y / actual.w - expected.y / expected.w) * 540)).toBeLessThan(1);
  expect(dockedKeyOffset(60)).toBe(0);
  updateDockedKeyOffsets([]);
  expect(dockedKeyOffset(61)).toBe(0);
});

it("retains score-derived progress when a zero-height zero-distance route only fans across X", () => {
  const match = /float roadNoteProgress\(float localZ\) \{\s+return ([^;]+);/.exec(
    NOTE_LANE_SHADER
  );
  if (!match?.[1]) throw new Error("missing canonical progress assignment");
  const assignment = match[1]
    .replaceAll("noteProjection.w", "depth")

    .replaceAll("noteContact.y", "contact")
    .replaceAll("roadWidth.y", "far");
  const sample = runInNewContext(`(depth, localZ, contact, far) => ${assignment}`, {
    max: Math.max
  }) as (depth: number, localZ: number, contact: number, far: number) => number;
  expect(sample(500, 0, 100, 1700)).toBeCloseTo(0.25);
  expect(sample(100, 0, 100, 1700)).toBe(0);
  expect(NOTE_LANE_SHADER).toContain("float progress = roadNoteProgress(localZ);");
  expect(NOTE_LANE_SHADER).not.toContain("roadPointProgress");
  expect(NOTE_LANE_SHADER).toContain("max(length(direction.yz), 0.000001)");
});
