import { readFileSync } from "node:fs";
import {
  AdditiveBlending,
  InstancedMesh,
  NormalBlending,
  PerspectiveCamera,
  Texture,
  TextureLoader
} from "three";
import type { PlaneGeometry, ShaderMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERFORMANCE_NOTE_SPIRAL_CAPACITY,
  PERFORMANCE_NOTE_SPIRAL_LIFE,
  PERFORMANCE_NOTE_SPIRAL_GLYPHS,
  PerformanceNoteSpirals,
  performanceNoteSpiralAt
} from "./PerformanceNoteSpirals";

const event = {
  time: 10,
  pitch: 60,
  color: 0xff3366,
  strength: 1,
  position: { x: 10, y: 22, z: -142 }
};
const owned: PerformanceNoteSpirals[] = [];
const camera = () => new PerspectiveCamera(45, 1.6, 5, 10000);
function meshOf(spirals: PerformanceNoteSpirals): InstancedMesh<PlaneGeometry, ShaderMaterial> {
  let mesh: InstancedMesh<PlaneGeometry, ShaderMaterial> | undefined;
  spirals.group.traverse((node) => {
    if (
      node instanceof InstancedMesh &&
      (node.material as ShaderMaterial).blending === NormalBlending
    )
      mesh = node as InstancedMesh<PlaneGeometry, ShaderMaterial>;
  });
  if (!mesh) throw new Error("Missing spiral batch");
  return mesh;
}
async function fixture() {
  const texture = new Texture({ width: 640, height: 128 } as HTMLImageElement);
  const haloTexture = new Texture({ width: 640, height: 128 } as HTMLImageElement);
  const load = vi
    .spyOn(TextureLoader.prototype, "loadAsync")
    .mockResolvedValueOnce(texture)
    .mockResolvedValueOnce(haloTexture);
  const spirals = new PerformanceNoteSpirals();
  owned.push(spirals);
  await Promise.resolve();
  return { spirals, mesh: meshOf(spirals), texture, haloTexture, load };
}
afterEach(() => {
  for (const spirals of owned) spirals.dispose();
  owned.length = 0;
  vi.restoreAllMocks();
});

