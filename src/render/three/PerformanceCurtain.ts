import { Mesh, NormalBlending, PlaneGeometry, ShaderMaterial } from "three";
/** The last transparent scene draw covers shared-canvas legacy FX while leaving the flat HUD intact. */
export class PerformanceCurtain {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly material = new ShaderMaterial({
    uniforms: { fade: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: NormalBlending,
    vertexShader: "void main(){gl_Position=vec4(position.xy,0.0,1.0);}",
    fragmentShader: "uniform float fade;void main(){gl_FragColor=vec4(0.0,0.0,0.0,fade);}"
  });
  private readonly geometry = new PlaneGeometry(2, 2);
  private value = 0;
  constructor() {
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10000;
    this.mesh.visible = false;
  }
  get opacity(): number {
    return this.value;
  }
  set(opacity: number): void {
    this.value = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0;
    const fade = this.material.uniforms.fade;
    if (fade) fade.value = this.value;
    this.mesh.visible = this.value > 0;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
