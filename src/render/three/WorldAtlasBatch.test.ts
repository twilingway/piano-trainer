import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  InstancedMesh,
  InstancedBufferAttribute,
  LinearFilter,
  NormalBlending,
  OrthographicCamera,
  PerspectiveCamera,
  LinearSRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import type { PlaneGeometry, ShaderMaterial } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { WorldAtlasBatch, WORLD_ATLAS_CAPACITY_LIMIT } from "./WorldAtlasBatch";
import type { WorldAtlasDefinition } from "./WorldAtlasBatch";

const definition: WorldAtlasDefinition = {
  url: "local-atlas.webp",
  columns: 4,
  rows: 3,
  frames: 12,
  fps: 24,
  anchorY: 0.8
};
const batches: WorldAtlasBatch[] = [];
const camera = () => new PerspectiveCamera(45, 16 / 9, 5, 50000);
function meshOf(batch: WorldAtlasBatch): InstancedMesh<PlaneGeometry, ShaderMaterial> {
  const mesh = batch.group.children[0];
  if (!(mesh instanceof InstancedMesh)) throw new Error("Missing batch mesh");
  return mesh as InstancedMesh<PlaneGeometry, ShaderMaterial>;
}
function texture(width = 640, height = 480): Texture<HTMLImageElement> {
  return new Texture({ width, height } as HTMLImageElement);
}
async function fixture(def = definition, capacity = 4, image = texture()) {
  vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValueOnce(image);
  const batch = new WorldAtlasBatch(def, capacity);
  batches.push(batch);
  await Promise.resolve();
  return { batch, mesh: meshOf(batch), image };
}
afterEach(() => {
  for (const batch of batches) batch.dispose();
  batches.length = 0;
  vi.restoreAllMocks();
});

it.each([
  ["plasma-flame", 8, 12, 96, 144, 192],
  ["piano-mist", 8, 12, 96, 192, 96],
  ["piano-hit", 4, 3, 12, 160, 160],
  ["piano-glitter", 6, 4, 24, 144, 192]
] as const)(
  "maps every %s exported frame inside its own real WebP cell",
  async (name, columns, rows, frames, cellW, cellH) => {
    const metadata = JSON.parse(
      readFileSync(new URL(`../../fx/${name}.json`, import.meta.url), "utf8").replace(/^\uFEFF/, "")
    ) as {
      doc: { exp: { cols: number; rows: number; frames: number; cellW: number; cellH: number } };
    };
    expect(metadata.doc.exp).toMatchObject({ cols: columns, rows, frames, cellW, cellH });
    const bytes = readFileSync(new URL(`../../fx/${name}.webp`, import.meta.url));
    expect(bytes.toString("ascii", 12, 16)).toBe("VP8L");
    const dimensions = bytes.readUInt32LE(21),
      width = (dimensions & 0x3fff) + 1,
      height = ((dimensions >>> 14) & 0x3fff) + 1;
    expect([width, height]).toEqual([columns * cellW, rows * cellH]);
    const { batch, mesh, image } = await fixture(
      { ...definition, columns, rows, frames },
      frames + 2,
      texture(width, height)
    );
    expect(batch.ready).toBe(true);
    batch.begin(camera());
    for (let frame = 0; frame < frames; frame++)
      batch.add(0, 0, -100, 30, 40, 0xffffff, 0.5, frame);
    batch.add(0, 0, -100, 30, 40, 0xffffff, 0.5, -1);
    batch.add(0, 0, -100, 30, 40, 0xffffff, 0.5, frames + 0.9);
    batch.end();
    const uv = mesh.geometry.getAttribute("particleUv"),
      shape = mesh.geometry.getAttribute("particleShape");
    for (let frame = 0; frame < frames; frame++) {
      const column = frame % columns,
        row = Math.floor(frame / columns);
      expect(uv.getX(frame)).toBeCloseTo((column * cellW + 0.5) / width, 6);
      expect(uv.getY(frame)).toBeCloseTo(1 - ((row + 1) * cellH - 0.5) / height, 6);
      expect(uv.getX(frame) + uv.getZ(frame)).toBeCloseTo(((column + 1) * cellW - 0.5) / width, 6);
      expect(uv.getY(frame) + uv.getW(frame)).toBeCloseTo(1 - (row * cellH + 0.5) / height, 6);
      expect(shape.getZ(frame)).toBe(frame);
    }
    expect(shape.getZ(frames)).toBe(frames - 1);
    expect(shape.getZ(frames + 1)).toBe(0);
    expect(image.generateMipmaps).toBe(false);
    expect(image.minFilter).toBe(LinearFilter);
    expect(image.magFilter).toBe(LinearFilter);
    expect(image.colorSpace).toBe(LinearSRGBColorSpace);
    expect(image.flipY).toBe(true);
  }
);

