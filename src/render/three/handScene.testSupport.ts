import { songFromMidi } from "../../song/midi";
import { withFingering } from "../../song/song";
import { readFileSync } from "node:fs";
import {
  Box3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SkinnedMesh,
  Vector3
} from "three";
import type { BufferGeometry, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Finger, Hand } from "../../fingering/fingering";
import library from "../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { blackKeyCap } from "./blackKeyCap";
import { planChunks } from "./handSolver/chunks";
import golden from "./handSolver/golden.json";
import type { Library } from "./handSolver/library";
import { isBlack, whitePosition } from "./handSolver/mech";
import type { FingeredNote } from "./handSolver/plan";
import { STUDIO_REST } from "./handSolver/rest";
import type { LiveHands } from "./liveHands";
import type { Planner } from "./liveHands";
import { KIT_DEPTH, KIT_TOP, KIT_WHITE, whitePart } from "./pianoKit";
import type { KitPart } from "./pianoKit";

const LIB = library as unknown as Library;
/** ThreeStage's hinge: 250 mm of key behind the front, in app units. */
const PIVOT = (250 * 142) / 150;

/** hand.glb without its images: GLTFLoader cannot decode them in Node. */
export function handGlb(path = "public/models/hand.glb"): ArrayBuffer {
  const glb = readFileSync(path);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString()) as Record<string, unknown>;
  const rest = glb.subarray(20 + jsonLength);
  delete json.images;
  delete json.textures;
  delete json.samplers;
  json.materials = (json.materials as object[]).map(() => ({ doubleSided: true }));
  json.extensionsUsed = [];
  json.extensionsRequired = [];
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += " ";
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + rest.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([head, Buffer.from(text), rest]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

export async function loadSceneModels(): Promise<{
  hand: Object3D;
  kit: Map<KitPart, BufferGeometry>;
}> {
  const hand = (await new GLTFLoader().parseAsync(handGlb(), "")).scene;
  const kitData = new Uint8Array(readFileSync("public/models/piano-kit.glb")).buffer;
  const kit = new Map<KitPart, BufferGeometry>();
  (await new GLTFLoader().parseAsync(kitData, "")).scene.traverse((node) => {
    if (node instanceof Mesh) kit.set(node.name as KitPart, node.geometry as BufferGeometry);
  });
  return { hand, kit };
}

export interface Key {
  readonly pitch: number;
  readonly hinge: Group;
  readonly mesh: Mesh;
  readonly box: Box3;
  drop: number;
}

/** The keys as ThreeStage builds them for a white `width` units across, C4's centre at 0. */
export function buildKeys(kit: Map<KitPart, BufferGeometry>, width: number, root: Group): Key[] {
  const keys: Key[] = [];
  const material = new MeshBasicMaterial({ side: DoubleSide });
  for (let pitch = 21; pitch <= 108; pitch++) {
    const black = isBlack(pitch);
    const part = kit.get(black ? "black" : whitePart(isBlack(pitch - 1), isBlack(pitch + 1)));
    if (!part) throw new Error("missing piano key geometry");
    const geometry = part.clone();
    const bounds = new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
    // keyboardLayout: a black key is 0.6 of a white one across.
    const across = black ? (0.6 * width) / (bounds.max.x - bounds.min.x) : width / KIT_WHITE;
    geometry.scale(across, 1000, KIT_DEPTH);
    geometry.translate(0, KIT_TOP, 0);
    const shaped = black ? blackKeyCap(geometry) : geometry;
    shaped.computeBoundingBox();
    const bottom = shaped.boundingBox?.min.y ?? 0;
    const mesh = new Mesh(shaped, material);
    mesh.position.set(0, -bottom, PIVOT);
    const hinge = new Group();
    hinge.position.set(whitePosition(pitch) * width, bottom, -PIVOT);
    hinge.add(mesh);
    root.add(hinge);
    keys.push({ pitch, hinge, mesh, box: new Box3(), drop: 0 });
  }
  return keys;
}

export interface Sample {
  /** Units into a key's solid, straight down from its surface. */
  readonly depth: number;
  readonly finger: Finger | 0;
  readonly hand: Hand;
  readonly pitch: number;
  readonly pressed: boolean;
  readonly drop: number;
  readonly time: number;
  readonly bone: string;
  readonly point: readonly number[];
}

const FINGER_BONE = /^finger(\d)-\dR$/;

/** Every skin vertex inside a key: how deep, measured up to the key's surface. */
export function penetrations(
  root: Group,
  spaces: readonly { readonly space: Object3D; readonly hand: Hand }[],
  keys: readonly Key[],
  time: number
): Sample[] {
  root.updateMatrixWorld(true);
  const cells = new Map<number, Key[]>();
  for (const key of keys) {
    key.box.setFromObject(key.mesh);
    for (
      let cell = Math.floor(key.box.min.x / 16);
      cell <= Math.floor(key.box.max.x / 16);
      cell++
    ) {
      const list = cells.get(cell) ?? [];
      list.push(key);
      cells.set(cell, list);
    }
  }
  const out: Sample[] = [];
  const ray = new Raycaster();
  const up = new Vector3(0, 1, 0);
  const v = new Vector3();
  spaces.forEach(({ space, hand }) => {
    if (!space.visible) return;
    space.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      const skin = node as SkinnedMesh;
      skin.skeleton.update();
      const fingerOf = skin.skeleton.bones.map((bone) => {
        const match = FINGER_BONE.exec(bone.name);
        return match ? (Number(match[1]) as Finger) : 0;
      });
      const joints = skin.geometry.getAttribute("skinIndex");
      const weights = skin.geometry.getAttribute("skinWeight");
      const count = skin.geometry.getAttribute("position").count;
      const deepest = new Map<string, Sample>();
      for (let i = 0; i < count; i++) {
        skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld);
        if (v.y > KIT_TOP + 14) continue;
        for (const key of cells.get(Math.floor(v.x / 16)) ?? []) {
          if (!key.box.containsPoint(v)) continue;
          ray.set(v, up);
          const hits = ray.intersectObject(key.mesh, false);
          // Odd hits upwards: the point is inside the key's closed solid.
          if (hits.length % 2 === 0) continue;
          let heaviest = 0;
          for (let j = 1; j < 4; j++)
            if (weights.getComponent(i, j) > weights.getComponent(i, heaviest)) heaviest = j;
          const boneIndex = joints.getComponent(i, heaviest);
          const finger = fingerOf[boneIndex] ?? 0;
          const bone = skin.skeleton.bones[boneIndex]?.name ?? "?";
          const depth = hits[0]?.distance ?? 0;
          const id = `${bone}:${String(key.pitch)}`;
          if (depth > (deepest.get(id)?.depth ?? 0))
            deepest.set(id, {
              depth,
              finger,
              hand,
              pitch: key.pitch,
              pressed: key.hinge.rotation.x > 0,
              drop: key.drop,
              time,
              bone,
              point: v.toArray()
            });
        }
      }
      out.push(...deepest.values());
    });
  });
  return out;
}

