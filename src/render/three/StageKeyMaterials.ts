import { KeyboardAppearance } from "./KeyboardAppearance";
import { DirectionalLight, Group, HemisphereLight, MeshStandardMaterial } from "three";
import { IVORY, ivoryMaterial, velvetMaterial } from "./keyMaterials";

/** Materials share the baked keyboard picture; ownership and disposal stay together. */
export class StageKeyMaterials {
  readonly top = new MeshStandardMaterial({ color: IVORY, roughness: 0.4 });
  readonly white = ivoryMaterial();
  readonly black = velvetMaterial();
  readonly case = new MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.3 });
  readonly felt = new MeshStandardMaterial({ color: 0x951f2c, roughness: 0.95 });
  readonly lighting = new Group();
  readonly appearance: KeyboardAppearance;
  constructor(refresh: () => void) {
    this.top.vertexColors = this.black.vertexColors = true;
    const sun = new DirectionalLight(0xffffff, 0.45);
    sun.position.set(-150, 900, 900);
    const hemisphere = new HemisphereLight(0xffffff, 0x9a9fac, 0.25);
    this.appearance = new KeyboardAppearance({
      top: this.top,
      white: this.white,
      black: this.black,
      sun,
      hemisphere,
      refresh
    });
    this.lighting.add(hemisphere, sun);
  }
  dispose(): void {
    this.white.map?.dispose();
    this.black.bumpMap?.dispose();
    for (const material of [this.top, this.white, this.black, this.case, this.felt])
      material.dispose();
  }
}
