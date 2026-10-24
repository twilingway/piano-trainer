import { roadWidthUniforms } from "./roadWidthUniforms";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial
} from "three";
import type { Texture } from "three";
import {
  bakeNoteMaterial,
  bakeNotePlate,
  NOTE_BLOOM_MARGIN,
  NOTE_FACE_HEIGHT,
  NOTE_FACE_WIDTH
} from "../bakeNoteMaterial";
import type { CanvasFactory } from "../bakeNoteMaterial";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
import type { WorldRoadNote } from "./roadNoteGeometry";

export const FLAT_ROAD_NOTE_CAPACITY = 1024;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
type LayerKind = "bloom" | "face" | "emission" | "bevel" | "plate";
interface Layer {
  readonly kind: LayerKind;
  readonly raised: boolean | undefined;
  readonly mesh: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  readonly shape: InstancedBufferAttribute;
  readonly projection: InstancedBufferAttribute;
  readonly contact: InstancedBufferAttribute;
  readonly alpha: InstancedBufferAttribute;
  used: number;
}
export interface FlatNoteMaskMetrics {
  width: number;
  depth: number;
  capX: number;
  capZ: number;
}

/** The same pixel-space corner/bloom policy as FlatNoteBlocks, mapped onto the shared road. */
export function flatNoteMaskMetrics(
  note: WorldRoadNote,
  kind: LayerKind,
  target: FlatNoteMaskMetrics
): void {
  const unitX = note.materialUnitX ?? 1;
  const unitZ = note.materialUnitZ ?? 1;
  const width = note.width / unitX;
  const height = (note.top - note.bottom) / unitZ;
  const scale = Math.min(1, width / 64, height / 24);
  const bloomScale = Math.min(1, width / 64);
  const margin = kind === "bloom" ? NOTE_BLOOM_MARGIN * bloomScale : 0;
  const cap = kind === "bloom" ? (12 + NOTE_BLOOM_MARGIN) * bloomScale : 12 * scale;
  target.width = note.width + margin * 2 * unitX;
  target.depth = note.top - note.bottom + margin * 2 * unitZ;
  target.capX = Math.min(target.width / 2, cap * unitX);
  target.capZ = Math.min(target.depth / 2, cap * unitZ);
}

const VERTEX = /* glsl */ `
${NOTE_LANE_SHADER}
attribute vec4 noteShape;
attribute float noteAlpha;
uniform vec4 maskSize;
varying vec2 maskUv;
varying vec3 maskTint;
varying float maskAlpha;
float sliceAxis(float cell, float extent, float edge) {
  if (cell < 0.5) return 0.0;
  if (cell < 1.5) return edge;
  if (cell < 2.5) return extent - edge;
  return extent;
}
void main() {
  vec2 cell = floor(vec2(uv.x, 1.0 - uv.y) * 3.0 + 0.5);
  vec3 point = vec3(sliceAxis(cell.x, noteShape.x, noteShape.z) - noteShape.x * 0.5,
                    0.0, sliceAxis(cell.y, noteShape.y, noteShape.w) - noteShape.y * 0.5);
  maskUv = vec2(sliceAxis(cell.x, 1.0, maskSize.z / maskSize.x),
                sliceAxis(cell.y, 1.0, maskSize.w / maskSize.y));
  maskTint = instanceColor;
  maskAlpha = noteAlpha;
  gl_Position = projectNoteLane(projectRoadPoint(vec4(point, 1.0)));
}
`;
const FRAGMENT = /* glsl */ `
uniform sampler2D picture;
varying vec2 maskUv;
varying vec3 maskTint;
varying float maskAlpha;
void main() {
  vec4 source = texture2D(picture, maskUv);
  gl_FragColor = vec4(source.rgb * maskTint, source.a * maskAlpha);
}
`;

/** Shared baked glass masks projected by the native road; full 3D keeps its separate material. */
export class ThreeFlatRoadNotes {
  readonly group = new Group();
  readonly capacity: number;
  performanceAngle = 0;
  performanceScale = 1;
  nearZ = 0;
  private readonly layers: Layer[] = [];
  private readonly textures: Texture[];
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly metrics: FlatNoteMaskMetrics = { width: 0, depth: 0, capX: 0, capZ: 0 };
  private disposed = false;

