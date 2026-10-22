import { Matrix4, SkinnedMesh, Vector3 } from "three";
import type { Bone, Object3D } from "three";
import type { Finger } from "../../fingering/fingering";
import { FINGERS, keyUnder, keyTarget } from "./handSolver/mech";
import type { Rest, Vec3 } from "./handSolver/mech";
import type { HandAt } from "./handSolver/track";
import { inContactPatch } from "./handKeySolids";
import { keyFrontDip } from "./handContact";
import { SkinEvaluator, skinAnchor } from "./skinGeometry";
import type { SkinGeometry, SkinTerm } from "./skinGeometry";

interface Support {
  readonly skin: SkinnedMesh;
  readonly index: number;
  readonly finger: Finger;
}

/** Bake full finger skinning once; frame updates use numeric profiles and never raycast. */
export class HandSkin {
  private readonly supports: Support[] = [];
  private readonly vertices: Support[] = [];
  private profile: SkinEvaluator | undefined;
  private cached = false;
  private readonly skins: SkinnedMesh[] = [];
  private readonly point = new Vector3();
  private readonly inverse = new Matrix4();

  constructor(
    private readonly space: Object3D,
    private readonly fingers: ReadonlyMap<Bone, Finger>
  ) {
    space.updateMatrixWorld(true);
    const directions: Vector3[] = [];
    for (let y = -2; y <= 2; y++)
      for (let a = 0; a < 16; a++) {
        const t = (a * Math.PI) / 8;
        directions.push(new Vector3(Math.cos(t), y / 2, Math.sin(t)).normalize());
      }
    directions.push(new Vector3(0, 1, 0), new Vector3(0, -1, 0));
    space.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      const skin = node as SkinnedMesh;
      this.skins.push(skin);
      skin.skeleton.update();
      const indices = skin.geometry.getAttribute("skinIndex"),
        weights = skin.geometry.getAttribute("skinWeight");
      const candidates = new Map<number, { index: number; point: Vector3 }[]>();
      for (let index = 0; index < indices.count; index++) {
        let dominant = 0;
        for (let j = 1; j < 4; j++)
          if (weights.getComponent(index, j) > weights.getComponent(index, dominant)) dominant = j;
        const joint = indices.getComponent(index, dominant),
          bone = skin.skeleton.bones[joint];
        const finger = bone ? fingers.get(bone) : undefined;
        if (!bone || finger === undefined) continue;
        this.vertices.push({ skin, index, finger });
        const point = skin.getVertexPosition(index, new Vector3()).applyMatrix4(skin.matrixWorld);
        bone.worldToLocal(point);
        const list = candidates.get(joint) ?? [];
        list.push({ index, point });
        candidates.set(joint, list);
      }
      for (const [joint, points] of candidates) {
        const bone = skin.skeleton.bones[joint];
        const finger = bone ? fingers.get(bone) : undefined;
        if (finger === undefined || !FINGERS.includes(finger)) continue;
        const selected = new Set<number>();
        const min = Math.min(...points.map((p) => p.point.y)),
          max = Math.max(...points.map((p) => p.point.y));
        const bands = new Map<number, typeof points>();
        for (const point of points) {
          const band = Math.min(
            7,
            Math.floor((8 * (point.point.y - min)) / Math.max(1e-9, max - min))
          );
          const list = bands.get(band) ?? [];
          list.push(point);
          bands.set(band, list);
        }
        for (const band of bands.values())
          for (const direction of directions) {
            let best = -Infinity,
              index = -1;
            for (const candidate of band) {
              const dot = candidate.point.dot(direction);
              if (dot > best) {
                best = dot;
                index = candidate.index;
              }
            }
            if (index >= 0) selected.add(index);
          }
        for (const index of selected) this.supports.push({ skin, index, finger });
      }
    });
  }

  private solver(point: Vector3, toSolver?: Matrix4): Vec3 {
    const inverse = toSolver ?? this.inverse.copy(this.space.matrixWorld).invert();
    point.applyMatrix4(inverse).multiplyScalar(1000);
    return [point.x, -point.z, point.y];
  }

  /** Runtime geometry only; a private avatar's offsets never need a tracked file. */
  bake(rest: Rest, pose: HandAt, toSolver?: Matrix4): SkinGeometry {
    this.space.updateMatrixWorld(true);
    for (const skin of this.skins) skin.skeleton.update();
    const frame = new SkinEvaluator({ vertices: [] }, rest);
    frame.evaluate(pose.angles, pose.root);
    const anchors = new Map<Bone, number>(),
      segments = new Map<Bone, number>();
    for (const [bone, finger] of this.fingers) {
      let depth = 0,
        parent = bone.parent;
      while (parent) {
        if (this.fingers.get(parent as Bone) === finger) depth++;
        parent = parent.parent;
      }
      segments.set(bone, depth);
      anchors.set(bone, skinAnchor(finger, depth));
    }
    const geometry: SkinGeometry = {
      vertices: this.vertices
        .map((support, source) => {
          const skin = support.skin,
            index = skin.geometry.getAttribute("skinIndex"),
            weight = skin.geometry.getAttribute("skinWeight");
          const bind = new Vector3()
            .fromBufferAttribute(skin.geometry.getAttribute("position"), support.index)
            .applyMatrix4(skin.bindMatrix);
          const terms: SkinTerm[] = [];
          let primary = 0;
          for (let j = 1; j < 4; j++)
            if (weight.getComponent(support.index, j) > weight.getComponent(support.index, primary))
              primary = j;
          const primaryBone = skin.skeleton.bones[index.getComponent(support.index, primary)];
          for (let j = 0; j < 4; j++) {
            const w = weight.getComponent(support.index, j);
            if (w === 0) continue;
            const boneIndex = index.getComponent(support.index, j),
              bone = skin.skeleton.bones[boneIndex],
              inverse = skin.skeleton.boneInverses[boneIndex];
            if (!bone || !inverse) throw new Error("missing skin influence");
            const point = bind.clone().applyMatrix4(inverse).applyMatrix4(bone.matrixWorld);
            const anchor = anchors.get(bone) ?? 0;
            terms.push({
              anchor,
              offset: frame.local(anchor, this.solver(point, toSolver)),
              weight: w
            });
          }
          return {
            source,
            finger: support.finger,
            segment: primaryBone ? (segments.get(primaryBone) ?? 0) : 0,
            terms
          };
        })
        .filter((vertex) => vertex.terms.every((term) => term.anchor !== 0))
    };
    this.profile = new SkinEvaluator(geometry, rest);
    this.profile.evaluate(pose.angles, pose.root);
    this.cached = false;
    return geometry;
  }

  /** Exact numeric skinning once per pose; pressure queries never scan the Three mesh. */
  update(pose: HandAt): void {
    this.profile?.evaluate(pose.angles, pose.root);
    this.cached = this.profile !== undefined;
  }

  /** Native finger vertices after Three skinning, for full-profile geometry contract tests. */
  snapshot(toSolver?: Matrix4): readonly Vec3[] {
    this.space.updateMatrixWorld(true);
    for (const skin of this.skins) skin.skeleton.update();
    return this.vertices.map((s) =>
      this.solver(
        s.skin.getVertexPosition(s.index, new Vector3()).applyMatrix4(s.skin.matrixWorld),
        toSolver
      )
    );
  }

  get supportCount(): number {
    return this.supports.length;
  }

  get vertexCount(): number {
    return this.profile?.geometry.vertices.length ?? 0;
  }

  /** Actual skin point requesting the largest hinge angle on this one target key. */
  contact(
    finger: Finger,
    pitch: number,
    mirror: boolean,
    toSolver?: Matrix4
  ): { height: number; along: number } | undefined {
    const target = keyTarget(pitch, finger, mirror);
    if (this.cached && this.profile) {
      let height = Infinity,
        along = 0,
        demand = -Infinity;
      const positions = this.profile.positions;
      this.profile.geometry.vertices.forEach((v, i) => {
        if (v.finger !== finger) return;
        const x = positions[i * 3] ?? 0,
          y = positions[i * 3 + 1] ?? 0,
          z = positions[i * 3 + 2] ?? 0;
        if (!inContactPatch(target, x, y) || keyUnder(x, y, mirror).pitch !== pitch) return;
        const front = keyFrontDip((target.black ? 12 : 0) - z, y);
        if (front > demand) {
          height = z;
          along = y;
          demand = front;
        }
      });
      return Number.isFinite(height) ? { height, along } : undefined;
    }
    this.space.updateMatrixWorld(true);
    if (toSolver) this.inverse.copy(toSolver);
    else this.inverse.copy(this.space.matrixWorld).invert();
    for (const skin of this.skins) skin.skeleton.update();
    let height = Infinity,
      along = 0,
      demand = -Infinity;
    for (const support of this.supports) {
      if (support.finger !== finger) continue;
      support.skin
        .getVertexPosition(support.index, this.point)
        .applyMatrix4(support.skin.matrixWorld)
        .applyMatrix4(this.inverse)
        .multiplyScalar(1000);
      const y = -this.point.z;
      if (
        !inContactPatch(target, this.point.x, y) ||
        keyUnder(this.point.x, y, mirror).pitch !== pitch
      )
        continue;
      const front = keyFrontDip((target.black ? 12 : 0) - this.point.y, y);
      if (front > demand) {
        height = this.point.y;
        along = y;
        demand = front;
      }
    }
    return Number.isFinite(height) ? { height, along } : undefined;
  }
}
