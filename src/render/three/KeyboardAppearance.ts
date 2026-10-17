import {
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3
} from "three";
import type {
  DirectionalLight,
  HemisphereLight,
  MeshPhysicalMaterial,
  MeshStandardMaterial
} from "three";
import type { KeyBox } from "./keyBoxes";
import { studyIvoryMap } from "./keyMaterials";

export const KEY_CONTACT_LIMIT = 36;
interface AppearanceTargets {
  readonly top: MeshStandardMaterial;
  readonly white: MeshPhysicalMaterial;
  readonly black: MeshPhysicalMaterial;
  readonly sun: DirectionalLight;
  readonly hemisphere: HemisphereLight;
  readonly refresh: () => void;
}

/** A baked soft box, under the raised key; its visible fringe supplies inexpensive contact AO. */
function contactMap(): DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs((x + 0.5) / size - 0.5);
      const v = Math.abs((y + 0.5) / size - 0.5);
      const dx = Math.max(0, u - 0.25) / 0.25;
      const dy = Math.max(0, v - 0.39) / 0.11;
      const alpha = Math.round(255 * Math.exp(-4 * (dx * dx + dy * dy)));
      data.set([alpha, alpha, alpha, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Static piano appearance, independent of cameras, note materials and all animation clocks. */
export class KeyboardAppearance {
  readonly group = new Group();
  private readonly grain = studyIvoryMap();
  private readonly contactTexture = contactMap();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material = new MeshBasicMaterial({
    color: 0x10151b,
    alphaMap: this.contactTexture,
    transparent: true,
    opacity: 0.26,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide
  });
  private readonly contacts = new InstancedMesh(this.geometry, this.material, KEY_CONTACT_LIMIT);
  private readonly matrix = new Matrix4();
  private readonly size = new Vector3();
  private readonly original;
  private dim: boolean | undefined;
  private disposed = false;

  constructor(private readonly targets: AppearanceTargets) {
    const { top, white, black, sun, hemisphere } = targets;
    this.original = {
      topColor: top.color.clone(),
      topRoughness: top.roughness,
      whiteMap: white.map,
      whiteRoughness: white.roughness,
      clearcoat: white.clearcoat,
      blackColor: black.color.clone(),
      blackRoughness: black.roughness,
      blackSpecular: black.specularIntensity,
      blackSheen: black.sheen,
      blackBumpScale: black.bumpScale,
      blackSheenColor: black.sheenColor.clone(),
      sunIntensity: sun.intensity,
      sunPosition: sun.position.clone(),
      hemisphereIntensity: hemisphere.intensity,
      groundColor: hemisphere.groundColor.clone()
    };
    this.contacts.count = 0;
    this.contacts.frustumCulled = false;
    this.contacts.renderOrder = 1;
    this.group.add(this.contacts);
    this.setDim(false);
  }

  setDim(dim: boolean): void {
    if (this.disposed || this.dim === dim) return;
    this.dim = dim;
    const { top, white, black, sun, hemisphere } = this.targets;
    const old = this.original;
    top.color.copy(old.topColor);
    if (!dim) top.color.setRGB(1, 1.016, 1.065);
    top.roughness = dim ? old.topRoughness : 0.34;
    white.map = dim ? old.whiteMap : this.grain;
    white.roughness = dim ? old.whiteRoughness : 0.44;
    white.clearcoat = dim ? old.clearcoat : 0.12;
    black.color.copy(old.blackColor);
    if (!dim) black.color.setHex(0x25282b);
    black.roughness = dim ? old.blackRoughness : 0.48;
    black.specularIntensity = dim ? old.blackSpecular : 0.4;
    black.sheen = dim ? old.blackSheen : 0.4;
    black.bumpScale = dim ? old.blackBumpScale : 0.04;
    black.sheenColor.copy(old.blackSheenColor);
    if (!dim) black.sheenColor.setHex(0xb4b8bc);
    sun.intensity = dim ? old.sunIntensity : 1.85;
    sun.position.copy(old.sunPosition);
    if (!dim) sun.position.set(-500, 900, 400);
    hemisphere.intensity = dim ? old.hemisphereIntensity : 1;
    hemisphere.groundColor.copy(old.groundColor);
    if (!dim) hemisphere.groundColor.setHex(0xa6abb0);
    this.group.visible = !dim;
    this.targets.refresh();
  }

  /** Reuse one fixed instance buffer for at most the black keys of an 88-key piano. */
  layout(boxes: readonly KeyBox[]): void {
    if (this.disposed) return;
    let count = 0;
    for (const box of boxes) {
      if (count >= KEY_CONTACT_LIMIT) break;
      if (!box.black || !Number.isFinite(box.x) || !Number.isFinite(box.width) || box.width <= 0)
        continue;
      const depth = box.back - box.front;
      if (!Number.isFinite(depth) || depth <= 0 || !Number.isFinite(box.bottom)) continue;
      // The left light casts a soft fringe to the right; the key hides the centre of its own AO.
      this.matrix.makeRotationX(-Math.PI / 2);
      this.matrix.scale(this.size.set(box.width * 2.1, depth + 4, 1));
      this.matrix.setPosition(
        box.x + box.width * 0.25,
        box.bottom + 0.06,
        -(box.back + box.front - 4) / 2
      );
      this.contacts.setMatrixAt(count++, this.matrix);
    }
    this.contacts.count = count;
    this.contacts.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    // Restore shared template maps before their owner frees them; the neutral grain belongs here.
    this.setDim(true);
    this.disposed = true;
    this.contacts.count = 0;
    this.group.removeFromParent();
    this.group.clear();
    this.contacts.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.contactTexture.dispose();
    this.grain.dispose();
  }
}
