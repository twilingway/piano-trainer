import { describe, expect, it, vi } from "vitest";
import type { ShaderMaterial } from "three";
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Matrix4,
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
import { legacyRouteFar } from "../dockedRoadProjection";
import { CAMERA_PRESETS, worldCamera } from "../worldCamera";
import { configureStageCamera } from "./configureStageCamera";
import { placeStageGroups } from "./stageGroupFrames";

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
  it("pins a road-local contact onto separately scaled and panned keys", () => {
    const road = new Group();
    road.position.set(-120, 0, 0);
    const keys = new Group();
    keys.scale.setScalar(1.45);
    keys.position.set(-174, 0, 0);
    const world = new PerspectiveCamera(45, 1.6, 0.1, 100000);
    world.position.set(0, 1400, 900);
    world.lookAt(0, 0, -800);
    const keyboard = new OrthographicCamera(-1500, 1500, 800, -800, 0.1, 100000);
    keyboard.position.set(0, 2000, 0);
    keyboard.lookAt(0, 0, 0);
    configureDockedRoad(road, world, keyboard, true, 149.1938, 5000, keys);
    const contact = new Vector4(33, 34, -145.8, 1);
    const from = contact
      .clone()
      .applyMatrix4(road.matrixWorld)
      .applyMatrix4(world.matrixWorldInverse)
      .applyMatrix4(world.projectionMatrix);
    const actual = from.clone().applyMatrix4(roadWidthUniforms.roadDockTransform.value);
    const expected = contact
      .clone()
      .applyMatrix4(keys.matrixWorld)
      .applyMatrix4(keyboard.matrixWorldInverse)
      .applyMatrix4(keyboard.projectionMatrix);
    actual.toArray().forEach((v, i) => {
      expect(v).toBeCloseTo(expected.toArray()[i] ?? 0, 6);
    });
    configureDockedRoad(road, world, keyboard, false, 149.1938, 5000, keys);
  });
  it("straightens onto the shown keys, a camera snapshot framed like them, or nothing", () => {
    const road = new Group();
    const keys = new Group();
    const world = new PerspectiveCamera(45, 1.6, 0.1, 100000);
    world.position.set(0, 1400, 900);
    world.lookAt(0, 0, -800);
    const screen = { width: 1280, height: 640 },
      offset = { x: 12, y: -30 },
      pan = 40;
    const snapshot = worldCamera(1280, 640, { ...CAMERA_PRESETS.player, scale: 1.3 });
    // The shown keyboard is the same camera, placed as the stage places its keys group.
    const keyboard = new Camera();
    keyboard.matrixAutoUpdate = false;
    configureStageCamera(keyboard, snapshot, screen, offset);
    placeStageGroups(keys, new Group(), snapshot, snapshot, pan, false, false);
    const fit = roadWidthUniforms.roadDockFitTransform.value;
    const shown = roadWidthUniforms.roadDockTransform.value;
    const frame = { pan, offset, screen };
    configureDockedRoad(road, world, keyboard, true, 149.1938, 5000, keys, {
      ...frame,
      fitCamera: snapshot
    });
    fit.elements.forEach((v, i) => {
      expect(v).toBeCloseTo(shown.elements[i] ?? NaN, 6);
    });
    configureDockedRoad(road, world, keyboard, true, 149.1938, 5000, keys, {
      ...frame,
      fitCamera: "keyboard"
    });
    expect(fit.elements).toEqual(shown.elements);
    configureDockedRoad(road, world, keyboard, true, 149.1938, 5000, keys, false);
    expect(fit.equals(new Matrix4())).toBe(true);
    configureDockedRoad(road, world, keyboard, false, 149.1938, 5000, keys);
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
      "anchorRelativeRoadClip(gl_Position, anchor, roadDockFitTransform * anchor, pinned, roadDockProgress)"
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
      "return anchorRelativeRoadClip(point, anchor, roadDockFitTransform * anchor, pinned, progress)"
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

it("routes legacy docked notes exactly like the CPU legacy far point", () => {
  const taper = /float taper = ([^;]+);/.exec(NOTE_LANE_SHADER)?.[1];
  if (!taper) throw new Error("missing legacy route taper");
  expect(NOTE_LANE_SHADER).toContain(
    "if (roadVertical > 0.0) return vec3(taper, roadVertical, 0.0);"
  );
  expect(NOTE_LANE_SHADER).toContain("return vec3(taper, 0.0, -(roadWidth.y - noteContact.y));");
  expect(NOTE_LANE_SHADER).toContain("- roadRouteDirection() * progress;");
  const across = runInNewContext(
    `(x, axis, farScale) => ${taper
      .replaceAll("instanceMatrix[3].x", "x")
      .replaceAll("roadWidth.w", "axis")
      .replaceAll("roadWidth.z", "farScale")}`
  ) as (x: number, axis: number, farScale: number) => number;
  for (const [x, axis, farScale, farZ, contact] of [
    [33, 0, 0.1, 5000, 149.1938],
    [-410, 25, 0.6, 2200, 145.8],
    [700, -90, 1, 900, 149.1938]
  ] as const) {
    const road = { axis, farScale, farZ };
    const level = legacyRouteFar(x, 22, contact, road);
    expect(across(x, axis, farScale)).toBeCloseTo(level.x - x, 9);
    expect(level.y).toBe(22);
    expect(level.z + contact).toBeCloseTo(-(farZ - contact), 9);
    const rise = legacyRouteFar(x, 22, contact, road, 2000);
    expect(rise.x - x).toBeCloseTo(across(x, axis, farScale), 9);
    expect(rise.y - 22).toBe(2000);
    expect(rise.z).toBe(-contact);
  }
});
