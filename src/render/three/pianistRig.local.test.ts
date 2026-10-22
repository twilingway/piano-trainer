import { Group, Matrix4 } from "three";
import type { Vector3 } from "three";
import { songFromMidi } from "../../song/midi";
import { withFingering } from "../../song/song";
import { planChunks } from "./handSolver/chunks";
import { fitScenePose } from "./handScenePose";
import { pianistActualFingerGap } from "./pianistFingerGap.testSupport";
import {
  PianistOfflineCache,
  offlineFitSources,
  offlinePoseFingerprint,
  pianistTestRange
} from "./pianistOfflineCache.testSupport";
import type { ScenePlanChunk } from "./liveHands";
import { STUDIO_REST } from "./handSolver/rest";
import { buildKeys, loadSceneModels, penetrations, pressKeys } from "./handScene.testSupport";
import { LiveHands } from "./liveHands";
import type { Planner } from "./liveHands";
import { Pianist } from "./pianist";

import { existsSync, readFileSync } from "node:fs";
import { AnimationMixer, Bone } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import library from "../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { BoneFrame, solverPoint } from "./handPose";
import { CHAIN, at, handJoints } from "./handSolver/mech";
import { SkinEvaluator } from "./skinGeometry";
import type { Track } from "./handSolver/track";
import { place } from "./handSolver/place";
const BLACK_TOP_CLASSES = new Set([1, 3, 6, 8, 10]);
import { PianistRig } from "./pianistRig";
import { pianistHandProfile } from "./pianistRigProfile";

/** Strip only materials/images in memory; never alter or publish the private source GLB. */
async function loadPrivateRig() {
  const glb = readFileSync("local-models/pianist.glb");
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString()) as Record<string, unknown>;
  delete json.images;
  delete json.textures;
  delete json.samplers;
  json.materials = (json.materials as object[]).map(() => ({ doubleSided: true }));
  json.extensionsUsed = [];
  json.extensionsRequired = [];
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4) text += " ";
  const encoded = Buffer.from(text);
  const head = Buffer.from(glb.subarray(0, 20));
  const bin = glb.subarray(20 + length);
  head.writeUInt32LE(20 + encoded.length + bin.length, 8);
  head.writeUInt32LE(encoded.length, 12);
  const bytes = Buffer.concat([head, encoded, bin]);
  return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
}

