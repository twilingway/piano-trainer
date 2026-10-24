import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  OrthographicCamera,
  Scene
} from "three";
import type { Camera, WebGLRenderer, Object3D } from "three";
import {
  buildProjectionLayout,
  sampleProjectionLane,
  sampleProjectionLaneAtY,
  projectionLaneWidth
} from "../stylizedProjection";
import type { ProjectionLayout, ProjectionParameters } from "../stylizedProjection";
import type { KeyBox } from "./keyBoxes";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import type { WorldCamera } from "../worldCamera";
import { ProjectionKeyAnchors } from "./projectionKeyAnchors";
import { ProjectionBackground } from "./ProjectionBackground";
import { ProjectionNoteBatch } from "./ProjectionNoteBatch";
import { ProjectionDebug } from "./ProjectionDebug";
import { ProjectionDigits } from "./ProjectionDigits";
import { projectionNoteProgress } from "./projectionNoteProgress";

/** Independent CSS-pixel composition. The keyboard and its camera remain authoritative. */
export class StylizedProjectionLayer {
  private readonly scene = new Scene();
  private readonly backgroundScene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -10, 10);
  private readonly anchors = new ProjectionKeyAnchors();
  private readonly background = new ProjectionBackground();
  private readonly notes = new ProjectionNoteBatch();
  private readonly digits = new ProjectionDigits();
  private readonly debug = new ProjectionDebug();
  private readonly guidesGeometry = new BufferGeometry();
  private readonly guidePositions = new BufferAttribute(new Float32Array(88 * 66 * 6), 3);
  private readonly guidesMaterial = new LineBasicMaterial({
    color: 0x24c9fc,
    transparent: true,
    opacity: 0.22,
    depthTest: false,
    depthWrite: false
  });
  private readonly guides = new LineSegments(this.guidesGeometry, this.guidesMaterial);
  private layout: ProjectionLayout | undefined;
  private previousParameters: ProjectionParameters | undefined;
  private previousWidth = 0;
  private previousHeight = 0;
  private previousAnchorCount = -1;
  private previousLocale = "";
  private readonly previousAnchors = new Float64Array(88 * 3).fill(Number.NaN);
  private readonly point = { x: 0, y: 0 };
  private readonly progress = { head: 0, tail: 0 };
  private legacyLabels: readonly { renderable: boolean }[] = [];
  requested = false;
  geometryOnly = false;

  constructor() {
    this.guidesGeometry.setAttribute("position", this.guidePositions);
    this.guides.frustumCulled = false;
    this.scene.add(this.guides, this.notes.mesh, this.digits.mesh, this.debug.mesh);
    this.backgroundScene.add(this.background.mesh);
  }
  suspend(): void {
    for (const label of this.legacyLabels) label.renderable = true;
    this.legacyLabels = [];
    this.requested = false;
    this.geometryOnly = false;
  }

  prepare(
    frame: ThreeRoadFrame | undefined,
    boxes: readonly KeyBox[],
    hinges: readonly { readonly pitch: number; readonly hinge: Object3D }[],
    camera: Camera,
    screen: { readonly width: number; readonly height: number },
    world: WorldCamera,
    enabled: boolean
  ): boolean {
    this.geometryOnly = false;
    for (const label of this.legacyLabels) label.renderable = true;
    this.legacyLabels = frame?.legacyLabels ?? [];
    this.requested = frame?.noteProjection.mode === "stylizedProjection" && enabled;
    if (!this.requested || !frame) return false;
    const anchors = this.anchors.update(boxes, hinges, camera, screen.width, screen.height);
    let changed =
      this.previousParameters !== frame.noteProjection ||
      this.previousWidth !== screen.width ||
      this.previousHeight !== screen.height ||
      this.previousAnchorCount !== anchors.length ||
      this.previousLocale !== document.documentElement.lang;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      if (!a) continue;
      for (let j = 0; j < 3; j++) {
        const v = j === 0 ? a.x : j === 1 ? a.y : a.width;
        const old = this.previousAnchors[i * 3 + j] ?? Number.NaN;
        if (
          !Object.is(old, v) &&
          (Math.abs(old - v) > 0.01 || Number.isFinite(old) !== Number.isFinite(v))
        )
          changed = true;
      }
    }
    if (changed) {
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        if (!a) continue;
        this.previousAnchors.set([a.x, a.y, a.width], i * 3);
      }
      this.previousParameters = frame.noteProjection;
      this.previousAnchorCount = anchors.length;
      this.previousWidth = screen.width;
      this.previousHeight = screen.height;
      this.previousLocale = document.documentElement.lang;
      this.layout = buildProjectionLayout(
        screen.width,
        screen.height,
        anchors,
        frame.noteProjection,
        frame.noteProjection.debugMapping
      );
      this.camera.right = screen.width;
      this.camera.bottom = screen.height;
      this.camera.updateProjectionMatrix();
      this.updateGuides();
      this.debug.update(this.layout);
    }
    const layout = this.layout;
    if (!layout) return false;
    this.background.mesh.visible = layout.valid && !layout.parameters.geometryOnly;
    this.guides.visible = layout.valid;
    this.notes.mesh.visible = this.digits.mesh.visible = layout.valid;
    if (!layout.valid) return false;
    this.geometryOnly = layout.parameters.geometryOnly;
    this.background.update(layout, frame.visualTime);
    this.notes.begin(layout.parameters.geometryOnly ? 0 : layout.parameters.noteGlow);
    this.digits.begin();
    for (let i = 0; i < frame.noteCount; i++) {
      const note = frame.notes[i];
      if (note?.pitch === undefined) continue;
      const lane = layout.lanes[note.pitch - 21];
      if (lane?.pitch !== note.pitch) continue;
      const { head, tail } = projectionNoteProgress(note, world, this.progress);
      this.notes.add(layout, lane, head, tail, note.color, note.alpha);
      sampleProjectionLane(layout, lane, (head + tail) * 0.5, this.point);
      this.digits.add(
        note.finger,
        this.point.x,
        this.point.y,
        Math.min(20, projectionLaneWidth(layout, lane, head) * 1.3)
      );
      this.digits.addText(
        note.label,
        this.point.x,
        this.point.y + (note.finger ? 12 : 0),
        Math.min(22, projectionLaneWidth(layout, lane, head) * 1.4)
      );
    }
    this.notes.end();
    this.digits.end();
    for (const label of this.legacyLabels) label.renderable = false;
    return true;
  }

  private updateGuides(): void {
    const layout = this.layout;
    if (!layout) return;
    let used = 0;
    for (const lane of layout.lanes) {
      if (layout.parameters.debugEvery12 && lane.index % 12 !== 0 && lane.pitch !== 60) continue;
      let y = Math.max(0, lane.horizon.y);
      const endY = Math.min(layout.height, lane.key.y);
      const delta = layout.height / 64;
      while (y < endY) {
        const next = Math.min(endY, (Math.floor(y / delta + 1e-7) + 1) * delta);
        sampleProjectionLaneAtY(layout, lane, y, this.point);
        this.guidePositions.setXYZ(used++, this.point.x, this.point.y, 0);
        sampleProjectionLaneAtY(layout, lane, next, this.point);
        this.guidePositions.setXYZ(used++, this.point.x, this.point.y, 0);
        y = next;
      }
    }
    this.guidesGeometry.setDrawRange(0, used);
    this.guidePositions.needsUpdate = true;
    this.guidesMaterial.opacity = layout.parameters.geometryOnly
      ? 0.45
      : 0.12 + layout.parameters.laneGlow * 0.1;
  }
  draw(renderer: WebGLRenderer): void {
    if (!this.requested) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
  drawBackground(renderer: WebGLRenderer): void {
    if (this.requested && this.layout?.valid && !this.layout.parameters.geometryOnly)
      renderer.render(this.backgroundScene, this.camera);
  }
  dispose(): void {
    this.suspend();
    this.background.dispose();
    this.notes.dispose();
    this.digits.dispose();
    this.debug.dispose();
    this.guidesGeometry.dispose();
    this.guidesMaterial.dispose();
  }
}