it.each([false, true])(
  "keeps depth occlusion and correct color/blending for additive=%s",
  async (additive) => {
    const { mesh, batch } = await fixture({ ...definition, additive });
    const material = mesh.material;
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.side).toBe(DoubleSide);
    expect(material.blending).toBe(additive ? AdditiveBlending : NormalBlending);
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    batch.begin(camera());
    batch.add(0, 0, -100, 30, 40, 0x808080, 0.5, 0);
    batch.end();
    expect(mesh.geometry.getAttribute("particleTint").getX(0)).toBeCloseTo(128 / 255, 6);
  }
);

it.each(["perspective", "orthographic"])(
  "billboards and anchors follow %s cameras including rear orbit and roll",
  async (kind) => {
    const { batch, mesh } = await fixture();
    const view =
      kind === "perspective" ? camera() : new OrthographicCamera(-400, 400, 300, -300, 5, 50000);
    const parent = new Group();
    parent.rotation.y = 0.3;
    parent.scale.set(1.4, 1, 1);
    parent.add(view);
    for (const position of [
      new Vector3(0, 0, 1000),
      new Vector3(600, 250, -800),
      new Vector3(-400, 700, 300)
    ]) {
      view.position.copy(position);
      view.lookAt(10, 20, 30);
      view.rotateZ(0.4);
      batch.begin(view);
      batch.add(10, 20, 30, 80, 120, 0xffffff, 0.4, 0);
      batch.end();
      const right: unknown = mesh.material.uniforms.cameraRight?.value,
        up: unknown = mesh.material.uniforms.cameraUp?.value;
      if (!(right instanceof Vector3) || !(up instanceof Vector3))
        throw Error("Missing camera basis");
      expect(right.length()).toBeCloseTo(1, 10);
      expect(up.length()).toBeCloseTo(1, 10);
      expect(right.dot(up)).toBeCloseTo(0, 10);
      const shape = mesh.geometry.getAttribute("particleShape");
      const anchorRow = 0.5 - definition.anchorY;
      const anchored = new Vector3(10, 20, 30).addScaledVector(
        up,
        (anchorRow + shape.getW(0)) * shape.getY(0)
      );
      expect(anchored.distanceTo(new Vector3(10, 20, 30))).toBeLessThan(1e-5);
      const positions = mesh.geometry.getAttribute("position");
      const depths: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        const world = new Vector3(10, 20, 30)
          .addScaledVector(right, positions.getX(i) * shape.getX(0))
          .addScaledVector(up, (positions.getY(i) + shape.getW(0)) * shape.getY(0));
        depths.push(world.applyMatrix4(view.matrixWorldInverse).z);
      }
      expect(Math.max(...depths) - Math.min(...depths)).toBeLessThan(1e-8);
    }
  }
);

