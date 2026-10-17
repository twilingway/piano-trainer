import type { Container } from "pixi.js";
import type { SongNote } from "../song/song";
import { noteColor } from "./computerKeys";
import type { FrameState } from "./frameState";
import type { KeyRect } from "./keyboardLayout";
import { EnergyAttacks, energySources } from "./noteEnergy";
import { PlasmaLayer } from "./PlasmaLayer";
import type { PlasmaAnchor } from "./PlasmaLayer";
import type { RoadLayer } from "./RoadLayer";
import type { Geometry } from "./viewGeometry";

/** Connects score energy to the two renderers; it never decides musical hits. */
export class NotePlasma {
  private readonly layer = new PlasmaLayer();
  private readonly attacks = new EnergyAttacks();
  private lastTime: number | undefined;
  private epoch: number | undefined;

  constructor() {
    this.layer.container.once("destroyed", () => {
      this.destroy();
    });
  }

  get container(): Container {
    return this.layer.container;
  }

  load(): Promise<void> {
    return this.layer.load();
  }

  draw(
    frame: FrameState,
    notes: readonly SongNote[],
    keys: ReadonlyMap<number, KeyRect>,
    geometry: Geometry,
    road: RoadLayer | undefined,
    visible: boolean,
    deltaSeconds: number
  ): void {
    const on = road !== undefined && visible;
    this.container.visible = on && !road.drawsNativeRoad;
    if (!on) {
      this.clear();
      road?.clearEnergy();
      return;
    }
    const delta = frame.playing === false ? 0 : Math.min(0.05, Math.max(0, deltaSeconds));
    const changed = this.epoch !== frame.effectEpoch;
    this.epoch = frame.effectEpoch;
    const jump =
      this.lastTime !== undefined &&
      (frame.time < this.lastTime || frame.time - this.lastTime > Math.max(0.5, deltaSeconds * 4));
    if (jump || changed) {
      road.clearEnergy();
      this.layer.clear();
      this.attacks.clear();
    }
    this.lastTime = frame.time;
    const sources = energySources(notes, frame, (note) => noteColor(note, undefined));
    road.setEnergy(sources, delta);
    if (road.drawsNativeRoad) {
      this.layer.clear();
      this.attacks.clear();
      return;
    }
    const anchors: PlasmaAnchor[] = [];
    for (const key of keys.values()) {
      const spot = road.notePlace(key.x + key.width / 2, geometry.hitY);
      if (!spot) continue;
      anchors.push({
        pitch: key.pitch,
        x: spot.x,
        y: spot.y,
        width: key.width * spot.scale,
        color: 0xc7edff,
        black: key.black
      });
    }
    // Do not consume an attack while paused; resume emits it once.
    const attacks = delta > 0 ? this.attacks.update(sources) : [];
    this.layer.draw(
      anchors,
      sources,
      attacks,
      Math.max(80, road.hitLineY),
      delta,
      road.drawsNativeRoad,
      road.keysOffsetX
    );
  }

  clear(road?: RoadLayer): void {
    road?.clearEnergy();
    this.layer.clear();
    this.attacks.clear();
    this.lastTime = undefined;
    this.epoch = undefined;
  }

  destroy(): void {
    this.layer.destroy();
  }
}
