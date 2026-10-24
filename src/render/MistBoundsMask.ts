import { BufferImageSource, Sprite, Texture } from "./flatThree";
import type { Container } from "./flatThree";
import type { PlasmaAnchor } from "./PlasmaLayer";

/** A fixed alpha ramp is baked once; only its bounds change with projected piano geometry. */
export class MistBoundsMask {
  private readonly sprite: Sprite;

  constructor(private readonly mist: Container) {
    const width = 256;
    const pixels = new Uint8Array(width * 4);
    for (let index = 0; index < width; index++) {
      const edge = Math.min(1, Math.min(index, width - 1 - index) / 8);
      const value = Math.round(edge * edge * (3 - 2 * edge) * 255);
      pixels.set([value, value, value, 255], index * 4);
    }
    this.sprite = new Sprite(
      new Texture({ source: new BufferImageSource({ resource: pixels, width, height: 1 }) })
    );
    this.sprite.eventMode = "none";
    this.sprite.renderable = false;
    mist.addChild(this.sprite);
  }

  update(anchors: readonly PlasmaAnchor[], height: number, enabled: boolean, offsetX = 0): void {
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    if (enabled)
      for (const anchor of anchors) {
        if (
          anchor.black ||
          !Number.isFinite(anchor.x) ||
          !Number.isFinite(anchor.y) ||
          !Number.isFinite(anchor.width) ||
          anchor.width <= 0
        )
          continue;
        left = Math.min(left, anchor.x - anchor.width / 2);
        right = Math.max(right, anchor.x + anchor.width / 2);
        top = Math.min(top, anchor.y - Math.max(1, height) * 2);
        bottom = Math.max(bottom, anchor.y + Math.max(1, height) * 2);
      }
    if (!Number.isFinite(left) || right <= left || !Number.isFinite(top) || bottom <= top) {
      this.mist.mask = null;
      return;
    }
    const shift = Number.isFinite(offsetX) ? offsetX : 0;
    this.sprite.position.set(left + shift, top);
    this.sprite.width = right - left;
    this.sprite.height = bottom - top;
    if (this.mist.mask !== this.sprite) this.mist.mask = this.sprite;
  }

  destroy(): void {
    this.mist.mask = null;
    this.sprite.destroy({ texture: true, textureSource: true });
  }
}
