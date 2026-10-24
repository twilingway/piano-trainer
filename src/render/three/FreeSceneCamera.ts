import { boxCameraDistance } from "./boxCameraDistance";
import { Box3, MOUSE, Mesh, SkinnedMesh, PerspectiveCamera, Vector3 } from "three";
import type { Object3D } from "three";
import { MAX_ROAD_WORLD_Z } from "../worldCamera";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FreeCameraMovement } from "../../input/freeCameraMovement";

/** One inspection camera; gesture listeners exist only while this view is active. */
export class FreeSceneCamera {
  readonly camera = new PerspectiveCamera(45, 1, 0.1, 100000);
  private readonly controls: OrbitControls;
  private enabled = false;
  private needsReset = true;
  private needsBounds = true;
  private touchAction = "";
  private readonly bounds = new Box3();
  private readonly scoreBounds = new Box3();
  private readonly roadBounds = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private radius = 1;
  private roadReach = MAX_ROAD_WORLD_Z;
  private readonly movement = new FreeCameraMovement();
  private movementWanted = false;
  private readonly direction = new Vector3();
  private readonly right = new Vector3();

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
    this.movement.setEnabled(on && this.movementWanted);
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
    if (resetPose) this.movement.clear();
    this.needsBounds = true;
    this.needsReset ||= resetPose;
  }

  setRoadBounds(bounds: Box3 | undefined): void {
    if (bounds ? this.roadBounds.equals(bounds) : this.roadBounds.isEmpty()) return;
    if (bounds) this.roadBounds.copy(bounds);
    else this.roadBounds.makeEmpty();
    this.invalidate(false);
  }

  setScoreBounds(bounds: Box3 | undefined): void {
    if (bounds ? this.scoreBounds.equals(bounds) : this.scoreBounds.isEmpty()) return;
    if (bounds) this.scoreBounds.copy(bounds);
    else this.scoreBounds.makeEmpty();
    this.invalidate(false);
  }

  setMovement(on: boolean): void {
    this.movementWanted = on;
    this.movement.setEnabled(on && this.enabled);
  }

  update(width: number, height: number, subject: Object3D, deltaSeconds = 0): void {
    const aspect = Math.max(1, width) / Math.max(1, height);
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    if (this.needsBounds) this.reset(subject, this.needsReset);
    const { forward, right } = this.movement.axes;
    if (forward || right) {
      this.camera.getWorldDirection(this.direction);
      this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      this.direction.multiplyScalar(forward).addScaledVector(this.right, right).normalize();
      this.direction.multiplyScalar(this.radius * Math.max(0, Math.min(0.05, deltaSeconds)));
      this.camera.position.add(this.direction);
      this.controls.target.add(this.direction);
    }
    this.controls.update();
    this.updateClip();
    this.camera.updateMatrixWorld();
  }

  reset(subject: Object3D, resetPose = true): void {
    if (resetPose) this.movement.clear();
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
    this.bounds.union(this.scoreBounds).union(this.roadBounds);
    if (this.bounds.isEmpty())
      this.bounds.setFromCenterAndSize(new Vector3(), new Vector3(400, 400, 400));
    this.bounds.getCenter(this.centre);
    this.bounds.getSize(this.size);
    const radius = Math.max(1, this.size.length() / 2);
    this.radius = radius;
    const scale = subject.getWorldScale(new Vector3());
    this.roadReach =
      MAX_ROAD_WORLD_Z * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    const direction = new Vector3(0.4, 0.55, 1).normalize();
    const distance = boxCameraDistance(this.bounds, this.camera.fov, this.camera.aspect, direction);
    if (resetPose) {
      this.camera.position.copy(this.centre).addScaledVector(direction, distance);
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
    this.movement.dispose();
    this.controls.dispose();
  }
}
