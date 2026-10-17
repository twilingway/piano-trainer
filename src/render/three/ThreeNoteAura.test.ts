import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  ShaderMaterial
} from "three";
import { describe, expect, it, vi } from "vitest";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { NOTE_AURA_CAPACITY, NOTE_AURA_LAYERS, ThreeNoteAura } from "./ThreeNoteAura";

const note = (overrides: Partial<WorldRoadNote> = {}): WorldRoadNote => ({
  x: 42,
  top: 420,
  bottom: 142,
  width: 20,
  color: 0x0080ff,
  alpha: 0.8,
  ...overrides
});
function mesh(aura: ThreeNoteAura): InstancedMesh {
  const child = aura.group.children[0];
  if (!(child instanceof InstancedMesh)) throw new Error("expected instanced aura");
  return child as InstancedMesh;
}

describe("exterior long-note lava aura", () => {
  it("fits every batch within WebGL2's minimum sixteen vertex attribute slots", () => {
    const aura = new ThreeNoteAura();
    const batch = mesh(aura);
    // Include even unused position/normal/UV streams, plus instance color and the mat4's four slots.
    const geometrySlots = Object.values(batch.geometry.attributes).reduce(
      (sum, attr) => sum + Math.ceil(attr.itemSize / 4),
      0
    );
    expect(geometrySlots + 1 + 4).toBeLessThanOrEqual(16);
    expect(batch.geometry.getAttribute("noteEnvelope").itemSize).toBe(3);
    expect(batch.geometry.hasAttribute("noteAlpha")).toBe(false);
    expect(batch.geometry.hasAttribute("noteOffset")).toBe(false);
    expect(batch.geometry.hasAttribute("noteLayer")).toBe(false);
    aura.dispose();
  });
  it("gives each qualifying note exactly two shells in one rounded-geometry batch", () => {
    const aura = new ThreeNoteAura();
    aura.update(
      [
        note({ duration: 0.599 }),
        note({ duration: 0.6, top: 144 }),
        note({ top: 202 }),
        note({ top: 204 }),
        note({ duration: Number.NaN })
      ],
      50
    );
    const batch = mesh(aura);
    expect(batch.count).toBe(4);
    expect(aura.group.children).toHaveLength(1);
    expect(batch.geometry.name).toBe("note-chamfered-slab");
    const size = batch.geometry.getAttribute("noteSize");
    const layer = batch.geometry.getAttribute("noteEnvelope");
    expect([size.getZ(0), size.getZ(1), size.getZ(2), size.getZ(3)]).toEqual([2, 2, 62, 62]);
    expect([layer.getY(0), layer.getY(1), layer.getY(2), layer.getY(3)]).toEqual([0, 1, 0, 1]);
    aura.dispose();
  });

  it("matches the real note body and trims the consumed near end while retaining the far end", () => {
    const aura = new ThreeNoteAura();
    aura.update([note({ duration: 2, seed: 0.2 })], 50, 7);
    const batch = mesh(aura);
    const geometry = batch.geometry;
    const size = geometry.getAttribute("noteSize");
    const params = geometry.getAttribute("noteParams");
    const original = Array.from(params.array).slice(0, 8);
    const matrix = new Matrix4();
    for (let layer = 0; layer < NOTE_AURA_LAYERS; layer++) {
      batch.getMatrixAt(layer, matrix);
      expect(matrix.elements[12]).toBe(42);
      expect(matrix.elements[13]).toBeCloseTo(51.8);
      expect(size.getX(layer)).toBe(20);
      expect(size.getY(layer)).toBeCloseTo(3.6);
      expect(matrix.elements[14] - size.getZ(layer) / 2).toBe(-420);
      expect(matrix.elements[14] + size.getZ(layer) / 2).toBe(-142);
    }
    aura.update([note({ duration: 2, seed: 0.2, bottom: 200 })], 50, 7);
    batch.getMatrixAt(0, matrix);
    expect(batch.geometry).toBe(geometry);
    expect(size.getZ(0)).toBe(220);
    expect(matrix.elements[14] - size.getZ(0) / 2).toBe(-420);
    expect(matrix.elements[14] + size.getZ(0) / 2).toBe(-200);
    expect(Array.from(params.array).slice(0, 8)).toEqual(original);
    aura.dispose();
  });

  it("preserves note hue with transparent depth-tested shells and no opaque body", () => {
    const aura = new ThreeNoteAura();
    aura.update([note()], 50, 7);
    const batch = mesh(aura);
    const material = batch.material;
    if (!(material instanceof ShaderMaterial)) throw new Error("expected aura shader");
    const color = new Color();
    for (let layer = 0; layer < NOTE_AURA_LAYERS; layer++) {
      batch.getColorAt(layer, color);
      expect(color.r).toBe(0);
      expect(color.g).toBeCloseTo(128 / 255);
      expect(color.b).toBe(1);
      expect(batch.geometry.getAttribute("noteEnvelope").getX(layer)).toBeGreaterThanOrEqual(0.6);
      expect(batch.geometry.getAttribute("noteEnvelope").getX(layer)).toBeLessThanOrEqual(0.8);
    }
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.side).toBe(DoubleSide);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.fragmentShader).not.toContain("helix");
    expect(material.fragmentShader).not.toContain("atan(");
    expect(batch.renderOrder).toBe(3);
    aura.dispose();
  });

  it("keeps seeded lava slow and stable during note travel, repeated frames and pause", () => {
    const aura = new ThreeNoteAura();
    aura.update([note({ seed: 0.2 })], 50, 9);
    const batch = mesh(aura);
    const params = batch.geometry.getAttribute("noteParams");
    const original = Array.from(params.array);
    const matrix = batch.instanceMatrix;
    const color = batch.instanceColor;
    expect(Math.abs(params.getY(0))).toBeGreaterThanOrEqual(0.12);
    expect(Math.abs(params.getY(0))).toBeLessThanOrEqual(0.25);
    aura.update([note({ seed: 0.2, x: 120, top: 320, bottom: 42 })], 50, 9);
    expect(batch.geometry.getAttribute("noteParams")).toBe(params);
    expect(Array.from(params.array)).toEqual(original);
    expect(batch.instanceMatrix).toBe(matrix);
    expect(batch.instanceColor).toBe(color);
    const material = batch.material;
    if (!(material instanceof ShaderMaterial)) throw new Error("expected aura shader");
    expect(material.uniforms.visualTime?.value).toBe(9);
    aura.update([note({ seed: 0.2 })], 50, Number.NaN);
    expect(material.uniforms.visualTime?.value).toBe(0);
    aura.dispose();
  });

  it("advances the supplied time while a fully visible note and all instance data remain fixed", () => {
    const aura = new ThreeNoteAura();
    const input = [note({ seed: 0.4, duration: 1.2, textureOffset: 0 })];
    aura.update(input, 50, 9);
    const batch = mesh(aura);
    const matrix = Array.from(batch.instanceMatrix.array);
    const params = Array.from(batch.geometry.getAttribute("noteParams").array);
    const material = batch.material;
    if (!(material instanceof ShaderMaterial)) throw new Error("expected aura shader");
    const time = material.uniforms.visualTime;
    // Boiling must not deform endpoint geometry as clipping changes the box dimensions.
    expect(material.vertexShader).not.toContain("visualTime");
    expect(material.vertexShader).not.toContain("noise3");
    expect(time?.value).toBe(9);
    aura.update(input, 50, 10);
    expect(material.uniforms.visualTime).toBe(time);
    expect(time?.value).toBe(10);
    expect(Array.from(batch.instanceMatrix.array)).toEqual(matrix);
    expect(Array.from(batch.geometry.getAttribute("noteParams").array)).toEqual(params);
    aura.update(input, 50, 10);
    expect(time?.value).toBe(10);
    aura.dispose();
  });

  it("retains the same material coordinate through far clipping, full visibility and near consumption", () => {
    const aura = new ThreeNoteAura();
    const states = [
      note({ top: 320, bottom: 142, textureOffset: 100 }),
      note({ top: 420, bottom: 142, textureOffset: 0 }),
      note({ top: 420, bottom: 200, textureOffset: 0 }),
      note({ top: 460, bottom: 200, textureOffset: -40 })
    ];
    const coordinates: number[] = [];
    const matrix = new Matrix4();
    for (const state of states) {
      aura.update([state], 50, 7);
      const batch = mesh(aura);
      const sizes = batch.geometry.getAttribute("noteSize");
      const offsets = batch.geometry.getAttribute("noteEnvelope");
      for (let layer = 0; layer < NOTE_AURA_LAYERS; layer++) {
        batch.getMatrixAt(layer, matrix);
        // Evaluate the shader's far-origin coordinate at the same retained world point.
        const localZ = -300 - matrix.elements[14];
        const coordinate =
          (localZ + sizes.getZ(layer) * 0.5 + offsets.getZ(layer)) / sizes.getX(layer);
        coordinates.push(coordinate);
        expect(offsets.getZ(layer)).toBe(state.textureOffset);
      }
    }
    expect(coordinates).toEqual([6, 6, 6, 6, 6, 6, 6, 6]);
    aura.update([note({ textureOffset: Number.NaN }), note({ textureOffset: -5 })], 50);
    const offsets = mesh(aura).geometry.getAttribute("noteEnvelope");
    expect(offsets.getZ(0)).toBe(0);
    expect(offsets.getZ(2)).toBe(-5);
    aura.dispose();
  });

  it("varies phase, flow, frequency, spread and alpha by stable seed", () => {
    const aura = new ThreeNoteAura();
    const input = Array.from({ length: 8 }, (_, index) => note({ seed: index / 8 }));
    aura.update(input, 50);
    const batch = mesh(aura);
    const params = batch.geometry.getAttribute("noteParams");
    const alpha = batch.geometry.getAttribute("noteEnvelope");
    for (let component = 0; component < 4; component++) {
      expect(new Set(input.map((_, index) => params.array[index * 8 + component])).size).toBe(
        input.length
      );
    }
    expect(new Set(input.map((_, index) => alpha.getX(index * 2))).size).toBe(input.length);
    expect(input.some((_, index) => params.getY(index * 2) < 0)).toBe(true);
    expect(input.some((_, index) => params.getY(index * 2) > 0)).toBe(true);
    const snapshot = Array.from(params.array);
    aura.update(input, 50);
    expect(Array.from(params.array)).toEqual(snapshot);
    aura.update([note(), note({ top: 300, bottom: 22 })], 50);
    for (let component = 0; component < 4; component++)
      expect(params.array[component]).toBe(params.array[8 + component]);
    aura.dispose();
  });

  it("bounds the shell count and rejects invalid geometry and unused tail entries", () => {
    const aura = new ThreeNoteAura();
    const input = Array.from({ length: NOTE_AURA_CAPACITY + 10 }, (_, index) => note({ x: index }));
    aura.update(input, 50);
    const batch = mesh(aura);
    expect(batch.count).toBe(NOTE_AURA_CAPACITY * NOTE_AURA_LAYERS);
    aura.update(input, 50, 0, 1);
    expect(batch.count).toBe(NOTE_AURA_LAYERS);
    aura.update(input, 50, 0, 0);
    expect(batch.count).toBe(0);
    aura.update(
      [note({ width: 0 }), note({ alpha: 0 }), note({ x: Number.NaN }), note({ bottom: 450 })],
      50
    );
    expect(batch.count).toBe(0);
    aura.update(input, Number.NaN);
    expect(batch.count).toBe(0);
    expect(aura.group.visible).toBe(false);
    aura.dispose();
  });

  it("clears and disposes only owned resources once, without reviving the pool", () => {
    const aura = new ThreeNoteAura();
    const parent = new Group();
    parent.add(aura.group);
    aura.update([note()], 50);
    const batch = mesh(aura);
    const material = batch.material;
    if (Array.isArray(material)) throw new Error("unexpected material array");
    const disposeGeometry = vi.spyOn(batch.geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");
    aura.clear();
    expect(batch.count).toBe(0);
    aura.dispose();
    aura.dispose();
    aura.update([note()], 50);
    expect(batch.count).toBe(0);
    expect(parent.children).toHaveLength(0);
    expect(aura.group.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
