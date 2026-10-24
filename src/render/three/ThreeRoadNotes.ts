import { createFilledNoteBodyMaterial } from "./FilledNoteMaterial";
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
import { performanceNoteMatrix } from "./performanceNoteMatrix";
import { noteSlabHeight } from "../noteDimensions";
import { createNoteSlabGeometry, NOTE_SLAB_THICKNESS } from "./noteSlabGeometry";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { createNoteBodyMaterial } from "./ThreeNoteMaterial";
import { createNoteHaloMaterial } from "./noteHaloMaterial";

export const THREE_ROAD_NOTE_CAPACITY = 1024;
export const THREE_ROAD_NOTE_THICKNESS = NOTE_SLAB_THICKNESS;

/** Two bounded batches: a uniformly emissive closed volume and its exterior halo. */
export class ThreeRoadNotes {
  performanceAngle = 0;
  performanceScale = 1;
  nearZ = 0;
  readonly group = new Group();
  readonly capacity: number;
  private readonly bodyGeometry = createNoteSlabGeometry();
  private readonly planeGeometry = new PlaneGeometry(1, 1);
  private readonly bodyMaterial = createNoteBodyMaterial();
  private readonly haloMaterial = createNoteHaloMaterial();
  private readonly filledMaterial = createFilledNoteBodyMaterial();
  private readonly filledHalo = createNoteHaloMaterial(true);
  private readonly contacts: InstancedBufferAttribute;
  private readonly projections: InstancedBufferAttribute;
  private readonly sizes: InstancedBufferAttribute;
  private readonly alphas: InstancedBufferAttribute;
  private readonly colors: InstancedBufferAttribute;
  private readonly matrices: InstancedBufferAttribute;
  private readonly body: InstancedMesh;
  private readonly halo: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private disposed = false;

  constructor(capacity = THREE_ROAD_NOTE_CAPACITY) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(THREE_ROAD_NOTE_CAPACITY, Math.floor(capacity)))
      : THREE_ROAD_NOTE_CAPACITY;
    this.contacts = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.projections = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.sizes = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.alphas = new InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    this.colors = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.matrices = new InstancedBufferAttribute(new Float32Array(this.capacity * 16), 16);
    for (const attribute of [
      this.sizes,
      this.contacts,
      this.projections,
      this.alphas,
      this.colors,
      this.matrices
    ])
      attribute.setUsage(DynamicDrawUsage);
    for (const geometry of [this.bodyGeometry, this.planeGeometry]) {
      geometry.setAttribute("noteSize", this.sizes);
      geometry.setAttribute("noteProjection", this.projections);
      geometry.setAttribute("noteContact", this.contacts);
      geometry.setAttribute("noteAlpha", this.alphas);
    }
    this.body = new InstancedMesh(this.bodyGeometry, this.bodyMaterial, this.capacity);
    this.halo = new InstancedMesh(this.planeGeometry, this.haloMaterial, this.capacity);
    for (const mesh of [this.body, this.halo]) {
      mesh.instanceMatrix = this.matrices;
      mesh.instanceColor = this.colors;
      // Shader dimensions exceed the unit geometry's bounds. Visibility is decided upstream.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
    }
    this.halo.renderOrder = 1;
    this.group.visible = false;
  }

  /** Opaque bloom is drawn before solid faces; glass retains its original transparent passes. */
  setStyle(style: "filled" | "glass"): void {
    if (this.disposed) return;
    const filled = style === "filled";
    this.body.material = filled ? this.filledMaterial : this.bodyMaterial;
    this.halo.material = filled ? this.filledHalo : this.haloMaterial;
    this.halo.renderOrder = filled ? -1 : 1;
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
      const laneY = note.lane?.y ?? floorY;
      const height = noteSlabHeight(note.width, laneY);
      const depth = note.top - note.bottom;
      const centreY = laneY + height / 2;
      const centreZ = -(note.top + note.bottom) / 2;
      if (!Number.isFinite(depth) || !Number.isFinite(centreY) || !Number.isFinite(centreZ))
        continue;
      this.sizes.setXYZ(used, note.width, height, depth);
      this.projections.setXYZW(
        used,
        note.lane?.scaleX ?? 1,
        note.lane?.offsetX ?? 0,
        note.lane?.offsetY ?? 0,
        -centreZ
      );
      this.contacts.setXYZW(
        used,
        laneY,
        note.lane?.depth ?? this.nearZ,
        note.lane?.freeFar?.x ?? 0,
        note.lane?.freeFar?.y ?? 0
      );
      this.alphas.setX(used, Math.min(1, note.alpha));
      this.color.setRGB(
        ((note.color >> 16) & 255) / 255,
        ((note.color >> 8) & 255) / 255,
        (note.color & 255) / 255
      );
      this.body.setColorAt(used, this.color);
      performanceNoteMatrix(
        this.matrix,
        note.x,
        centreY,
        centreZ,
        laneY,
        this.nearZ,
        this.performanceAngle,
        this.performanceScale
      );
      this.body.setMatrixAt(used, this.matrix);
      used++;
    }
    this.body.count = this.halo.count = used;
    this.group.visible = used > 0;
    if (used > 0) {
      this.upload(this.sizes, used);
      this.upload(this.projections, used);
      this.upload(this.contacts, used);
      this.upload(this.alphas, used);
      this.upload(this.colors, used);
      this.upload(this.matrices, used);
    }
    const time = Number.isFinite(visualTime) ? visualTime : 0;
    const bodyTime = this.bodyMaterial.uniforms.visualTime;
    const haloTime = this.haloMaterial.uniforms.visualTime;
    if (bodyTime) bodyTime.value = time;
    if (haloTime) haloTime.value = time;
  }

  setViewport(width: number, height: number): void {
    for (const material of [this.haloMaterial, this.filledHalo]) {
      const viewport = material.uniforms.viewport;
      const value: unknown = viewport?.value;
      if (value instanceof Vector2) value.set(Math.max(1, width), Math.max(1, height));
    }
  }

  clear(): void {
    this.body.count = this.halo.count = 0;
    this.group.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
    this.group.clear();
    for (const mesh of [this.body, this.halo]) mesh.dispose();
    this.bodyGeometry.dispose();
    this.planeGeometry.dispose();
    this.bodyMaterial.dispose();
    this.haloMaterial.dispose();
    this.filledMaterial.dispose();
    this.filledHalo.dispose();
  }

  private upload(attribute: InstancedBufferAttribute, used: number): void {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, used * attribute.itemSize);
    attribute.needsUpdate = true;
  }
}
