import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { PianoCase } from "./PianoCase";
import type { Keyboard88 } from "./keyboard88";

function setup() {
  const material = new MeshStandardMaterial();
  const source = new Group();
  for (const name of [
    "slip.001",
    "board.001",
    "felt.001",
    "table.001",
    "cheek-left",
    "cheek-right",
    "panel-left",
    "panel-right"
  ]) {
    const mesh = new Mesh(new BoxGeometry(1, 0.02, 0.2), material);
    mesh.name = name;
    source.add(mesh);
  }
  const keyboard: Keyboard88 = { keys: new Map(), case: source, dispose: vi.fn() };
  return { source, material, keyboard, cabinet: new PianoCase(keyboard) };
}

describe("original keyboard88 housing", () => {
  it("keeps all eight source pieces, including the table, under one uniform metric transform", () => {
    const v = setup();
    v.cabinet.layout(-164.5);
    expect(v.cabinet.group.children.map((part) => part.name)).toEqual(
      v.source.children.map((part) => part.name)
    );
    expect(v.cabinet.group.scale.toArray()).toEqual([1000, 1000, 1000]);
    expect(v.cabinet.group.position.toArray()).toEqual([-164.5, 22, 0]);
    expect(v.cabinet.group.getObjectByName("table.001")).toBeDefined();
    const first = v.cabinet.group.children[0] as Mesh;
    const original = v.source.children[0] as Mesh;
    expect(first).not.toBe(original);
    expect(first.geometry).toBe(original.geometry);
    expect(first.material).toBe(original.material);
    v.cabinet.group.updateMatrixWorld(true);
    const size = new Box3().setFromObject(first).getSize(new Vector3());
    expect(size.toArray()).toEqual([1000, expect.closeTo(20, 4), expect.closeTo(200, 4)]);
    v.cabinet.layout(250);
    expect(v.cabinet.group.scale.toArray()).toEqual([1000, 1000, 1000]);
    expect(v.cabinet.group.children).toHaveLength(8);
    v.cabinet.dispose();
  });

  it("never frees shared asset geometry or maps on layout, clear or repeated disposal", () => {
    const v = setup();
    const disposals = v.source.children.map((part) => vi.spyOn((part as Mesh).geometry, "dispose"));
    const material = vi.spyOn(v.material, "dispose");
    v.cabinet.layout(0);
    v.cabinet.layout(100);
    v.cabinet.clear();
    v.cabinet.dispose();
    v.cabinet.dispose();
    v.cabinet.layout(0);
    expect(v.cabinet.group.children).toHaveLength(0);
    expect(disposals.every((dispose) => dispose.mock.calls.length === 0)).toBe(true);
    expect(material).not.toHaveBeenCalled();
    expect(v.keyboard.dispose).not.toHaveBeenCalled();
    for (const part of v.source.children) (part as Mesh).geometry.dispose();
    v.material.dispose();
  });

  it("shortens only the front shelf and supports while fixing the rear, key-bed and shared source", () => {
    const v = setup();
    for (const part of v.source.children) {
      if (!["table.001", "panel-left", "panel-right"].includes(part.name)) continue;
      (part as Mesh).geometry = new BoxGeometry(1.29, 0.03, 0.265);
      part.position.z = -0.0225;
    }
    v.cabinet.layout(0);
    v.cabinet.group.updateMatrixWorld(true);
    for (const name of ["table.001", "panel-left", "panel-right"]) {
      const clone = v.cabinet.group.getObjectByName(name);
      const original = v.source.getObjectByName(name);
      if (!clone || !original) throw new Error("missing case piece");
      const compact = new Box3().setFromObject(clone);
      const source = new Box3().setFromObject(original);
      expect(compact.min.z).toBeCloseTo(-155, 4);
      expect(compact.max.z).toBeCloseTo(34, 4);
      expect(compact.max.x - compact.min.x).toBeCloseTo((source.max.x - source.min.x) * 1000, 4);
      expect(compact.max.y - compact.min.y).toBeCloseTo((source.max.y - source.min.y) * 1000, 4);
      expect(original.scale.toArray()).toEqual([1, 1, 1]);
      expect(original.position.z).toBe(-0.0225);
      expect(source.max.z).toBeCloseTo(0.11, 6);
      expect((clone as Mesh).geometry).toBe((original as Mesh).geometry);
    }
    expect(v.cabinet.group.getObjectByName("slip.001")?.scale.toArray()).toEqual([1, 1, 1]);
    v.cabinet.dispose();
    for (const part of v.source.children) (part as Mesh).geometry.dispose();
    v.material.dispose();
  });
});
