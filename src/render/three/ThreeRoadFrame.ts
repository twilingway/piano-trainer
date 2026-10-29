import type { FreeRoadLayout, FreeRoadLane } from "../freeRoadLayout";
import type { Arrival } from "../roadTypes";
import type { FallingNoteStyle } from "../fallingNoteStyle";
import type { NoteLaneProjection } from "../noteLaneProjection";
import type { WorldCamera } from "../worldCamera";
import { worldRoadNote } from "./roadNoteGeometry";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { ROAD_TRAIL_ANCHOR_CAPACITY } from "./roadTrailGeometry";

/** A note born at the free field's far end: its lane's far point, colour and burst phase. */
export interface FreeRoadBurst {
  x: number;
  y: number;
  z: number;
  color: number;
  age: number;
}

/** Reusable visual snapshot; all positions come from the existing score-time layout. */
export class ThreeRoadFrame {
  legacyLabels: readonly { renderable: boolean }[] = [];
  readonly notes: WorldRoadNote[] = [];
  readonly beats: number[] = [];
  readonly trailAnchors: WorldRoadNote[] = [];
  readonly bursts: FreeRoadBurst[] = [];
  guides = false;
  direct = false;
  freeLayout: FreeRoadLayout | undefined;
  freeLanes: readonly FreeRoadLane[] = [];
  /** Free-field lanes by key centre, the scene's x of a note and its arrival. */
  freeContacts: ReadonlyMap<number, NoteLaneProjection> = new Map();
  flatMaterial = false;
  /** Lane rows per pixel of a flat note's picture, so its edges keep 2D proportions on screen. */
  flatPictureRows = 1;
  noteStyle: FallingNoteStyle = "filled";
  /** Flat-view preference; full 3D keeps the accepted decoration enabled. */
  burning = true;
  noteCount = 0;
  beatCount = 0;
  trailAnchorCount = 0;
  burstCount = 0;
  songTime = 0;
  visualTime = 0;
  /** Seconds the notes take across the whole road; 0 before the first frame. */
  lookAhead = 0;

  begin(): void {
    this.noteCount = 0;
    this.beatCount = 0;
    this.trailAnchorCount = 0;
    this.burstCount = 0;
  }

  /** Arrivals on a free-field lane burst at its far end; the free camera alone shows them. */
  withBursts(arrivals: readonly Arrival[]): this {
    for (const arrival of arrivals) {
      const far = this.freeContacts.get(arrival.x)?.freeFar;
      if (!far) continue;
      const burst = this.bursts[this.burstCount] ?? { x: 0, y: 0, z: 0, color: 0, age: 0 };
      burst.x = far.x;
      burst.y = far.y;
      burst.z = far.z;
      burst.color = arrival.color;
      burst.age = arrival.age;
      this.bursts[this.burstCount++] = burst;
    }
    return this;
  }

  addTrailAnchor(
    keyX: number,
    width: number,
    color: number,
    alpha: number,
    camera: WorldCamera,
    lane?: NoteLaneProjection
  ): void {
    const x = camera.sourceX(keyX) + (lane?.worldOffsetX ?? 0);
    if (
      this.trailAnchorCount >= ROAD_TRAIL_ANCHOR_CAPACITY ||
      !Number.isFinite(x) ||
      !Number.isFinite(camera.near.z) ||
      !Number.isFinite(width) ||
      !Number.isFinite(color) ||
      !Number.isFinite(alpha) ||
      width <= 0 ||
      alpha <= 0
    )
      return;
    const anchor = this.trailAnchors[this.trailAnchorCount] ?? {
      x: 0,
      top: 0,
      bottom: 0,
      width: 0,
      color: 0,
      alpha: 0
    };
    anchor.x = x;
    anchor.top = anchor.bottom = lane?.depth ?? camera.near.z;
    anchor.width = width * (camera.params.sourceUnits ?? 0.5);
    anchor.color = color;
    anchor.alpha = alpha;
    anchor.lane = lane;
    this.trailAnchors[this.trailAnchorCount++] = anchor;
  }

  add(
    keyX: number,
    top: number,
    bottom: number,
    width: number,
    color: number,
    alpha: number,
    hitY: number,
    camera: WorldCamera,
    duration = 0,
    id = "",
    tailOffset = 0,
    lane?: NoteLaneProjection,
    pitch?: number,
    finger?: number,
    label?: string
  ): void {
    const note = worldRoadNote(
      keyX,
      top,
      bottom,
      width,
      color,
      alpha,
      hitY,
      camera,
      this.notes[this.noteCount],
      lane
    );
    if (!note) return;
    note.materialUnitX = camera.params.sourceUnits ?? 0.5;
    const span = camera.roadFarZ - (lane?.depth ?? camera.near.z);
    note.materialUnitZ = (span / hitY) * this.flatPictureRows;
    // A free lane stretches the road's depth onto its own route: a picture pixel along it then
    // spans as much of the world as one across, the flat note turned into the field.
    const far = lane?.freeFar;
    const route = far && Math.hypot(far.x - note.x, far.y - lane.y, far.z + (lane.depth ?? 0));
    note.freeMaterialUnitZ =
      route && route > 0 && span > 0 ? (note.materialUnitX * span) / route : undefined;
    note.duration = duration;
    note.pitch = pitch;
    note.finger = finger;
    note.label = label;
    note.lane = lane;
    note.textureOffset = (tailOffset * (camera.roadFarZ - (lane?.depth ?? camera.near.z))) / hitY;
    let hash = 2166136261;
    for (let index = 0; index < id.length; index++)
      hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    note.seed =
      id.length > 0
        ? (hash >>> 0) / 4294967295
        : Math.abs(Math.sin(keyX * 12.9898 + duration * 78.233));
    this.notes[this.noteCount++] = note;
  }

  beat(y: number, hitY: number, camera: WorldCamera): void {
    if (!Number.isFinite(y) || hitY <= 0 || y < 0 || y > hitY) return;
    this.beats[this.beatCount++] =
      camera.near.z + (1 - y / hitY) * (camera.roadFarZ - camera.near.z);
  }

  clear(): void {
    this.begin();
    this.visualTime = 0;
  }
}
