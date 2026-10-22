import { Bone, Group, Quaternion, Vector3 } from "three";

export function keyboard88At<T>(items: ArrayLike<T>, index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`Invalid keyboard88 index ${String(index)}`);
  return value;
}

export interface Keyboard88Rest {
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly scale: readonly number[];
  readonly tail: readonly number[];
}

export interface Keyboard88Rig {
  readonly boneNames: readonly string[];
  readonly parents: readonly number[];
  readonly rest: readonly Keyboard88Rest[];
  readonly rootMatrix: readonly number[];
}

/** Metric FK of the exported bind skeleton, also used by the independent Blender comparison. */
export class Keyboard88Bones {
  readonly root = new Group();
  readonly bones: Bone[];
  readonly restWorld: Quaternion[];
  readonly rig: Keyboard88Rig;

  constructor(rig: Keyboard88Rig) {
    this.rig = rig;
    this.root.matrixAutoUpdate = false;
    this.root.matrix.fromArray(rig.rootMatrix);
    this.bones = rig.boneNames.map((name, i) => {
      const bone = new Bone();
      const rest = keyboard88At(rig.rest, i);
      bone.name = name;
      bone.position.fromArray(rest.position);
      bone.quaternion.fromArray(rest.quaternion);
      bone.scale.fromArray(rest.scale);
      return bone;
    });
    for (const [i, bone] of this.bones.entries()) {
      const parent = keyboard88At(rig.parents, i);
      (parent < 0 ? this.root : keyboard88At(this.bones, parent)).add(bone);
    }
    this.update();
    this.restWorld = this.bones.map((bone) =>
      new Quaternion().setFromRotationMatrix(bone.matrixWorld)
    );
  }

  set(rotations: ArrayLike<number>, offset = 0): void {
    for (let i = 0; i < this.bones.length; i++)
      keyboard88At(this.bones, i).quaternion.fromArray(rotations, offset + i * 4);
    this.update();
  }

  update(): void {
    this.root.updateMatrixWorld(true);
  }

  head(index: number, target = new Vector3()): Vector3 {
    return target.setFromMatrixPosition(keyboard88At(this.bones, index).matrixWorld);
  }

  tail(index: number, target = new Vector3()): Vector3 {
    return target
      .fromArray(keyboard88At(this.rig.rest, index).tail)
      .applyMatrix4(keyboard88At(this.bones, index).matrixWorld);
  }

  write(target: Float32Array): void {
    for (let i = 0; i < this.bones.length; i++)
      keyboard88At(this.bones, i).quaternion.toArray(target, i * 4);
  }
}
