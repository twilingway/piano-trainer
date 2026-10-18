import type { Camera } from "three";
import { quintic } from "./performanceCameraMath";
import { performanceSceneTimeline } from "./performanceSceneTimeline";
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  ShaderMaterial,
  SpotLight,
  Vector3,
  BoxGeometry
} from "three";
import type { PerformanceStageLayout } from "./performanceStageLayout";

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  vUv = uv; vNormal = normalize(normalMatrix * normal); vView = -view.xyz; vWorld = world.xyz;
  gl_Position = projectionMatrix * view;
}
`;
const FRAGMENT = /* glsl */ `
uniform vec3 tint;
uniform float density;
uniform float unitScale;
uniform float songTime;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void main() {
  float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.6);
  float ends = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
  float cloud = noise(vWorld / max(80.0 * unitScale, 0.001) + vec3(0.0, -songTime * 0.08, 0.0));
  float alpha = density * facing * ends * (0.35 + 0.65 * cloud);
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(tint, alpha);
  #include <colorspace_fragment>
}
`;

const POOL_FRAGMENT = /* glsl */ `
uniform vec3 tint;
uniform float density;
varying vec2 vUv;
void main() {
  float radius = length(vUv * 2.0 - 1.0);
  float soft = 1.0 - smoothstep(0.05, 1.0, radius);
  gl_FragColor = vec4(tint, density * soft * soft);
  #include <colorspace_fragment>
}
`;
const POOL_VERTEX =
  "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";

/** Soft beam shells, restrained physical light, and lamp fixtures share identical positions. */
export class PerformanceLights {
  readonly group = new Group();
  private readonly geometry = new ConeGeometry(1, 1, 64, 12, true);
  private readonly materials: ShaderMaterial[] = [];
  private readonly beams: Mesh[] = [];
  private readonly spots: SpotLight[] = [];
  private readonly poolGeometry = new CircleGeometry(1, 64);
  private readonly pools: Mesh<CircleGeometry, ShaderMaterial>[] = [];
  private readonly fill = new PointLight(0xffead8, 0.55, 0, 0);
  private readonly face = new Vector3();
  private readonly projectedFace = new Vector3();
  private faceCue = 0;
  private readonly faceLights = [
    new PointLight(0xffd6b3, 0, 0, 0),
    new PointLight(0xffe3c5, 0, 0, 0)
  ];
  private readonly up = new Vector3(0, 1, 0);
  private readonly direction = new Vector3();
  private readonly target = new Vector3();
  private stage: PerformanceStageLayout | undefined;
  private readonly fixtures = new Group();
  private readonly headGeometry = new CylinderGeometry(0.75, 1, 1.2, 24);
  private readonly poleGeometry = new CylinderGeometry(1, 1, 1, 12);
  private readonly lensGeometry = new CircleGeometry(0.7, 24);
  private readonly footGeometry = new BoxGeometry(1, 1, 1);
  private readonly bodyMaterial = new MeshStandardMaterial({
    color: 0x12161b,
    roughness: 0.4,
    metalness: 0.6,
    emissive: 0x151a20
  });
  private readonly lensMaterial = new MeshBasicMaterial({
    color: 0xffe6bd,
    transparent: true,
    opacity: 0
  });
  private readonly heads: Group[] = [];
  private readonly poles: Mesh[] = [];
  private readonly feet: Mesh[][] = [];

  constructor() {
    this.fixtures.name = "performance-light-fixtures";
    for (const color of [0xa3bfd6, 0xffe0c1]) {
      const material = new ShaderMaterial({
        uniforms: {
          tint: { value: new Color(color) },
          density: { value: 0 },
          unitScale: { value: 1 },
          songTime: { value: 0 }
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: DoubleSide
      });
      this.materials.push(material);
      const beam = new Mesh(this.geometry, material);
      const spot = new SpotLight(color, 0, 0, 0.42, 0.92, 0);
      const pool = new Mesh(
        this.poolGeometry,
        new ShaderMaterial({
          uniforms: { tint: { value: new Color(color) }, density: { value: 0 } },
          vertexShader: POOL_VERTEX,
          fragmentShader: POOL_FRAGMENT,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          toneMapped: false,
          blending: AdditiveBlending
        })
      );
      pool.name = "performance-floor-pool";
      pool.rotation.x = -Math.PI / 2;
      this.pools.push(pool);
      this.beams.push(beam);
      this.spots.push(spot);
      this.group.add(beam, spot, spot.target, pool);
      const head = new Group(),
        casing = new Mesh(this.headGeometry, this.bodyMaterial);
      const lens = new Mesh(this.lensGeometry, this.lensMaterial);
      lens.rotation.x = -Math.PI / 2;
      lens.position.y = 0.61;
      head.add(casing, lens);
      const pole = new Mesh(this.poleGeometry, this.bodyMaterial);
      const feet = Array.from({ length: 3 }, () => new Mesh(this.footGeometry, this.bodyMaterial));
      this.heads.push(head);
      this.poles.push(pole);
      this.feet.push(feet);
      this.fixtures.add(head, pole, ...feet);
    }
    this.group.add(this.fill, this.fixtures, ...this.faceLights);
  }
  setFaceTarget(x: number, y: number, z: number): void {
    this.face.set(x, y, z);
  }
  setView(camera: Camera, unit: number): void {
    const distance = camera.position.distanceTo(this.face) / Math.max(0.001, unit);
    this.projectedFace.copy(this.face).project(camera);
    const framing = Math.max(Math.abs(this.projectedFace.x), Math.abs(this.projectedFace.y));
    this.faceCue =
      this.projectedFace.z < 1 && this.projectedFace.z > -1
        ? quintic(Math.max(0, Math.min(1, (3000 - distance) / 2100))) *
          quintic(Math.max(0, Math.min(1, (1.5 - framing) / 0.6)))
        : 0;
  }
  setStageLayout(stage: PerformanceStageLayout | undefined): void {
    this.stage = stage;
  }
  layout(
    centre: Vector3,
    radius: number,
    fade: number,
    handSpan: number,
    unitScale = 1,
    songTime = 0
  ): void {
    this.fill.position.copy(centre).addScaledVector(this.up, handSpan * 0.2);
    this.fill.distance = Math.min(handSpan * 1.1, 260 * unitScale);
    const time = Number.isFinite(songTime) ? Math.max(0, songTime) : 0;
    const spotFade = performanceSceneTimeline(time).spotFade;
    const outro = spotFade > 0 ? Math.max(0, Math.min(1, fade / spotFade)) : 1;
    const attack = quintic((time - 12) / 1.5),
      release = quintic((time - 16.8) / 2.2);
    this.fill.intensity = ((0.8 + 0.15 * attack) * (1 - release) + 0.04 * release) * outro;
    this.faceLights.forEach((light, index) => {
      light.intensity = (index === 0 ? 1 + this.faceCue * 3.2 : 0.5 + this.faceCue * 1.3) * fade;
      const height = Math.max(80 * unitScale, this.face.y - centre.y);
      const faceScale = Math.min(unitScale, height / 800);
      light.distance = Math.min(650 * unitScale, height * 0.75);
      light.position.set(
        this.face.x + (index === 0 ? -1 : 1) * 160 * faceScale,
        this.face.y + 80 * faceScale,
        this.face.z + (index === 0 ? -1 : 1) * 180 * faceScale
      );
    });
    const stage = this.stage,
      spread = stage?.radius ?? radius;
    const floor = stage?.top ?? centre.y - radius;
    const baseX = stage?.centre.x ?? centre.x,
      baseZ = stage?.centre.z ?? centre.z;
    this.target.set(baseX, floor, baseZ + spread * 0.1);
    this.fixtures.visible = fade > 0;
    this.bodyMaterial.emissiveIntensity = 0.22 * fade;
    this.lensMaterial.opacity = 0.75 * fade;
    this.spots.forEach((spot, index) => {
      spot.intensity = (index === 0 ? 0.85 : 1.05) * fade;
      spot.distance = spread * 4;
      spot.position.set(
        baseX + (index === 0 ? -1 : 1) * spread * 0.68,
        floor + spread * 1.55,
        baseZ - spread * 0.5
      );
      spot.target.position.copy(this.target);
      spot.target.position.x += (index === 0 ? -1 : 1) * spread * 0.2;
      const pool = this.pools[index];
      if (pool) {
        pool.position.copy(spot.target.position);
        pool.position.y += 1.5 * unitScale;
        pool.scale.set(spread * 0.44, spread * 0.58, 1);
        const opacity = pool.material.uniforms.density;
        if (opacity) opacity.value = 0.14 * fade;
        pool.visible = fade > 0;
      }
      const beam = this.beams[index],
        material = this.materials[index],
        head = this.heads[index],
        pole = this.poles[index];
      if (!beam || !material || !head || !pole) return;
      const density = material.uniforms.density,
        scale = material.uniforms.unitScale,
        time = material.uniforms.songTime;
      if (density) density.value = 0.12 * fade;
      if (scale) scale.value = unitScale;
      if (time) time.value = Number.isFinite(songTime) ? songTime : 0;
      this.direction.subVectors(spot.position, spot.target.position);
      const length = this.direction.length();
      beam.position.copy(spot.target.position).addScaledVector(this.direction, 0.5);
      beam.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
      beam.scale.set(length * Math.tan(spot.angle), length, length * Math.tan(spot.angle));
      head.position.copy(spot.position);
      head.quaternion.setFromUnitVectors(this.up, this.direction.negate());
      head.scale.setScalar(38 * unitScale);
      pole.position.set(spot.position.x, (floor + spot.position.y) / 2, spot.position.z);
      pole.scale.set(5 * unitScale, spot.position.y - floor, 5 * unitScale);
      this.feet[index]?.forEach((foot, leg) => {
        const angle = (leg * Math.PI * 2) / 3;
        foot.position.set(
          spot.position.x + Math.sin(angle) * 36 * unitScale,
          floor + 5 * unitScale,
          spot.position.z + Math.cos(angle) * 36 * unitScale
        );
        foot.rotation.y = angle;
        foot.scale.set(8 * unitScale, 8 * unitScale, 100 * unitScale);
      });
    });
  }
  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    for (const geometry of [
      this.geometry,
      this.headGeometry,
      this.poleGeometry,
      this.lensGeometry,
      this.footGeometry,
      this.poolGeometry
    ])
      geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const pool of this.pools) pool.material.dispose();
    this.bodyMaterial.dispose();
    this.lensMaterial.dispose();
    for (const spot of this.spots) spot.dispose();
    this.fill.dispose();
    for (const light of this.faceLights) light.dispose();
  }
}
