import { quintic } from "./performanceCameraMath";
import { performanceOutroTimeline } from "./performanceOutroTimeline";
import { performanceRoadScale } from "./performanceRoadProjection";
import { Box3, Color, PerspectiveCamera, Vector3 } from "three";
import type { Object3D, Scene } from "three";
import { posedSceneBounds } from "./posedSceneBounds";
import {
  performanceOpeningClock,
  performanceOpeningHandsSeconds,
  performanceOpeningSeconds,
  performanceSceneTimeline
} from "./performanceSceneTimeline";
import type { HandsSource } from "./liveHands";
import type { KeyBox } from "./keyBoxes";
import { performanceCameraClipping } from "./performanceCameraClipping";
import { performanceCameraGeometry, performanceOpeningPosition } from "./performanceCameraGeometry";
import type { PerformanceRoadDimensions } from "./performanceCameraGeometry";
import { PerformanceCameraPath } from "./performanceCameraPath";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { PerformanceLights } from "./PerformanceLights";

/** A single camera whose complete pose depends only on session song time. */
export class PerformanceScene {
  roadScale = 1;
  readonly camera = new PerspectiveCamera(45, 1, 1, 10000);
  readonly lights = new PerformanceLights();
  readonly background = new Color(0x000000);
  private readonly bounds = new Box3();
  private readonly centre = new Vector3();
  private readonly size = new Vector3();
  private readonly target = new Vector3();
  private readonly close = new Vector3();
  private readonly full = new Vector3();
  private route: PerformanceCameraPath | undefined;
  private road: PerformanceRoadDimensions | undefined;
  private routeAspect = 0;
  private readonly topUp = new Vector3(0, 0, -1);
  private readonly keyCentre = new Vector3();
  private dirty = true;
  private scale = 0;
  private readonly localFocus = new Vector3(0, 22, 30);
  private handSpan = 400;
  private boxes: readonly KeyBox[] = [];
  private notes: HandsSource["notes"] | undefined;
  private songDuration = Infinity;
  private opening = performanceOpeningSeconds(Infinity);

  setNotes(notes: HandsSource["notes"] | undefined): void {
    if (notes === this.notes) return;
    this.notes = notes;
    this.songDuration = Infinity;
    if (notes) {
      let end = 0;
      for (const note of [...notes.left, ...notes.right])
        if (Number.isFinite(note.start + note.duration))
          end = Math.max(end, note.start + note.duration);
      if (end > 0) this.songDuration = end;
    }
    this.opening = performanceOpeningSeconds(this.songDuration);
    this.focusOpening();
    this.route = undefined;
  }

  getDuration(): number {
    return this.songDuration;
  }

  private focusOpening(): void {
    if (!this.notes) return;
    const notes = [...this.notes.left, ...this.notes.right].filter((note) =>
      Number.isFinite(note.start)
    );
    if (notes.length === 0) return;
    const first = Math.min(...notes.map((note) => note.start));
    // The notes under the close hand shot, which a short opening cuts to under a second.
    const hold = performanceOpeningHandsSeconds(this.opening);
    const pitches = new Set(
      notes.filter((note) => note.start < first + hold).map((note) => note.pitch)
    );
    const opening = this.boxes.filter((box) => pitches.has(box.pitch));
    const white = this.boxes.find((box) => !box.black);
    if (opening.length === 0 || !white) return;
    const left = Math.min(...opening.map((box) => box.x - box.width / 2));
    const right = Math.max(...opening.map((box) => box.x + box.width / 2));
    this.localFocus.x = (left + right) / 2;
    this.handSpan = Math.max(white.width * 16, right - left + white.width * 6);
  }

  layout(boxes: readonly KeyBox[]): void {
    this.boxes = boxes;
    const whites = boxes.filter((box) => !box.black);
    const centre = whites.find((box) => box.pitch === 60) ?? whites[Math.floor(whites.length / 2)];
    if (centre) {
      this.localFocus.set(centre.x, centre.top, 30);
      this.handSpan = centre.width * 16;
    }
    this.focusOpening();
    this.invalidate();
  }

  setRoad(frame: ThreeRoadFrame | undefined, floorY: number, nearZ: number, farZ: number): void {
    const available =
      frame !== undefined &&
      Number.isFinite(floorY) &&
      Number.isFinite(nearZ) &&
      Number.isFinite(farZ) &&
      farZ > nearZ;
    if (!available) {
      if (this.road) {
        this.road = undefined;
        this.route = undefined;
      }
      return;
    }
    if (this.road?.floorY === floorY && this.road.nearZ === nearZ && this.road.farZ === farZ)
      return;
    this.road = { floorY, nearZ, farZ, lanes: [] };
    this.route = undefined;
  }

