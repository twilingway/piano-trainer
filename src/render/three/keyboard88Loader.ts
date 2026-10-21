import {
  Matrix4,
  Mesh,
  Quaternion,
  SkinnedMesh,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";
import type { Group, Material, MeshStandardMaterial, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { unzlibSync } from "fflate";
import { disposePianistModel } from "./disposePianistModel";
import { validateKeyboard88Atlas } from "./keyboard88Atlas";
import type { Keyboard88Atlas, Keyboard88Frame } from "./keyboard88Atlas";
import type { Keyboard88Rig } from "./keyboard88Bones";
import { bindKeyboard88Visibility, validateKeyboard88Masks } from "./keyboard88Visibility";
import type { Keyboard88Masks } from "./keyboard88Visibility";

interface AssetFile {
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface Keyboard88Manifest {
  readonly version: 1;
  readonly frameCount: number;
  readonly boneNames: readonly string[];
  readonly files: Readonly<Record<"body" | "skin" | "index" | "rotations", AssetFile>>;
  readonly masks: Keyboard88Masks;
  readonly leftSkin?: "mirrored" | "flat";
}
export interface Keyboard88Performer {
  readonly scene: Group;
  readonly atlas: Keyboard88Atlas;
  readonly manifest: Keyboard88Manifest;
  readonly rig: Keyboard88Rig;
  dispose(): void;
}
export type Keyboard88PerformerAsset = Keyboard88Performer;
export interface Keyboard88LoaderDependencies {
  fetch: typeof fetch;
  digest(bytes: Uint8Array): Promise<string>;
  parseModel(bytes: ArrayBuffer): Promise<Group>;
  decodeTexture(bytes: Uint8Array): Promise<Texture>;
}
interface LoadOptions {
  signal?: AbortSignal | undefined;
  manifestUrl?: string | undefined;
  dependencies?: Partial<Keyboard88LoaderDependencies> | undefined;
}
const DEFAULT_URL = `${import.meta.env.BASE_URL}models/keyboard88-performer.json`;
const FRAME_COUNT = 1215;
const BONE_COUNT = 52;
const MIB = 1024 * 1024;
const FILES = ["body", "skin", "index", "rotations"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("keyboard88 load aborted", "AbortError");
}
function json(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
function boneNames(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === BONE_COUNT &&
    value.every((name) => typeof name === "string" && name.length > 0) &&
    new Set(value as string[]).size === BONE_COUNT
  );
}
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}
function vector(value: unknown, size: number): value is number[] {
  return Array.isArray(value) && value.length === size && value.every(Number.isFinite);
}
function unitRotation(value: unknown): value is number[] {
  return (
    vector(value, 4) && Math.abs(value.reduce((sum, part) => sum + part * part, 0) - 1) < 0.002
  );
}
function readRig(data: Record<string, unknown>, names: readonly string[]): Keyboard88Rig {
  if (!Array.isArray(data.bones) || data.bones.length !== BONE_COUNT || !record(data.root))
    throw new Error("keyboard88 missing rest rig");
  const parents: number[] = [];
  const rest = data.bones.map((value: unknown, i) => {
    if (
      !record(value) ||
      value.name !== names[i] ||
      typeof value.parent !== "number" ||
      !Number.isInteger(value.parent) ||
      value.parent < -1 ||
      value.parent >= i ||
      !vector(value.translation, 3) ||
      !unitRotation(value.rotation) ||
      !vector(value.scale, 3) ||
      value.scale.some((scale) => scale <= 0) ||
      !vector(value.tail, 3)
    )
      throw new Error("keyboard88 invalid rest bone");
    parents.push(value.parent);
    return {
      position: value.translation,
      quaternion: value.rotation,
      scale: value.scale,
      tail: value.tail
    };
  });
  const root = data.root;
  if (!vector(root.translation, 3) || !unitRotation(root.rotation) || !vector(root.scale, 3))
    throw new Error("keyboard88 invalid root transform");
  const rootMatrix = new Matrix4()
    .compose(
      new Vector3().fromArray(root.translation),
      new Quaternion().fromArray(root.rotation),
      new Vector3().fromArray(root.scale)
    )
    .toArray();
  return { boneNames: names, parents, rest, rootMatrix };
}

/** Reject versions, paths and budgets before requesting or allocating model resources. */
export function readKeyboard88Manifest(value: unknown): Keyboard88Manifest {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.frameCount !== FRAME_COUNT ||
    !boneNames(value.boneNames) ||
    !record(value.files) ||
    !record(value.masks) ||
    (value.leftSkin !== undefined && value.leftSkin !== "mirrored" && value.leftSkin !== "flat")
  )
    throw new Error("keyboard88 incompatible manifest");
  for (const name of FILES) {
    const file = value.files[name];
    if (
      !record(file) ||
      typeof file.url !== "string" ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(file.url) ||
      typeof file.bytes !== "number" ||
      !Number.isInteger(file.bytes) ||
      file.bytes <= 0 ||
      typeof file.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(file.sha256)
    )
      throw new Error(`keyboard88 invalid ${name} descriptor`);
  }
  const manifest = value as unknown as Keyboard88Manifest;
  validateKeyboard88Masks(manifest.masks);
  if (
    manifest.files.body.bytes > 15 * MIB ||
    manifest.files.skin.bytes > 2.5 * MIB ||
    manifest.files.index.bytes + manifest.files.rotations.bytes > 2 * MIB
  )
    throw new Error("keyboard88 asset budget exceeded");
  return manifest;
}

/** GLTFLoader may not make secondary requests outside the verified asset set. */
function validateGlb(bytes: Uint8Array): void {
  if (bytes.byteLength < 20) throw new Error("keyboard88 truncated GLB");
  const view = new DataView(bytesBuffer(bytes));
  const length = view.getUint32(12, true);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    20 + length > bytes.byteLength
  )
    throw new Error("keyboard88 invalid GLB header");
  const data = json(bytes.subarray(20, 20 + length));
  if (!record(data)) throw new Error("keyboard88 invalid GLB JSON");
  const buffers = data.buffers;
  if (
    !Array.isArray(buffers) ||
    buffers.some((buffer: unknown) => !record(buffer) || buffer.uri !== undefined) ||
    (Array.isArray(data.images) && data.images.length > 0) ||
    (Array.isArray(data.extensionsRequired) && data.extensionsRequired.length > 0)
  )
    throw new Error("keyboard88 GLB must contain only embedded geometry");
}

