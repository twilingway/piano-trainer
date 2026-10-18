import { Bone, Box3, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3 } from "three";
import type { Object3D } from "three";
import { cameraGaze } from "./gazeMath";
import type { CameraGaze, GazeBasis, GazePoint } from "./gazeMath";

interface Rotation {
  readonly node: Object3D;
  readonly base: Quaternion;
  readonly applied: Quaternion;
  owned: boolean;
}
interface Eye {
  readonly centre: Vector3;
  readonly radius: number;
  readonly source: Object3D;
  readonly pivotNames: readonly string[];
}
const ZERO: CameraGaze = { headYaw: 0, headPitch: 0, eyeYaw: 0, eyePitch: 0, weight: 0 };
const rotation = (node: Object3D): Rotation => ({
  node,
  base: node.quaternion.clone(),
  applied: node.quaternion.clone(),
  owned: false
});
const find = (model: Object3D, names: readonly string[]): Object3D | undefined => {
  for (const name of names) {
    const found = model.getObjectByName(name);
    if (found) return found;
  }
  return undefined;
};
/** Posed geometry is read once; neither source attributes nor inverse bind matrices are changed. */
function geometryBounds(object: Object3D): Box3 {
  const bounds = new Box3(),
    vertex = new Vector3();
  object.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    const mesh = part as Mesh;
    if (!mesh.geometry.hasAttribute("position")) return;
    const positions = mesh.geometry.getAttribute("position");
    if (part instanceof SkinnedMesh) part.skeleton.update();
    for (let index = 0; index < positions.count; index++)
      bounds.expandByPoint(mesh.getVertexPosition(index, vertex).applyMatrix4(part.matrixWorld));
  });
  return bounds;
}
function setWorldRotation(track: Rotation, world: Quaternion): void {
  const parent = track.node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
  track.node.quaternion.copy(parent.invert().multiply(world)).normalize();
  track.node.updateWorldMatrix(false, true);
  track.applied.copy(track.node.quaternion);
  track.owned = true;
}

/** Call after the native base pose. prepare() may also be called before the next mixer update. */
export class CameraPerformerGaze {
  private readonly head: Rotation | undefined;
  private readonly neck: Rotation | undefined;
  private readonly eyes: Eye[] = [];
  private readonly eyeRotations: Rotation[] = [];
  private readonly localOrigin = new Vector3();
  private readonly localForward = new Vector3();
  private readonly localUp = new Vector3();
  private calibrated = false;

  constructor(private readonly model: Object3D) {
    const candidateHead = find(model, ["Head", "head"]),
      neck = find(model, ["Neck", "neck01", "neck"]);
    this.head = candidateHead instanceof Bone ? rotation(candidateHead) : undefined;
    this.neck = neck instanceof Bone && neck !== candidateHead ? rotation(neck) : undefined;
    if (!this.head) return;
    const head = this.head.node;
    model.updateWorldMatrix(true, true);
    const sources = [
      find(model, ["Eye_1", "Eye_L", "GEO-body_male_realistic.eye.L"]),
      find(model, ["Eye_-1", "Eye_R", "GEO-body_male_realistic.eye.R"])
    ];
    const left = sources[0],
      right = sources[1];
    if (!left || !right) return;
    const bounds = [geometryBounds(left), geometryBounds(right)];
    const a = bounds[0],
      b = bounds[1];
    if (!a || !b || a.isEmpty() || b.isEmpty()) return;
    const centres = [a.getCenter(new Vector3()), b.getCenter(new Vector3())];
    const origin = centres[0]
      ?.clone()
      .add(centres[1] ?? new Vector3())
      .multiplyScalar(0.5);
    if (!origin) return;
    const headPosition = head.getWorldPosition(new Vector3());
    const anatomyUp = origin
      .clone()
      .sub(this.neck?.node.getWorldPosition(new Vector3()) ?? headPosition);
    const headAxes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map(
      (axis) => axis.transformDirection(head.matrixWorld)
    );
    headAxes.sort((x, y) => Math.abs(y.dot(anatomyUp)) - Math.abs(x.dot(anatomyUp)));
    const up = headAxes[0]?.clone();
    if (!up || anatomyUp.lengthSq() < 1e-12) return;
    if (up.dot(anatomyUp) < 0) up.negate();
    const eyeLine = centres[1]?.clone().sub(centres[0] ?? new Vector3());
    if (!eyeLine || eyeLine.lengthSq() < 1e-12) return;
    let forward = new Vector3(),
      irisCount = 0;
    for (const [index, names] of [
      [0, ["Iris_1", "Iris_L"]],
      [1, ["Iris_-1", "Iris_R"]]
    ] as const) {
      const iris = find(model, names),
        centre = centres[index];
      if (!iris || !centre) continue;
      const bound = geometryBounds(iris);
      if (bound.isEmpty()) continue;
      forward.add(bound.getCenter(new Vector3()).sub(centre));
      irisCount++;
    }
    if (!irisCount || forward.lengthSq() < eyeLine.lengthSq() * 0.0001) {
      forward = up.clone().cross(eyeLine).normalize();
      const protrusion = origin.clone().sub(headPosition);
      protrusion.addScaledVector(up, -protrusion.dot(up));
      const horizontal = eyeLine.clone().normalize();
      protrusion.addScaledVector(horizontal, -protrusion.dot(horizontal));
      if (protrusion.lengthSq() > eyeLine.lengthSq() * 0.0001 && forward.dot(protrusion) < 0)
        forward.negate();
    }
    forward.normalize();
    up.addScaledVector(forward, -up.dot(forward)).normalize();
    if (up.lengthSq() < 0.5 || forward.lengthSq() < 0.5) return;
    const inverse = new Matrix4().copy(head.matrixWorld).invert();
    this.localOrigin.copy(origin).applyMatrix4(inverse);
    this.localForward.copy(forward).transformDirection(inverse);
    this.localUp.copy(up).transformDirection(inverse);
    for (const [index, source] of [left, right].entries()) {
      const centre = centres[index],
        box = bounds[index];
      if (!centre || !box) continue;
      this.eyes.push({
        source,
        centre: centre.clone().applyMatrix4(inverse),
        radius: box.getSize(new Vector3()).length() / 2,
        pivotNames:
          index === 0 ? ["PianistIris_1", "PianistIris_L"] : ["PianistIris_-1", "PianistIris_R"]
      });
    }
    this.calibrated = true;
    this.discoverEyes();
  }

