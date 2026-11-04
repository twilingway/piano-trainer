import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Box3, Group, Mesh, Vector3, type BufferGeometry, type Material } from "three";
import type { Keyboard88 } from "./keyboard88";
import { KEYBOARD_METRES } from "../keyboardMetrics";

/** The atlas housing keeps its key-bed and rear anchor; only the front shelf is compacted. */
export class PianoCase {
  readonly group = new Group();
  private disposed = false;
  private readonly clayGeometries: RoundedBoxGeometry[] = [];

  constructor(private readonly keyboard: Keyboard88) {}

  layout(c4: number, finish?: Material): void {
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
      if (finish)
        clone.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          node.material = finish;
          const source = node.geometry as BufferGeometry;
          source.computeBoundingBox();
          const bounds = source.boundingBox;
          if (!bounds) return;
          const size = bounds.getSize(new Vector3()),
            centre = bounds.getCenter(new Vector3());
          const geometry = new RoundedBoxGeometry(
            size.x,
            size.y,
            size.z,
            3,
            Math.min(0.005, size.x * 0.4, size.y * 0.4, size.z * 0.4)
          );
          geometry.translate(centre.x, centre.y, centre.z);
          this.clayGeometries.push(geometry);
          node.geometry = geometry;
        });
      this.group.add(clone);
    }
  }

  clear(): void {
    // Geometry and baked materials belong to the keyboard asset, shared across rebuilds.
    this.group.clear();
    for (const geometry of this.clayGeometries) geometry.dispose();
    this.clayGeometries.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
}