it("fades the exact shader policy at near, across the camera and for fullscreen expansion", async () => {
  const { mesh } = await fixture();
  const shader = mesh.material.vertexShader;
  const body = /float atlasVisibility\([^)]*\) \{([^}]+)\}/.exec(shader)?.[1];
  if (!body) throw Error("Missing visibility policy");
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const visibility = runInNewContext(`(function(gap,size,span){${body}})`, {
    smoothstep,
    max: Math.max
  }) as (gap: number, size: number, span: number) => number;
  expect(visibility(1000, 100, 0.2)).toBe(1);
  for (const size of [20, 100, 500]) {
    expect(visibility(0, size, 0.5)).toBe(0);
    expect(visibility(-10, size, 0.5)).toBe(0);
    expect(visibility(size, size, 3)).toBe(0);
    expect(visibility(size, size, 1e9)).toBe(0);
    let previous = 0;
    for (let gap = 0; gap <= size; gap += size / 100) {
      const value = visibility(gap, size, 0.5);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value - previous).toBeLessThan(0.031);
      previous = value;
    }
  }
  for (const view of [camera(), new OrthographicCamera(-400, 400, 300, -300, 5, 50000)]) {
    const p = view.projectionMatrix.elements;
    for (const depth of [4, 5, 6, 20, 100, 1000]) {
      const clipZ = -depth * p[10] + p[14],
        clipW = -depth * p[11] + p[15];
      const gap = (clipZ + clipW) / Math.abs(p[10] + p[11]);
      expect(gap).toBeCloseTo(depth - 5, 7);
      expect(Number.isFinite(visibility(gap, 100, 0.5))).toBe(true);
    }
  }
  expect(shader.indexOf("clip.w <= 0.0")).toBeLessThan(shader.indexOf("/ clip.w"));
  expect(shader).not.toContain("max(clip.w");
});

it("rejects nonfinite/degenerate particles, bounds capacity and uploads only the used prefix", async () => {
  const { batch, mesh } = await fixture(definition, 2);
  const valid: [number, number, number, number, number, number, number, number] = [
    0, 0, -100, 20, 30, 0xffffff, 0.5, 0
  ];
  batch.begin(camera());
  for (const [index, value] of [
    [0, NaN],
    [1, Infinity],
    [2, 1e300],
    [3, 0],
    [3, -1],
    [4, NaN],
    [4, 1e300],
    [5, NaN],
    [6, NaN],
    [7, Infinity]
  ]) {
    const invalid = [...valid] as typeof valid;
    invalid[index ?? 0] = value ?? NaN;
    batch.add(...invalid);
  }
  batch.add(...valid);
  batch.add(1, 0, -100, 20, 30, 0xffffff, 2, 1);
  batch.add(2, 0, -100, 20, 30, 0xffffff, 0.5, 2);
  batch.end();
  expect(mesh.count).toBe(2);
  expect(mesh.geometry.getAttribute("particleCentre").getX(1)).toBe(1);
  expect(mesh.geometry.getAttribute("particleTint").getW(1)).toBe(1);
  const uploaded = mesh.geometry.getAttribute("particleCentre");
  if (!(uploaded instanceof InstancedBufferAttribute)) throw new Error("Missing instance buffer");
  expect(uploaded.updateRanges).toEqual([{ start: 0, count: 6 }]);
  batch.begin(camera());
  batch.end();
  expect(mesh.count).toBe(0);
  expect(batch.group.visible).toBe(false);
});

it.each([0, -1, 1.5, NaN, Infinity, WORLD_ATLAS_CAPACITY_LIMIT + 1])(
  "rejects invalid capacity %s before loading",
  (capacity) => {
    const load = vi.spyOn(TextureLoader.prototype, "loadAsync");
    expect(() => new WorldAtlasBatch(definition, capacity)).toThrow(RangeError);
    expect(load).not.toHaveBeenCalled();
  }
);
it.each([
  { columns: 0 },
  { rows: NaN },
  { frames: 13 },
  { fps: 0 },
  { anchorY: Infinity },
  { anchorY: 1.1 }
])("rejects invalid grid/animation metadata %j", (patch) => {
  expect(() => new WorldAtlasBatch({ ...definition, ...patch }, 1)).toThrow(RangeError);
});

