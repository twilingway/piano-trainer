import { roadWidthUniforms } from "./roadWidthUniforms";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial
} from "three";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
import { NOTE_LANE_SHADER } from "../noteLaneProjection";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { ROAD_TRAIL_CAPACITY, ROAD_TRAIL_MAX_GAP, RoadTrailSelection } from "./roadTrailGeometry";
const NO_ANCHORS: readonly WorldRoadNote[] = [];

const VERTEX = /* glsl */ `
${NOTE_LANE_SHADER}
attribute vec3 noteSize;
attribute float noteAlpha;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main() {
  vUv = uv;
  vTint = instanceColor;
  vAlpha = noteAlpha;
  vec3 point = vec3(position.x * noteSize.x, 0.0, -position.y * noteSize.z);
  gl_Position = projectNoteLane(projectRoadPoint(vec4(point, 1.0)));
}
`;
const FRAGMENT = /* glsl */ `
uniform float visualTime;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float aa = max(fwidth(across), 0.015);
  float edge = smoothstep(0.72, 0.96, across);
  float coverage = 1.0 - smoothstep(1.0 - aa, 1.0, across);
  float ends = smoothstep(0.0, 0.05, vUv.y) * smoothstep(0.0, 0.05, 1.0 - vUv.y);
  float flow = 0.96 + 0.04 * sin(vUv.y * 10.0 - visualTime * 0.8);
  float alpha = mix(0.20, 0.52, edge) * coverage * mix(0.45, 1.0, ends) * vAlpha;
  gl_FragColor = vec4(vTint * mix(0.70, 1.0, edge) * flow, alpha);
}
`;

/** One bounded draw call for translucent neon ribbons between distinct note bodies. */
export class ThreeRoadTrails {
  performanceAngle = 0;
  performanceScale = 1;
  nearZ = 0;
  readonly group = new Group();
  private readonly selection = new RoadTrailSelection();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly time = { value: 0 };
  private readonly material = new ShaderMaterial({
    uniforms: { ...roadWidthUniforms, visualTime: this.time },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide
  });
  private readonly contacts = new InstancedBufferAttribute(
    new Float32Array(ROAD_TRAIL_CAPACITY * 4),
    4
  );
  private readonly projections = new InstancedBufferAttribute(
    new Float32Array(ROAD_TRAIL_CAPACITY * 4),
    4
  );
  private readonly sizes = new InstancedBufferAttribute(
    new Float32Array(ROAD_TRAIL_CAPACITY * 3),
    3
  );
  private readonly alphas = new InstancedBufferAttribute(new Float32Array(ROAD_TRAIL_CAPACITY), 1);
  private readonly mesh = new InstancedMesh(this.geometry, this.material, ROAD_TRAIL_CAPACITY);
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private disposed = false;

  constructor() {
    this.geometry.setAttribute("noteSize", this.sizes);
    this.geometry.setAttribute("noteProjection", this.projections);
    this.geometry.setAttribute("noteContact", this.contacts);
    this.geometry.setAttribute("noteAlpha", this.alphas);
    this.mesh.instanceColor = new InstancedBufferAttribute(
      new Float32Array(ROAD_TRAIL_CAPACITY * 3),
      3
    );
    for (const attribute of [
      this.sizes,
      this.projections,
      this.contacts,
      this.alphas,
      this.mesh.instanceMatrix,
      this.mesh.instanceColor
    ])
      attribute.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.group.add(this.mesh);
    this.clear();
  }

  update(
    notes: readonly WorldRoadNote[],
    floorY: number,
    visualTime = 0,
    noteCount = notes.length,
    maxGap = ROAD_TRAIL_MAX_GAP,
    anchors: readonly WorldRoadNote[] = NO_ANCHORS,
    anchorCount = anchors.length
  ): void {
    if (this.disposed) return;
    if (!Number.isFinite(floorY)) {
      this.clear();
      return;
    }
    const used = this.selection.update(notes, noteCount, maxGap, anchors, anchorCount);
    for (let index = 0; index < used; index++) {
      const trail = this.selection.trails[index];
      if (!trail) continue;
      this.sizes.setXYZ(index, trail.width, 0, trail.top - trail.bottom);
      this.projections.setXYZW(
        index,
        trail.lane?.scaleX ?? 1,
        trail.lane?.offsetX ?? 0,
        trail.lane?.offsetY ?? 0,
        (trail.top + trail.bottom) / 2
      );
      this.contacts.setXYZW(
        index,
        trail.lane?.y ?? floorY,
        trail.lane?.depth ?? this.nearZ,
        trail.lane?.freeFar?.x ?? 0,
        trail.lane?.freeFar?.y ?? 0
      );
      this.alphas.setX(index, trail.alpha);
      this.color.setRGB(
        ((trail.color >> 16) & 255) / 255,
        ((trail.color >> 8) & 255) / 255,
        (trail.color & 255) / 255
      );
      this.mesh.setColorAt(index, this.color);
      performanceNoteMatrix(
        this.matrix,
        trail.x,
        (trail.lane?.y ?? floorY) + 0.15,
        -(trail.bottom + (trail.top - trail.bottom) / 2),
        trail.lane?.y ?? floorY,
        this.nearZ,
        this.performanceAngle,
        this.performanceScale
      );
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.mesh.count = used;
    this.group.visible = used > 0;
    this.time.value = Number.isFinite(visualTime) ? visualTime : 0;
    if (used > 0) {
      this.upload(this.sizes, used);
      this.upload(this.projections, used);
      this.upload(this.contacts, used);
      this.upload(this.alphas, used);
      this.upload(this.mesh.instanceMatrix, used);
      if (this.mesh.instanceColor) this.upload(this.mesh.instanceColor, used);
    }
  }

  clear(): void {
    this.mesh.count = 0;
    this.group.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
    this.group.clear();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private upload(attribute: InstancedBufferAttribute, used: number): void {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, used * attribute.itemSize);
    attribute.needsUpdate = true;
  }
}
