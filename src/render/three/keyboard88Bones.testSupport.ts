import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { Keyboard88Bones, keyboard88At as at } from "./keyboard88Bones.ts";
import type { Keyboard88Rig } from "./keyboard88Bones";

export const RIGHT_TIPS = [51, 39, 42, 48, 45];
export const LEFT_TIPS = [32, 20, 23, 29, 26];
interface ExportIndex {
  bones: {
    name: string;
    parent: number;
    translation: number[];
    rotation: number[];
    scale: number[];
    tail: number[];
  }[];
  root: { translation: number[]; rotation: number[]; scale: number[] };
  frames: { id: number; pressedMask: number; assignment: number[] }[];
}
interface GlbData {
  skins: { inverseBindMatrices: number }[];
  accessors: { bufferView: number; byteOffset?: number }[];
  bufferViews: { byteOffset: number }[];
}
export function keyboard88BoneFixture() {
  const index = JSON.parse(
    readFileSync(resolve("public/models/keyboard88-atlas.json"), "utf8")
  ) as ExportIndex;
  const raw = readFileSync(resolve("public/models/keyboard88-poses.bin"));
  const rotations = new Float32Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
  );
  const rig: Keyboard88Rig = {
    boneNames: index.bones.map((b) => b.name),
    parents: index.bones.map((b) => b.parent),
    rest: index.bones.map((b) => ({
      position: b.translation,
      quaternion: b.rotation,
      scale: b.scale,
      tail: b.tail
    })),
    rootMatrix: new Matrix4()
      .compose(
        new Vector3().fromArray(index.root.translation),
        new Quaternion().fromArray(index.root.rotation),
        new Vector3().fromArray(index.root.scale)
      )
      .toArray()
  };
  const fk = new Keyboard88Bones(rig);
  const glb = readFileSync(resolve("public/models/keyboard88-performer.glb"));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8")) as GlbData;
  const binary = glb.subarray(28 + jsonLength);
  const accessor = at(gltf.accessors, at(gltf.skins, 0).inverseBindMatrices);
  const offset = at(gltf.bufferViews, accessor.bufferView).byteOffset + (accessor.byteOffset ?? 0);
  const inverses = Array.from({ length: 52 }, (_, i) =>
    new Matrix4().fromArray(
      Array.from({ length: 16 }, (_, j) => binary.readFloatLE(offset + i * 64 + j * 4))
    )
  );
  const inverseRoot = fk.root.matrix.clone().invert();
  const positions = RIGHT_TIPS.flatMap((bone) => fk.tail(bone).applyMatrix4(inverseRoot).toArray());
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(
      RIGHT_TIPS.flatMap((i) => [i, 0, 0, 0]),
      4
    )
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(
      RIGHT_TIPS.flatMap(() => [1, 0, 0, 0]),
      4
    )
  );
  const material = new MeshBasicMaterial();
  const mesh = new SkinnedMesh(geometry, material);
  fk.root.add(mesh);
  mesh.bind(new Skeleton(fk.bones, inverses), new Matrix4());
  return {
    rig,
    index,
    rotations,
    fk,
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      mesh.skeleton.dispose();
    }
  };
}
