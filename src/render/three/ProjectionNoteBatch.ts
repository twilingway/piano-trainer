import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  DoubleSide
} from "three";
import { projectionLaneWidth, sampleProjectionLane, projectionLaneX } from "../stylizedProjection";
import type { ProjectionLayout, ProjectionLane } from "../stylizedProjection";

const SEGMENTS = 66;
const CAPACITY = 1024;
const VERTICES = SEGMENTS * 6;
const CORNERS = [0, 1, 2, 2, 1, 3];

/** A bounded ribbon batch: head/tail stay on the same warp, never independent flat cards. */
export class ProjectionNoteBatch {
  private readonly geometry = new BufferGeometry();
  private readonly positions = new BufferAttribute(new Float32Array(CAPACITY * VERTICES * 3), 3);
  private readonly uv = new BufferAttribute(new Float32Array(CAPACITY * VERTICES * 2), 2);
  private readonly colors = new BufferAttribute(new Float32Array(CAPACITY * VERTICES * 4), 4);
  private readonly uniforms = { glow: { value: 0.7 } };
  private readonly point = { x: 0, y: 0 };
  private used = 0;
  private count = 0;
  readonly material = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    uniforms: this.uniforms,
    vertexShader: `attribute vec4 tint; varying vec2 vUv; varying vec4 vTint;
      void main(){ vUv=uv; vTint=tint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; varying vec4 vTint; uniform float glow;
      void main(){
        vec2 p=vec2(abs(vUv.x-.5)*2.,abs(vUv.y-.5)*2.);
        vec2 q=p-vec2(.82);
        float edge=length(max(q,0.))+min(max(q.x,q.y),0.)+.82;
        float mask=1.-smoothstep(.86,1.,edge);
        float rim=smoothstep(.66,.9,edge)*(1.-smoothstep(.94,1.,edge));
        float shine=pow(1.-vUv.x,3.)*.24;
        vec3 body=mix(vTint.rgb*.68,vTint.rgb, vUv.x)+shine;
        body=mix(body,vec3(1.),rim*.85);
        float halo=exp(-max(0.,edge-.78)*15.)*.24*glow;
        gl_FragColor=vec4(body+vTint.rgb*halo, max(mask,halo)*vTint.a);
      }`
  });
  readonly mesh = new Mesh(this.geometry, this.material);

  constructor() {
    for (const attribute of [this.positions, this.uv, this.colors])
      attribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("uv", this.uv);
    this.geometry.setAttribute("tint", this.colors);
    this.mesh.frustumCulled = false;
    this.geometry.setDrawRange(0, 0);
  }

  begin(glow: number): void {
    this.used = this.count = 0;
    this.uniforms.glow.value = glow;
  }

  add(
    layout: ProjectionLayout,
    lane: ProjectionLane,
    head: number,
    tail: number,
    color: number,
    alpha = 1
  ): void {
    if (this.count >= CAPACITY || head <= tail) return;
    this.count++;
    const firstY = sampleProjectionLane(layout, lane, tail, this.point).y;
    const lastY = sampleProjectionLane(layout, lane, head, this.point).y;
    const stepY = layout.height / 64;
    const r = ((color >> 16) & 255) / 255,
      g = ((color >> 8) & 255) / 255,
      b = (color & 255) / 255;
    let y0 = Math.max(0, firstY);
    const clippedEnd = Math.min(layout.height, lastY);
    while (y0 < clippedEnd && this.used + 6 <= CAPACITY * VERTICES) {
      const y1 = Math.min(clippedEnd, (Math.floor(y0 / stepY + 1e-7) + 1) * stepY);
      for (let corner = 0; corner < 6; corner++) {
        const code = CORNERS[corner] ?? 0;
        const y = code >= 2 ? y1 : y0;
        const t = (y - firstY) / Math.max(0.0001, lastY - firstY);
        const u = Math.pow(
          Math.max(0, (y - lane.horizon.y) / (lane.key.y - lane.horizon.y)),
          1 / layout.parameters.depthExponent
        );
        this.point.x = projectionLaneX(layout, lane, y);
        this.point.y = y;
        const half = projectionLaneWidth(layout, lane, u) * 0.46;
        const side = code % 2 === 0 ? -1 : 1;
        const index = this.used++;
        this.positions.setXYZ(index, this.point.x + side * half, this.point.y, 0);
        this.uv.setXY(index, side < 0 ? 0 : 1, t);
        this.colors.setXYZW(index, r, g, b, alpha);
      }
      y0 = y1;
    }
  }

  end(): void {
    this.geometry.setDrawRange(0, this.used);
    if (this.used === 0) return;
    for (const attribute of [this.positions, this.uv, this.colors]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.used * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
