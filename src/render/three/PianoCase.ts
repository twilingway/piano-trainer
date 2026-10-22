import { Group } from "three";
import type { Keyboard88 } from "./keyboard88";
import { KEYBOARD_METRES } from "../keyboardMetrics";

/** The atlas' eight original case objects, including its table and floor-reaching panels. */
export class PianoCase {
  readonly group = new Group();
  private disposed = false;

  constructor(private readonly keyboard: Keyboard88) {}

  layout(c4: number): void {
    this.clear();
    if (this.disposed || !Number.isFinite(c4)) return;
    this.group.position.set(c4, 22, 0);
    this.group.scale.setScalar(KEYBOARD_METRES);
    for (const part of this.keyboard.case.children) this.group.add(part.clone());
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
