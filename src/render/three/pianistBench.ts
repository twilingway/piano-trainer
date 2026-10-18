import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { Object3D } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { pianistBenchLayout } from "./pianistBenchLayout";
import type { BenchLayout, BenchPose } from "./pianistBenchLayout";

const BONES = {
  pelvis: "pelvis",
  leftHip: "thighL",
  rightHip: "thighR",
  leftKnee: "shinL",
  rightKnee: "shinR",
  leftFoot: "footL",
  rightFoot: "footR"
} as const;

/** Samples the posed rig in the shared model/bench frame, never in display units. */
export function pianistBenchPose(model: Object3D, space: Object3D): BenchPose | undefined {
  space.updateWorldMatrix(true, true);
  const pose: Partial<Record<keyof BenchPose, Vector3>> = {};
  for (const [key, name] of Object.entries(BONES)) {
    const bone = model.getObjectByName(name);
    if (!bone) return undefined;
    pose[key as keyof BenchPose] = space.worldToLocal(bone.getWorldPosition(new Vector3()));
  }
  return pose as unknown as BenchPose;
}

/** One static prop, owned by the pianist and lit by the same stage. */
export class PianistBench {
  readonly group = new Group();
  private readonly cushion;
  private readonly frame;
  private readonly leg;
  private readonly wood = new MeshStandardMaterial({ color: 0x29201b, roughness: 0.36 });
  private readonly leather = new MeshStandardMaterial({ color: 0x161719, roughness: 0.76 });
  private disposed = false;

  constructor(readonly layout: BenchLayout) {
    const { x, top, front, width, depth, floor } = layout;
    const cushionHeight = 0.055;
    const frameHeight = 0.04;
    const legHeight = top - cushionHeight - frameHeight - floor;
    this.cushion = new RoundedBoxGeometry(width, cushionHeight, depth, 3, 0.018);
    this.frame = new BoxGeometry(width - 0.025, frameHeight, depth - 0.025);
    this.leg = new BoxGeometry(0.045, legHeight, 0.045);
    this.group.name = "PianistBench";
    this.group.position.set(x, top, front + depth / 2);
    const cushion = new Mesh(this.cushion, this.leather);
    cushion.name = "PianistBenchCushion";
    cushion.position.y = -cushionHeight / 2;
    const frame = new Mesh(this.frame, this.wood);
    frame.position.y = -cushionHeight - frameHeight / 2;
    this.group.add(cushion, frame);
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const leg = new Mesh(this.leg, this.wood);
        leg.position.set(
          side * (width / 2 - 0.045),
          -cushionHeight - frameHeight - legHeight / 2,
          end * (depth / 2 - 0.045)
        );
        this.group.add(leg);
      }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const geometry of [this.cushion, this.frame, this.leg]) geometry.dispose();
    this.wood.dispose();
    this.leather.dispose();
  }
}

export function createPianistBench(model: Object3D, space: Object3D): PianistBench | undefined {
  const pose = pianistBenchPose(model, space);
  const layout = pose && pianistBenchLayout(pose);
  return layout ? new PianistBench(layout) : undefined;
}
