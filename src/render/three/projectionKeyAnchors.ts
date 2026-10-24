import { Vector3, type Camera, type Object3D } from "three";
import { nativeKeyContactPoint } from "../nativeKeyContactAnchors";
import type { ProjectionKeyAnchor } from "../stylizedProjection";
import type { KeyBox } from "./keyBoxes";

/** CSS pixels only. Hinge matrices include the physical depression and keyboard transform. */
export class ProjectionKeyAnchors {
  readonly anchors: ProjectionKeyAnchor[] = [];
  private readonly point = new Vector3();
  private readonly edge = new Vector3();
  private boxes: readonly KeyBox[] | undefined;
  private hinges: readonly { readonly pitch: number; readonly hinge: Object3D }[] | undefined;
  private readonly contacts: { pitch: number; owner: Object3D; point: Vector3; width: number }[] =
    [];

  update(
    boxes: readonly KeyBox[],
    hinges: readonly { readonly pitch: number; readonly hinge: Object3D }[],
    camera: Camera,
    width: number,
    height: number
  ): readonly ProjectionKeyAnchor[] {
    camera.updateMatrixWorld(true);
    if (boxes !== this.boxes || hinges !== this.hinges) {
      this.boxes = boxes;
      this.hinges = hinges;
      this.contacts.length = 0;
      for (const box of boxes) {
        const owner = hinges.find((entry) => entry.pitch === box.pitch)?.hinge;
        if (!owner || box.pitch < 21 || box.pitch > 108) continue;
        const p = nativeKeyContactPoint(box, box.back);
        this.contacts.push({
          pitch: box.pitch,
          owner,
          point: new Vector3(p.x, p.y, p.z),
          width: box.width
        });
      }
    }
    let count = 0;
    for (const contact of this.contacts) {
      const { owner } = contact;
      owner.updateWorldMatrix(true, false);
      this.point.copy(contact.point).applyMatrix4(owner.matrixWorld).project(camera);
      this.edge
        .copy(contact.point)
        .addScaledVector(ProjectionKeyAnchors.horizontal, contact.width / 2)
        .applyMatrix4(owner.matrixWorld)
        .project(camera);
      const anchor = this.anchors[count] ?? { pitch: contact.pitch, x: 0, y: 0, width: 0 };
      anchor.pitch = contact.pitch;
      anchor.x = (this.point.x + 1) * width * 0.5;
      anchor.y = (1 - this.point.y) * height * 0.5;
      anchor.width = Math.abs(this.edge.x - this.point.x) * width;
      // A point behind the camera must be diagnosed, never silently mirrored into a lane.
      if (this.point.z < -1 || this.point.z > 1) anchor.x = Number.NaN;
      this.anchors[count++] = anchor;
    }
    this.anchors.length = count;
    return this.anchors;
  }
  private static readonly horizontal = new Vector3(1, 0, 0);
}
