import {
  Bone,
  BufferGeometry,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Texture
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  loadKeyboard88Performer,
  Keyboard88PerformerLoader,
  readKeyboard88Manifest
} from "./keyboard88Loader";
import type { Keyboard88LoaderDependencies } from "./keyboard88Loader";

const HASH = "a".repeat(64);
const names = Array.from({ length: 52 }, (_, i) => `Bone${String(i)}`);
const encode = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));
const binary = (value: Uint8Array) => new Uint8Array(value).buffer;
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error("Missing fixture item");
  return value;
}

function glb(data: unknown = { buffers: [{ byteLength: 0 }] }): Uint8Array {
  const raw = encode(data);
  const size = Math.ceil(raw.length / 4) * 4;
  const bytes = new Uint8Array(20 + size).fill(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(raw, 20);
  return bytes;
}

function fixture() {
  const scene = new Group();
  const bones = names.map((name) => {
    const bone = new Bone();
    bone.name = name;
    scene.add(bone);
    return bone;
  });
  const skeleton = new Skeleton(bones);
  const materials: MeshStandardMaterial[] = [];
  for (const [i, role] of ["body", "rightHand", "leftHand"].entries()) {
    const geometry = new BufferGeometry();
    geometry.userData = { role, sourceFaceIds: [i] };
    const material = new MeshStandardMaterial();
    material.userData.role = role;
    materials.push(material);
    const mesh = new SkinnedMesh(geometry, material);
    mesh.bind(skeleton);
    scene.add(mesh);
  }
  const rotations = new Float32Array(1215 * 52 * 4);
  for (let i = 3; i < rotations.length; i += 4) rotations[i] = 1;
  const frames = Array.from({ length: 1215 }, (_, i) => ({
    id: 308 + i,
    assignment: [60, 62, 64, 65, 67],
    pressedMask: i === 0 ? 0 : 1
  }));
  const index = {
    version: 1,
    frameCount: 1215,
    boneNames: names,
    frames,
    bones: names.map((name, i) => ({
      name,
      parent: i - 1,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      tail: [0, 0.01, 0]
    })),
    root: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  };
  const payloads = {
    body: glb(),
    skin: new Uint8Array([1, 2, 3]),
    index: encode(index),
    rotations: new Uint8Array(rotations.buffer)
  };
  const manifest = {
    version: 1,
    frameCount: 1215,
    boneNames: names,
    masks: { body: [0], rightHand: [1], leftHand: [2], nails: [] },
    files: Object.fromEntries(
      Object.entries(payloads).map(([key, data]) => [
        key,
        {
          url: `${key}.bin`,
          bytes: data.byteLength,
          sha256: HASH
        }
      ])
    ) as Record<keyof typeof payloads, { url: string; bytes: number; sha256: string }>
  };
  const texture = new Texture();
  const parseModel = vi.fn(() => Promise.resolve(scene));
  const decodeTexture = vi.fn(() => Promise.resolve(texture));
  const fetcher = vi.fn<typeof fetch>((input) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (path.endsWith("keyboard88-performer.json"))
      return Promise.resolve(new Response(binary(encode(manifest))));
    const key = path.slice(path.lastIndexOf("/") + 1, -4) as keyof typeof payloads;
    return Promise.resolve(new Response(binary(payloads[key])));
  });
  const dependencies: Keyboard88LoaderDependencies = {
    fetch: fetcher,
    digest: () => Promise.resolve(HASH),
    parseModel,
    decodeTexture
  };
  return {
    scene,
    skeleton,
    bones,
    materials,
    texture,
    manifest,
    index,
    payloads,
    dependencies,
    fetcher,
    parseModel,
    decodeTexture
  };
}

