// @vitest-environment happy-dom
import { Assets, Texture } from "pixi.js";
import type { Mesh } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLASS_LIFT_SHARE, RoadGlassLayer } from "./RoadGlassLayer";

afterEach(() => vi.restoreAllMocks());

const project = (y: number, offsetX: number, lift = 0) => ({
  x: 300 + offsetX,
  y: y - lift
});

describe("luminous road notes", () => {
  it("keeps its baked material usable when the optional atlases fail", async () => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    vi.spyOn(Assets, "load").mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const notes = new RoadGlassLayer();
    await notes.load();
    expect(notes.ready).toBe(true);
    notes.begin();
    notes.draw(20, 80, 40, 0xb54cff, 1, 0, 100, project);
    const face = notes.container.children.find((child) => child.blendMode === "normal");
    expect(face?.visible).toBe(true);
    expect(notes.container.children.some((child) => child.zIndex === -Infinity)).toBe(true);
  });

  it("expands only the bloom while keeping the visible face's duration and pooled geometry", () => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    const notes = new RoadGlassLayer();
    notes.begin();
    notes.draw(20, 80, 40, 0xff780a, 1, 0, 100, project);
    const face = notes.container.children.find((child) => child.blendMode === "normal") as Mesh;
    const bloom = notes.container.children.find((child) => child.zIndex === -Infinity) as Mesh;
    const bounds = (mesh: Mesh) => {
      const vertices = mesh.geometry.getBuffer("aPosition").data;
      const x: number[] = [],
        y: number[] = [];
      for (let index = 0; index < vertices.length; index += 2) {
        x.push(vertices[index] ?? 0);
        y.push(vertices[index + 1] ?? 0);
      }
      return {
        left: Math.min(...x),
        right: Math.max(...x),
        top: Math.min(...y),
        bottom: Math.max(...y)
      };
    };
    const solid = bounds(face),
      light = bounds(bloom);
    expect(solid.left).toBeCloseTo(280);
    expect(solid.right).toBeCloseTo(320);
    expect(solid.top).toBeCloseTo(20 - 40 * GLASS_LIFT_SHARE);
    expect(solid.bottom).toBeCloseTo(80 - 40 * GLASS_LIFT_SHARE);
    expect(light.left).toBeLessThan(solid.left);
    expect(light.right).toBeGreaterThan(solid.right);
    expect(light.top).toBeLessThan(solid.top);
    expect(light.bottom).toBeGreaterThan(solid.bottom);
    const geometry = face.geometry;
    notes.begin();
    notes.draw(50, 80, 40, 0xff780a, 1, 0, 100, project);
    expect(face.geometry).toBe(geometry);
    expect(bounds(face).top).toBeCloseTo(50 - 40 * GLASS_LIFT_SHARE);
    notes.begin();
    notes.end();
    expect(notes.container.children.every((child) => !child.visible)).toBe(true);
  });
});
