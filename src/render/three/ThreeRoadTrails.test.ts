import { AdditiveBlending, Color, Group, InstancedMesh, Matrix4, ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { ROAD_TRAIL_CAPACITY, RoadTrailSelection } from "./roadTrailGeometry";
import { ThreeRoadTrails } from "./ThreeRoadTrails";

const note = (
  bottom: number,
  top: number,
  overrides: Partial<WorldRoadNote> = {}
): WorldRoadNote => ({
  x: 42,
  top,
  bottom,
  width: 20,
  color: 0x8000ff,
  alpha: 1,
  ...overrides
});

describe("same-lane trail geometry", () => {
  it("connects consecutive nonoverlapping notes in depth order without crossing lanes or changing input", () => {
    const selection = new RoadTrailSelection(8);
    const input = [
      note(400, 450),
      note(180, 200, { x: 70 }),
      note(100, 150, { color: 0xff0000, width: 10 }),
      note(200, 250, { color: 0x0000ff }),
      note(120, 140, { x: 70 })
    ];
    const original = input.map((entry) => ({ ...entry }));
    const count = selection.update(input);
    expect(count).toBe(3);
    expect(selection.trails[0]).toMatchObject({
      x: 42,
      bottom: 150,
      top: 200,
      width: 6.5,
      color: 0x800080
    });
    expect(selection.trails[1]).toMatchObject({ x: 42, bottom: 250, top: 400 });
    expect(selection.trails[2]).toMatchObject({ x: 70, bottom: 140, top: 180 });
    expect(input).toEqual(original);
    const forward = selection.trails.slice(0, count).map((entry) => ({ ...entry }));
    expect(selection.update([...input].reverse())).toBe(count);
    expect(selection.trails.slice(0, count)).toEqual(forward);
  });

  it("keeps overlapping or sustained voices solid and starts the ribbon at their farthest end", () => {
    const selection = new RoadTrailSelection(8);
    const count = selection.update([
      note(100, 300),
      note(150, 220),
      note(250, 350, { alpha: 0.4, width: 8 }),
      note(400, 450, { alpha: 0.7 }),
      note(460, 500)
    ]);
    expect(count).toBe(2);
    expect(selection.trails[0]).toMatchObject({ bottom: 350, top: 400, width: 5.2, alpha: 0.4 });
    expect(selection.trails[1]).toMatchObject({ bottom: 450, top: 460 });
  });

  it("skips touching bodies and large gaps while retaining the next short connection", () => {
    const selection = new RoadTrailSelection(8);
    expect(
      selection.update([note(100, 150), note(150, 200), note(1000, 1100), note(1120, 1200)], 4, 100)
    ).toBe(1);
    expect(selection.trails[0]).toMatchObject({ bottom: 1100, top: 1120 });
  });

  it("honours noteCount, rejects invisible inputs, and reuses fixed output storage", () => {
    const selection = new RoadTrailSelection(4);
    const storage = selection.trails;
    const first = storage[0];
    const input = [note(100, 150), note(200, 250), note(300, 350)];
    expect(selection.update(input)).toBe(2);
    expect(selection.update(input, 1)).toBe(0);
    expect(selection.update(input, 0)).toBe(0);
    expect(selection.update(input, 3, 0)).toBe(0);
    expect(
      selection.update([
        note(100, 150, { alpha: 0 }),
        note(200, 250, { x: Number.NaN }),
        note(300, 350)
      ])
    ).toBe(0);
    expect(selection.trails).toBe(storage);
    expect(selection.trails[0]).toBe(first);
    const bounded = new RoadTrailSelection(ROAD_TRAIL_CAPACITY + 10);
    expect(bounded.capacity).toBe(ROAD_TRAIL_CAPACITY);
    expect(bounded.trails).toHaveLength(ROAD_TRAIL_CAPACITY);
  });
});

function mesh(trails: ThreeRoadTrails): InstancedMesh {
  const child = trails.group.children[0];
  if (!(child instanceof InstancedMesh)) throw new Error("expected instanced trails");
  return child as InstancedMesh;
}

describe("instanced neon trail rendering", () => {
  it("draws a narrow translucent ribbon in one additive instance batch", () => {
    const trails = new ThreeRoadTrails();
    trails.update([note(100, 150), note(200, 250)], 50, 4);
    expect(trails.group.children).toHaveLength(1);
    const batch = mesh(trails);
    expect(batch.count).toBe(1);
    const matrix = new Matrix4();
    batch.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBe(42);
    expect(matrix.elements[13]).toBeCloseTo(50.15);
    expect(matrix.elements[14]).toBe(-175);
    expect(batch.geometry.getAttribute("noteSize").getX(0)).toBe(13);
    expect(batch.geometry.getAttribute("noteSize").getZ(0)).toBe(50);
    const tint = new Color();
    batch.getColorAt(0, tint);
    expect(tint.r).toBeCloseTo(128 / 255);
    expect(tint.g).toBe(0);
    expect(tint.b).toBe(1);
    const material = batch.material;
    if (!(material instanceof ShaderMaterial)) throw new Error("expected trail shader");
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.uniforms.visualTime?.value).toBe(4);
    trails.dispose();
  });

  it("keeps buffers/material/clock objects stable and clears old connections on reset", () => {
    const trails = new ThreeRoadTrails();
    const batch = mesh(trails);
    const geometry = batch.geometry;
    const material = batch.material;
    const matrix = batch.instanceMatrix;
    const colors = batch.instanceColor;
    trails.update([note(100, 150), note(200, 250)], 50, 2);
    trails.update([note(120, 170), note(210, 260)], 50, 2);
    expect(batch.geometry).toBe(geometry);
    expect(batch.material).toBe(material);
    expect(batch.instanceMatrix).toBe(matrix);
    expect(batch.instanceColor).toBe(colors);
    expect(batch.count).toBe(1);
    trails.clear();
    expect(batch.count).toBe(0);
    expect(trails.group.visible).toBe(false);
    trails.update([note(100, 150), note(200, 250)], Number.NaN);
    expect(batch.count).toBe(0);
    const parent = new Group();
    parent.add(trails.group);
    const disposeGeometry = vi.spyOn(geometry, "dispose");
    if (Array.isArray(material)) throw new Error("unexpected material array");
    const disposeMaterial = vi.spyOn(material, "dispose");
    trails.dispose();
    trails.dispose();
    trails.update([note(100, 150), note(200, 250)], 50);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
    expect(trails.group.children).toHaveLength(0);
    expect(batch.count).toBe(0);
  });
});