describe("world musical note spirals", () => {
  it("bakes exactly the five original piano-hit PNGs without relying on fonts or external resources", () => {
    const source = JSON.parse(readFileSync("src/fx/piano-hit.json", "utf8")) as {
      tex: Record<string, string>;
      doc: { textures: { id: string; name: string }[] };
    };
    const svg = readFileSync("src/fx/piano-music-glyphs.svg", "utf8");
    const images = [
      ...svg.matchAll(
        /<image id="([^"]+)" x="(\d+)" y="0" width="128" height="128" href="([^"]+)"/g
      )
    ];
    expect(images).toHaveLength(PERFORMANCE_NOTE_SPIRAL_GLYPHS);
    expect(svg).toContain('width="640" height="128"');
    expect(svg).not.toMatch(/<text|<foreignObject|font-family|href="https?:/);
    for (const [index, image] of images.entries()) {
      const entry = source.doc.textures[index];
      expect(entry).toBeDefined();
      expect(image[1]).toBe(entry?.name);
      expect(Number(image[2])).toBe(index * 128);
      expect(image[3]).toBe(source.tex[entry?.id ?? ""]);
      const bytes = Buffer.from((image[3] ?? "").split(",")[1] ?? "", "base64");
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.readUInt32BE(16)).toBe(128);
      expect(bytes.readUInt32BE(20)).toBe(128);
    }
  });
  it("varies all five glyphs deterministically while retaining each shape throughout its life", () => {
    const glyphs = new Set<number>();
    for (let pitch = 21; pitch <= 108; pitch++) {
      for (let copy = 0; copy < 3; copy++) {
        const source = { ...event, pitch };
        const first = performanceNoteSpiralAt(source, 10.3, 1, copy);
        const later = performanceNoteSpiralAt(source, 11.7, 1, copy);
        const seek = performanceNoteSpiralAt(source, 10.3, 1, copy);
        expect(first.glyph).toBe(later.glyph);
        expect(first).toEqual(seek);
        expect(Number.isInteger(first.glyph)).toBe(true);
        expect(first.glyph).toBeGreaterThanOrEqual(0);
        expect(first.glyph).toBeLessThan(PERFORMANCE_NOTE_SPIRAL_GLYPHS);
        glyphs.add(first.glyph);
      }
    }
    expect([...glyphs].sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it("uses the same atlas frame for each glyph and its glow, with no additional draw batches", async () => {
    const { spirals, mesh } = await fixture();
    spirals.update(10.3, [event], camera(), 1);
    const halo = spirals.group.children[0]?.children[0] as InstancedMesh<
      PlaneGeometry,
      ShaderMaterial
    >;
    expect(spirals.group.children).toHaveLength(2);
    expect(halo.count).toBe(mesh.count);
    for (let copy = 0; copy < 3; copy++) {
      const glyph = performanceNoteSpiralAt(event, 10.3, 1, copy).glyph;
      expect(mesh.geometry.getAttribute("particleShape").getZ(copy)).toBe(glyph);
      expect(halo.geometry.getAttribute("particleShape").getZ(copy)).toBe(glyph);
      const uv = mesh.geometry.getAttribute("particleUv");
      const glowUv = halo.geometry.getAttribute("particleUv");
      expect(uv.getX(copy)).toBeCloseTo(glyph / 5 + 0.5 / 640);
      expect(uv.getZ(copy)).toBeCloseTo(1 / 5 - 1 / 640);
      for (const value of ["getX", "getY", "getZ", "getW"] as const)
        expect(uv[value](copy)).toBe(glowUv[value](copy));
    }
  });

  it("rises two metres on world Y, curls on X/Z, shrinks as it burns and fades for the final two thirds", () => {
    const a = performanceNoteSpiralAt(event, 10.2, 1, 0);
    const b = performanceNoteSpiralAt(event, 11.2, 1, 0);
    const c = performanceNoteSpiralAt(event, 12.4, 1, 0);
    const end = performanceNoteSpiralAt(event, event.time + a.life - 0.00001, 1, 0);
    expect(a.y).toBeGreaterThan(event.position.y + 80);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
    expect(end.y - event.position.y).toBeCloseTo(2000, 1);
    expect(a.x).not.toBeCloseTo(b.x);
    expect(a.z).not.toBeCloseTo(b.z);
    expect(c.width).toBeLessThan(b.width);
    expect(b.width).toBeLessThan(a.width);
    expect(end.width / a.width).toBeCloseTo(0.2, 1);
    expect(end.glowAlpha).toBeLessThan(b.glowAlpha);
    expect(c.alpha).toBeGreaterThan(0);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(80);
    expect(b.rotation).not.toBe(a.rotation);
    expect(c.alpha).toBeLessThan(b.alpha);
    expect(end.alpha).toBeLessThan(0.001);
    expect(performanceNoteSpiralAt(event, 10 + PERFORMANCE_NOTE_SPIRAL_LIFE, 1, 0).alive).toBe(
      false
    );
    const doubled = performanceNoteSpiralAt(
      { ...event, position: { x: 20, y: 44, z: -284 } },
      11.2,
      2,
      0
    );
    for (const key of ["x", "y", "z", "width", "height"] as const)
      expect(doubled[key]).toBeCloseTo(b[key] * 2);
  });
  it("starts at the keyboard origin, varies size by 2-3x and gives each copy its own speed and pulse", () => {
    const points = [0, 1, 2].map((copy) => performanceNoteSpiralAt(event, 10.8, 1, copy));
    const sizes = points.map((p) => p.width);
    const ratio = Math.max(...sizes) / Math.min(...sizes);
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(3.2);
    expect(new Set(points.map((p) => p.life)).size).toBe(3);
    expect(new Set(points.map((p) => p.rotation)).size).toBe(3);
    expect(new Set(points.map((p) => p.y)).size).toBe(3);
    for (let copy = 0; copy < 3; copy++) {
      const born = performanceNoteSpiralAt(event, event.time + copy * 0.08, 1, copy);
      expect(born.x).toBeCloseTo(event.position.x);
      expect(born.y).toBeCloseTo(event.position.y);
      expect(born.z).toBeCloseTo(event.position.z);
      const end = performanceNoteSpiralAt(
        event,
        event.time + copy * 0.08 + born.life - 1e-5,
        1,
        copy
      );
      expect(end.y - event.position.y).toBeCloseTo(2000, 1);
      expect(end.glowAlpha).toBeLessThan(0.001);
    }
    const changedSeed = performanceNoteSpiralAt({ ...event, pitch: 61 }, 10.8, 1, 0);
    expect(changedSeed.rotation).not.toBe(points[0]?.rotation);
    expect(changedSeed.x).not.toBe(points[0]?.x);
  });
  it("reuses the five original piano-hit glyphs, preserves tint and depth occlusion with restrained alpha", async () => {
    const { spirals, mesh, load } = await fixture();
    expect(load.mock.calls[0]?.[0]).toContain("piano-music-glyphs.svg");
    spirals.update(10.3, [event], camera(), 1);
    expect(mesh.count).toBe(3);
    const tint = mesh.geometry.getAttribute("particleTint");
    expect(tint.getX(0)).toBeCloseTo(1.08);
    expect(tint.getY(0)).toBeCloseTo((1.08 * 0x33) / 255);
    expect(tint.getZ(0)).toBeCloseTo((1.08 * 0x66) / 255);
    expect(tint.getW(0)).toBeGreaterThan(0);
    expect(tint.getW(0)).toBeLessThanOrEqual(0.88);
    const halo = spirals.group.children[0]?.children[0] as InstancedMesh<
      PlaneGeometry,
      ShaderMaterial
    >;
    expect(halo.material.blending).toBe(AdditiveBlending);
    expect(halo.material.depthTest).toBe(true);
    expect(halo.material.depthWrite).toBe(false);
    expect(halo.count).toBe(mesh.count);
    expect(halo.geometry.getAttribute("particleTint").getW(0)).toBeLessThanOrEqual(0.11);
    expect(halo.geometry.getAttribute("particleShape").getX(0)).toBeGreaterThan(
      mesh.geometry.getAttribute("particleShape").getX(0)
    );
    expect(mesh.geometry.getAttribute("particleRotation").getX(0)).not.toBe(0);
    expect(mesh.material.blending).toBe(NormalBlending);
    expect(mesh.material.depthTest).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.vertexShader).toContain("atlasVisibility");
  });
  it("retains detached events, freezes on pause and reconstructs the same trajectory after a seek", async () => {
    const { spirals, mesh } = await fixture(),
      view = camera();
    spirals.update(10.3, [event], view, 1);
    const positions = () =>
      Array.from(mesh.geometry.getAttribute("particleCentre").array).slice(0, mesh.count * 3);
    const first = positions();
    view.position.set(500, 600, 1000);
    view.lookAt(event.position.x, event.position.y, event.position.z);
    spirals.update(10.3, [event], view, 1);
    expect(mesh.count).toBe(3);
    expect(positions()).toEqual(first);
    spirals.update(11, [], view, 1);
    expect(mesh.count).toBe(3);
    expect(positions()).not.toEqual(first);
    spirals.update(14, [], view, 1);
    expect(mesh.count).toBe(0);
    spirals.update(10.3, [event], view, 1);
    expect(positions()).toEqual(first);
    spirals.update(10.2, [], view, 1);
    expect(mesh.count).toBe(0);
  });
  it("bounds dense inputs without creating a mesh per event and rejects invalid or future inputs", async () => {
    const { spirals, mesh } = await fixture(),
      view = camera();
    const events = Array.from({ length: 400 }, (_, i) => ({
      ...event,
      time: 10 + i / 4000,
      pitch: 21 + (i % 88),
      position: { x: i, y: 22, z: -142 }
    }));
    spirals.update(10.5, events, view, 1);
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.count).toBeLessThanOrEqual(PERFORMANCE_NOTE_SPIRAL_CAPACITY);
    spirals.update(10.5, events, view, 1);
    expect(meshOf(spirals)).toBe(mesh);
    spirals.clear();
    expect(mesh.count).toBe(0);
    spirals.update(
      10.3,
      [
        { ...event, position: { x: NaN, y: 0, z: 0 } },
        { ...event, time: 12 },
        { ...event, strength: NaN }
      ],
      view,
      1
    );
    expect(mesh.count).toBe(0);
    spirals.update(10.3, [event], view, Infinity);
    expect(mesh.count).toBe(0);
  });
  it("does not resurrect cleared events when the one atlas finishes loading", async () => {
    let resolve: (texture: Texture<HTMLImageElement>) => void = () => {
      throw new Error("Missing loader");
    };
    const pending = new Promise<Texture<HTMLImageElement>>((done) => {
      resolve = done;
    });
    const load = vi
      .spyOn(TextureLoader.prototype, "loadAsync")
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(new Texture({ width: 640, height: 128 } as HTMLImageElement));
    const spirals = new PerformanceNoteSpirals();
    owned.push(spirals);
    spirals.update(10.3, [event], camera(), 1);
    spirals.clear();
    resolve(new Texture({ width: 640, height: 128 } as HTMLImageElement));
    await Promise.resolve();
    expect(spirals.ready).toBe(true);
    spirals.update(10.3, [], camera(), 1);
    expect(meshOf(spirals).count).toBe(0);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("releases only its one atlas and owned mesh resources, once", async () => {
    const { spirals, mesh, texture, haloTexture } = await fixture();
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose"),
      materialDispose = vi.spyOn(mesh.material, "dispose"),
      textureDispose = vi.spyOn(texture, "dispose"),
      haloDispose = vi.spyOn(haloTexture, "dispose");
    spirals.dispose();
    spirals.dispose();
    spirals.update(10.3, [event], camera(), 1);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(haloDispose).toHaveBeenCalledOnce();
    expect(spirals.group.children).toHaveLength(0);
  });
});
