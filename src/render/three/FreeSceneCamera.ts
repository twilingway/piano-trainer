import { Box3, MOUSE, Mesh, SkinnedMesh, PerspectiveCamera, Vector3 } from "three";
import type { Object3D } from "three";
import { MAX_ROAD_WORLD_Z } from "../worldCamera";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** One inspection camera; gesture listeners exist only while this view is active. */
export class FreeSceneCamera {
  readonly camera = new PerspectiveCamera(45, 1, 0.1, 100000);
  private readonly controls: OrbitControls;
  private enabled = false;
  private needsReset = true;
  private needsBounds = true;
  private touchAction = "";
  private readonly bounds = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private radius = 1;
  private roadReach = MAX_ROAD_WORLD_Z;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.touchAction = this.canvas.style.touchAction;
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.disconnect();
    this.canvas.style.touchAction = this.touchAction;
    this.controls.touches = { ONE: null, TWO: null };
    this.controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.ROTATE, RIGHT: null };
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.01;
    this.controls.maxPolarAngle = Math.PI - 0.01;
    this.controls.enableZoom = true;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.touchAction = this.canvas.style.touchAction;
      this.controls.connect(this.canvas);
      this.canvas.addEventListener("pointerdown", this.preventMiddleDefault);
      window.addEventListener("blur", this.cancelGesture);
      this.canvas.addEventListener("pointercancel", this.cancelGesture);
    } else {
      this.disconnect();
    }
  }

  private readonly preventMiddleDefault = (event: PointerEvent): void => {
    if (event.button === 1) event.preventDefault();
  };

  private readonly cancelGesture = (): void => {
    if (!this.enabled) return;
    this.disconnect();
    this.controls.connect(this.canvas);
    this.canvas.addEventListener("pointerdown", this.preventMiddleDefault);
    window.addEventListener("blur", this.cancelGesture);
    this.canvas.addEventListener("pointercancel", this.cancelGesture);
  };

  private disconnect(): void {
    this.controls.disconnect();
    this.canvas.style.touchAction = this.touchAction;
    this.canvas.removeEventListener("pointerdown", this.preventMiddleDefault);
    window.removeEventListener("blur", this.cancelGesture);
    this.canvas.removeEventListener("pointercancel", this.cancelGesture);
  }

  invalidate(resetPose = true): void {
    this.needsBounds = true;
    this.needsReset ||= resetPose;
  }

  update(width: number, height: number, subject: Object3D): void {
    const aspect = Math.max(1, width) / Math.max(1, height);
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    if (this.needsBounds) this.reset(subject, this.needsReset);
    this.controls.update();
    this.updateClip();
    this.camera.updateMatrixWorld();
  }

  reset(subject: Object3D, resetPose = true): void {
    // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse under the piano's large scale.
    subject.updateWorldMatrix(true, false);
    subject.updateMatrixWorld(true);
    this.bounds.makeEmpty();
    const part = new Box3();
    subject.traverseVisible((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh;
      if (object instanceof SkinnedMesh) {
        object.skeleton.update();
        object.computeBoundingBox();
        part.copy(object.boundingBox);
      } else {
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) part.copy(mesh.geometry.boundingBox);
        else return;
      }
      this.bounds.union(part.applyMatrix4(object.matrixWorld));
    });
    if (this.bounds.isEmpty())
      this.bounds.setFromCenterAndSize(new Vector3(), new Vector3(400, 400, 400));
    this.bounds.getCenter(this.centre);
    this.bounds.getSize(this.size);
    const radius = Math.max(1, this.size.length() / 2);
    this.radius = radius;
    const scale = subject.getWorldScale(new Vector3());
    this.roadReach =
      MAX_ROAD_WORLD_Z * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    const halfFov = Math.atan(
      Math.tan((this.camera.fov * Math.PI) / 360) * Math.min(1, this.camera.aspect)
    );
    const distance = (radius / Math.sin(halfFov)) * 1.12;
    if (resetPose) {
      this.camera.position
        .copy(this.centre)
        .addScaledVector(new Vector3(0.4, 0.55, 1).normalize(), distance);
      this.controls.target.copy(this.centre);
    }
    const currentDistance = this.controls.getDistance();
    this.controls.minDistance = resetPose
      ? Math.max(1, radius * 0.05)
      : Math.min(Math.max(1, radius * 0.05), currentDistance);
    this.controls.maxDistance = resetPose
      ? distance * 20
      : Math.max(distance * 20, currentDistance);

    this.controls.update();
    this.updateClip();
    this.camera.updateMatrixWorld();
    this.needsReset = false;
    this.needsBounds = false;
  }

  private updateClip(): void {
    const near = Math.max(0.1, this.radius / 200);
    // Keys/pianist bounds are cached at reset; leave room for the road beyond them.
    const far = Math.max(
      this.radius * 20,
      this.camera.position.distanceTo(this.centre) + Math.max(this.radius * 4, this.roadReach * 1.1)
    );
    if (this.camera.near === near && this.camera.far === far) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.setEnabled(false);
    this.controls.dispose();
  }
}
