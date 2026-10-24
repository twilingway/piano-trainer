import type { RoadLayer } from "./RoadLayer";
import type { NotesLayer } from "./NotesLayer";
import type { Container } from "./flatThree";

/** Flat keys stay on stage during native loading and return after a renderer failure. */
export function syncNativeKeyLayer(stage: Container, keys: Container, native: boolean): void {
  if (native) stage.removeChild(keys);
  else if (keys.parent !== stage) stage.addChildAt(keys, Math.min(3, stage.children.length));
}

/** Arrival bursts remain with the visible road; keyboard bubbles have no drawing owner. */
export function drawNativeRoadFrame(
  road: RoadLayer | undefined,
  notes: NotesLayer,
  keys: Container,
  deltaSeconds: number
): void {
  road?.draw(notes.root, keys, notes.arrivals, deltaSeconds);
}
