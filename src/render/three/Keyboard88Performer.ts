import { Bone, Group, LinearSRGBColorSpace, Mesh } from "three";
import type { Material, Texture } from "three";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { KEYBOARD_C4, KEYBOARD_METRES, metricC4X } from "../keyboardMetrics";
import { createKeyboard88Plan } from "./keyboard88Plan";
import { indexKeyboard88Atlas } from "./keyboard88Atlas";
import type { Keyboard88Plan } from "./keyboard88Plan";
import { createKeyboard88Sample, sampleKeyboard88Plan } from "./keyboard88Sample";
import { Keyboard88Mirror } from "./keyboard88Mirror";
import type { HandsSource } from "./liveHands";
import type { Keyboard88PerformerAsset } from "./keyboard88Loader";
import { bindKeyboard88Visibility } from "./keyboard88Visibility";
import { bindKeyboard88RoadBody } from "./keyboard88RoadBody";

/** The public performer only draws a numerical song-time pose; it never drives the song or keys. */
export class Keyboard88Performer {
  readonly space = new Group();
  private notes: HandsSource["notes"] | undefined;
  private plan: Keyboard88Plan | undefined;
  private sample;
  private readonly composeOptions;
  private readonly index;
  private readonly mirror;
  private readonly rotations;
  private readonly bones: Bone[];
  private readonly visibility;
  private readonly roadBody;
  private disposed = false;
  private layoutVersion = -1;
  private readonly visibleParts = { body: false, hands: false };

  constructor(readonly asset: Keyboard88PerformerAsset) {
    this.space.add(asset.scene);
    this.sample = createKeyboard88Sample(asset.atlas);
    this.composeOptions = { rightPins: this.sample.right, leftPins: this.sample.left };
    this.index = indexKeyboard88Atlas(asset.atlas);
    this.mirror = new Keyboard88Mirror(asset.rig, asset.atlas);
    this.rotations = new Float32Array(asset.atlas.boneNames.length * 4);
    const found = new Map<string, Bone>();
    const materials = new Set<Material>();
    const maps = new Set<Texture>();
    asset.scene.traverse((node) => {
      if (node instanceof Bone) found.set(node.name, node as Bone);
      if (!(node instanceof Mesh)) return;
      node.frustumCulled = false;
      for (const material of (Array.isArray(node.material)
        ? node.material
        : [node.material]) as Material[]) {
        if (materials.has(material)) continue;
        materials.add(material);
        const finish = material as Material & {
          color?: { convertLinearToSRGB(): void };
          map?: Texture;
        };
        finish.color?.convertLinearToSRGB();
        if (finish.map && !maps.has(finish.map)) {
          maps.add(finish.map);
          finish.map.colorSpace = LinearSRGBColorSpace;
        }
      }
    });
    this.bones = asset.atlas.boneNames.map((name) => {
      const bone = found.get(name);
      if (!bone) throw new Error(`Missing keyboard88 bone ${name}`);
      return bone;
    });
    this.visibility = bindKeyboard88Visibility(asset.scene, asset.manifest.masks);
    this.roadBody = bindKeyboard88RoadBody(asset.scene);
  }

  setSeparateCameras(separate: boolean): void {
    this.roadBody.setSeparateCameras(separate);
  }

  setVisibility(body: boolean, hands: boolean): void {
    this.visibleParts.body = body;
    this.visibleParts.hands = hands;
    this.visibility.setVisibility(this.visibleParts);
    this.space.visible = body || hands;
  }

  follow(keys: KeysScene): void {
    if (keys.version === this.layoutVersion) return;
    this.layoutVersion = keys.version;
    const c4 = metricC4X(
      keys.faces.map(({ key }) => key),
      keys.camera.sourceX
    );
    this.space.scale.setScalar(KEYBOARD_METRES);
    this.space.position.set(
      c4 - KEYBOARD_C4.x * KEYBOARD_METRES,
      22 - KEYBOARD_C4.y * KEYBOARD_METRES,
      -KEYBOARD_C4.z * KEYBOARD_METRES
    );
  }

  setSong(notes: HandsSource["notes"] | undefined): void {
    if (this.disposed || (this.notes === notes && this.plan)) return;
    this.notes = notes;
    const convert = (hand: "left" | "right") =>
      (notes?.[hand] ?? []).map((note, id) => ({
        id,
        midi: note.pitch,
        finger: note.finger,
        start: note.start,
        duration: note.duration
      }));
    this.plan = createKeyboard88Plan(
      this.asset.atlas,
      {
        left: convert("left"),
        right: convert("right")
      },
      this.index
    );
    this.sample = createKeyboard88Sample(this.asset.atlas, this.plan);
    this.composeOptions.rightPins = this.sample.right;
    this.composeOptions.leftPins = this.sample.left;
  }

  pose(source: HandsSource | undefined): void {
    if (this.disposed || !this.plan) return;
    sampleKeyboard88Plan(this.asset.atlas, this.plan, source?.time ?? 0, this.sample);
    this.mirror.compose(
      this.sample.right.rotations,
      this.sample.left.rotations,
      this.rotations,
      this.composeOptions
    );
    for (let i = 0; i < this.bones.length; i++)
      this.bones[i]?.quaternion.fromArray(this.rotations, i * 4);
    this.asset.scene.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visibility.dispose();
    this.roadBody.dispose();
    this.space.removeFromParent();
    this.asset.dispose();
  }
}