it("owns resources exactly once, even when a texture finishes after disposal", async () => {
  let resolve!: (texture: Texture<HTMLImageElement>) => void;
  vi.spyOn(TextureLoader.prototype, "loadAsync").mockReturnValueOnce(
    new Promise<Texture<HTMLImageElement>>((done) => {
      resolve = done;
    })
  );
  const batch = new WorldAtlasBatch(definition, 2);
  batches.push(batch);
  const mesh = meshOf(batch);
  const disposeMesh = vi.spyOn(mesh, "dispose"),
    disposeGeometry = vi.spyOn(mesh.geometry, "dispose"),
    disposeMaterial = vi.spyOn(mesh.material, "dispose");
  const parent = new Group();
  parent.add(batch.group);
  batch.dispose();
  batch.dispose();
  const late = texture(),
    disposeTexture = vi.spyOn(late, "dispose");
  resolve(late);
  await Promise.resolve();
  batch.begin(camera());
  batch.add(0, 0, 0, 1, 1, 0xffffff, 1, 0);
  batch.end();
  expect(batch.ready).toBe(false);
  expect(mesh.count).toBe(0);
  expect(parent.children).toHaveLength(0);
  for (const dispose of [disposeMesh, disposeGeometry, disposeMaterial, disposeTexture])
    expect(dispose).toHaveBeenCalledOnce();
});
it("releases the loaded texture exactly once and leaves no live instances", async () => {
  const { batch, mesh, image } = await fixture();
  const disposed = vi.spyOn(image, "dispose");
  batch.begin(camera());
  batch.add(0, 0, -100, 10, 10, 0xffffff, 0.5, 0);
  batch.end();
  batch.dispose();
  batch.dispose();
  expect(disposed).toHaveBeenCalledOnce();
  expect(mesh.material.uniforms.atlas?.value).toBeNull();
  expect(mesh.count).toBe(0);
  expect(batch.ready).toBe(false);
});
it.each(["network", "grid"])(
  "keeps ready false on %s failure with no unhandled load",
  async (failure) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const image = texture(641, 480),
      disposed = vi.spyOn(image, "dispose");
    const load = vi.spyOn(TextureLoader.prototype, "loadAsync");
    if (failure === "network") load.mockRejectedValueOnce(new Error("offline"));
    else load.mockResolvedValueOnce(image);
    const batch = new WorldAtlasBatch(definition, 2);
    batches.push(batch);
    await Promise.resolve();
    batch.begin(camera());
    batch.add(0, 0, -100, 10, 10, 0xffffff, 0.5, 0);
    batch.end();
    expect(batch.ready).toBe(false);
    expect(meshOf(batch).count).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalledTimes(failure === "grid" ? 1 : 0);
  }
);

it("rotates each billboard in its camera plane without changing the atlas frame or other callers", async () => {
  const { batch, mesh } = await fixture();
  batch.begin(camera());
  batch.add(10, 20, -100, 40, 80, 0x55aaff, 0.6, 5, 1, Math.PI / 2);
  batch.add(10, 20, -100, 40, 80, 0x55aaff, 0.6, 5);
  batch.add(10, 20, -100, 40, 80, 0x55aaff, 0.6, 5, 1, NaN);
  batch.end();
  expect(mesh.count).toBe(2);
  const rotations = mesh.geometry.getAttribute("particleRotation");
  expect(rotations.getX(0)).toBeCloseTo(Math.PI / 2);
  expect(rotations.getX(1)).toBe(0);
  expect(mesh.geometry.getAttribute("particleShape").getZ(0)).toBe(5);
  const body = /vec2 atlasTurn\([^)]*\) \{([^}]+)\}/.exec(mesh.material.vertexShader)?.[1];
  if (!body) throw Error("Missing billboard rotation math");
  const turn = runInNewContext(`(function(x,y,angle){${body}})`, {
    sin: Math.sin,
    cos: Math.cos,
    vec2: (x: number, y: number) => [x, y]
  }) as (x: number, y: number, rotation: number) => [number, number];
  const [x, y] = turn(20, 40, Math.PI / 2);
  expect(x).toBeCloseTo(-40);
  expect(y).toBeCloseTo(20);
  expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(20, 40));
  expect(mesh.material.vertexShader).toContain("vec2 corner = atlasTurn");
  expect(mesh.material.vertexShader).toContain("c * particleShape.x + s * particleShape.y");
});
