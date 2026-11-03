import {
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type BufferGeometry,
  ShaderMaterial,
  Vector2
} from "three";
import type { CanvasFactory } from "../bakeNoteMaterial";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import { noteSlabHeight } from "../noteDimensions";
import {
  bakeNativeNoteLabelAtlas,
  NATIVE_FINGER_LABELS,
  type NativeNoteGlyph,
  type NativeNoteLabelAtlas
} from "./nativeNoteLabelAtlas";
import { NATIVE_NOTE_LABEL_LAYOUT_SHADER } from "./nativeNoteLabelLayout";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
import { roadWidthUniforms } from "./roadWidthUniforms";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { NOTE_SLAB_ATTRIBUTES, NOTE_SLAB_VERTEX } from "./noteSlabGeometry";
import { createNativeNoteLabelGeometry } from "./nativeNoteLabelGeometry";

export const NATIVE_NOTE_LABEL_CAPACITY = 1024;

const VERTEX = /* glsl */ `
#define NOTE_META_PACKED
${NOTE_LANE_SHADER}
${NOTE_SLAB_ATTRIBUTES}
attribute vec4 labelShape;
attribute vec4 labelUv;
attribute vec2 labelAspects;
uniform vec2 viewport;
varying float captionAlpha;
varying vec4 captionClip;
varying vec4 captionRect;
varying vec4 captionAtlas;
${NATIVE_NOTE_LABEL_LAYOUT_SHADER}
vec3 captionNdc(vec4 clip) { return clip.xyz / max(abs(clip.w), 0.000001); }
void main() {
  vec4 noteSize = vec4(labelShape.x, labelShape.w, labelShape.y, notePitch);
  ${NOTE_SLAB_VERTEX}
  vec4 clip = projectRoadLanePoint(vec4(slabPoint, 1.0));
  float halfWidth = labelShape.x * 0.5, halfDepth = labelShape.y * 0.5;
  float topY = labelShape.w * 0.5;
  vec4 front = projectRoadLanePoint(vec4(0.0, topY, halfDepth, 1.0));
  vec4 back = projectRoadLanePoint(vec4(0.0, topY, -halfDepth, 1.0));
  vec2 route = (captionNdc(back).xy - captionNdc(front).xy) * viewport * 0.5;
  float routeLength = max(length(route), 0.000001);
  vec2 direction = route / routeLength;
  vec3 headLeft = captionNdc(projectRoadLanePoint(vec4(-halfWidth, topY, halfDepth, 1.0)));
  vec3 headRight = captionNdc(projectRoadLanePoint(vec4(halfWidth, topY, halfDepth, 1.0)));
  vec2 span = (headRight.xy - headLeft.xy) * viewport * 0.5;
  float headWidth = abs(span.x * direction.y - span.y * direction.x);
  vec4 stack = captionStack(headWidth, routeLength, labelAspects, direction);
  float progress = clamp((stack.w * 0.5 + 2.0) / routeLength, 0.0, 0.5);
  float anchorZ = halfDepth - labelShape.y * progress;
  vec4 anchor = projectRoadLanePoint(vec4(0.0, topY, anchorZ, 1.0));
  vec3 left = captionNdc(projectRoadLanePoint(vec4(-halfWidth, topY, anchorZ, 1.0)));
  vec3 right = captionNdc(projectRoadLanePoint(vec4(halfWidth, topY, anchorZ, 1.0)));
  span = (right.xy - left.xy) * viewport * 0.5;
  float crossWidth = abs(span.x * direction.y - span.y * direction.x);
  stack = captionStack(crossWidth, routeLength, labelAspects, direction);
  bool finger = labelShape.z < 0.0;
  float height = finger ? stack.x : stack.y;
  float aspect = finger ? labelAspects.x : labelAspects.y;
  vec2 along = stack.xy * (labelAspects * abs(direction.x) + abs(direction.y));
  float offset = finger ? -(along.y + stack.z) * 0.5 : (along.x + stack.z) * 0.5;
  vec2 center = captionNdc(anchor).xy + direction * offset * (2.0 / viewport);
  captionRect = vec4(center, vec2(height * aspect, height) * (2.0 / viewport));
  captionAtlas = labelUv;
  captionAlpha = anchor.w > 0.0 ? noteAlpha : 0.0;
  // Divide only after perspective interpolation in the fragment, independent of render DPR.
  captionClip = clip;
  gl_Position = clip;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D picture;
varying float captionAlpha;
varying vec4 captionClip;
varying vec4 captionRect;
varying vec4 captionAtlas;
void main() {
  if (captionClip.w <= 0.0 || captionAlpha <= 0.0 || min(captionRect.z, captionRect.w) <= 0.0) discard;
  vec2 point = captionClip.xy / captionClip.w;
  vec2 cell = (point - captionRect.xy) / captionRect.zw + 0.5;
  if (min(cell.x, cell.y) < 0.0 || max(cell.x, cell.y) > 1.0) discard;
  vec2 pictureUv = captionAtlas.xy + vec2(cell.x, 1.0 - cell.y) * captionAtlas.zw;
  vec4 source = texture2D(picture, pictureUv);
  // Fragment depth already includes the final dock projection. Only the two-pixel strip at the
  // actual near clip fades; an orthographic road's small NDC depth is not world-space distance.
  float nearEdge = max(fwidth(gl_FragCoord.z) * 2.0, 0.000001);
  float fade = smoothstep(0.0, nearEdge, gl_FragCoord.z);
  float alpha = source.a * captionAlpha * fade;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(source.rgb, alpha);
}
`;

