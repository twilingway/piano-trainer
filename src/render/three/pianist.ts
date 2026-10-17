import { AnimationMixer, Group, LinearSRGBColorSpace, Mesh } from "three";
import type { AnimationClip, Material, Object3D, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { whitePosition } from "./handSolver/mech";
import { keyBoxes } from "./keyBoxes";
import { pianistModelUrl } from "./pianistModel";

/** The lab's saved trial: eight seconds of the two index fingers, not a way to play a song. */
export const PIANIST_TRIAL_CLIP = "IndexFingerTest_8s";
/** A white key of the lab's keyboard across, metres. */
const LAB_WHITE_M = 0.0235;

/**
 * The parts of the character's forearms and hands: the app's live hands play in their place for
 * now. They stay in the model, rig and weights whole, only hidden.
 */
export function isHiddenArmPart(name: string): boolean {
  return /_ArmCut_[LR]$/.test(name) || /^White_(Closed_Glove|Cuff)_[LR]$/.test(name);
}

export interface PianistModel {
  readonly scene: Object3D;
  readonly clip: AnimationClip | undefined;
}

/** The local pianist, or undefined when the model is not there. */
export async function loadPianist(): Promise<PianistModel | undefined> {
  const url = await pianistModelUrl();
  if (!url) return undefined;
  const model = await new GLTFLoader().loadAsync(url);
  const done = new Set<Material>();
  model.scene.traverse((node) => {
    if (isHiddenArmPart(node.name)) node.visible = false;
    if (!(node instanceof Mesh)) return;
    // Its bounds are those of the rest pose: never cull the seated pianist.
    node.frustumCulled = false;
    const materials = (
      Array.isArray(node.material) ? node.material : [node.material]
    ) as Material[];
    for (const material of materials) {
      if (done.has(material)) continue;
      done.add(material);
      toDisplayValues(material);
    }
  });
  const clip = model.animations.find((c) => c.name === PIANIST_TRIAL_CLIP) ?? model.animations[0];
  return { scene: model.scene, clip };
}

/**
 * The stage works in display values (colour management off): glTF's linear colour factors become
 * sRGB, and the textures are read as they are stored, like the live hands' skin.
 */
function toDisplayValues(material: Material): void {
  const fields = material as unknown as Record<string, unknown>;
  for (const key of ["color", "emissive", "sheenColor", "specularColor"]) {
    const colour = fields[key] as { convertLinearToSRGB?: () => void } | undefined;
    colour?.convertLinearToSRGB?.();
  }
  for (const key of ["map", "emissiveMap", "sheenColorMap", "specularColorMap"]) {
    const texture = fields[key] as Texture | null | undefined;
    if (texture) texture.colorSpace = LinearSRGBColorSpace;
  }
  material.needsUpdate = true;
}

/**
 * The pianist seated behind the 3D keys, still: the first frame of the lab's clip. Nothing moves
 * it, so it has no clock of its own; the live hands play the song in front of it.
 */
export class Pianist {
  /** The model's frame: metres in glTF axes, C4's centre at the white keys' front top edge. */
  readonly space = new Group();
  private laidOut = -1;

  constructor(readonly model: PianistModel) {
    this.space.add(model.scene);
    if (model.clip) {
      const mixer = new AnimationMixer(model.scene);
      mixer.clipAction(model.clip).play();
      mixer.setTime(0);
    }
  }

  /** `white` is any white key: its pitch, centre and width in the keys' group. */
  layout(white: { readonly pitch: number; readonly x: number; readonly width: number }): void {
    const c4 = white.x - whitePosition(white.pitch) * white.width;
    this.space.scale.setScalar(white.width / LAB_WHITE_M);
    // The white keys' top sits at 22 in the keys' group, their front edge at 0.
    this.space.position.set(c4, 22, 0);
  }

  /** Lays the pianist out on the keys whenever they change. */
  follow(keys: KeysScene): void {
    if (keys.version === this.laidOut) return;
    this.laidOut = keys.version;
    const white = keyBoxes(keys).find((box) => !box.black);
    if (white) this.layout(white);
  }
}
