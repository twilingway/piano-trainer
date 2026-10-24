import { Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from "three";
import type { ProjectionLayout } from "../stylizedProjection";

/** The exact circle used by lane sources also separates sky from clouds. */
export class ProjectionBackground {
  private readonly uniforms = {
    screen: { value: new Vector2(1, 1) },
    radius: { value: 1 },
    horizon: { value: 0.17 },
    direction: { value: 1 },
    clock: { value: 0 }
  };
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: this.uniforms,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform vec2 screen; uniform float radius;
      uniform float horizon; uniform float direction; uniform float clock;
      float cloud(vec2 p){return sin(p.x*19.+sin(p.y*8.))*sin(p.y*17.+p.x*5.);}
      void main(){
        float dx=(vUv.x-.5)*screen.x;
        float root=sqrt(max(0.,radius*radius-dx*dx));
        float sag=dx*dx/max(.001,radius+root);
        float line=horizon+direction*sag/screen.y;
        float y=1.-vUv.y;
        float d=y-line;
        vec3 sky=mix(vec3(.025,.035,.16),vec3(.9,.17,.18), exp(-abs(d)*8.));
        vec3 sea=mix(vec3(.005,.018,.045),vec3(.25,.04,.19),exp(-abs(d)*6.));
        vec3 c=mix(sky,sea,smoothstep(-.003,.003,d));
        c+=vec3(1.,.44,.1)*exp(-abs(d)*160.)*.7;
        float sun=exp(-length(vec2((vUv.x-.5)*screen.x/screen.y,(y-horizon)*1.2))*100.);
        c+=vec3(1.,.67,.25)*sun;
        float mist=cloud(vec2(vUv.x*3.+clock*.002,d*3.));
        c+=vec3(.13,.035,.13)*mist*mist*smoothstep(.015,.12,d)*exp(-d*3.);
        gl_FragColor=vec4(c,1.);
      }`
  });
  readonly mesh = new Mesh(this.geometry, this.material);
  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }
  update(layout: ProjectionLayout, clock: number): void {
    this.uniforms.screen.value.set(layout.width, layout.height);
    this.uniforms.radius.value = layout.effectiveRadius;
    this.uniforms.horizon.value = layout.parameters.horizonY;
    this.uniforms.direction.value = layout.parameters.horizonArcDirection === "up" ? 1 : -1;
    this.uniforms.clock.value = clock;
    this.mesh.visible = !layout.parameters.geometryOnly;
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
