import { Box3, Group } from "three";
import type { Keyboard88 } from "./keyboard88";
import { KEYBOARD_METRES } from "../keyboardMetrics";

/** The atlas housing keeps its key-bed and rear anchor; only the front shelf is compacted. */
export class PianoCase {
  readonly group = new Group();
  private disposed = false;

  constructor(private readonly keyboard: Keyboard88) {}

  layout(c4: number): void {
    this.clear();
    if (this.disposed || !Number.isFinite(c4)) return;
    this.group.position.set(c4, 22, 0);
    this.group.scale.setScalar(KEYBOARD_METRES);
    for (const part of this.keyboard.case.children) {
      const clone = part.clone();
      if (["table.001", "panel-left", "panel-right"].includes(part.name)) {
        const bounds = new Box3().setFromObject(clone);
        const front = 0.034;
        if (bounds.max.z > front && bounds.max.z > bounds.min.z) {
          const scale = (front - bounds.min.z) / (bounds.max.z - bounds.min.z);
          clone.scale.z *= scale;
          clone.position.z = bounds.min.z + (clone.position.z - bounds.min.z) * scale;
        }
      }
      this.group.add(clone);
    }
  }

  clear(): void {
    // Geometry and baked materials belong to the keyboard asset, shared across rebuilds.
    this.group.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
}