  constructor(
    capacity = FLAT_ROAD_NOTE_CAPACITY,
    createCanvas: CanvasFactory = (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
  ) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(FLAT_ROAD_NOTE_CAPACITY, Math.floor(capacity)))
      : FLAT_ROAD_NOTE_CAPACITY;
    const material = bakeNoteMaterial(createCanvas);
    const pictures = {
      bloom: material.bloom,
      face: material.face,
      emission: material.emission,
      bevel: material.bevel,
      plate: bakeNotePlate(createCanvas)
    };
    const textures = {} as Record<LayerKind, Texture>;
    for (const kind of Object.keys(pictures) as LayerKind[]) {
      const texture = new CanvasTexture(pictures[kind]);
      texture.flipY = false;
      texture.colorSpace = LinearSRGBColorSpace;
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      textures[kind] = texture;
    }
    this.textures = Object.values(textures);
    this.addLayer("bloom", undefined, textures.bloom, 0);
    this.addLayer("face", false, textures.face, 1);
    this.addLayer("emission", false, textures.emission, 2);
    this.addLayer("bevel", false, textures.bevel, 3);
    this.addLayer("plate", true, textures.plate, 4);
    this.addLayer("face", true, textures.face, 5);
    this.addLayer("emission", true, textures.emission, 6);
    this.addLayer("bevel", true, textures.bevel, 7);
    this.clear();
  }

  private addLayer(
    kind: LayerKind,
    raised: boolean | undefined,
    texture: Texture,
    order: number
  ): void {
    const margin = kind === "bloom" ? NOTE_BLOOM_MARGIN : 0;
    const geometry = new PlaneGeometry(1, 1, 3, 3);
    const shape = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    const projection = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    const contact = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    const alpha = new InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    geometry.setAttribute("noteShape", shape);
    geometry.setAttribute("noteProjection", projection);
    geometry.setAttribute("noteAlpha", alpha);
    geometry.setAttribute("noteContact", contact);
    const material = new ShaderMaterial({
      uniforms: {
        ...roadWidthUniforms,
        picture: { value: texture },
        maskSize: {
          value: [
            NOTE_FACE_WIDTH + margin * 2,
            NOTE_FACE_HEIGHT + margin * 2,
            12 + margin,
            12 + margin
          ]
        }
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      blending: kind === "face" || kind === "plate" ? NormalBlending : AdditiveBlending
    });
    const mesh = new InstancedMesh(geometry, material, this.capacity);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    for (const attribute of [
      shape,
      projection,
      contact,
      alpha,
      mesh.instanceMatrix,
      mesh.instanceColor
    ])
      attribute.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.userData.flatNoteLayer = kind;
    mesh.userData.raised = raised;
    this.group.add(mesh);
    this.layers.push({ kind, raised, mesh, shape, projection, contact, alpha, used: 0 });
  }

  update(notes: readonly WorldRoadNote[], floorY: number, noteCount = notes.length): void {
    if (this.disposed) return;
    for (const layer of this.layers) layer.used = 0;
    const count = Number.isFinite(noteCount)
      ? Math.max(0, Math.min(notes.length, Math.floor(noteCount)))
      : notes.length;
    if (Number.isFinite(floorY))
      for (let index = 0; index < count && index < this.capacity; index++) {
        const note = notes[index];
        if (!note || !this.valid(note) || !Number.isFinite(note.lane?.y ?? floorY)) continue;
        const raised =
          note.pitch !== undefined && BLACK_PITCH_CLASSES.has(((note.pitch % 12) + 12) % 12);
        for (const layer of this.layers) {
          if (layer.raised !== undefined && layer.raised !== raised) continue;
          flatNoteMaskMetrics(note, layer.kind, this.metrics);
          const used = layer.used++;
          layer.shape.setXYZW(
            used,
            this.metrics.width,
            this.metrics.depth,
            this.metrics.capX,
            this.metrics.capZ
          );
          layer.projection.setXYZW(
            used,
            note.lane?.scaleX ?? 1,
            note.lane?.offsetX ?? 0,
            note.lane?.offsetY ?? 0,
            (note.top + note.bottom) / 2
          );
          layer.contact.setXYZW(
            used,
            note.lane?.y ?? floorY,
            note.lane?.depth ?? this.nearZ,
            note.lane?.freeFar?.x ?? 0,
            note.lane?.freeFar?.y ?? 0
          );
          layer.alpha.setX(used, layer.kind === "plate" ? 1 : Math.min(1, note.alpha));
          const tint =
            layer.kind === "bevel" ? 0xffffff : layer.kind === "plate" ? 0x020c18 : note.color;
          this.color.setRGB(
            ((tint >>> 16) & 255) / 255,
            ((tint >>> 8) & 255) / 255,
            (tint & 255) / 255
          );
          layer.mesh.setColorAt(used, this.color);
          const laneY = note.lane?.y ?? floorY;
          performanceNoteMatrix(
            this.matrix,
            note.x,
            laneY,
            -(note.top + note.bottom) / 2,
            laneY,
            this.nearZ,
            this.performanceAngle,
            this.performanceScale
          );
          layer.mesh.setMatrixAt(used, this.matrix);
        }
      }
    for (const layer of this.layers) {
      layer.mesh.count = layer.used;
      for (const attribute of [
        layer.shape,
        layer.projection,
        layer.contact,
        layer.alpha,
        layer.mesh.instanceColor,
        layer.mesh.instanceMatrix
      ]) {
        if (!attribute) continue;
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, layer.used * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
    this.group.visible = this.layers.some((layer) => layer.used > 0);
  }

  private valid(note: WorldRoadNote): boolean {
    return (
      Number.isFinite(note.x) &&
      Number.isFinite(note.top) &&
      Number.isFinite(note.bottom) &&
      Number.isFinite(note.width) &&
      Number.isFinite(note.color) &&
      Number.isFinite(note.alpha) &&
      Number.isFinite(note.materialUnitX ?? 1) &&
      Number.isFinite(note.materialUnitZ ?? 1) &&
      (note.materialUnitX ?? 1) > 0 &&
      (note.materialUnitZ ?? 1) > 0 &&
      note.width > 0 &&
      note.top > note.bottom &&
      note.alpha > 0
    );
  }

  clear(): void {
    for (const layer of this.layers) layer.mesh.count = layer.used = 0;
    this.group.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
    this.group.clear();
    for (const layer of this.layers) {
      layer.mesh.dispose();
      layer.mesh.geometry.dispose();
      layer.mesh.material.dispose();
    }
    for (const texture of this.textures) texture.dispose();
  }
}
