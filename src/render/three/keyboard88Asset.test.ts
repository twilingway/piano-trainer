import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}
interface Primitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices: number;
  readonly material: number;
  readonly extras: { readonly role: string };
}
interface Asset {
  readonly nodes: readonly {
    readonly name: string;
    readonly mesh: number;
    readonly translation: readonly [number, number, number];
    readonly scale?: readonly number[];
    readonly extras: {
      readonly role: string;
      readonly midi?: number;
      readonly dipM?: number;
    };
  }[];
  readonly meshes: readonly { readonly primitives: readonly Primitive[] }[];
  readonly accessors: readonly Accessor[];
  readonly bufferViews: readonly { readonly byteOffset: number; readonly byteLength: number }[];
  readonly materials: readonly {
    readonly extras: { readonly role: string };
    readonly pbrMetallicRoughness: { readonly baseColorTexture: { readonly index: number } };
  }[];
  readonly images: readonly { readonly mimeType: string; readonly bufferView: number }[];
  readonly skins?: unknown;
  readonly animations?: unknown;
}

const bytes = readFileSync("public/models/keyboard88.glb");
const jsonSize = bytes.readUInt32LE(12);
const asset = JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize)) as Asset;
const binaryStart = 20 + jsonSize + 8;

function values(index: number): readonly number[] {
  const accessor = asset.accessors[index];
  if (!accessor) throw new Error(`Missing accessor ${String(index)}`);
  const view = asset.bufferViews[accessor.bufferView];
  if (!view) throw new Error(`Missing buffer view ${String(accessor.bufferView)}`);
  const components = { VEC2: 2, VEC3: 3, VEC4: 4, SCALAR: 1 }[accessor.type];
  if (!components || accessor.componentType !== 5126) throw new Error("Expected float32 data");
  const start = binaryStart + view.byteOffset + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count * components }, (_, i) =>
    bytes.readFloatLE(start + i * 4)
  );
}

function partBounds(name: string): { min: number[]; max: number[] } {
  const node = asset.nodes.find((part) => part.name === name);
  if (!node) throw new Error(`Missing ${name}`);
  const mesh = asset.meshes[node.mesh];
  if (!mesh) throw new Error(`Missing mesh ${String(node.mesh)}`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.primitives) {
    const positionIndex = primitive.attributes.POSITION;
    if (positionIndex === undefined) throw new Error("Missing position");
    const positions = values(positionIndex);
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      const value = (positions[i] ?? 0) + (node.translation[axis] ?? 0);
      min[axis] = Math.min(min[axis] ?? Infinity, value);
      max[axis] = Math.max(max[axis] ?? -Infinity, value);
    }
  }
  return { min, max };
}

describe("published keyboard88 binary contract", () => {
  it("contains the full real keyboard and exactly the eight source case objects", () => {
    expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const keys = asset.nodes.filter((node) => node.extras.role === "key");
    expect(keys.map((node) => node.extras.midi)).toEqual(
      Array.from({ length: 88 }, (_, i) => i + 21)
    );
    expect(keys.every((node) => node.name === `key-${String(node.extras.midi)}`)).toBe(true);
    expect(keys.every((node) => node.extras.dipM === 0.008)).toBe(true);
    expect(new Set(keys.map((node) => node.mesh)).size).toBe(5);
    expect(
      asset.nodes.filter((node) => node.extras.role === "case").map((node) => node.name)
    ).toEqual([
      "slip.001",
      "board.001",
      "felt.001",
      "table.001",
      "cheek-left",
      "cheek-right",
      "panel-left",
      "panel-right"
    ]);
    expect(asset.nodes).toHaveLength(96);
    expect(asset.skins).toBeUndefined();
    expect(asset.animations).toBeUndefined();
    expect(asset.nodes.every((node) => node.scale === undefined)).toBe(true);
  });

  it("retains metric source dimensions, absolute C4 anchor and the floor-reaching case", () => {
    const at = (midi: number) => asset.nodes.find((node) => node.extras.midi === midi)?.translation;
    expect(at(60)?.[0]).toBeCloseTo(0.36, 7);
    expect(at(60)?.[1]).toBeCloseTo(0.74, 7);
    expect(at(60)?.[2]).toBeCloseTo(-0.3, 7);
    expect((at(50)?.[0] ?? 0) - (at(48)?.[0] ?? 0)).toBeCloseTo(0.0235, 7);
    expect((at(60)?.[0] ?? 0) - (at(48)?.[0] ?? 0)).toBeCloseTo(0.1645, 7);
    const white = partBounds("key-60");
    expect((white.max[2] ?? 0) - (white.min[2] ?? 0)).toBeCloseTo(0.15, 5);
    expect(white.max[1]).toBeCloseTo(0.74, 6);
    expect(partBounds("key-61").max[1]).toBeCloseTo(0.752, 6);
    expect(partBounds("panel-left").min[1]).toBeCloseTo(0, 6);
    const all = asset.nodes.map((node) => partBounds(node.name));
    expect(Math.min(...all.map((bounds) => bounds.min[0] ?? 0))).toBeCloseTo(-0.28625, 5);
    expect(Math.max(...all.map((bounds) => bounds.max[0] ?? 0))).toBeCloseTo(1.12375, 5);
  });

  it("keeps baked UVs and maps separate from ordered painted top/body primitives", () => {
    for (const node of asset.nodes) {
      const mesh = asset.meshes[node.mesh];
      if (!mesh) throw new Error("Missing node mesh");
      expect(mesh.primitives.map((primitive) => primitive.extras.role)).toEqual(
        node.extras.role === "key" ? ["top", "body"] : ["case"]
      );
      for (const primitive of mesh.primitives) {
        const material = asset.materials[primitive.material];
        expect(material?.extras.role).toBe(primitive.extras.role);
        expect(material?.pbrMetallicRoughness.baseColorTexture.index).toBeTypeOf("number");
        for (const name of ["POSITION", "NORMAL", "TANGENT", "TEXCOORD_0", "TEXCOORD_1"]) {
          const index = primitive.attributes[name];
          expect(index).toBeTypeOf("number");
          if (index === undefined) throw new Error(`Missing ${name}`);
          const data = values(index);
          expect(data.every(Number.isFinite)).toBe(true);
          if (name.startsWith("TEXCOORD"))
            expect(data.every((value) => value >= -0.00001 && value <= 1.00001)).toBe(true);
        }
        expect(asset.accessors[primitive.indices]?.count).toBeGreaterThan(0);
      }
    }
    expect(asset.images.length).toBeGreaterThanOrEqual(6);
    for (const image of asset.images) {
      expect(image.mimeType).toBe("image/png");
      const view = asset.bufferViews[image.bufferView];
      if (!view) throw new Error("Missing embedded map");
      expect(
        bytes.subarray(binaryStart + view.byteOffset, binaryStart + view.byteOffset + 8)
      ).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
  });
});
