import { dockedKeyOffset } from "./dockedRoadProjection";
import type { Camera, Group } from "three";
import { WorldAtlasBatch, type WorldAtlasDefinition } from "./WorldAtlasBatch";

type EffectKind = "flame" | "mist" | "hit" | "glitter";
type Batches = Readonly<Record<EffectKind, WorldAtlasBatch>>;

/** World and key particles need independent billboard bases and render ownership. */
export class DockedWorldEffects {
  private readonly extra: Batches;
  private active = false;
  constructor(
    group: Group,
    private readonly shared: Batches,
    definitions: Record<EffectKind, WorldAtlasDefinition>
  ) {
    this.extra = {
      flame: new WorldAtlasBatch(definitions.flame, 128),
      mist: new WorldAtlasBatch(definitions.mist, 128),
      hit: new WorldAtlasBatch(definitions.hit, 128),
      glitter: new WorldAtlasBatch(definitions.glitter, 512)
    };
    for (const batch of Object.values(this.extra)) {
      batch.group.userData.cameraCompositionRole = "world";
      group.add(batch.group);
    }
  }
  get ready(): boolean {
    return !this.active || Object.values(this.extra).every((batch) => batch.ready);
  }
  begin(world: Camera, keyboard: Camera | undefined): void {
    this.active = keyboard !== undefined;
    for (const batch of Object.values(this.shared))
      batch.group.userData.cameraCompositionRole = this.active ? "keyboard" : "world";
    for (const batch of Object.values(this.extra)) batch.begin(world);
  }
  keyLift(pitch: number, unit: number): number {
    return this.active ? dockedKeyOffset(pitch) * unit : 0;
  }
  world(kind: EffectKind): WorldAtlasBatch {
    return this.active ? this.extra[kind] : this.shared[kind];
  }
  end(): void {
    for (const batch of Object.values(this.extra)) batch.end();
  }
  dispose(): void {
    for (const batch of Object.values(this.extra)) batch.dispose();
  }
}
