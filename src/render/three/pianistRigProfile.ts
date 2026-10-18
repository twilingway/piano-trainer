import { Bone, Matrix4, SkinnedMesh, Vector3 } from "three";
import type { Object3D, Quaternion } from "three";
import type { Finger, Hand } from "../../fingering/fingering";
import { BoneFrame } from "./handPose";
import { FINGERS, R_FINGER, TIP_ABOVE, at } from "./handSolver/mech";
import type { Rest, Vec3 } from "./handSolver/mech";
import type { SkinRadii } from "./handScenePose";

const FINGER_NAME: Readonly<Record<Finger, string>> = {
  1: "thumb",
  2: "index",
  3: "middle",
  4: "ring",
  5: "pinky"
};
const Y = new Vector3(0, 1, 0);
const tuple = (p: Vector3): Vec3 => [p.x, p.y, p.z];

export interface PianistPhalanx {
  readonly bone: Bone;
  readonly finger: Finger;
  readonly joint: number;
  readonly bendAxis: Vector3;
}

export interface PianistHandProfile {
  readonly hand: Hand;
  readonly wrist: Bone;
  readonly upper: Bone;
  readonly forearm: Bone;
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly phalanges: readonly PianistPhalanx[];
  readonly rest: Rest;
  readonly radii: SkinRadii;
  readonly fromHandFrame: Matrix4;
  readonly wristBindTurn: Quaternion;
  readonly meshes: readonly Object3D[];
  readonly glove: SkinnedMesh;
}

function bone(scene: Object3D, name: string): Bone {
  const found = scene.getObjectByName(name);
  if (!(found instanceof Bone)) throw new Error(`PianistRig has no ${name}`);
  return found as Bone;
}

/** The terminal joint sits inside the measured glove cap, not at an invented HandRig length. */
function terminalLength(glove: SkinnedMesh, tip: Bone, radius: number): number {
  const index = glove.skeleton.bones.indexOf(tip);
  const skin = glove.geometry.getAttribute("skinIndex");
  const weights = glove.geometry.getAttribute("skinWeight");
  const inverse = tip.matrixWorld.clone().invert();
  const p = new Vector3();
  let end = -Infinity;
  for (let i = 0; i < skin.count; i++) {
    let weight = 0;
    for (let j = 0; j < 4; j++)
      if (skin.getComponent(i, j) === index) weight += weights.getComponent(i, j);
    if (weight < 0.8) continue;
    glove.getVertexPosition(i, p).applyMatrix4(glove.matrixWorld).applyMatrix4(inverse);
    end = Math.max(end, p.y);
  }
  const length = end - radius / 1000;
  if (!(length > 0.005 && length < 0.08))
    throw new Error("PianistRig has no measurable finger cap");
  return length * 1000;
}

/** Measure the skin envelope in each dominant phalanx frame, including the thumb base. */
function gloveRadii(glove: SkinnedMesh, fingers: ReadonlyMap<Bone, Finger>): SkinRadii {
  const radius = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const indices = glove.geometry.getAttribute("skinIndex"),
    weights = glove.geometry.getAttribute("skinWeight");
  const point = new Vector3();
  for (let i = 0; i < indices.count; i++) {
    let dominant = 0;
    for (let j = 1; j < 4; j++)
      if (weights.getComponent(i, j) > weights.getComponent(i, dominant)) dominant = j;
    const bone = glove.skeleton.bones[indices.getComponent(i, dominant)];
    const finger = bone ? fingers.get(bone) : undefined;
    if (!bone || finger === undefined || weights.getComponent(i, dominant) < 0.8) continue;
    glove.getVertexPosition(i, point).applyMatrix4(glove.matrixWorld);
    bone.worldToLocal(point);
    radius[finger] = Math.max(radius[finger], Math.hypot(point.x, point.z) * 1000);
  }
  for (const finger of FINGERS) if (radius[finger] <= 0) radius[finger] = R_FINGER[finger];
  return radius;
}

