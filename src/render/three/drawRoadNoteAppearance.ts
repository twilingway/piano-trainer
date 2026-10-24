import type { Group } from "three";
import { ThreeFlatRoadNotes } from "./ThreeFlatRoadNotes";
import type { ThreeRoadNotes } from "./ThreeRoadNotes";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";

/** Only flat-key styles use the baked skin; the accepted full-3D renderer stays intact. */
export function drawRoadNoteAppearance(
  native: ThreeRoadNotes,
  flat: ThreeFlatRoadNotes | undefined,
  road: Group,
  frame: ThreeRoadFrame,
  floorY: number,
  nearZ: number
): ThreeFlatRoadNotes | undefined {
  if (!frame.flatMaterial) {
    flat?.clear();
    native.setStyle(frame.noteStyle === "filled" ? "filled" : "glass");
    native.update(frame.notes, floorY, frame.visualTime, frame.noteCount);
    return flat;
  }
  native.group.visible = false;
  flat ??= new ThreeFlatRoadNotes();
  if (flat.group.parent !== road) road.add(flat.group);
  flat.nearZ = nearZ;
  flat.performanceAngle = native.performanceAngle;
  flat.performanceScale = native.performanceScale;
  flat.update(frame.notes, floorY, frame.noteCount);
  return flat;
}
