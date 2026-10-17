import { AnimationMixer, Group, LinearSRGBColorSpace, Mesh, Vector3 } from "three";
import type { AnimationClip, Camera, Material, Object3D, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { whitePosition } from "./handSolver/mech";
import { keyBoxes } from "./keyBoxes";
import { pianistModelUrl } from "./pianistModel";
import { createPianistBench } from "./pianistBench";
import type { PianistBench } from "./pianistBench";
import { PianistRig } from "./pianistRig";
import { PianistFace } from "./PianistFace";
import { disposePianistModel } from "./disposePianistModel";
import { PianistAppearance } from "./pianistAppearance";
import { KIT_DEPTH } from "./pianoKit";
import type { SourcePerformanceIdentity } from "../../song/sourcePerformance";
import type { HandsSource } from "./liveHands";
import { NativePianistClip } from "./nativePianistClip";
import type { NativePerformance } from "./nativePianistClip";
import { loadNativePianist } from "./nativePianistModel";
import { CameraPerformerGaze } from "./CameraPerformerGaze";
import { NativePerformerMotion } from "./NativePerformerMotion";

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
  readonly performance?: NativePerformance;
}

/** The local pianist, or undefined when the model is not there. */
export async function loadPianist(
  source?: SourcePerformanceIdentity
): Promise<PianistModel | undefined> {
  try {
    const native = await loadNativePianist(source);
    if (native) {
      prepareModel(native.scene, false);
      return native;
    }
  } catch (error) {
    console.warn("Native pianist unavailable, using the local trial model", error);
  }
  const url = await pianistModelUrl();
  if (!url) return undefined;
  const model = await new GLTFLoader().loadAsync(url);
  prepareModel(model.scene, true);
  const clip = model.animations.find((c) => c.name === PIANIST_TRIAL_CLIP) ?? model.animations[0];
  return { scene: model.scene, clip };
}

function prepareModel(scene: Object3D, hideArms: boolean): void {
  const done = new Set<Material>();
  scene.traverse((node) => {
    if (hideArms && isHiddenArmPart(node.name)) node.visible = false;
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
 * The pianist starts in the lab clip's seated frame. A compatible rig then follows the shared
 * hand plan; there is no animation clock of its own.
 */
export class Pianist {
  /** The model's frame: metres in glTF axes, C4's centre at the white keys' front top edge. */
  readonly space = new Group();
  private laidOut = -1;
  readonly rig: PianistRig | undefined;
  readonly bench: PianistBench | undefined;
  private readonly appearance: PianistAppearance | undefined;
  private readonly nativeClip: NativePianistClip | undefined;
  private readonly motion: NativePerformerMotion | undefined;
  private readonly gaze: CameraPerformerGaze | undefined;
  private readonly cameraWorld = new Vector3();
  private readonly face: PianistFace | undefined;
  private disposed = false;

  constructor(
    readonly model: PianistModel,
    source?: SourcePerformanceIdentity
  ) {
    this.space.add(model.scene);
    if (model.performance && model.clip) {
      this.nativeClip = new NativePianistClip(model.scene, model.clip, model.performance);
      this.nativeClip.sample(0, source);
      this.face = PianistFace.create(model.scene);
      this.gaze = new CameraPerformerGaze(model.scene);
      this.motion = new NativePerformerMotion(model.scene);
      return;
    }
    this.rig = PianistRig.create(model.scene);
    if (model.clip) {
      const mixer = new AnimationMixer(model.scene);
      mixer.clipAction(model.clip).play();
      mixer.setTime(0);
    }
    this.rig?.seat();
    this.face = PianistFace.create(model.scene);
    this.rig?.setFace(this.face);
    this.gaze = new CameraPerformerGaze(model.scene);
    this.appearance = new PianistAppearance(model.scene);
    this.bench = createPianistBench(model.scene, this.space);
    if (this.bench) this.space.add(this.bench.group);
  }

  get native(): boolean {
    return this.nativeClip !== undefined;
  }

  /** The camera is already configured; restore additive gaze before sampling original bone curves. */
  sample(source: HandsSource | undefined, camera: Camera): void {
    if (this.disposed || !this.nativeClip) return;
    this.gaze?.prepare();
    this.motion?.prepare();
    const valid = this.nativeClip.sample(source?.time ?? 0, source?.performance);
    this.space.visible = valid;
    if (!valid) return;
    this.motion?.apply(source?.time ?? 0, source?.beats ?? []);
    this.face?.update(source?.time ?? 0);
    camera.getWorldPosition(this.cameraWorld);
    this.gaze?.apply(this.cameraWorld, source?.time ?? 0);
  }

  /** Add camera attention after the existing fallback rig has written its fresh musical pose. */
  poseFallback(
    poses: Parameters<PianistRig["pose"]>[0],
    source: HandsSource | undefined,
    camera: Camera
  ): void {
    if (this.disposed || this.nativeClip || !this.rig) return;
    this.gaze?.prepare();
    this.rig.pose(poses, source);
    camera.getWorldPosition(this.cameraWorld);
    this.gaze?.apply(this.cameraWorld, source?.time ?? 0);
  }

  /** `white` is any white key: its pitch, centre and width in the keys' group. */
  layout(white: { readonly pitch: number; readonly x: number; readonly width: number }): void {
    const c4 = white.x - whitePosition(white.pitch) * white.width;
    this.space.scale.set(white.width / LAB_WHITE_M, 1000, KIT_DEPTH);
    // The white keys' top sits at 22 in the keys' group, their front edge at 0.
    this.space.position.set(c4, 22, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bench?.dispose();
    this.face?.dispose();
    this.gaze?.dispose();
    this.motion?.dispose();
    this.nativeClip?.dispose();
    this.appearance?.dispose();
    disposePianistModel(this.model.scene);
  }

  /** Lays the pianist out on the keys whenever they change. */
  follow(keys: KeysScene): void {
    if (keys.version === this.laidOut) return;
    this.laidOut = keys.version;
    const white = keyBoxes(keys).find((box) => !box.black);
    if (white) this.layout(white);
  }
}