  invalidate(): void {
    this.route = undefined;
    this.dirty = true;
  }

  constructor(scene: Scene) {
    scene.add(this.lights.group);
    this.lights.group.visible = false;
  }

  update(time: number, width: number, height: number, subject: Object3D): number {
    const opening = this.opening,
      frame = performanceSceneTimeline(time, opening);
    this.roadScale = this.road
      ? performanceRoadScale(this.road.farZ - this.road.nearZ, time, opening)
      : 1;
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    // Bounds are refreshed for the posed local model; no static bind-pose clipping.
    if (this.dirty || this.scale !== subject.scale.x) {
      posedSceneBounds(subject, this.bounds);
      this.dirty = false;
      this.scale = subject.scale.x;
      this.route = undefined;
    }
    this.keyCentre.copy(this.localFocus).applyMatrix4(subject.matrixWorld);
    if (this.bounds.isEmpty())
      this.bounds.setFromCenterAndSize(this.keyCentre, this.size.set(400, 400, 400));
    this.bounds.getCenter(this.centre);
    this.bounds.getSize(this.size);
    const radius = Math.max(100, this.size.length() / 2);
    const halfFov = Math.atan(Math.tan((45 * Math.PI) / 360) * Math.min(1, this.camera.aspect));
    const distance = (radius / Math.sin(halfFov)) * 1.12;
    this.keyCentre.copy(this.localFocus).applyMatrix4(subject.matrixWorld);
    this.close.copy(this.keyCentre);
    const halfView = Math.tan((45 * Math.PI) / 360);
    const across = this.handSpan / (2 * halfView * this.camera.aspect);
    const along = 360 / (2 * halfView);
    this.close.y += Math.max(across, along) * subject.scale.x * 1.1;
    this.close.z += 1;
    this.full.copy(this.centre);
    this.full.y += distance;
    this.full.z += 1;
    if (!this.route || this.routeAspect !== this.camera.aspect) {
      const pitches =
        this.notes && new Set([...this.notes.left, ...this.notes.right].map((note) => note.pitch));
      const lanes = this.boxes
        .filter((box) => !pitches || pitches.has(box.pitch))
        .map((box) => ({ x: box.x, y: box.black ? box.top : (this.road?.floorY ?? box.top) }));
      const road = this.road && { ...this.road, lanes };
      const geometry = performanceCameraGeometry(
        subject,
        this.bounds,
        this.keyCentre,
        this.handSpan * subject.scale.x,
        this.full,
        this.boxes,
        road
      );
      this.route = new PerformanceCameraPath({
        ...geometry,
        duration: this.songDuration,
        aspect: this.camera.aspect
      });
      this.routeAspect = this.camera.aspect;
    }
    this.full.copy(this.route.geometry.top);
    if (!Number.isFinite(time) || time <= opening) {
      this.camera.fov = 45;
      const position = performanceOpeningPosition(time, this.close, this.route.geometry, opening);
      const clock = performanceOpeningClock(time, opening);
      this.camera.position.set(position.x, position.y, position.z);
      this.target
        .copy(this.keyCentre)
        .lerp(this.centre, clock > 14 ? (clock > 14 ? quintic((clock - 14) / 2) : 0) : 0);
      this.camera.up.copy(this.topUp);
      this.camera.lookAt(this.target);
    } else {
      const pose = this.route.sample(time);
      this.roadScale *= pose.roadScale;
      this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.camera.fov = pose.fov;
      this.camera.up.set(pose.up.x, pose.up.y, pose.up.z);
      this.target.set(pose.target.x, pose.target.y, pose.target.z);
      this.camera.lookAt(this.target);
      this.camera.userData.performanceShot = pose.shot;
      this.camera.userData.performanceCrossing = pose.crossing;
    }
    const clip = performanceCameraClipping(
      this.camera.position,
      this.route.geometry.bounds,
      radius,
      subject.scale.x,
      this.route.geometry.road
    );
    this.camera.near = clip.near;
    this.camera.far = clip.far;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const face = this.route.geometry.face;
    if (face) this.lights.setFaceTarget(face.x, face.y, face.z);
    this.lights.setView(this.camera, subject.scale.x);
    this.lights.layout(
      this.keyCentre,
      radius,
      frame.spotFade * performanceOutroTimeline(time, this.songDuration).light,
      this.handSpan * subject.scale.x,
      subject.scale.x,
      time,
      opening
    );
    return time > opening ? this.route.sample(time).noteAngle : (frame.vertical * Math.PI) / 2;
  }

  dispose(): void {
    this.lights.dispose();
  }
}