/** Two captions per note share one bounded draw call and the body's exact lane transform. */
export class ThreeRoadNoteLabels {
  readonly group = new Group();
  readonly capacity: number;
  performanceAngle = 0;
  performanceScale = 1;
  nearZ = 0;
  private readonly atlas: NativeNoteLabelAtlas | undefined;
  private readonly mesh: InstancedMesh<BufferGeometry, ShaderMaterial> | undefined;
  private readonly shape: InstancedBufferAttribute;
  private readonly aspects: InstancedBufferAttribute;
  private readonly uv: InstancedBufferAttribute;
  private readonly projection: InstancedBufferAttribute;
  private readonly contact: InstancedBufferAttribute;
  private readonly alphaPitch: InstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private disposed = false;

  constructor(capacity = NATIVE_NOTE_LABEL_CAPACITY, createCanvas?: CanvasFactory) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(NATIVE_NOTE_LABEL_CAPACITY, Math.floor(capacity)))
      : NATIVE_NOTE_LABEL_CAPACITY;
    const instances = this.capacity * 2;
    this.shape = new InstancedBufferAttribute(new Float32Array(instances * 4), 4);
    this.aspects = new InstancedBufferAttribute(new Float32Array(instances * 2), 2);
    this.uv = new InstancedBufferAttribute(new Float32Array(instances * 4), 4);
    this.projection = new InstancedBufferAttribute(new Float32Array(instances * 4), 4);
    this.contact = new InstancedBufferAttribute(new Float32Array(instances * 4), 4);
    this.alphaPitch = new InstancedBufferAttribute(new Float32Array(instances * 2), 2);
    this.atlas = bakeNativeNoteLabelAtlas(createCanvas);
    if (this.atlas) {
      const geometry = createNativeNoteLabelGeometry();
      geometry.setAttribute("labelShape", this.shape);
      geometry.setAttribute("labelAspects", this.aspects);
      geometry.setAttribute("labelUv", this.uv);
      geometry.setAttribute("noteProjection", this.projection);
      geometry.setAttribute("noteContact", this.contact);
      geometry.setAttribute("noteAlphaPitch", this.alphaPitch);
      const material = new ShaderMaterial({
        uniforms: {
          ...roadWidthUniforms,
          picture: { value: this.atlas.texture },
          viewport: { value: new Vector2(1, 1) }
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        forceSinglePass: true,
        toneMapped: false,
        side: DoubleSide
      });
      this.mesh = new InstancedMesh(geometry, material, instances);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 9;
      for (const attribute of [
        this.shape,
        this.aspects,
        this.uv,
        this.projection,
        this.contact,
        this.alphaPitch,
        this.mesh.instanceMatrix
      ])
        attribute.setUsage(DynamicDrawUsage);
      this.group.add(this.mesh);
    }
    this.clear();
  }

  get ready(): boolean {
    return !this.disposed && this.mesh !== undefined;
  }

  update(
    notes: readonly WorldRoadNote[],
    floorY: number,
    flat = false,
    noteCount = notes.length
  ): void {
    if (!this.ready || !this.mesh || !this.atlas) return;
    const count = Number.isFinite(noteCount)
      ? Math.max(0, Math.min(notes.length, Math.floor(noteCount), this.capacity))
      : Math.min(notes.length, this.capacity);
    let used = 0;
    if (Number.isFinite(floorY))
      for (let index = 0; index < count; index++) {
        const note = notes[index];
        if (!note || !this.valid(note, floorY)) continue;
        const finger = this.atlas.glyphs.get(NATIVE_FINGER_LABELS[note.finger ?? 0] ?? "");
        const name = note.label ? this.atlas.glyphs.get(note.label) : undefined;
        if (!finger && !name) continue;
        const laneY = note.lane?.y ?? floorY;
        const bodyHeight = flat ? 0 : noteSlabHeight(note.width, laneY);
        performanceNoteMatrix(
          this.matrix,
          note.x,
          laneY + bodyHeight / 2,
          -(note.top + note.bottom) / 2,
          laneY,
          this.nearZ,
          this.performanceAngle,
          this.performanceScale
        );
        if (finger)
          this.write(used++, note, finger, laneY, bodyHeight, -1, finger.aspect, name?.aspect ?? 0);
        if (name)
          this.write(used++, note, name, laneY, bodyHeight, 1, finger?.aspect ?? 0, name.aspect);
      }
    this.mesh.count = used;
    this.group.visible = used > 0;
    if (used > 0)
      for (const attribute of [
        this.shape,
        this.aspects,
        this.uv,
        this.projection,
        this.contact,
        this.alphaPitch,
        this.mesh.instanceMatrix
      ]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, used * attribute.itemSize);
        attribute.needsUpdate = true;
      }
  }

  private write(
    index: number,
    note: WorldRoadNote,
    glyph: NativeNoteGlyph,
    laneY: number,
    bodyHeight: number,
    kind: number,
    fingerAspect: number,
    nameAspect: number
  ): void {
    this.shape.setXYZW(index, note.width, note.top - note.bottom, kind, bodyHeight);
    this.aspects.setXY(index, fingerAspect, nameAspect);
    this.uv.setXYZW(index, glyph.u, glyph.v, glyph.width, glyph.height);
    this.projection.setXYZW(
      index,
      note.lane?.scaleX ?? 1,
      note.lane?.offsetX ?? 0,
      note.lane?.offsetY ?? 0,
      (note.top + note.bottom) / 2
    );
    this.contact.setXYZW(
      index,
      laneY,
      note.lane?.depth ?? this.nearZ,
      note.lane?.freeFar?.x ?? 0,
      note.lane?.freeFar?.y ?? 0
    );
    this.alphaPitch.setXY(index, Math.min(1, note.alpha), note.pitch ?? 0);
    this.mesh?.setMatrixAt(index, this.matrix);
  }

  private valid(note: WorldRoadNote, floorY: number): boolean {
    return (
      Number.isFinite(note.x) &&
      Number.isFinite(note.width) &&
      note.width > 0 &&
      Number.isFinite(note.top) &&
      Number.isFinite(note.bottom) &&
      note.top > note.bottom &&
      Number.isFinite(note.alpha) &&
      note.alpha > 0 &&
      Number.isFinite(note.lane?.y ?? floorY)
    );
  }

  setViewport(width: number, height: number): void {
    const value: unknown = this.mesh?.material.uniforms.viewport?.value;
    if (value instanceof Vector2) value.set(Math.max(1, width), Math.max(1, height));
  }

  clear(): void {
    if (this.mesh) this.mesh.count = 0;
    this.group.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
    this.group.clear();
    this.mesh?.dispose();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.atlas?.texture.dispose();
  }
}