function readAtlas(
  index: Uint8Array,
  packed: Uint8Array,
  manifest: Keyboard88Manifest
): { atlas: Keyboard88Atlas; rig: Keyboard88Rig } {
  const data = json(index);
  if (
    !record(data) ||
    data.version !== 1 ||
    data.frameCount !== FRAME_COUNT ||
    !boneNames(data.boneNames) ||
    !sameNames(manifest.boneNames, data.boneNames) ||
    !Array.isArray(data.frames) ||
    data.frames.length !== FRAME_COUNT
  )
    throw new Error("keyboard88 incompatible atlas index");
  const encoding = record(data.rotations) ? data.rotations.encoding : undefined;
  if (encoding !== undefined && encoding !== "float32-le" && encoding !== "zlib-float32-le")
    throw new Error("keyboard88 unsupported rotations encoding");
  const count = FRAME_COUNT * BONE_COUNT * 4;
  const bytes =
    encoding === "zlib-float32-le"
      ? unzlibSync(packed, { out: new Uint8Array(count * 4) })
      : packed;
  if (bytes.byteLength !== count * 4) throw new Error("keyboard88 invalid rotation count");
  const view = new DataView(bytesBuffer(bytes));
  const rotations = new Float32Array(count);
  for (let i = 0; i < count; i++) rotations[i] = view.getFloat32(i * 4, true);
  const atlas: Keyboard88Atlas = {
    frames: data.frames as Keyboard88Frame[],
    boneNames: data.boneNames,
    rotations
  };
  validateKeyboard88Atlas(atlas);
  if (atlas.frames.some((frame, i) => frame.id !== 308 + i))
    throw new Error("keyboard88 frame IDs must be exactly 308 through 1522");
  return { atlas, rig: readRig(data, manifest.boneNames) };
}

