import { ALL_FLAT_EFFECTS, type FlatEffectOptions } from "../flatEffectSettings";
import { performanceRingField } from "./performanceRingField";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { PerformanceNoteSpirals } from "./PerformanceNoteSpirals";
import type { PerformanceNoteSpiralEvent } from "./PerformanceNoteSpirals";
import { PerformanceCurtain } from "./PerformanceCurtain";
import { performanceOutroTimeline } from "./performanceOutroTimeline";
import { Box3, Group, PointLight, Vector3 } from "three";
import type { Camera, Object3D } from "three";
import type { EnergySource } from "../noteEnergy";
import { nativeKeyContactPoint } from "../nativeKeyContactAnchors";
import type { KeyBox } from "./keyBoxes";
import { posedSceneBounds } from "./posedSceneBounds";
import { PerformancePlatform } from "./PerformancePlatform";
import { PerformanceNeonSign } from "./PerformanceNeonSign";
import { bassFireStrength, performanceBassOnsets } from "./performanceBassFire";
import type { BassOnset } from "./performanceBassFire";
import {
  performanceSignPlacement,
  performanceStageLayout,
  stageNotePoint
} from "./performanceStageLayout";
import type { PerformanceSignPlacement, PerformanceStageLayout } from "./performanceStageLayout";
import { PerformanceFxState, performanceAtlasFrame } from "./performanceFxState";
import { performanceOpeningSeconds, performanceSceneTimeline } from "./performanceSceneTimeline";
import { WorldAtlasBatch } from "./WorldAtlasBatch";

const FLAME = {
  url: new URL("../../fx/plasma-flame.webp", import.meta.url).href,
  columns: 8,
  rows: 12,
  frames: 96,
  fps: 24,
  anchorY: 0.88
};
const MIST = {
  additive: false,
  url: new URL("../../fx/piano-mist.webp", import.meta.url).href,
  columns: 8,
  rows: 12,
  frames: 96,
  fps: 16,
  anchorY: 0.8125
};
const HIT = {
  url: new URL("../../fx/piano-hit.webp", import.meta.url).href,
  columns: 4,
  rows: 3,
  frames: 12,
  fps: 24,
  anchorY: 0.5 + 50 / 384
};
const GLITTER = {
  url: new URL("../../fx/piano-glitter.webp", import.meta.url).href,
  columns: 6,
  rows: 4,
  frames: 24,
  fps: 24,
  anchorY: 0.5 + 200 / 512
};
interface WorldKey {
  readonly pitch: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly black: boolean;
}
const RING_PUFFS = 32;
const RING_LIGHTS = 8;
/** Bonfires around the platform edge on a bass burst. */
const BASS_FIRES = 12;
const BASS_FIRE_COLOR = 0xff6a1a;
const BASS_FIRE_CORE = 0xffc04a;
interface BassNotes {
  readonly left: readonly { readonly start: number; readonly pitch: number }[];
}

/** Separate scene ownership keeps decorative particles out of camera collision bounds. */
export class PerformanceWorldStage {
  readonly group = new Group();
  private readonly curtain = new PerformanceCurtain();
  private duration = Infinity;
  private opening = performanceOpeningSeconds(Infinity);
  private fade = 1;
  private reveal = 1;
  private readonly platform = new PerformancePlatform();
  private readonly flame = new WorldAtlasBatch(FLAME, 512);
  private readonly ringFlame = new WorldAtlasBatch({ ...FLAME, additive: false }, 512);
  private readonly mist = new WorldAtlasBatch(MIST, 320);
  private readonly hit = new WorldAtlasBatch(HIT, 128);
  private readonly glitter = new WorldAtlasBatch(GLITTER, 512);
  private readonly state = new PerformanceFxState();
  private readonly spirals = new PerformanceNoteSpirals();
  private readonly lights = Array.from(
    { length: RING_LIGHTS },
    () => new PointLight(0xffffff, 0, 240, 2)
  );
  private readonly bounds = new Box3();
  private readonly logicalKeyBounds = new Box3();
  private readonly position = new Vector3();
  private readonly keys = new Map<number, WorldKey>();
  private boxes: readonly KeyBox[] | undefined;
  private children = -1;
  private scale = -1;
  private nearZ = -1;
  private lastOn = false;
  private pressesOn = true;
  private notesOn = true;
  private pressesSince = -Infinity;
  private notesSince = -Infinity;
  private layoutValue: PerformanceStageLayout | undefined;
  private sign: PerformanceNeonSign | undefined;
  private signPlacement: PerformanceSignPlacement | undefined;
  private bassNotes: BassNotes | undefined;
  private bassOnsets: readonly BassOnset[] = [];