describe("keyboard88 public loader", () => {
  it("validates complete assets, shares one skin, and disposes shared resources once", async () => {
    const f = fixture();
    const disposeTexture = vi.spyOn(f.texture, "dispose");
    const disposeSkeleton = vi.spyOn(f.skeleton, "dispose");
    const disposeMaterial = f.materials.map((material) => vi.spyOn(material, "dispose"));
    const loaded = await loadKeyboard88Performer({ dependencies: f.dependencies });
    expect(loaded.atlas.frames).toHaveLength(1215);
    expect(at(loaded.atlas.frames, 1214).id).toBe(1522);
    expect(f.fetcher).toHaveBeenCalledTimes(5);
    expect(at(f.materials, 0).map).toBeNull();
    expect(f.materials.slice(1).every((material) => material.map === f.texture)).toBe(true);
    expect(f.texture.flipY).toBe(false);
    loaded.dispose();
    loaded.dispose();
    expect(disposeTexture).toHaveBeenCalledOnce();
    expect(disposeSkeleton).toHaveBeenCalledOnce();
    for (const dispose of disposeMaterial) expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects incompatible versions, counts, URLs, masks and budgets before parsing", () => {
    const { manifest } = fixture();
    expect(() => readKeyboard88Manifest({ ...manifest, version: 2 })).toThrow("incompatible");
    expect(() => readKeyboard88Manifest({ ...manifest, frameCount: 1214 })).toThrow("incompatible");
    expect(() =>
      readKeyboard88Manifest({
        ...manifest,
        files: {
          ...manifest.files,
          body: { ...manifest.files.body, url: "https://unverified.invalid/body.glb" }
        }
      })
    ).toThrow("descriptor");
    expect(() =>
      readKeyboard88Manifest({ ...manifest, masks: { ...manifest.masks, nails: [4] } })
    ).toThrow("nail");
    expect(() =>
      readKeyboard88Manifest({
        ...manifest,
        files: { ...manifest.files, body: { ...manifest.files.body, bytes: 16 * 1024 * 1024 } }
      })
    ).toThrow("budget");
  });

  it("keeps failed and missing assets unavailable for the fallback owner", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const loader = new Keyboard88PerformerLoader(f.dependencies);
    expect(await loader.load()).toBeUndefined();
    expect(loader.state).toBe("failed");
    expect(loader.asset).toBeUndefined();
    expect(f.parseModel).not.toHaveBeenCalled();
    loader.cancel();
    expect(await loader.load()).toBeUndefined();
    expect(f.fetcher).toHaveBeenCalledOnce();
    expect(loader.state).toBe("failed");
    expect(await loader.load("/another/keyboard88-performer.json")).toBeDefined();
    expect(f.fetcher).toHaveBeenCalledTimes(6);
    loader.dispose();
  });

  it("retains construction failures until the asset URL changes", async () => {
    const f = fixture();
    const loader = new Keyboard88PerformerLoader(f.dependencies);
    const loaded = await loader.load();
    expect(loaded).toBeDefined();
    const disposeSkeleton = vi.spyOn(f.skeleton, "dispose");
    const error = new Error("invalid performer binding");
    loader.fail(error);
    expect(loader.state).toBe("failed");
    expect(loader.error).toBe(error);
    expect(loader.asset).toBeUndefined();
    expect(disposeSkeleton).toHaveBeenCalledOnce();
    expect(await loader.load()).toBeUndefined();
    expect(f.fetcher).toHaveBeenCalledTimes(5);
    loader.dispose();
  });

  it("rejects corrupt hashes and unvalidated GLB network references", async () => {
    const f = fixture();
    await expect(
      loadKeyboard88Performer({
        dependencies: { ...f.dependencies, digest: () => Promise.resolve("b".repeat(64)) }
      })
    ).rejects.toThrow("hash");
    expect(f.parseModel).not.toHaveBeenCalled();
    const external = glb({ buffers: [{ uri: "https://unverified.invalid/skin.bin" }] });
    f.payloads.body = external;
    f.manifest.files.body.bytes = external.length;
    await expect(loadKeyboard88Performer({ dependencies: f.dependencies })).rejects.toThrow(
      "embedded"
    );
    expect(f.parseModel).not.toHaveBeenCalled();
  });

  it.each(["id", "quaternion", "bone order"])(
    "rejects corrupt %s before adoption",
    async (kind) => {
      const f = fixture();
      if (kind === "id") at(f.index.frames, 0).id = 307;
      if (kind === "bone order") f.index.boneNames = [...names].reverse();
      if (kind === "quaternion") new DataView(f.payloads.rotations.buffer).setFloat32(0, NaN, true);
      f.payloads.index = encode(f.index);
      f.manifest.files.index.bytes = f.payloads.index.byteLength;
      await expect(loadKeyboard88Performer({ dependencies: f.dependencies })).rejects.toThrow();
      expect(f.parseModel).not.toHaveBeenCalled();
    }
  );

  it.each(["cancel", "dispose"] as const)(
    "%s releases late parsed assets and never adopts stale generations",
    async (action) => {
      const f = fixture();
      let resolve!: (scene: Group) => void;
      let started!: () => void;
      const parsing = new Promise<void>((yes) => {
        started = yes;
      });
      f.parseModel.mockImplementationOnce(() => {
        started();
        return new Promise<Group>((yes) => {
          resolve = yes;
        });
      });
      const disposeGeometry = vi.spyOn(
        (f.scene.children.find((node) => node instanceof SkinnedMesh) as SkinnedMesh).geometry,
        "dispose"
      );
      const loader = new Keyboard88PerformerLoader(f.dependencies);
      const pending = loader.load();
      await parsing;
      expect(loader.state).toBe("pending");
      loader[action]();
      resolve(f.scene);
      expect(await pending).toBeUndefined();
      expect(loader.asset).toBeUndefined();
      expect(loader.state).toBe(action === "dispose" ? "disposed" : "idle");
      expect(disposeGeometry).toHaveBeenCalledOnce();
      expect(f.decodeTexture).not.toHaveBeenCalled();
      loader.dispose();
    }
  );

  it("cleans the parsed model on skin failure", async () => {
    const f = fixture();
    const disposeSkeleton = vi.spyOn(f.skeleton, "dispose");
    f.decodeTexture.mockRejectedValueOnce(new Error("bad WebP"));
    await expect(loadKeyboard88Performer({ dependencies: f.dependencies })).rejects.toThrow(
      "bad WebP"
    );
    expect(disposeSkeleton).toHaveBeenCalledOnce();
  });
});
