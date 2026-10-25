import {
  Matrix4,
  OrthographicCamera,
  Scene,
  Vector4,
  type Camera,
  type Object3D,
  type WebGLRenderer
} from "three";
import { dockedKeyOffset } from "./dockedRoadProjection";
import { anchorRelativeDockedClip } from "../dockedRoadProjection";
import type { WorldCamera } from "../worldCamera";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { ProjectionDigits } from "./ProjectionDigits";

/** The same route and camera blend as the road shader, with one baked label batch. */
export class DockedRoadLabels {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -10, 10);
  private readonly digits = new ProjectionDigits();
  private readonly worldMatrix = new Matrix4();
  private readonly keyboardMatrix = new Matrix4();
  private readonly point = new Vector4();
  private readonly from = new Vector4();
  private readonly to = new Vector4();
  private readonly anchor = new Vector4();
  private readonly clip = new Vector4();
  private labels: readonly { renderable: boolean }[] = [];
  private enabled = false;
  constructor() {
    this.scene.add(this.digits.mesh);
  }

  prepare(
    frame: ThreeRoadFrame | undefined,
    world: WorldCamera,
    road: Object3D,
    worldCamera: Camera,
    keyboardCamera: Camera,
    screen: { readonly width: number; readonly height: number },
    enabled: boolean
  ): void {
    this.enabled = enabled && frame !== undefined;
    // StylizedProjectionLayer owns the labels whenever its mode is active.
    if (frame?.noteProjection.mode !== "stylizedProjection")
      for (const label of this.labels) label.renderable = true;
    this.labels = this.enabled ? (frame?.legacyLabels ?? []) : [];
    if (!this.enabled || !frame) return;
    for (const label of this.labels) label.renderable = false;
    road.updateWorldMatrix(true, false);
    worldCamera.updateMatrixWorld(true);
    keyboardCamera.updateMatrixWorld(true);
    this.worldMatrix
      .multiplyMatrices(worldCamera.projectionMatrix, worldCamera.matrixWorldInverse)
      .multiply(road.matrixWorld);
    this.keyboardMatrix
      .multiplyMatrices(keyboardCamera.projectionMatrix, keyboardCamera.matrixWorldInverse)
      .multiply(road.matrixWorld);
    this.camera.right = screen.width;
    this.camera.bottom = screen.height;
    this.camera.updateProjectionMatrix();
    this.digits.begin();
    for (let i = 0; i < frame.noteCount; i++) {
      const note = frame.notes[i];
      if (!note || (!note.finger && !note.label) || !note.lane?.freeFar) continue;
      const contact = note.lane.depth ?? world.near.z;
      const progress =
        ((note.top + note.bottom) / 2 - contact) / Math.max(0.000001, world.roadFarZ - contact);
      const far = note.lane.freeFar;
      const dy = far.y - note.lane.y;
      const dz = far.z + contact;
      const length = Math.max(0.000001, Math.hypot(dy, dz));
      this.point.set(
        note.x + (far.x - note.x) * progress,
        note.lane.y + dy * progress - dz / length,
        -contact + dz * progress + dy / length,
        1
      );
      this.from.copy(this.point).applyMatrix4(this.worldMatrix);
      this.point.set(note.x, note.lane.y - dz / length, -contact + dy / length, 1);
      this.anchor.copy(this.point).applyMatrix4(this.worldMatrix);
      this.point.y += dockedKeyOffset(note.pitch ?? 0);
      this.to.copy(this.point).applyMatrix4(this.keyboardMatrix);
      anchorRelativeDockedClip(this.from, this.anchor, this.to, progress, this.clip);
      if (this.clip.w <= 0 || this.clip.z < -this.clip.w || this.clip.z > this.clip.w) continue;
      const x = ((this.clip.x / this.clip.w + 1) * screen.width) / 2;
      const y = ((1 - this.clip.y / this.clip.w) * screen.height) / 2;
      const size = Math.min(
        18,
        Math.max(4, (screen.width / Math.max(20, frame.freeLanes.length)) * 0.7)
      );
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      this.digits.add(note.finger, x, y, size);
      this.digits.addText(note.label, x, y + (note.finger ? size : 0), size);
    }
    this.digits.end();
  }
  draw(renderer: WebGLRenderer): void {
    if (!this.enabled) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
  suspend(): void {
    this.enabled = false;
    for (const label of this.labels) label.renderable = true;
    this.labels = [];
  }
  dispose(): void {
    this.suspend();
    this.digits.dispose();
  }
}