  get available(): boolean {
    return this.calibrated;
  }
  get controlledEyeCount(): number {
    return this.eyeRotations.length;
  }

  /** Restore only our last output, preserving a fresh pose already written by the native animator. */
  prepare(): void {
    for (const track of [this.head, this.neck, ...this.eyeRotations]) {
      if (!track?.owned) continue;
      if (track.node.quaternion.equals(track.applied)) track.node.quaternion.copy(track.base);
      track.owned = false;
    }
    this.model.updateWorldMatrix(true, true);
  }

  getFaceBasis(): GazeBasis | undefined {
    const head = this.head?.node;
    if (!head || !this.calibrated) return undefined;
    head.updateWorldMatrix(true, false);
    return {
      origin: this.localOrigin.clone().applyMatrix4(head.matrixWorld),
      forward: this.localForward.clone().transformDirection(head.matrixWorld),
      up: this.localUp.clone().transformDirection(head.matrixWorld)
    };
  }

  private discoverEyes(): void {
    const head = this.head?.node;
    if (!head) return;
    for (const eye of this.eyes) {
      const candidate = find(this.model, eye.pivotNames) ?? eye.source;
      if (this.eyeRotations.some((track) => track.node === candidate)) continue;
      const skinned: SkinnedMesh[] = [];
      candidate.traverse((part) => {
        if (part instanceof SkinnedMesh) skinned.push(part as SkinnedMesh);
      });
      if (skinned.length > 0) continue;
      const centre = eye.centre.clone().applyMatrix4(head.matrixWorld);
      const pivot = candidate.getWorldPosition(new Vector3());
      if (pivot.distanceTo(centre) > Math.max(1e-7, eye.radius * 0.2)) continue;
      this.eyeRotations.push(rotation(candidate));
    }
  }

  apply(cameraWorld: GazePoint, songTime: number, attention = 1): CameraGaze {
    this.prepare();
    this.discoverEyes();
    const face = this.getFaceBasis(),
      head = this.head;
    if (!face || !head) return ZERO;
    for (const track of [head, this.neck, ...this.eyeRotations])
      if (track) track.base.copy(track.node.quaternion);
    const gaze = cameraGaze({ cameraWorld, time: songTime, attention, face });
    if (gaze.weight === 0) return gaze;
    const up = new Vector3().copy(face.up),
      forward = new Vector3().copy(face.forward);
    const right = forward.clone().cross(up).normalize();
    up.crossVectors(right, forward).normalize();
    const delta = new Quaternion()
      .setFromAxisAngle(up, -gaze.headYaw)
      .multiply(new Quaternion().setFromAxisAngle(right, gaze.headPitch));
    const desired = head.node.getWorldQuaternion(new Quaternion()).premultiply(delta);
    if (this.neck) {
      const share = new Quaternion().slerp(delta, 0.2);
      setWorldRotation(
        this.neck,
        this.neck.node.getWorldQuaternion(new Quaternion()).premultiply(share)
      );
    }
    setWorldRotation(head, desired);
    const turned = this.getFaceBasis();
    if (turned) {
      const eyeForward = new Vector3().copy(turned.forward),
        eyeUp = new Vector3().copy(turned.up);
      const eyeRight = eyeForward.clone().cross(eyeUp).normalize();
      eyeUp.crossVectors(eyeRight, eyeForward).normalize();
      const eyeDelta = new Quaternion()
        .setFromAxisAngle(eyeUp, -gaze.eyeYaw)
        .multiply(new Quaternion().setFromAxisAngle(eyeRight, gaze.eyePitch));
      for (const eye of this.eyeRotations)
        setWorldRotation(eye, eye.node.getWorldQuaternion(new Quaternion()).premultiply(eyeDelta));
    }
    this.model.updateWorldMatrix(true, true);
    return gaze;
  }

  dispose(): void {
    this.prepare();
    this.eyeRotations.length = 0;
  }
}
