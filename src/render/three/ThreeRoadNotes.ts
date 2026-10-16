import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Vector2
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { createNoteBodyMaterial, createNoteSurfaceMaterial } from "./ThreeNoteMaterial";

export const THREE_ROAD_NOTE_CAPACITY = 1024;
export const THREE_ROAD_NOTE_THICKNESS = 0.28;

/** Three bounded draw calls: real rounded bodies, a glass/neon face and an exterior halo. */
export class ThreeRoadNotes {
  readonly group = new Group();
  readonly capacity: number;
  private readonly bodyGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  private readonly planeGeometry = new PlaneGeometry(1, 1);
  private readonly bodyMaterial = createNoteBodyMaterial();
  private readonly faceMaterial = createNoteSurfaceMaterial(false);
  private readonly haloMaterial = createNoteSurfaceMaterial(true);
  private readonly sizes: InstancedBufferAttribute;
  private readonly alphas: InstancedBufferAttribute;
  private readonly colors: InstancedBufferAttribute;
  private readonly matrices: InstancedBufferAttribute;
  private readonly body: InstancedMesh;
  private readonly face: InstancedMesh;
  private readonly halo: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private disposed = false;

  constructor(capacity = THREE_ROAD_NOTE_CAPACITY) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(THREE_ROAD_NOTE_CAPACITY, Math.floor(capacity)))
      : THREE_ROAD_NOTE_CAPACITY;
    this.sizes = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.alphas = new InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    this.colors = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.matrices = new InstancedBufferAttribute(new Float32Array(this.capacity * 16), 16);
    for (const attribute of [this.sizes, this.alphas, this.colors, this.matrices])
      attribute.setUsage(DynamicDrawUsage);
    for (const geometry of [this.bodyGeometry, this.planeGeometry]) {
      geometry.setAttribute("noteSize", this.sizes);
      geometry.setAttribute("noteAlpha", this.alphas);
    }
    this.body = new InstancedMesh(this.bodyGeometry, this.bodyMaterial, this.capacity);
    this.face = new InstancedMesh(this.planeGeometry, this.faceMaterial, this.capacity);
    this.halo = new InstancedMesh(this.planeGeometry, this.haloMaterial, this.capacity);
    for (const mesh of [this.body, this.halo, this.face]) {
      mesh.instanceMatrix = this.matrices;
      mesh.instanceColor = this.colors;
      // Shader dimensions exceed the unit geometry's bounds. Visibility is decided upstream.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
    }
    this.halo.renderOrder = 1;
    this.face.renderOrder = 2;
    this.group.visible = false;
  }

  update(
    notes: readonly WorldRoadNote[],
    floorY: number,
    visualTime = 0,
    noteCount = notes.length
  ): void {
    if (this.disposed) return;
    if (!Number.isFinite(floorY)) {
      this.clear();
      return;
    }
    const count = Number.isFinite(noteCount)
      ? Math.max(0, Math.min(notes.length, Math.floor(noteCount)))
      : notes.length;
    let used = 0;
    for (let index = 0; index < count && used < this.capacity; index++) {
      const note = notes[index];
      if (
        !note ||
        !Number.isFinite(note.x) ||
        !Number.isFinite(note.top) ||
        !Number.isFinite(note.bottom) ||
        !Number.isFinite(note.width) ||
        !Number.isFinite(note.color) ||
        !Number.isFinite(note.alpha) ||
        note.width <= 0 ||
        note.top <= note.bottom ||
        note.alpha <= 0
      )
        continue;
      const height = note.width * THREE_ROAD_NOTE_THICKNESS;
      const depth = note.top - note.bottom;
      const centreY = floorY + height / 2;
      const centreZ = -(note.top + note.bottom) / 2;
      if (!Number.isFinite(depth) || !Number.isFinite(centreY) || !Number.isFinite(centreZ))
        continue;
      this.sizes.setXYZ(used, note.width, height, depth);
      this.alphas.setX(used, Math.min(1, note.alpha));
      this.color.setRGB(
        ((note.color >> 16) & 255) / 255,
        ((note.color >> 8) & 255) / 255,
        (note.color & 255) / 255
      );
      this.body.setColorAt(used, this.color);
      this.matrix.makeTranslation(note.x, centreY, centreZ);
      this.body.setMatrixAt(used, this.matrix);
      used++;
    }
    this.body.count = this.halo.count = this.face.count = used;
    this.group.visible = used > 0;
    if (used > 0) {
      this.upload(this.sizes, used);
      this.upload(this.alphas, used);
      this.upload(this.colors, used);
      this.upload(this.matrices, used);
    }
    const time = Number.isFinite(visualTime) ? visualTime : 0;
    const faceTime = this.faceMaterial.uniforms.visualTime;
    const haloTime = this.haloMaterial.uniforms.visualTime;
    if (faceTime) faceTime.value = time;
    if (haloTime) haloTime.value = time;
  }

  setViewport(width: number, height: number): void {
    for (const material of [this.faceMaterial, this.haloMaterial]) {
      const viewport = material.uniforms.viewport;
      const value: unknown = viewport?.value;
      if (value instanceof Vector2) value.set(Math.max(1, width), Math.max(1, height));
    }
  }

  clear(): void {
    this.body.count = this.halo.count = this.face.count = 0;
    this.group.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
    this.group.clear();
    for (const mesh of [this.body, this.face, this.halo]) mesh.dispose();
    this.bodyGeometry.dispose();
    this.planeGeometry.dispose();
    this.bodyMaterial.dispose();
    this.faceMaterial.dispose();
    this.haloMaterial.dispose();
  }

  private upload(attribute: InstancedBufferAttribute, used: number): void {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, used * attribute.itemSize);
    attribute.needsUpdate = true;
  }
}