describe.skipIf(!existsSync("local-models/pianist.glb"))("private PianistRig integration", () => {
  let model: Awaited<ReturnType<typeof loadPrivateRig>>;
  beforeAll(async () => {
    model = await loadPrivateRig();
  });

  it("fits the actual hand skeleton, preserves bind lengths and repeats after seeking", () => {
    model.scene.updateMatrixWorld(true);
    const profiles = {
      left: pianistHandProfile(model.scene, "left"),
      right: pianistHandProfile(model.scene, "right")
    };
    const rig = PianistRig.create(model.scene);
    expect(rig).toBeDefined();
    if (!rig) throw new Error("PianistRig calibration failed");
    const mixer = new AnimationMixer(model.scene);
    const clip = model.animations[0];
    if (clip) {
      mixer.clipAction(clip).play();
      mixer.setTime(0);
    }
    rig.seat();
    const original = new Map<Bone, { parent: unknown; position: Vector3; scale: Vector3 }>();
    model.scene.traverse((node) => {
      if (node instanceof Bone)
        original.set(node as Bone, {
          parent: node.parent,
          position: node.position.clone(),
          scale: node.scale.clone()
        });
    });
    const frame = new BoneFrame(model.scene);
    const pelvis = model.scene.getObjectByName("pelvis");
    if (!pelvis) throw new Error("No pelvis");
    const seatedPelvis = frame.head(pelvis);
    let maxJoint = 0;
    let maxBend = 0;
    for (const hand of ["left", "right"] as const) {
      const placed = place(rig.rest[hand], library, hand, [[2, hand === "right" ? 64 : 48]]);
      const pose = { root: placed.rootVec, angles: placed.angles };
      const poses = {
        left: hand === "left" ? pose : undefined,
        right: hand === "right" ? pose : undefined
      };
      rig.pose(poses);
      const first = profiles[hand].phalanges.map((p) => p.bone.quaternion.toArray());
      rig.pose({ left: undefined, right: undefined });
      rig.pose(poses);
      expect(profiles[hand].phalanges.map((p) => p.bone.quaternion.toArray())).toEqual(first);
      const joints = handJoints(rig.rest[hand], pose.angles, pose.root);
      const point = (i: number) => {
        const p = at(joints, i);
        return solverPoint([p[0] * (hand === "left" ? -1 : 1), p[1], p[2]]).multiplyScalar(0.001);
      };
      for (const p of profiles[hand].phalanges) {
        const chain = CHAIN[p.finger];
        maxJoint = Math.max(maxJoint, frame.head(p.bone).distanceTo(point(at(chain, p.joint))));
        const normal = point(chain[1])
          .sub(point(chain[0]))
          .cross(point(chain[2]).sub(point(chain[1])))
          .normalize();
        const axis = p.bendAxis.clone().applyQuaternion(frame.turn(p.bone));
        maxBend = Math.max(maxBend, (axis.angleTo(normal) * 180) / Math.PI);
      }
      expect(rig.reachError[hand]).toBeLessThan(0.0001);
    }
    for (const [bone, saved] of original) {
      expect(bone.parent).toBe(saved.parent);
      expect(bone.position.toArray()).toEqual(saved.position.toArray());
      expect(bone.scale.toArray()).toEqual(saved.scale.toArray());
    }
    expect(frame.head(pelvis).distanceTo(seatedPelvis)).toBeLessThan(1e-10);
    process.stdout.write(
      `PianistRig real: joint ${String(maxJoint * 1000)} mm, bend ${String(maxBend)} deg\n`
    );
    expect(maxJoint).toBeLessThan(0.0001);
    expect(maxBend).toBeLessThan(10);
  });

  it("reconstructs its own measured glove skin through straight and extended thumbs", async () => {
    const local = await loadPrivateRig();
    const pianist = new Pianist({ scene: local.scene, clip: local.animations[0] });
    const rig = pianist.rig;
    if (!rig) throw Error("Missing private body rig");
    let maximum = 0;
    for (const hand of ["left", "right"] as const) {
      const geometry = rig.geometry[hand];
      if (!geometry?.vertices.length) throw Error("Missing measured glove geometry");
      const evaluator = new SkinEvaluator(geometry, rig.rest[hand]);
      for (const bend of [-10, 0, 5, 30]) {
        const pose = {
          root: [5, 15, -5, 100, -60, 70] as const,
          angles: {
            1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: bend, t_ip: 25 },
            2: { mcp: 20, pip: 30, dip: 20, abd: 0 },
            3: { mcp: 20, pip: 30, dip: 20, abd: 0 },
            4: { mcp: 20, pip: 30, dip: 20, abd: 0 },
            5: { mcp: 43, pip: Math.max(0, bend), dip: Math.max(0, bend), abd: -35 }
          }
        };
        rig.pose({
          left: hand === "left" ? pose : undefined,
          right: hand === "right" ? pose : undefined
        });
        evaluator.evaluate(pose.angles, pose.root);
        local.scene.updateMatrixWorld(true);
        const inverse = local.scene.matrixWorld.clone().invert();
        if (hand === "left") inverse.premultiply(new Matrix4().makeScale(-1, 1, 1));
        const actual = rig.skins[hand].snapshot(inverse);
        geometry.vertices.forEach((vertex, i) => {
          const point = actual[vertex.source];
          if (!point) throw Error("missing skin source");
          const b = i * 3;
          maximum = Math.max(
            maximum,
            Math.hypot(
              (evaluator.positions[b] ?? 0) - point[0],
              (evaluator.positions[b + 1] ?? 0) - point[1],
              (evaluator.positions[b + 2] ?? 0) - point[2]
            )
          );
        });
      }
    }
    process.stdout.write("Avatar measured skin max error " + String(maximum) + " mm\n");
    expect(maximum).toBeLessThan(0.1);
  });

  let fittedChunks: ScenePlanChunk[] | undefined;
  it.skipIf(!process.env.PIANIST_TEST_MIDI).each([18.5, 23.5, 28])(
    "keeps the real gloves outside the physical keys on local MIDI at width %s",
    { timeout: 1200000 },
    async (width) => {
      const midiPath = process.env.PIANIST_TEST_MIDI;
      if (!midiPath) throw new Error("No local MIDI configured");
      const bytes = readFileSync(midiPath);
      const song = withFingering(songFromMidi(new Uint8Array(bytes).buffer, "local acceptance"));
      const until = process.env.PIANIST_TEST_UNTIL
        ? Number(process.env.PIANIST_TEST_UNTIL)
        : song.duration;
      const range = pianistTestRange(process.env.PIANIST_TEST_RANGE, until);
      const notes = {
        left: song.notes.filter((n) => n.hand === "left" && n.start <= until + 2),
        right: song.notes.filter((n) => n.hand === "right" && n.start <= until + 2)
      };
      const local = await loadPrivateRig();
      const pianist = new Pianist({ scene: local.scene, clip: local.animations[0] });
      if (!pianist.rig) throw new Error("Private pianist has no compatible rig");
      const models = await loadSceneModels();
      const root = new Group();
      const keys = buildKeys(models.kit, width, root);
      const planner: Planner = (input, deliver, context) => {
        if (!fittedChunks) {
          fittedChunks = [];
          const cacheOn = process.env.PIANIST_TEST_CACHE === "1";
          const cache = new PianistOfflineCache(
            cacheOn
              ? offlinePoseFingerprint(
                  readFileSync("local-models/pianist.glb"),
                  bytes,
                  [context?.rest, context?.skin],
                  offlineFitSources()
                )
              : "disabled",
            cacheOn ? ".browser-artifacts/pianist-v5-offline-cache.json" : undefined
          );
          for (const chunk of planChunks(
            context?.rest ?? STUDIO_REST,
            library,
            input,
            () => false,
            context?.timing
          ))
            fittedChunks.push({
              ...chunk,
              poses: chunk.poses.map((pose) =>
                cache.fit(chunk.hand, pose, () =>
                  fitScenePose(
                    pose,
                    context?.rest?.[chunk.hand] ?? STUDIO_REST,
                    chunk.hand,
                    undefined,
                    context?.skin?.[chunk.hand]
                  )
                )
              ),
              sceneFit: true
            });
          cache.flush();
          process.stdout.write(
            `Pianist offline complete cacheHits=${String(cache.hits)} fitted=${String(cache.misses)}\n`
          );
        }
        for (const chunk of fittedChunks) deliver(chunk);
        return () => undefined;
      };
      const hands = new LiveHands(models.hand, planner);
      hands.layout({ pitch: 60, x: 0, width });
      hands.setPlayer(pianist.rig);
      pianist.layout({ pitch: 60, x: 0, width });
      root.add(pianist.space, hands.group);
      const spaces = (["left", "right"] as const).map((hand) => {
        const space = local.scene.getObjectByName(
          "White_Closed_Glove_" + (hand === "left" ? "L" : "R")
        );
        if (!space) throw new Error("No glove");
        return { space, hand };
      });
      const targets = [
        ...notes.left.map((n) => ({ ...n, hand: "left" as const })),
        ...notes.right.map((n) => ({ ...n, hand: "right" as const }))
      ].filter(
        (n) =>
          n.finger !== undefined &&
          n.start + Math.min(0.025, n.duration / 4) <= until &&
          (!range || (n.start < range[1] && n.start + n.duration > range[0]))
      );
      const targetTimes = new Map<number, typeof targets>();
      for (const note of targets) {
        const t = note.start + Math.min(0.025, note.duration / 4);
        targetTimes.set(t, [...(targetTimes.get(t) ?? []), note]);
      }
      const sampleTimes = new Set<number>(targetTimes.keys());
      for (let t = 0; t <= until; t += 0.1) sampleTimes.add(t);
      hands.update({ time: 0, notes, beats: song.beats });
      const lanes = (hands as unknown as { lanes: Record<string, Track> }).lanes;
      for (const lane of Object.values(lanes))
        lane.keys.forEach((key, i) => {
          if (key.t >= 0 && key.t <= until) sampleTimes.add(key.t);
          const next = lane.keys[i + 1];
          if (next && next.t >= 0 && next.t <= until) sampleTimes.add((key.t + next.t) / 2);
        });
      for (const note of targets) {
        sampleTimes.add(note.start + note.duration / 2);
        sampleTimes.add(note.start + Math.max(0, note.duration - 0.005));
        if (range) {
          const start = Math.max(note.start, range[0]),
            end = Math.min(note.start + note.duration, range[1]);
          sampleTimes.add((start + end) / 2);
        }
      }
      const covered = new Set<string>();
      const targetCount = targets.length;
      let deepestStill = 0;
      let deepestPressed = 0;
      let reach = 0;
      let worst = "";
      let worstInfo: unknown;
      const begun = performance.now();
      for (const time of [...sampleTimes]
        .filter((t) => !range || (t >= range[0] && t <= range[1]))
        .sort((a, b) => a - b)) {
        hands.update({ time, notes, beats: song.beats });
        if (Math.round(time * 10) % 100 === 0)
          process.stdout.write(
            `Avatar v5 t=${time.toFixed(1)} elapsedMs=${String(Math.round(performance.now() - begun))}\n`
          );
        pressKeys(hands, keys);
        for (const note of targets) {
          if (
            note.finger === undefined ||
            covered.has(note.id) ||
            time < note.start ||
            time > note.start + note.duration
          )
            continue;
          const contact = pianist.rig.contact(note.hand, note.finger, note.pitch);
          const depth =
            (BLACK_TOP_CLASSES.has(note.pitch % 12) ? 12 : 0) - (contact?.height ?? -Infinity);
          if (
            contact &&
            depth >= 0.5 &&
            depth <= 11 &&
            (hands.keys.get(note.pitch)?.drop ?? 0) >= 0.5
          )
            covered.add(note.id);
        }
        for (const sample of penetrations(root, spaces, keys, time)) {
          if (sample.pressed) deepestPressed = Math.max(deepestPressed, sample.depth);
          else if (sample.depth > deepestStill) {
            deepestStill = sample.depth;
            const hand = sample.hand,
              pose = hands.poses[hand],
              lane = lanes[hand];
            if (!lane) throw new Error("Missing planned hand lane");
            const ki = lane.keys.findIndex((k) => k.t > time);
            const finger =
              ([1, 2, 3, 4, 5] as const).find((f) => f === sample.finger) ??
              (
                [
                  ["thumb", 1],
                  ["index", 2],
                  ["middle", 3],
                  ["ring", 4],
                  ["pinky", 5]
                ] as const
              ).find(([name]) => sample.bone.startsWith(`${name}_`))?.[1];
            worstInfo = {
              time,
              bone: sample.bone,
              pitch: sample.pitch,
              vertex: sample.point,
              neighbors: lane.keys.slice(Math.max(0, ki - 1), ki + 1),
              planned: lane.keys
                .slice(Math.max(0, ki - 1), ki + 1)
                .map((k) => lane.poses[k.strike]?.pitches),
              contact:
                finger === undefined ? undefined : pianist.rig.contact(hand, finger, sample.pitch),
              keys: [...hands.keys],
              pose
            };
            worst =
              sample.hand +
              "/" +
              sample.bone +
              "/pitch" +
              String(sample.pitch) +
              "/t" +
              time.toFixed(2);
          }
        }
        reach = Math.max(reach, pianist.rig.reachError.left, pianist.rig.reachError.right);
      }
      if (worstInfo)
        process.stdout.write("Worst avatar contact " + JSON.stringify(worstInfo) + "\n");
      const missed = targets.filter((note) => !covered.has(note.id));
      // Diagnostics replay independently; they never add coverage or alter acceptance metrics.
      for (const note of missed.slice(0, 8)) {
        if (note.finger === undefined) continue;
        const key = keys.find((candidate) => candidate.pitch === note.pitch);
        const glove = spaces.find((candidate) => candidate.hand === note.hand)?.space;
        const lane = lanes[note.hand];
        if (!key || !glove || !lane) throw new Error("Missing diagnostic key, glove or lane");
        // A boundary miss may have contacted before the focused interval; inspect its source window.
        const from = note.start;
        const to = Math.min(note.start + note.duration, until);
        const times = new Set([...sampleTimes].filter((t) => t >= from && t <= to));
        times.add(from);
        times.add(to);
        for (let t = from; t <= to; t += 1 / 120) times.add(t);
        let minGap = Infinity,
          minGapTime = from,
          bestDepth = -Infinity;
        let best: unknown;
        for (const time of [...times].sort((a, b) => a - b)) {
          hands.update({ time, notes, beats: song.beats });
          pressKeys(hands, keys);
          root.updateMatrixWorld(true);
          const gap = pianistActualFingerGap(glove, key, note.finger);
          if (gap < minGap) {
            minGap = gap;
            minGapTime = time;
          }
          const contact = pianist.rig.contact(note.hand, note.finger, note.pitch);
          const depth = contact
            ? (BLACK_TOP_CLASSES.has(note.pitch % 12) ? 12 : 0) - contact.height
            : -Infinity;
          if (best === undefined || depth > bestDepth) {
            bestDepth = depth;
            const next = lane.keys.findIndex((phase) => phase.t > time);
            const before = next < 0 ? lane.keys.length - 1 : Math.max(0, next - 1);
            best = {
              time,
              contact: contact ?? null,
              depth: Number.isFinite(depth) ? depth : null,
              key: hands.keys.get(note.pitch) ?? { drop: 0, along: null },
              retained: lane.keys.slice(before, before + 2).map((phase) => ({
                ...phase,
                pitches: lane.poses[phase.strike]?.pitches
              }))
            };
          }
        }
        const strike = lane.keys.find(
          (phase) => phase.phase === "strike" && Math.abs(phase.t - note.start) <= 1e-7
        );
        let exactStrike: unknown = { found: false };
        if (strike) {
          hands.update({ time: strike.t, notes, beats: song.beats });
          pressKeys(hands, keys);
          root.updateMatrixWorld(true);
          const gap = pianistActualFingerGap(glove, key, note.finger);
          exactStrike = {
            time: strike.t,
            strike: strike.strike,
            pitches: lane.poses[strike.strike]?.pitches,
            contact: pianist.rig.contact(note.hand, note.finger, note.pitch) ?? null,
            key: hands.keys.get(note.pitch) ?? { drop: 0, along: null },
            actualFingerGap: Number.isFinite(gap) ? gap : null,
            pose: hands.poses[note.hand]
          };
        }
        process.stdout.write(
          "Missed avatar source " +
            JSON.stringify({
              id: note.id,
              hand: note.hand,
              finger: note.finger,
              pitch: note.pitch,
              start: note.start,
              duration: note.duration,
              focusedAcceptanceRange: range ?? null,
              sampledWindow: [from, to],
              samples: times.size,
              actualMinFingerGap: Number.isFinite(minGap) ? minGap : null,
              minGapTime,
              maxPositiveDepth: Math.max(0, bestDepth),
              exactStrike,
              best
            }) +
            "\n"
        );
      }
      const misses = missed.length,
        firstMiss = missed[0] ? JSON.stringify(missed[0]) : "";
      process.stdout.write(
        "Pianist local MIDI W=" +
          String(width) +
          " still=" +
          deepestStill.toFixed(3) +
          " pressed=" +
          deepestPressed.toFixed(3) +
          " reachMm=" +
          (reach * 1000).toFixed(3) +
          " targets=" +
          String(targetCount) +
          " misses=" +
          String(misses) +
          " firstMiss=" +
          firstMiss +
          " worst=" +
          worst +
          "\n"
      );
      expect(deepestStill).toBeLessThanOrEqual(0.5);
      expect(misses).toBe(0);
      expect(deepestPressed).toBeLessThanOrEqual(11);
      expect(reach).toBeLessThan(0.001);
      hands.dispose();
    }
  );
});
