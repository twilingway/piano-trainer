import type { WorldCamera } from "../worldCamera";
import { worldRoadNote } from "./roadNoteGeometry";
import type { WorldRoadNote } from "./roadNoteGeometry";
import { ROAD_TRAIL_ANCHOR_CAPACITY } from "./roadTrailGeometry";

/** Reusable visual snapshot; all positions come from the existing score-time layout. */
export class ThreeRoadFrame {
  readonly notes: WorldRoadNote[] = [];
  readonly beats: number[] = [];
  readonly trailAnchors: WorldRoadNote[] = [];
  guides = false;
  noteCount = 0;
  beatCount = 0;
  trailAnchorCount = 0;
  visualTime = 0;

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
    camera: WorldCamera
  ): void {
    const x = camera.sourceX(keyX);
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
    anchor.top = anchor.bottom = camera.near.z;
    anchor.width = width / 2;
    anchor.color = color;
    anchor.alpha = alpha;
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
    tailOffset = 0
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
      this.notes[this.noteCount]
    );
    if (!note) return;
    note.duration = duration;
    note.textureOffset = (tailOffset * (camera.roadFarZ - camera.near.z)) / hitY;
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

  replay(
    hitY: number,
    camera: WorldCamera,
    draw: (
      x: number,
      top: number,
      bottom: number,
      width: number,
      color: number,
      alpha: number
    ) => void
  ): void {
    const span = camera.roadFarZ - camera.near.z;
    for (let index = 0; index < this.noteCount; index++) {
      const note = this.notes[index];
      if (!note) continue;
      draw(
        note.x * 2 + camera.params.width / 2,
        hitY * (1 - (note.top - camera.near.z) / span),
        hitY * (1 - (note.bottom - camera.near.z) / span),
        note.width * 2,
        note.color,
        note.alpha
      );
    }
  }

  clear(): void {
    this.begin();
    this.visualTime = 0;
  }
}