export const syncPlanner: Planner = (notes, onChunk) => {
  for (const chunk of planChunks(STUDIO_REST, LIB, notes, () => false)) onChunk(chunk);
  return () => undefined;
};

/** The golden plans' strikes as song notes. */
export function goldenSongs(): { name: string; notes: Record<Hand, FingeredNote[]> }[] {
  return golden.plan.map((plan) => {
    const notes: FingeredNote[] = plan.strikes.flatMap((strike) =>
      strike.notes.map((note) => ({
        start: strike.time + 1,
        duration: note.end - strike.time,
        pitch: note.pitch,
        finger: note.finger as Finger
      }))
    );
    const hand = plan.hand as Hand;
    return {
      name: plan.name,
      notes: { left: hand === "left" ? notes : [], right: hand === "right" ? notes : [] }
    };
  });
}

/** ThreeStage's key turn under a tip at steady state. */
export function pressKeys(hands: LiveHands, keys: readonly Key[]): void {
  for (const key of keys) {
    const press = hands.keys.get(key.pitch);
    key.drop = press?.drop ?? 0;
    key.hinge.rotation.x = press
      ? Math.asin(Math.min(1, press.drop / Math.max(1, PIVOT - press.along)))
      : 0;
  }
}

/** An explicitly supplied private acceptance file, never copied into fixtures. */
export function localSceneSongs(): ReturnType<typeof goldenSongs> {
  const path = process.env.HAND_SCENE_MIDI;
  if (!path) return [];
  const data = readFileSync(path);
  const song = withFingering(
    songFromMidi(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      "local acceptance"
    )
  );
  return [
    {
      name: "local MIDI",
      notes: {
        left: song.notes.filter((n) => n.hand === "left"),
        right: song.notes.filter((n) => n.hand === "right")
      }
    }
  ];
}

/** Signed vertical gap from a finger's actual skin to one physical key top. */
export function fingerGap(space: Object3D, key: Key, finger: Finger): number {
  space.updateMatrixWorld(true);
  key.box.setFromObject(key.mesh);
  let gap = Infinity;
  const point = new Vector3(),
    ray = new Raycaster(),
    down = new Vector3(0, -1, 0);
  space.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const skin = node as SkinnedMesh;
    skin.skeleton.update();
    const index = skin.geometry.getAttribute("skinIndex"),
      weight = skin.geometry.getAttribute("skinWeight");
    const count = skin.geometry.getAttribute("position").count;
    for (let i = 0; i < count; i++) {
      let heaviest = 0;
      for (let j = 1; j < 4; j++)
        if (weight.getComponent(i, j) > weight.getComponent(i, heaviest)) heaviest = j;
      const bone = skin.skeleton.bones[index.getComponent(i, heaviest)];
      if (!bone?.name.startsWith(`finger${String(finger)}-`)) continue;
      skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld);
      if (
        point.x < key.box.min.x ||
        point.x > key.box.max.x ||
        point.z < key.box.min.z ||
        point.z > key.box.max.z
      )
        continue;
      ray.set(new Vector3(point.x, key.box.max.y + 100, point.z), down);
      const top = ray.intersectObject(key.mesh, false)[0]?.point.y;
      if (top !== undefined) gap = Math.min(gap, point.y - top);
    }
  });
  return gap;
}