  constructor(scene: Object3D) {
    this.group.add(
      this.platform.group,
      this.mist.group,
      this.flame.group,
      this.glitter.group,
      this.hit.group,
      this.ringFlame.group,
      this.spirals.group,
      ...this.lights,
      this.curtain.mesh
    );
    this.group.visible = false;
    scene.add(this.group);
  }
  setDuration(duration: number): void {
    this.duration = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    this.opening = performanceOpeningSeconds(this.duration);
  }
  /** A lesson's neon text behind the pianist; without text there is no sign object at all. */
  setSign(text: string | undefined): void {
    if (text === this.sign?.text) return;
    if (!text) {
      this.sign?.dispose();
      this.sign = undefined;
      return;
    }
    if (this.sign) this.sign.setText(text);
    else {
      this.sign = new PerformanceNeonSign(text);
      this.group.add(this.sign.mesh);
    }
    if (this.signPlacement) this.sign.layout(this.signPlacement);
  }
  /** The song's notes when its stage asks for bass fire; nothing burns without them. */
  setBassNotes(notes: BassNotes | undefined): void {
    if (notes === this.bassNotes) return;
    this.bassNotes = notes;
    this.bassOnsets = notes ? performanceBassOnsets(notes.left) : [];
  }
  get lightFade(): number {
    return this.fade;
  }
  get blackout(): number {
    return this.curtain.opacity;
  }
  get stage(): PerformanceStageLayout | undefined {
    return this.layoutValue;
  }
  /** Legacy can be replaced atomically only when every original atlas is available. */
  get ready(): boolean {
    return (
      this.layoutValue !== undefined &&
      this.flame.ready &&
      this.ringFlame.ready &&
      this.mist.ready &&
      this.hit.ready &&
      this.glitter.ready &&
      this.spirals.ready
    );
  }
  invalidate(): void {
    this.boxes = undefined;
    this.children = -1;
  }
  prepare(subject: Object3D, boxes: readonly KeyBox[], nearZ: number): void {
    if (
      this.boxes === boxes &&
      this.children === subject.children.length &&
      this.scale === subject.scale.x &&
      this.nearZ === nearZ
    )
      return;
    posedSceneBounds(subject, this.bounds);
    if (this.bounds.isEmpty()) {
      // Hidden keys still own the hit line; their existing layout is enough for effect anchors.
      for (const box of boxes) {
        this.logicalKeyBounds.min.set(box.x - box.width / 2, box.bottom, -box.back);
        this.logicalKeyBounds.max.set(box.x + box.width / 2, box.top, -box.front);
        this.bounds.union(this.logicalKeyBounds.applyMatrix4(subject.matrixWorld));
      }
      if (this.bounds.isEmpty()) return;
    }
    const unit = Math.max(0.001, subject.scale.x);
    const bounds = { min: this.bounds.min, max: this.bounds.max };
    this.layoutValue = performanceStageLayout(bounds, unit);
    this.signPlacement = performanceSignPlacement(bounds);
    this.sign?.layout(this.signPlacement);
    this.platform.layout(this.layoutValue);
    this.keys.clear();
    for (const box of boxes) {
      const { x, y, z } = nativeKeyContactPoint(box, nearZ);
      this.position.set(x, y, z).applyMatrix4(subject.matrixWorld);
      this.keys.set(box.pitch, {
        pitch: box.pitch,
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        width: box.width * unit,
        black: box.black
      });
    }
    this.boxes = boxes;
    this.children = subject.children.length;
    this.scale = subject.scale.x;
    this.nearZ = nearZ;
  }
  update(
    on: boolean,
    time: number,
    subject: Object3D,
    boxes: readonly KeyBox[],
    sources: readonly EnergySource[],
    camera: Camera,
    nearZ: number,
    emitEffects = true,
    visible?: Pick<ThreeRoadFrame, "notes" | "noteCount">,
    inspection = false,
    options: FlatEffectOptions = ALL_FLAT_EFFECTS
  ): void {
    if (!on) {
      this.group.visible = false;
      if (this.lastOn) this.clear();
      this.lastOn = false;
      return;
    }
    this.lastOn = true;
    if (options.presses && !this.pressesOn) this.pressesSince = time;
    if (options.musicalNotes && !this.notesOn) this.notesSince = time;
    this.pressesOn = options.presses;
    this.notesOn = options.musicalNotes;
    this.prepare(subject, boxes, nearZ);
    this.group.visible = true;
    this.platform.group.visible = this.layoutValue !== undefined;
    const outro = performanceOutroTimeline(time, this.duration);
    this.fade = inspection ? 1 : outro.light;
    this.reveal = inspection
      ? 1
      : performanceSceneTimeline(time, this.opening).spotFade * this.fade;
    this.curtain.set(inspection ? 0 : outro.blackout);
    const stage = this.layoutValue;
    if (!stage) return;
    const reveal = this.reveal;
    const burst = this.bassOnsets.length > 0 ? bassFireStrength(time, this.bassOnsets) * reveal : 0;
    this.sign?.update(time, camera, reveal, burst);
    const batches = [this.flame, this.mist, this.hit, this.glitter, this.ringFlame];
    for (const batch of batches) batch.begin(camera);
    for (const light of this.lights) light.intensity = 0;
    if (this.ready && emitEffects) {
      this.state.update(time, sources);
      if (options.burning) {
        this.drawMist(time, stage);
        this.drawHolds(time, sources, stage);
        this.drawRing(time, sources, stage, visible);
        this.drawBassFire(time, stage, burst);
      }
      if (options.presses) this.drawHits(time, stage);
      if (options.musicalNotes) this.drawSpirals(time, camera, stage);
      else this.spirals.clear();
    } else this.spirals.clear();
    for (const batch of batches) batch.end();
  }
  private drawMist(time: number, stage: PerformanceStageLayout): void {
    for (const key of this.keys.values()) {
      if (key.black) continue;
      for (let layer = 0; layer < 2; layer++) {
        const phase = key.pitch * 13 + layer * 31;
        this.mist.add(
          key.x + Math.sin(time * 0.6 + phase) * key.width * 0.4,
          key.y + (18 + layer * 28) * stage.unit,
          key.z - 5 * stage.unit,
          key.width * 4.5,
          key.width * 2.8,
          0x748a9e,
          0.11 * this.fade,
          performanceAtlasFrame(time, MIST.fps, MIST.frames, phase)
        );
      }
    }
    const reveal = this.reveal;
    for (let index = 0; index < RING_PUFFS; index++)
      for (let layer = 0; layer < 3; layer++) {
        const angle = (index / RING_PUFFS) * Math.PI * 2 + layer * 0.07;
        const drift = Math.sin(time * 0.21 + index * 1.7 + layer) * 0.035;
        const radius = stage.radius * (0.96 + layer * 0.06 + drift);
        this.mist.add(
          stage.centre.x + Math.sin(angle) * radius,
          stage.top + (28 + layer * 34 + Math.sin(time * 0.3 + index) * 18) * stage.unit,
          stage.centre.z - Math.cos(angle) * radius,
          stage.radius * 0.34,
          240 * stage.unit,
          0x657b8c,
          0.15 * reveal,
          performanceAtlasFrame(time, MIST.fps, MIST.frames, index * 11 + layer * 29)
        );
      }
  }
  private drawHolds(
    time: number,
    sources: readonly EnergySource[],
    stage: PerformanceStageLayout
  ): void {
    for (const source of sources) {
      if (!source.sounding) continue;
      const key = this.keys.get(source.pitch);
      const strength = Math.max(0, Math.min(1, source.strength));
      const frame = performanceAtlasFrame(time, FLAME.fps, FLAME.frames, source.pitch * 17);
      const glitterFrame =
        2 + performanceAtlasFrame(time, GLITTER.fps, GLITTER.frames - 2, source.pitch * 7);
      if (key) {
        this.flame.add(
          key.x,
          key.y + 18 * stage.unit,
          key.z,
          key.width * 4.2,
          key.width * 5.6,
          source.color,
          0.62 * strength * this.fade,
          frame
        );
        this.glitter.add(
          key.x,
          key.y + 55 * stage.unit,
          key.z,
          key.width * 4.8,
          key.width * 6.4,
          source.color,
          0.18 * strength * this.fade,
          glitterFrame
        );
      }
    }
  }
  private drawRing(
    time: number,
    sources: readonly EnergySource[],
    stage: PerformanceStageLayout,
    visible?: Pick<ThreeRoadFrame, "notes" | "noteCount">
  ): void {
    const colors = visible
      ? performanceRingField(visible.notes, visible.noteCount)
      : sources.filter((source) => source.sounding);
    const reveal = this.reveal;
    let lightIndex = 0;
    for (const source of colors) {
      const ring = stageNotePoint(source.pitch, stage);
      const strength = source.strength;
      const volume = 1 + Math.min(1.5, Math.log1p(strength) * 0.35);
      const intensity = 1 - Math.exp(-strength * 0.55);
      const frame = performanceAtlasFrame(time, FLAME.fps, FLAME.frames, source.pitch * 17);
      const glitterFrame =
        2 + performanceAtlasFrame(time, GLITTER.fps, GLITTER.frames - 2, source.pitch * 7);
      if (ring) {
        this.ringFlame.add(
          ring.x,
          ring.y + 20 * stage.unit,
          ring.z,
          135 * stage.unit * volume,
          310 * stage.unit * volume,
          source.color,
          0.78 * intensity * reveal,
          frame
        );
        this.glitter.add(
          ring.x,
          ring.y + 60 * stage.unit,
          ring.z,
          160 * stage.unit * volume,
          320 * stage.unit * volume,
          source.color,
          0.025 * intensity * reveal,
          glitterFrame
        );
        const light = this.lights[lightIndex++];
        if (light) {
          light.position.set(ring.x, stage.top + 70 * stage.unit, ring.z);
          light.color.setHex(source.color);
          light.distance = 540 * stage.unit;
          light.intensity = 35_000 * stage.unit ** 2 * intensity * reveal;
        }
      }
    }
  }
  private drawHits(time: number, stage: PerformanceStageLayout): void {
    const reveal = this.reveal;
    for (const hit of this.state.hits) {
      const age = time - hit.time;
      if (hit.time <= this.pressesSince || age < 0 || age >= HIT.frames / HIT.fps) continue;
      const frame = Math.floor(age * HIT.fps),
        key = this.keys.get(hit.pitch),
        ring = stageNotePoint(hit.pitch, stage);
      if (key)
        this.hit.add(
          key.x,
          key.y + 12 * stage.unit,
          key.z,
          key.width * 8.6,
          key.width * 8.6,
          hit.color,
          0.75 * hit.strength * this.fade,
          frame
        );
      if (ring)
        this.hit.add(
          ring.x,
          ring.y + 10 * stage.unit,
          ring.z,
          190 * stage.unit,
          190 * stage.unit,
          hit.color,
          0.65 * hit.strength * reveal,
          frame
        );
    }
  }
  /** A ring of bonfires flaring with the bass; spare ring lights throw its glow on the stage. */
  private drawBassFire(time: number, stage: PerformanceStageLayout, burst: number): void {
    if (burst <= 0) return;
    const unit = stage.unit,
      height = 0.5 + 0.7 * burst;
    for (let index = 0; index < BASS_FIRES; index++) {
      const angle = ((index + 0.5) / BASS_FIRES) * Math.PI * 2;
      const x = stage.centre.x + Math.sin(angle) * stage.radius * 1.02,
        z = stage.centre.z - Math.cos(angle) * stage.radius * 1.02;
      const frame = performanceAtlasFrame(time, FLAME.fps, FLAME.frames, index * 23);
      this.ringFlame.add(
        x,
        stage.top + 30 * unit,
        z,
        240 * unit * (0.7 + 0.5 * burst),
        620 * unit * height,
        BASS_FIRE_COLOR,
        0.9 * burst,
        frame
      );
      this.flame.add(
        x,
        stage.top + 40 * unit,
        z,
        300 * unit,
        700 * unit * height,
        BASS_FIRE_CORE,
        0.7 * burst,
        frame
      );
    }
    this.lights.forEach((light, index) => {
      if (light.intensity > 0) return;
      const angle = (index / RING_LIGHTS) * Math.PI * 2;
      light.position.set(
        stage.centre.x + Math.sin(angle) * stage.radius * 0.9,
        stage.top + 120 * unit,
        stage.centre.z - Math.cos(angle) * stage.radius * 0.9
      );
      light.color.setHex(BASS_FIRE_COLOR);
      light.distance = 900 * unit;
      light.intensity = 60_000 * unit ** 2 * burst;
    });
  }
  private drawSpirals(time: number, camera: Camera, stage: PerformanceStageLayout): void {
    const events: PerformanceNoteSpiralEvent[] = [];
    for (const hit of this.state.hits) {
      const age = time - hit.time;
      if (hit.time <= this.notesSince || age < 0 || age > 3.76) continue;
      const key = this.keys.get(hit.pitch);
      if (key)
        events.push({ ...hit, position: { x: key.x, y: key.y + 24 * stage.unit, z: key.z } });
    }
    this.spirals.update(time, events, camera, stage.unit);
  }
  clear(): void {
    this.state.clear();
    this.pressesSince = this.notesSince = -Infinity;
    this.spirals.clear();
    this.curtain.set(0);
    this.fade = 1;
    for (const light of this.lights) light.intensity = 0;
  }
  dispose(): void {
    this.clear();
    this.platform.dispose();
    this.setSign(undefined);
    this.spirals.dispose();
    this.curtain.dispose();
    for (const batch of [this.flame, this.mist, this.hit, this.glitter, this.ringFlame])
      batch.dispose();
    for (const light of this.lights) light.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
