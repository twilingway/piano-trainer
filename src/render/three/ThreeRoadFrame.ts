import type { FreeRoadLayout, FreeRoadLane } from "../freeRoadLayout";
import type { FallingNoteStyle } from "../fallingNoteStyle";
import type { NoteLaneProjection } from "../noteLaneProjection";
import type { WorldCamera } from "../worldCamera";
import { worldRoadNote } from "./roadNoteGeometry";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { ROAD_TRAIL_ANCHOR_CAPACITY } from "./roadTrailGeometry";

/** Reusable visual snapshot; all positions come from the existing score-time layout. */
export class ThreeRoadFrame {
  legacyLabels: readonly { renderable: boolean }[] = [];
  readonly notes: WorldRoadNote[] = [];
  readonly beats: number[] = [];
  readonly trailAnchors: WorldRoadNote[] = [];
  guides = false;
  direct = false;
  freeLayout: FreeRoadLayout | undefined;
  freeLanes: readonly FreeRoadLane[] = [];
  flatMaterial = false;
  noteStyle: FallingNoteStyle = "filled";
  /** Flat-view preference; full 3D keeps the accepted decoration enabled. */
  burning = true;
  noteCount = 0;
  beatCount = 0;
  trailAnchorCount = 0;
  songTime = 0;
  visualTime = 0;
  /** Seconds the notes take across the whole road; 0 before the first frame. */
  lookAhead = 0;

  begin(): void {
    this.noteCount = 0;
    this.beatCount = 0;
    this.trailAnchorCount = 0;
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
    note.materialUnitZ = (camera.roadFarZ - (lane?.depth ?? camera.near.z)) / hitY;
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