const defaults: Keyboard88LoaderDependencies = {
  fetch: (...args) => globalThis.fetch(...args),
  digest: async (bytes) => {
    const hash = await crypto.subtle.digest("SHA-256", bytesBuffer(bytes));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  },
  parseModel: async (bytes) => (await new GLTFLoader().parseAsync(bytes, "")).scene,
  decodeTexture: async (bytes) => {
    const url = URL.createObjectURL(new Blob([bytesBuffer(bytes)], { type: "image/webp" }));
    try {
      return await new TextureLoader().loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
};

export async function loadKeyboard88Performer(
  options: LoadOptions = {}
): Promise<Keyboard88Performer> {
  const deps = { ...defaults, ...options.dependencies };
  const signal = options.signal;
  const url = options.manifestUrl ?? DEFAULT_URL;
  const fetchBytes = async (path: string, max: number): Promise<Uint8Array> => {
    checkAbort(signal);
    const response = await deps.fetch(path, { signal: signal ?? null });
    if (!response.ok) throw new Error(`keyboard88 HTTP ${String(response.status)}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > max) throw new Error("keyboard88 response exceeds budget");
    checkAbort(signal);
    return bytes;
  };
  const manifest = readKeyboard88Manifest(json(await fetchBytes(url, MIB)));
  const prefix = url.slice(0, url.lastIndexOf("/") + 1);
  const payloads = await Promise.all(
    FILES.map(async (name) => {
      const descriptor = manifest.files[name];
      const bytes = await fetchBytes(prefix + descriptor.url, descriptor.bytes);
      if (bytes.byteLength !== descriptor.bytes || (await deps.digest(bytes)) !== descriptor.sha256)
        throw new Error(`keyboard88 ${name} hash or size mismatch`);
      return bytes;
    })
  );
  const [body, skinBytes, index, packed] = payloads;
  if (!body || !skinBytes || !index || !packed) throw new Error("keyboard88 missing payload");
  validateGlb(body);
  const { atlas, rig } = readAtlas(index, packed, manifest);
  checkAbort(signal);
  let scene: Group | undefined;
  let texture: Texture | undefined;
  const texturedMaterials = new Set<Material>();
  try {
    scene = await deps.parseModel(bytesBuffer(body));
    checkAbort(signal);
    const skeletons = new Set<unknown>();
    scene.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      skeletons.add(node.skeleton);
      if (
        !sameNames(
          node.skeleton.bones.map((bone) => bone.name),
          manifest.boneNames
        )
      )
        throw new Error("keyboard88 GLB bone order mismatch");
    });
    if (skeletons.size === 0) throw new Error("keyboard88 GLB is not skinned");
    bindKeyboard88Visibility(scene, manifest.masks).dispose();
    texture = await deps.decodeTexture(skinBytes);
    checkAbort(signal);
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mesh = node as Mesh;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const role: unknown = material.userData.role;
        if (role === "rightHand" || (role === "leftHand" && manifest.leftSkin !== "flat")) {
          (material as MeshStandardMaterial).map = texture ?? null;
          material.needsUpdate = true;
          texturedMaterials.add(material);
        }
      }
    });
    if (texturedMaterials.size === 0) throw new Error("keyboard88 has no textured hand material");
    let disposed = false;
    const loaded = scene;
    return {
      scene,
      atlas,
      rig,
      manifest,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposePianistModel(loaded);
      }
    };
  } catch (error) {
    if (scene) disposePianistModel(scene);
    if (texture && texturedMaterials.size === 0) texture.dispose();
    throw error;
  }
}

/** Owns each generation, including resources that arrive after cancellation. */
export class Keyboard88PerformerLoader {
  state: "idle" | "pending" | "ready" | "failed" | "disposed" = "idle";
  asset: Keyboard88Performer | undefined;
  error: unknown;
  private generation = 0;
  private controller: AbortController | undefined;

  constructor(private readonly dependencies?: Partial<Keyboard88LoaderDependencies>) {}

  async load(manifestUrl?: string): Promise<Keyboard88Performer | undefined> {
    if (this.state === "disposed") return undefined;
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.state = "pending";
    try {
      const asset = await loadKeyboard88Performer({
        manifestUrl,
        signal: controller.signal,
        dependencies: this.dependencies
      });
      if (generation !== this.generation) {
        asset.dispose();
        return undefined;
      }
      this.asset = asset;
      this.state = "ready";
      return asset;
    } catch (error) {
      if (generation === this.generation) {
        this.state = "failed";
        this.error = error;
      }
      return undefined;
    }
  }

  cancel(): void {
    if (this.state === "disposed") return;
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    this.asset?.dispose();
    this.asset = undefined;
    this.error = undefined;
    this.state = "idle";
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.cancel();
    this.state = "disposed";
  }
}
