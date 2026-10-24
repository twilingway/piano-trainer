import { AdditiveBlending, Color, Group, InstancedMesh, Matrix4, ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import type { WorldRoadNote } from "./roadNoteGeometry";
import {
  THREE_ROAD_NOTE_CAPACITY,
  THREE_ROAD_NOTE_THICKNESS,
  ThreeRoadNotes
} from "./ThreeRoadNotes";

const note = (overrides: Partial<WorldRoadNote> = {}): WorldRoadNote => ({
  x: 42,
  top: 320,
  bottom: 142,
  width: 20,
  color: 0x0080ff,
  alpha: 0.8,
  ...overrides
});

function meshes(notes: ThreeRoadNotes): InstancedMesh[] {
  return notes.group.children.map((child) => {
    if (!(child instanceof InstancedMesh)) throw new Error("expected instanced notes");
    return child as InstancedMesh;
  });
}

describe("instanced world road notes", () => {
  it("puts a rounded solid on the road in unpanned Three coordinates and shares its colour across layers", () => {
    const notes = new ThreeRoadNotes(4);
    const layers = meshes(notes);
    expect(layers).toHaveLength(2);
    notes.update([note()], 50, 3);
    expect(notes.group.visible).toBe(true);
    const body = layers[0];
    if (!body) throw new Error("missing body");
    const matrix = new Matrix4();
    const color = new Color();
    for (const layer of layers) {
      expect(layer.count).toBe(1);
      layer.getMatrixAt(0, matrix);
      expect(matrix.elements[12]).toBe(42);
      expect(matrix.elements[13]).toBeCloseTo(50 + (20 * THREE_ROAD_NOTE_THICKNESS) / 2);
      expect(matrix.elements[14]).toBe(-231);
      expect(matrix.elements[0]).toBe(1);
      expect(matrix.elements[5]).toBe(1);
      expect(matrix.elements[10]).toBe(1);
      layer.getColorAt(0, color);
      expect(color.r).toBe(0);
      expect(color.g).toBeCloseTo(128 / 255);
      expect(color.b).toBe(1);
      expect(layer.geometry.getAttribute("noteAlpha").getX(0)).toBeCloseTo(0.8);
      const size = layer.geometry.getAttribute("noteSize");
      expect(size.getX(0)).toBe(20);
      expect(size.getY(0)).toBeCloseTo(3.6);
      expect(size.getZ(0)).toBe(178);
    }
    const normals = body.geometry.getAttribute("normal");
    expect(
      Array.from({ length: normals.count }, (_, index) => Math.abs(normals.getX(index))).some(
        (value) => value > 0.01 && value < 0.99
      )
    ).toBe(true);
    notes.dispose();
  });

  it("changes short and long durations without replacing geometry, materials or instance storage", () => {
    const notes = new ThreeRoadNotes(8);
    const layers = meshes(notes);
    const resources = layers.map((layer) => ({
      geometry: layer.geometry,
      material: layer.material,
      matrix: layer.instanceMatrix,
      color: layer.instanceColor,
      size: layer.geometry.getAttribute("noteSize"),
      alpha: layer.geometry.getAttribute("noteAlpha")
    }));
    notes.update([note({ top: 142.1, width: 8 })], 50, 1);
    const initialPositions = layers[0]?.geometry.getAttribute("position");
    notes.update([note({ top: 2142, width: 22 }), note({ x: -40, color: 0xff0000 })], 50, 1);
    layers.forEach((layer, index) => {
      const before = resources[index];
      if (!before) throw new Error("missing resource");
      expect(layer.geometry).toBe(before.geometry);
      expect(layer.material).toBe(before.material);
      expect(layer.instanceMatrix).toBe(before.matrix);
      expect(layer.instanceColor).toBe(before.color);
      expect(layer.geometry.getAttribute("noteSize")).toBe(before.size);
      expect(layer.geometry.getAttribute("noteAlpha")).toBe(before.alpha);
      expect(before.size.getZ(0)).toBe(2000);
      expect(layer.count).toBe(2);
    });
    expect(layers[0]?.geometry.getAttribute("position")).toBe(initialPositions);
    expect(layers[0]?.instanceMatrix).toBe(layers[1]?.instanceMatrix);
    expect(layers[0]?.instanceColor).toBe(layers[1]?.instanceColor);
    notes.dispose();
  });

  it("bounds the instance budget and observes noteCount without reviving old tail entries", () => {
    const notes = new ThreeRoadNotes(2);
    const input = [note(), note({ x: 60 }), note({ x: 80 })];
    notes.update(input, 50);
    expect(meshes(notes).every((layer) => layer.count === 2)).toBe(true);
    notes.update(input, 50, 0, 1);
    expect(meshes(notes).every((layer) => layer.count === 1)).toBe(true);
    notes.update(input, 50, 0, 0);
    expect(meshes(notes).every((layer) => layer.count === 0)).toBe(true);
    expect(notes.group.visible).toBe(false);
    notes.dispose();
    const maximum = new ThreeRoadNotes(THREE_ROAD_NOTE_CAPACITY + 100);
    expect(maximum.capacity).toBe(THREE_ROAD_NOTE_CAPACITY);
    maximum.dispose();
  });

  it("skips invalid or invisible notes and clears invalid floor coordinates", () => {
    const notes = new ThreeRoadNotes(8);
    notes.update(
      [
        note({ top: 100 }),
        note({ width: 0 }),
        note({ alpha: 0 }),
        note({ x: Number.NaN }),
        note({ color: Number.NaN }),
        note()
      ],
      50
    );
    expect(meshes(notes).every((layer) => layer.count === 1)).toBe(true);
    notes.update([note()], Number.NaN);
    expect(notes.group.visible).toBe(false);
    expect(meshes(notes).every((layer) => layer.count === 0)).toBe(true);
    notes.dispose();
  });

  it("uses caller visual time and an exterior additive halo without reallocating uniforms", () => {
    const notes = new ThreeRoadNotes(2);
    const materials = meshes(notes)
      .map((layer) => layer.material)
      .filter((material): material is ShaderMaterial => material instanceof ShaderMaterial);
    const timeUniforms = materials.map((material) => material.uniforms.visualTime);
    expect(materials.filter((material) => material.blending === AdditiveBlending)).toHaveLength(1);
    expect(materials.find((material) => material.blending !== AdditiveBlending)?.depthWrite).toBe(
      false
    );
    expect(materials.find((material) => material.blending === AdditiveBlending)?.depthTest).toBe(
      true
    );
    expect(materials.find((material) => material.blending !== AdditiveBlending)?.depthTest).toBe(
      true
    );
    notes.update([note()], 50, 4);
    notes.update([note({ bottom: 160 })], 50, 4);
    timeUniforms.forEach((uniform) => {
      expect(uniform?.value).toBe(4);
    });
    materials.forEach((material, index) => {
      expect(material.uniforms.visualTime).toBe(timeUniforms[index]);
    });
    notes.dispose();
  });

  it("clears and disposes only its owned resources once, and cannot revive after disposal", () => {
    const notes = new ThreeRoadNotes(2);
    const parent = new Group();
    parent.add(notes.group);
    notes.update([note()], 50);
    const layers = meshes(notes);
    const geometries = [...new Set(layers.map((layer) => layer.geometry))];
    const materials = layers.map((layer) => layer.material);
    const geometryDisposals = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
    const materialDisposals = materials.map((material) => {
      if (Array.isArray(material)) throw new Error("unexpected material array");
      return vi.spyOn(material, "dispose");
    });
    expect(geometries).toHaveLength(2);
    notes.clear();
    expect(layers.every((layer) => layer.count === 0)).toBe(true);
    notes.dispose();
    notes.dispose();
    notes.update([note()], 50);
    expect(parent.children).toHaveLength(0);
    expect(notes.group.children).toHaveLength(0);
    expect(layers.every((layer) => layer.count === 0)).toBe(true);
    expect(geometryDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
  it("uses one closed emissive volume for both caps, sides and bevels during a full orbit", () => {
    const notes = new ThreeRoadNotes(2);
    notes.update([note()], 50, 17);
    const layers = meshes(notes),
      body = layers[0];
    if (!body || !(body.material instanceof ShaderMaterial)) throw Error("Missing volume body");
    expect(layers).toHaveLength(2);
    expect(body.material.uniforms.visualTime?.value).toBe(17);
    expect(body.material.lights).toBe(false);
    const normals = body.geometry.getAttribute("normal");
    for (const axis of [0, 1, 2]) {
      const values = Array.from({ length: normals.count }, (_, i) => normals.getComponent(i, axis));
      expect(Math.max(...values)).toBeGreaterThan(0.99);
      expect(Math.min(...values)).toBeLessThan(-0.99);
    }
    expect(layers[0]?.instanceMatrix).toBe(layers[1]?.instanceMatrix);
    notes.update([note({ color: 0xff0080 })], 50, 18);
    const color = new Color();
    body.getColorAt(0, color);
    expect(color.r).toBe(1);
    expect(color.b).toBeCloseTo(128 / 255);
    expect(body.material.uniforms.visualTime?.value).toBe(18);
    notes.dispose();
  });
});

it("keeps real rounded volume and restores the exact legacy glass material after filled style", () => {
  const view = new ThreeRoadNotes(4);
  const [body, halo] = meshes(view);
  if (
    !body ||
    !halo ||
    !(body.material instanceof ShaderMaterial) ||
    !(halo.material instanceof ShaderMaterial)
  )
    throw new Error("Expected two note batches");
  const geometry = body.geometry;
  const glass = body.material;
  const glassShader = glass.fragmentShader;
  const glassHalo = halo.material;
  view.setStyle("filled");
  const solid = body.material;
  expect(solid.transparent).toBe(false);
  expect(solid.depthWrite).toBe(true);
  expect(halo.material.transparent).toBe(false);
  expect(halo.material.depthWrite).toBe(false);
  expect(halo.renderOrder).toBeLessThan(body.renderOrder);
  expect(body.geometry).toBe(geometry);
  view.update([note(), note({ x: 1, top: 180, bottom: 142, color: 0xff0000 })], 22, 3);
  expect(body.count).toBe(2);
  const normals = geometry.getAttribute("normal");
  for (const axis of [0, 1, 2]) {
    const values = Array.from({ length: normals.count }, (_, index) =>
      normals.getComponent(index, axis)
    );
    expect(Math.max(...values)).toBeGreaterThan(0.99);
    expect(Math.min(...values)).toBeLessThan(-0.99);
  }
  const sizes = body.geometry.getAttribute("noteSize");
  expect(sizes.getY(0)).toBeGreaterThan(0);
  expect(sizes.getZ(0)).toBeGreaterThan(0);
  expect(body.instanceMatrix.array.every(Number.isFinite)).toBe(true);
  view.setStyle("glass");
  expect(body.material).toBe(glass);
  expect(body.material.fragmentShader).toBe(glassShader);
  expect(halo.material).toBe(glassHalo);
  expect(halo.renderOrder).toBe(1);
  view.setStyle("filled");
  expect(body.material).toBe(solid);
  view.dispose();
});
