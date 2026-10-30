import { Vector3, type Camera, type Object3D } from "three";
import type { OctaveKeyLabels } from "../octaveKeyLabels";
import type { Sprite } from "../flatThree";
import type { KeyBox } from "./keyBoxes";
import type { HingedKey } from "./stageKeyboardLayout";

/** Fixed-size screen glyphs use the very same camera and transformed keys as native picking. */
export class NativeOctaveProjection {
  private readonly point = new Vector3();
  private readonly view = new Vector3();

  update(
    labels: OctaveKeyLabels,
    keys: Object3D,
    boxes: readonly KeyBox[],
    hinged: readonly HingedKey[],
    camera: Camera | undefined,
    screen: { readonly width: number; readonly height: number }
  ): void {
    for (const sprite of labels.nativeSprites.values()) sprite.visible = false;
    if (!labels.on || !keys.visible || !camera || screen.width < 1 || screen.height < 1) return;
    keys.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      if (
        !box ||
        box.black ||
        box.pitch % 12 !== 0 ||
        box.uv.u1 <= box.uv.u0 ||
        labels.suppressed(box.pitch)
      )
        continue;
      const sprite = labels.nativeSprites.get(box.pitch);
      const key = hinged[index];
      if (!sprite || key?.pitch !== box.pitch || !key.hinge.visible || !key.mesh.visible) continue;
      this.point.set(box.x, box.top + key.hinge.position.y, -45).applyMatrix4(keys.matrixWorld);
      this.view.copy(this.point).applyMatrix4(camera.matrixWorldInverse);
      if (this.view.z >= 0) continue;
      this.point.project(camera);
      if (
        !Number.isFinite(this.point.x) ||
        !Number.isFinite(this.point.y) ||
        this.point.z < -1 ||
        this.point.z > 1 ||
        Math.abs(this.point.x) > 1 ||
        Math.abs(this.point.y) > 1
      )
        continue;
      sprite.scale.set(18 / sprite.texture.height);
      sprite.x = ((this.point.x + 1) * screen.width) / 2;
      sprite.y = ((1 - this.point.y) * screen.height) / 2;
      if (sprite.width > screen.width || sprite.height > screen.height) continue;
      const half = sprite.width / 2;
      sprite.x = Math.max(half, Math.min(screen.width - half, sprite.x));
      sprite.y = Math.max(sprite.height, Math.min(screen.height, sprite.y));
      if (!this.overlaps(sprite, labels)) sprite.visible = true;
    }
  }
  private overlaps(sprite: Sprite, labels: OctaveKeyLabels): boolean {
    for (const other of labels.nativeSprites.values()) {
      if (!other.visible || other === sprite) continue;
      if (
        Math.abs(sprite.x - other.x) < (sprite.width + other.width) / 2 + 3 &&
        sprite.y > other.y - other.height - 3 &&
        sprite.y - sprite.height < other.y + 3
      )
        return true;
    }
    return false;
  }
}
