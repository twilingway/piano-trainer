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
import { beforeAll, describe, expect, it } from "vitest";
import type { Finger, Hand } from "../../fingering/fingering";
import library from "../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { blackKeyCap } from "./blackKeyCap";
import { planChunks } from "./handSolver/chunks";
import golden from "./handSolver/golden.json";
import type { Library } from "./handSolver/library";
import { isBlack, whitePosition } from "./handSolver/mech";
import type { FingeredNote } from "./handSolver/plan";
import { STUDIO_REST } from "./handSolver/rest";
import { LiveHands } from "./liveHands";
import type { Planner } from "./liveHands";
import { KIT_DEPTH, KIT_TOP, KIT_WHITE, whitePart } from "./pianoKit";
import type { KitPart } from "./pianoKit";

const LIB = library as unknown as Library;
/** ThreeStage's hinge: 250 mm of key behind the front, in app units. */
const PIVOT = (250 * 142) / 150;

/** hand.glb without its images: GLTFLoader cannot decode them in Node. */
function handGlb(): ArrayBuffer {
  const glb = readFileSync("public/models/hand.glb");
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

async function load(): Promise<{ hand: Object3D; kit: Map<KitPart, BufferGeometry> }> {
  const hand = (await new GLTFLoader().parseAsync(handGlb(), "")).scene;
  const kitData = new Uint8Array(readFileSync("public/models/piano-kit.glb")).buffer;
  const kit = new Map<KitPart, BufferGeometry>();
  (await new GLTFLoader().parseAsync(kitData, "")).scene.traverse((node) => {
    if (node instanceof Mesh) kit.set(node.name as KitPart, node.geometry as BufferGeometry);
  });
  return { hand, kit };
}

interface Key {
  readonly pitch: number;
  readonly hinge: Group;
  readonly mesh: Mesh;
  readonly box: Box3;
}

/** The keys as ThreeStage builds them for a white `width` units across, C4's centre at 0. */
function buildKeys(kit: Map<KitPart, BufferGeometry>, width: number, root: Group): Key[] {
  const keys: Key[] = [];
  const material = new MeshBasicMaterial({ side: DoubleSide });
  for (let pitch = 28; pitch <= 96; pitch++) {
    const black = isBlack(pitch);
    const part = kit.get(
      black ? "black" : whitePart(isBlack(pitch - 1), isBlack(pitch + 1))
    ) as BufferGeometry;
    const geometry = part.clone();
    const bounds = new Box3().setFromBufferAttribute(
      geometry.getAttribute("position") as never
    );
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
    keys.push({ pitch, hinge, mesh, box: new Box3() });
  }
  return keys;
}

interface Sample {
  /** Units into a key's solid, straight down from its surface. */
  readonly depth: number;
  readonly finger: Finger | 0;
  readonly hand: Hand;
  readonly pitch: number;
  readonly pressed: boolean;
  readonly time: number;
}

const FINGER_BONE = /^finger(\d)-\dR$/;

/** Every skin vertex inside a key: how deep, measured up to the key's surface. */
function penetrations(
  root: Group,
  hands: LiveHands,
  keys: readonly Key[],
  time: number
): Sample[] {
  root.updateMatrixWorld(true);
  for (const key of keys) key.box.setFromObject(key.mesh);
  const out: Sample[] = [];
  const ray = new Raycaster();
  const up = new Vector3(0, 1, 0);
  const v = new Vector3();
  hands.group.children.forEach((space, side) => {
    if (!space.visible) return;
    const hand: Hand = side === 0 ? "left" : "right";
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
        for (const key of keys) {
          if (!key.box.containsPoint(v)) continue;
          ray.set(v, up);
          const hits = ray.intersectObject(key.mesh, false);
          // Odd hits upwards: the point is inside the key's closed solid.
          if (hits.length % 2 === 0) continue;
          let heaviest = 0;
          for (let j = 1; j < 4; j++) if (weights.getComponent(i, j) > weights.getComponent(i, heaviest)) heaviest = j;
          const finger = fingerOf[joints.getComponent(i, heaviest)] ?? 0;
          const depth = hits[0]?.distance ?? 0;
          const id = `${String(finger)}:${String(key.pitch)}`;
          if (depth > (deepest.get(id)?.depth ?? 0))
            deepest.set(id, {
              depth,
              finger,
              hand,
              pitch: key.pitch,
              pressed: key.hinge.rotation.x > 0,
              time
            });
        }
      }
      out.push(...deepest.values());
    });
  });
  return out;
}

const syncPlanner: Planner = (notes, onChunk) => {
  for (const chunk of planChunks(STUDIO_REST, LIB, notes, () => false)) onChunk(chunk);
  return () => undefined;
};

/** The golden plans' strikes as song notes. */
function goldenSongs(): { name: string; notes: Record<Hand, FingeredNote[]> }[] {
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
function pressKeys(hands: LiveHands, keys: readonly Key[]): void {
  for (const key of keys) {
    const press = hands.keys.get(key.pitch);
    key.hinge.rotation.x = press
      ? Math.asin(Math.min(1, press.drop / Math.max(1, PIVOT - press.along)))
      : 0;
  }
}

describe("live hands in the real scene", () => {
  let model: Awaited<ReturnType<typeof load>>;
  beforeAll(async () => {
    model = await load();
  });

  it.each([18.5, 23.5, 28])("measures skin in the keys at a %s-unit white", { timeout: 60000 }, (width) => {
    const root = new Group();
    const keys = buildKeys(model.kit, width, root);
    const hands = new LiveHands(model.hand, syncPlanner);
    hands.layout({ pitch: 60, x: 0, width });
    root.add(hands.group);
    const all: Sample[] = [];
    for (const song of goldenSongs()) {
      const end = Math.max(...[...song.notes.left, ...song.notes.right].map((n) => n.start + n.duration));
      for (let time = 0.9; time <= end + 0.2; time += 0.02) {
        hands.update({ time, notes: song.notes });
        pressKeys(hands, keys);
        all.push(...penetrations(root, hands, keys, time).map((s) => ({ ...s, song: song.name })));
      }
    }
    const report = (label: string, list: readonly Sample[]) => {
      const sorted = [...list].sort((a, b) => b.depth - a.depth);
      const worst = sorted[0];
      const black = list.filter((s) => isBlack(s.pitch));
      process.stdout.write(
        `W=${String(width)} ${label}: ${String(list.length)} contacts, max ${worst ? worst.depth.toFixed(2) : "0"}` +
          (worst ? ` (finger ${String(worst.finger)} ${worst.hand} on ${String(worst.pitch)} at ${worst.time.toFixed(2)} s, ${(worst as Sample & { song?: string }).song ?? ""})` : "") +
          `, black max ${Math.max(0, ...black.map((s) => s.depth)).toFixed(2)}\n`
      );
    };
    report("pressed key", all.filter((s) => s.pressed));
    report("still key", all.filter((s) => !s.pressed));
    for (const f of [0, 1, 2, 3, 4, 5] as const)
      report(`finger ${String(f)}`, all.filter((s) => s.finger === f));
    expect(all.length).toBeGreaterThanOrEqual(0);
  });
});