/** Calibrate in the bind pose, before the seated demonstration clip is sampled. */
export function pianistHandProfile(scene: Object3D, hand: Hand): PianistHandProfile {
  const side = hand === "right" ? "R" : "L";
  const wrist = bone(scene, `hand${side}`);
  const upper = bone(scene, `upper_arm${side}`);
  const forearm = bone(scene, `forearm${side}`);
  if (wrist.parent !== forearm || forearm.parent !== upper) throw new Error("Invalid pianist arm");
  const glove = scene.getObjectByName(`White_Closed_Glove_${side}`);
  if (!(glove instanceof SkinnedMesh)) throw new Error("PianistRig has no weighted glove");
  glove.skeleton.update();
  const frame = new BoneFrame(scene);
  const fingers = FINGERS.map((finger) => ({
    finger,
    bones: [1, 2, 3].map((joint) => bone(scene, `${FINGER_NAME[finger]}_${String(joint)}${side}`))
  }));
  const radii = gloveRadii(
    glove as SkinnedMesh,
    new Map(fingers.flatMap(({ finger, bones }) => bones.map((bone) => [bone, finger] as const)))
  );
  const index = at(fingers, 1);
  const middle = at(fingers, 2);
  const pinky = at(fingers, 4);
  const origin = frame.head(wrist);
  const x = frame
    .head(at(pinky.bones, 0))
    .sub(frame.head(at(index.bones, 0)))
    .normalize();
  const y = frame.head(at(middle.bones, 0)).sub(origin);
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = x
    .clone()
    .cross(y)
    .multiplyScalar(hand === "left" ? -1 : 1)
    .normalize();
  const fromHandFrame = new Matrix4().makeBasis(x, y, z);
  const toHandFrame = fromHandFrame.clone().invert();
  const mcp = {} as Record<Finger, Vec3>;
  const len = {} as Record<Finger, Vec3>;
  const phalanges: PianistPhalanx[] = [];
  for (const { finger, bones } of fingers) {
    const [a, b, c] = [at(bones, 0), at(bones, 1), at(bones, 2)];
    if (a.parent !== wrist || b.parent !== a || c.parent !== b)
      throw new Error("Invalid pianist finger chain");
    mcp[finger] = tuple(frame.head(a).sub(origin).applyMatrix4(toHandFrame).multiplyScalar(1000));
    len[finger] = [
      frame.head(a).distanceTo(frame.head(b)) * 1000,
      frame.head(b).distanceTo(frame.head(c)) * 1000,
      terminalLength(glove as SkinnedMesh, c, radii[finger] * TIP_ABOVE)
    ];
    const d0 = Y.clone().applyQuaternion(frame.turn(a));
    const d1 = Y.clone().applyQuaternion(frame.turn(b));
    const normal = d0.cross(d1).normalize();
    if (normal.lengthSq() < 0.9) throw new Error("Ambiguous pianist bend axis");
    bones.forEach((item, joint) => {
      phalanges.push({
        bone: item,
        finger,
        joint,
        bendAxis: normal.clone().applyQuaternion(frame.turn(item).invert())
      });
    });
  }
  const direction = (item: Bone) => {
    const p = Y.clone().applyQuaternion(frame.turn(item)).applyMatrix4(toHandFrame);
    p.z = 0;
    return tuple(p.normalize());
  };
  const meshes: Object3D[] = [];
  scene.traverse((node) => {
    if (new RegExp(`(?:_ArmCut|White_Closed_Glove|White_Cuff)_${side}$`).test(node.name))
      meshes.push(node);
  });
  return {
    hand,
    wrist,
    upper,
    forearm,
    upperLength: frame.head(upper).distanceTo(frame.head(forearm)),
    lowerLength: frame.head(forearm).distanceTo(origin),
    phalanges,
    radii,
    rest: { mcp, len, neutral: direction(at(middle.bones, 0)), idx: direction(at(index.bones, 0)) },
    fromHandFrame,
    wristBindTurn: frame.turn(wrist),
    meshes,
    glove: glove as SkinnedMesh
  };
}
