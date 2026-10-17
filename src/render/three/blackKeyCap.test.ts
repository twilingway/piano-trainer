import { readFileSync } from "node:fs";
import { BoxGeometry, Float32BufferAttribute, Mesh } from "three";
import type { BufferGeometry, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blackKeyCap } from "./blackKeyCap";
import { KIT_DEPTH, KIT_TOP } from "./pianoKit";

let scene: Object3D | undefined;
let source: BufferGeometry | undefined;
beforeAll(async () => {
  const bytes = new Uint8Array(readFileSync("public/models/piano-kit.glb")).buffer;
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  scene = gltf.scene;
  const key = scene.getObjectByName("black");
  if (!(key instanceof Mesh)) throw new Error("missing black key in real piano kit");
  source = key.geometry as BufferGeometry;
});
afterAll(() => {
  scene?.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const mesh = node as Mesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
});
function keyClone(): BufferGeometry {
  if (!source) throw new Error("piano kit not loaded");
  return source.clone().scale(1000, 1000, KIT_DEPTH).translate(0, KIT_TOP, 0);
}

describe("physical black key front cap", () => {
  it("widens the visible upper slope while preserving slot, rear and every point below the white top", () => {
    const key = keyClone();
    const before = key.clone();
    before.computeBoundingBox();
    const old = before.getAttribute("position");
    blackKeyCap(key);
    const next = key.getAttribute("position");
    let widened = 0;
    for (let i = 0; i < old.count; i++) {
      expect(next.getX(i)).toBe(old.getX(i));
      expect(next.getY(i)).toBe(old.getY(i));
      if (old.getY(i) <= KIT_TOP || old.getZ(i) < -110) expect(next.getZ(i)).toBe(old.getZ(i));
      if (old.getY(i) > 33 && old.getZ(i) > -72) {
        expect(old.getZ(i) - next.getZ(i)).toBeGreaterThan(6);
        widened++;
      }
    }
    expect(widened).toBeGreaterThan(4);
    expect(next.count).toBeGreaterThan(old.count);
    expect(key.boundingBox).toEqual(before.boundingBox);
    expect(Array.from(key.getAttribute("normal").array)).not.toEqual(
      Array.from(before.getAttribute("normal").array)
    );
    key.dispose();
    before.dispose();
  });

  it("keeps cap digits on the mapped top, gives its real facet a neutral reflection and leaves flat tops dark", () => {
    const key = keyClone();
    const uv = new Float32Array(key.getAttribute("position").count * 2);
    for (let i = 0; i < uv.length; i++) uv[i] = i / uv.length;
    key.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    const beforeUV = Array.from(key.getAttribute("uv").array);
    const count = key.getIndex()?.count;
    blackKeyCap(key);
    expect(Array.from(key.getAttribute("uv").array).slice(0, beforeUV.length)).toEqual(beforeUV);
    expect(key.getIndex()?.count).toBeLessThanOrEqual((count ?? 0) * 3);
    expect(key.groups.map((group) => group.materialIndex)).toEqual([0, 1]);
    const normal = key.getAttribute("normal");
    const position = key.getAttribute("position");
    const color = key.getAttribute("color");
    let cap = 0;
    let flat = 0;
    for (let i = 0; i < position.count; i++) {
      expect(color.getX(i)).toBe(color.getY(i));
      expect(color.getY(i)).toBe(color.getZ(i));
      expect(color.getX(i)).toBeGreaterThanOrEqual(1);
      expect(color.getX(i)).toBeLessThanOrEqual(4.601);
      if (
        position.getY(i) > KIT_TOP &&
        position.getZ(i) > -90 &&
        normal.getZ(i) > 0.4 &&
        Math.abs(normal.getX(i)) < 0.4
      ) {
        expect(color.getX(i)).toBeGreaterThan(1.8);
        cap++;
      }
      if (position.getY(i) > 33 && position.getZ(i) < -90 && normal.getY(i) > 0.99) {
        expect(color.getX(i)).toBe(1);
        flat++;
      }
    }
    expect(cap).toBeGreaterThan(4);
    expect(flat).toBeGreaterThan(0);
    // Upward cap faces keep material 0 (the painted top), so finger labels are not removed.
    const group = key.groups[0];
    const index = key.getIndex();
    let mappedCap = 0;
    if (!group || !index) throw new Error("missing mapped top group");
    for (let i = group.start; i < group.start + group.count; i++)
      if (color.getX(index.getX(i)) > 1.8) mappedCap++;
    expect(mappedCap).toBeGreaterThan(4);
    key.dispose();
  });

  it("removes internal cap rings: one plane, normal and finish across every central visible height", () => {
    const key = blackKeyCap(keyClone());
    const position = key.getAttribute("position");
    const normal = key.getAttribute("normal");
    const color = key.getAttribute("color");
    const heights = new Set<number>();
    let reference: { ny: number; nz: number; offset: number } | undefined;
    let used = 0;
    for (let i = 0; i < position.count; i++) {
      if (
        Math.abs(position.getX(i)) >= 3.6 ||
        position.getY(i) < KIT_TOP ||
        position.getZ(i) < -85 ||
        normal.getZ(i) < 0.2
      )
        continue;
      const ny = normal.getY(i),
        nz = normal.getZ(i);
      const offset = ny * position.getY(i) + nz * position.getZ(i);
      reference ??= { ny, nz, offset };
      expect(normal.getX(i)).toBeCloseTo(0, 6);
      expect(ny).toBeCloseTo(reference.ny, 6);
      expect(nz).toBeCloseTo(reference.nz, 6);
      expect(offset).toBeCloseTo(reference.offset, 4);
      expect(color.getX(i)).toBeCloseTo(3.8, 6);
      heights.add(Math.round(position.getY(i) * 100));
      used++;
    }
    expect(used).toBeGreaterThan(10);
    expect(heights.size).toBeGreaterThan(4);
    const index = key.getIndex();
    if (!index) throw new Error("missing cap indices");
    for (let i = 0; i < index.count; i += 3) {
      const ys = [
        position.getY(index.getX(i)),
        position.getY(index.getX(i + 1)),
        position.getY(index.getX(i + 2))
      ];
      expect(Math.min(...ys) < KIT_TOP && Math.max(...ys) > KIT_TOP).toBe(false);
    }
    key.dispose();
  });

  it("uses one continuous front-cap finish and suppresses the noisy reflection on sidewalls", () => {
    const key = blackKeyCap(keyClone());
    const position = key.getAttribute("position");
    const normal = key.getAttribute("normal");
    const color = key.getAttribute("color");
    const index = key.getIndex();
    const group = key.groups[1];
    if (!index || !group) throw new Error("missing body group");
    let sides = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(normal.getX(i)) > 0.85) {
        expect(color.getX(i)).toBe(1);
        sides++;
      }
    }
    expect(sides).toBeGreaterThan(0);
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2);
      const nz = (normal.getZ(a) + normal.getZ(b) + normal.getZ(c)) / 3;
      const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
      const aboveWhite = Math.max(position.getY(a), position.getY(b), position.getY(c)) > KIT_TOP;
      if (aboveWhite && z > -85) expect(nz).toBeLessThanOrEqual(0.12);
    }
    key.dispose();
  });

  it("does not alter the shared GLB and safely leaves a shape with no raised cap unchanged", () => {
    if (!source) throw new Error("piano kit not loaded");
    const original = Array.from(source.getAttribute("position").array);
    const key = blackKeyCap(keyClone());
    expect(Array.from(source.getAttribute("position").array)).toEqual(original);
    const low = new BoxGeometry(2, 2, 2).translate(0, 10, 0);
    const before = Array.from(low.getAttribute("position").array);
    blackKeyCap(low);
    expect(Array.from(low.getAttribute("position").array)).toEqual(before);
    key.dispose();
    low.dispose();
  });
});
