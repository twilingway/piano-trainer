import type { WorldCamera } from "../worldCamera";
import { worldRoadNote } from "./roadNoteGeometry";
import type { WorldRoadNote } from "./roadNoteGeometry";

/** Reusable visual snapshot; all positions come from the existing score-time layout. */
export class ThreeRoadFrame {
  readonly notes: WorldRoadNote[] = [];
  readonly beats: number[] = [];
  guides = false;
  noteCount = 0;
  beatCount = 0;
  visualTime = 0;

  begin(): void {
    this.noteCount = 0;
    this.beatCount = 0;
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
