import type { WorldCamera } from "../worldCamera";
import type { WorldRoadNote } from "./roadNoteGeometry";

export interface ProjectionNoteProgress {
  head: number;
  tail: number;
}

const clampProgress = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Reads existing score-derived bounds; neither a timer nor a frame-integrated offset. */
export function projectionNoteProgress(
  note: WorldRoadNote,
  world: WorldCamera,
  target: ProjectionNoteProgress
): ProjectionNoteProgress {
  const contact = note.lane?.depth ?? world.near.z;
  const span = world.roadFarZ - contact;
  if (!Number.isFinite(contact) || !Number.isFinite(span) || span <= 0) {
    target.head = target.tail = 0;
    return target;
  }
  target.head = clampProgress(1 - (note.bottom - contact) / span);
  target.tail = clampProgress(1 - (note.top - contact) / span);
  return target;
}
